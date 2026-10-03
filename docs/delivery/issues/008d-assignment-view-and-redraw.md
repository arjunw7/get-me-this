# 008d — Assignment view, viewed state, confirmed redraw, and assignment emails

## Outcome

Secret-draw groups gain their first user-facing draw surface. After the
organizer runs the 008c draw, every giver sees exactly their own current
assignment through a privacy-safe view; the organizer gets a confirmed
redraw flow that supersedes the current version with an explicit,
audited confirmation; a giver whose assignment was invalidated by a
membership change sees a neutral state that links the organizer to the
redraw; a leaver silently loses their assignment with no residual
surface; and each committed draw enqueues one assignment email per valid
giver through the pinned 009a enqueue contract.

This slice consumes the 008c handoff contract without broadening it: it
renders only what `my_assignment` and `group_draw_state` return, keys its
new viewed state on the assignment identity `(group_id, draw_version,
giver_id)`, and never adds a read path to another member's assignment.
The draw algorithm, its schema, and its invariants are unchanged by this
slice.

## Scope

One migration in the reserved range `20261021000000`–`20261021999999`
(008c's `20261012020000_secret_draw.sql` is untouched and never edited),
plus application UI, server actions, email wiring, and tests. No new
dependency.

- **Viewed state.** `public.group_assignment_views` records that a giver
  has seen their own current assignment: `group_id uuid`, `draw_version
integer`, `giver_id uuid`, `viewed_at timestamptz default
clock_timestamp()`, primary key `(group_id, draw_version, giver_id)`,
  composite foreign keys into the unique `(group_id, user_id)` of
  `group_members` with `ON DELETE RESTRICT` (the 006a pattern). The key
  is the 008c assignment identity, so a redraw — which bumps the version —
  naturally starts a fresh viewed state per version without any delete.
  Rows are never mutated or deleted; superseded versions' view rows are
  retained as internal history and are unreachable by every client
  projection, exactly like assignment rows.
- **Deny-all RLS on `group_assignment_views`**: RLS enabled, no policy,
  no client grant for any role including `service_role` through the
  application API. All access goes through two new `SECURITY DEFINER`
  functions following the 006a/008c contract (caller from `auth.uid()`,
  empty `search_path`, explicit REVOKE from `PUBLIC`, `anon`,
  `authenticated`, and `service_role` before exact grants):
  - `public.mark_assignment_viewed(p_group_id uuid) returns text` —
    insertable-only by the giver. Upserts the viewed marker for the
    caller's current valid assignment version. Zero rows is a no-op
    success (nothing to mark); every denial class (outsider, pending,
    left, removed, stale generation, wrong mode, archived, no draw)
    is a no-op success or generic failure, never an enumeration oracle.
  - `public.my_assignment_view_state(p_group_id uuid) returns table
(draw_version integer, viewed_at timestamptz)` — the caller's own
    viewed marker for their current assignment version, or zero rows.
    This function exists so the UI can render "seen" state without
    reading the table directly.
- **Assignment view UI.** A giver-facing assignment surface inside the
  006d group room for `secret_draw` groups with a committed current
  version, rendering exactly the `my_assignment` result: recipient id
  and display name with the established generic **Member** fallback,
  the neutral `is_valid = false` state (null recipient columns — the
  giver learns the assignment is no longer valid and never who
  departed), and the zero-rows "no current assignment" state. Version
  numbers, generations, tombstone internals, and audit metadata are
  never rendered. Zero-rows is rendered identically for all denial
  classes (no error difference that could distinguish states).
- **Redraw confirmation UI.** An organizer-only surface in the group
  room rendering exactly the `group_draw_state` result (draw_version,
  drawn_at, participant_count, roster_in_sync — existence metadata
  only, never any pair) and driving `run_secret_draw` through a server
  action. The redraw is destructive and surprising, so per DESIGN.md it
  requires explicit confirmation: the dialog states that every current
  assignment will be replaced and that members will see their new
  assignments only after the redraw. The organizer passes the version
  they confirmed against as `p_expected_draw_version` (the CAS
  contract); a `stale` result (a concurrent draw or tombstone beat the
  organizer) renders the refreshed state, never a retry loop that could
  re-randomize blindly. `insufficient_participants` renders a neutral
  blocked state naming the minimum. When `roster_in_sync = false`, the
  organizer sees the departure alert required by
  `docs/flows/groups-and-gifting.md` — the alert reports only that the
  roster is out of sync, with no attribution to any member.
- **Member-leaves handling.** Pure rendering of the 008c read
  semantics; no database change. Leaving `secret_draw` stores but never
  surfaces the departed member's assignment (their own reads go to zero
  rows); a giver whose recipient departed sees `is_valid = false` with
  null recipient columns and a link to the organizer's confirmed redraw
  flow; only a confirmed redraw restores readability; archival or
  mode-away tombstoning reads zero rows everywhere. No surface shows a
  departed member's identity in connection with an assignment.
- **Assignment emails.** Wire the existing contract-pinned
  `src/email/assignment-enqueue.ts` into the draw server action — its
  first call site. Immediately after a `run_secret_draw` call returns
  `drawn`, the action reads the caller's group's current-version valid
  assignments through the same current-version, current-generation read
  predicate `my_assignment` uses (a narrowly reviewed server-side read,
  never a client path and never a broadened 008c projection) and calls
  `enqueueAssignmentEmails` with rows satisfying the pinned contract:
  the exact 008c identity idempotency key (`assignment:g-1:2:u-giver`
  shape: group id, draw version, giver id), `is_valid = false` rows
  skipped, the null-recipient **Member** fallback preserved, per-group
  enqueue budget honoured, tombstone silence (after a mode-away
  tombstone there are no readable current assignments, so nothing is
  enqueued), and a redraw enqueuing under the new version's key only.
  Exactly-once per valid giver per draw version comes from the
  idempotency key plus the CAS: a `stale` retry enqueues nothing. The
  009a outbox does delivery; this slice adds no worker change.
- **Analytics.** Emit the already-catalogued server-side event
  `name_draw_completed` (`participant_count_bucket`, `is_redraw`) on
  each committed draw/redraw, per `docs/analytics/tracking-plan.md`. No
  new event, no new property, no tracking-plan change — the catalog is
  closed.

## Binding privacy rules

- A giver sees only their own assignment. The organizer sees existence
  metadata only. No UI, server action, log line, or error message
  renders or records another member's assignment, any giver→recipient
  pair, any version or generation internal, or any departed member's
  identity attached to an assignment.
- Viewed state is private to the giver. No "n of m viewed" aggregate,
  no organizer viewed reporting, no cross-member viewed surface in this
  slice (008c's handoff defers any such aggregate to its own privacy
  review; it is not included here).
- Assignment payloads never enter analytics, logs, error reports, or
  client bundles beyond the giver's own rendered view. The email
  payload carries exactly what `my_assignment` lawfully shows the giver.

## Non-goals

- No change to `run_secret_draw`, `my_assignment`, `group_draw_state`,
  `group_assignments`, or `20261012020000_secret_draw.sql`. Any defect
  found in 008c is a separate correction against 008c, not an edit
  here.
- No new analytics event or tracking-plan change; no new dependency; no
  departure notification (the organizer alert is the in-room
  `roster_in_sync` surface only); no "n of m viewed" aggregate; no
  member-initiated redraw; no draw exclusions or reveal scheduling; no
  Magic Patterns scaffolding or visual baseline beyond the approved
  prototype comparison for the new screens.
- No worker, Resend, or outbox change — 009a delivers.

## Acceptance criteria and required proof

The PR copies these criteria and marks each with evidence. Component
and e2e tests use the existing Vitest/RTL and Playwright conventions;
database tests are pgTAP suites under `supabase/tests/` plus race
scenarios in the committed two-session harness pattern.

1. **Viewed-state migration (pgTAP).** `group_assignment_views` has the
   specified columns, key, composite RESTRICT foreign keys, and
   deny-all RLS with no policy; direct client reads and writes are
   denied for `anon`, `authenticated`, and `service_role` (grants and
   RLS proven separately). The two new functions enforce the 006a
   privilege inventory; `mark_assignment_viewed` writes only for the
   caller's own current valid assignment and is a no-op for every
   denial class; `my_assignment_view_state` returns the caller's own
   marker and zero rows for every denial class.
2. **Viewed-state lifecycle (pgTAP).** Marking viewed twice for the
   same version writes one row (idempotent upsert); after a confirmed
   redraw, the new version has no viewed rows and the giver can mark
   the new version viewed independently; after a tombstone
   (mode-away or archival) both functions return no state; rows are
   never mutated or deleted by any function.
3. **Assignment view (component/e2e).** The giver's surface renders
   the valid assignment (recipient display name, **Member** fallback
   when null), the neutral `is_valid = false` state with no recipient
   identity, and the zero-rows state identically for all denial
   classes. Version numbers, generations, and internal draw state are
   absent from the DOM. Marking viewed fires once on first render of a
   valid assignment and renders seen state from
   `my_assignment_view_state`.
4. **Redraw confirmation (component/e2e).** Redraw requires explicit
   confirmation; the dialog states the supersession consequences; the
   server action passes the confirmed expected version to
   `run_secret_draw`; `stale` re-renders refreshed state with no
   re-randomizing retry; `insufficient_participants` renders the
   blocked state; `roster_in_sync = false` shows the departure alert
   with no member attribution. Non-organizers see no redraw control
   and the action refuses server-side.
5. **Member-leaves rendering (pgTAP + e2e).** After a committed draw,
   a leaver/removed member's own view reads zero rows; their giver
   reads `is_valid = false` with null recipient columns; a confirmed
   redraw restores valid reads for the new version only; archived
   groups and mode-away tombstones read zero rows through every
   surface in this slice.
6. **Email wiring (unit + pgTAP + e2e).** The draw server action is
   the wired call site: a committed draw enqueues exactly one
   assignment email per valid giver with the exact 008c identity key;
   `is_valid = false` rows are skipped; a redraw enqueues under the
   new version's key only; a `stale` retry enqueues nothing; the
   per-group budget path is exercised; after a tombstone there are no
   readable assignments and zero enqueues; no email payload or log
   contains any pair beyond what the giver is lawfully shown.
7. **Privacy-negative tests.** Non-givers, recipients, outsiders,
   pending/left/removed members, and the organizer receive zero
   assignment content through every new surface, function, and server
   action, including cross-group attempts; the organizer's redraw path
   never returns any pair; viewed state is unreadable by anyone other
   than its owner.
8. **Race scenarios (two-session harness).** With barriers and strict
   timeouts: (a) draw-commit vs. redraw-commit concurrency — exactly
   one version wins, the loser is `stale` with zero enqueues; (b)
   redraw vs. leave of a drawn assignee, both orders — either the
   redraw binds fresh generations or the leave wins and the redraw
   re-derives the roster; never a half-redrawn state; (c) redraw vs.
   mode-away tombstone — the tombstone bumps the version, the redraw
   either loses the CAS or refuses post-lock, and assignment emails
   never enqueue for a tombstoned version. The harness fails CI on
   assertion failure or timeout and cleans up fixtures.
9. **Analytics.** Exactly one `name_draw_completed` emission per
   committed draw, with `is_redraw` true on redraws and
   `participant_count_bucket` derived from `group_draw_state`'s
   participant count; no emission on failed draws; no new event or
   property anywhere.
10. **Visual evidence.** Before/after screenshots at mobile 390×844
    and desktop 1440×1000 for the new assignment and redraw surfaces,
    compared against the deployed Magic Patterns prototype at the same
    route-equivalent state, fixture, and interaction state; a Railway
    preview URL.

Required PR evidence: exact-head CI green on the five required checks
(`Install and verify`, `Database suites and races`, `Stack e2e and
visual`, `Populated-state group upgrade`, `No-provider Server Action
gates`); one correction pass expectation (review findings are fixed in
at most one follow-up commit-set on the same branch, not a new branch);
migration and rollback notes (the revert path drops
`group_assignment_views` and its two functions in dependency order;
viewed rows are ephemeral state and their loss is non-destructive);
synthetic-only fixtures; and confirmation that no Magic Patterns mock
data or editor artifacts were shipped.

## Implementation plan and gates

1. Isolated branch off current `main` from the approved exact brief
   commit; implementation starts only after this brief is merged and
   linked to its Linear issue.
2. Migration in the reserved `20261021000000`–`20261021999999` range,
   pgTAP suites, harness extension, then UI, server actions, and the
   email call site, each with the matching tests above.
3. Full local validation per the working rules (`pnpm exec supabase
start`, `pnpm exec supabase test db --local`, stack-gated e2e,
   typecheck, lint, build, `pnpm verify`) before the first push and
   between iterations.
4. Staging validation of the new migration and draw/redraw email flow
   is the separate owner-approved gate established by 008c.

## Dependencies and planning status

- Depends on 008c (merged algorithm contract), 006d (group room
  surface), 009a (outbox), and 009b (rate limiter) — all merged.
- The enqueue helper `src/email/assignment-enqueue.ts` and its contract
  tests are already on `main`; this slice adds its first call site and
  may not change the pinned contract.
- Brief only. The planning commit changes documentation only and adds
  no migration, application code, cloud resource, Linear state change,
  or pull request beyond this docs PR.

## Analytics, security, and privacy

The catalog is closed: `name_draw_completed` is the only emission and
it is already catalogued. Assignment content is token-like secret
state: excluded from analytics, logs, error reporting, and client
bundles by construction and asserted by the tests in criteria 6, 7,
and 9. Viewed-state records are private per giver. Security logging
for denied operations uses identifiers and coarse categories, never
assignment content, email payloads, or secret URLs.
