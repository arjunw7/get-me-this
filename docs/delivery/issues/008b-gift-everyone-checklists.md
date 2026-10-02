# 008b - Gift-everyone checklists

## Outcome

Deliver the **Gift everyone** gifting mode for groups configured with it. In
a `gift_everyone` group, every participating member has a private checklist
containing every other participating member, the configured budget applies
per recipient, and the giver can privately track progress per recipient by
marking checklist entries completed and reopening them. The checklist is the
giver's own gifting tracker: the recipient never sees who is gifting them,
that an entry exists about them, or any progress state toward them. There is
no draw, no assignment, and no anonymity to preserve — but there is also no
shared or claimable task list; each checklist belongs to exactly one giver.

The slice adds one new table with RLS, two narrowly granted `SECURITY
DEFINER` functions, pgTAP proof, a bounded two-session race harness for the
status lifecycle, and the gift-everyone variant of the gifting surface. It
consumes the Phase 6 reservation atomicity for gift de-duplication and never
reimplements it.

This repository brief is the binding implementation contract for 008b. A
matching Linear issue is created only after this brief is approved and must
link the exact approved commit rather than copying a divergent contract.

## Resolved decisions

Binding for this slice; each carries an owner-review flag because the product
sources do not state it explicitly.

1. **The checklist is per-giver and private; entries are not claimable by
   other members.** The product specification: "Each participant receives a
   private checklist containing every other participating member." The
   planning prompt's "every member can claim gift tasks for everyone" is
   therefore recast: a checklist entry about a recipient is created, updated,
   and seen only by its giver. No function, overload, or policy allows one
   member to read or mutate another member's checklist, even though every
   member appears as a recipient in someone else's checklist. (Owner-review
   flag: confirm there is no desired shared "claim this gift idea" list —
   that would be a different product and a different brief.)
2. **De-duplication comes from reservations, not checklist exclusivity.** Two
   members may both intend to gift the same recipient; the database prevents
   duplicate *purchases* only through the Phase 6 atomic group-scoped
   reservation (exactly one active reservation per group and wishlist item)
   plus the matrix rule that eligible givers can see that a recipient's item
   is reserved when coordination requires it. Checklist entries store no item
   link in v1 and confer no claim on any item. (Owner-review flag: whether a
   future item-linking entry needs its own brief.)
3. **Lifecycle is exactly two states.** An entry is `todo` or `completed`.
   "Complete" marks it done; "release" reopens it to `todo`. There is no
   separate claimed/in-progress state: claiming is implicit in entry
   ownership (Resolved decision 1), and the product spec describes only a
   tracking checklist. (Owner-review flag: confirm the two-state lifecycle
   against the Magic Patterns reference when the gifting screen is reviewed.)
4. **Recipient visibility is exactly nothing.** "Progress is private from
   recipients" (`docs/flows/groups-and-gifting.md`). A recipient sees no
   checklist entry, no giver identity, no completion state, no count, and no
   inference surface for gifting toward themselves. `gift_everyone` is
   non-secret only in the sense that the mode itself is public (the
   invitation preview shows it, and membership implies every participating
   member is expected to gift every other); the *progress and identity*
   remain private exactly as in `secret_draw`. The global rule "never let
   recipients see reservations, purchase progress, or private gifting
   assignments about themselves" applies in full.
5. **Participants.** A participant is a currently `joined` member whose
   `participating` flag is true. Checklists cover exactly the ordered pairs
   of distinct current participants. A joined non-participating member
   appears on no checklist as giver or recipient and receives the generic
   denial from both functions. Eligibility is re-derived from current state
   on every read and write; nothing is snapshotted at mode-set time.
   (Owner-review flag: the product spec never defines the participating flag
   for this mode.)
6. **Progress survives absence.** Stored entry rows are keyed by
   `(group_id, giver_id, recipient_id)` user IDs and are never deleted by a
   leave, decline, or removal. While a participant is absent they are
   filtered out of every checklist by the current-participation predicate;
   if they return through a targeted reinvitation (sticky-removal rules,
   006a/006f), their prior stored statuses reappear. (Owner-review flag:
   confirm reset-on-return is not wanted.)
7. **Mode is organizer-changeable, with no new constraint here.** Shared
   with 008a: `update_group_settings` (006a) already accepts a mode; the
   product spec is silent on post-creation changes; no mode-change UI ships
   in this slice. Switching a group out of `gift_everyone` hides checklists
   by derivation and destroys nothing; switching back reveals prior stored
   progress. Constraints involving draw state belong to the secret-draw
   brief (008c). (Owner-review flag: confirm.)
8. **Budget is presentation, never enforcement.** The configured budget
   applies per recipient as guidance text only; budgets never hide or block
   expensive items (trust rules).

## User stories and success signal

- As a member in "Gift everyone" mode, I want a checklist of the other
  members so I can track my gifting privately (product-spec story 7).
- As a giver, I want marking a recipient completed — and undoing it — to be
  safe when I have two tabs open, when the recipient leaves the group, or
  when the organizer changes the mode, so my checklist never shows a state
  that was never committed.
- As a recipient, I want no surface, query, count, or error difference to
  reveal who is gifting me or how far along they are.

Success signal: deterministic `gift_everyone` fixtures exercise the checklist
for giver, recipient, non-participant, organizer, and outsider roles; the
two-session harness proves the status lifecycle under concurrency; and every
denial class receives the same generic result with zero analytics emission.

## Dependency contract

### 006a - group security model (merged)

- Consume the merged `groups` (including `mode public.group_mode` with
  `gift_everyone`, and the still-inert nullable `current_draw_version`),
  `group_members` (`status`, `participating`, `membership_generation`),
  `audit_events` append-only contract, the fixed lock order (group row
  first, then member rows by ascending user id), and the
  `private.is_joined_group_member` helper semantics.
- Reuse the generic non-enumerating failure convention: every denial of the
  new functions returns the same `unavailable`-class result with no
  distinction between unknown group, outsider, wrong mode, and ineligible
  membership.
- Do not modify `update_group_settings`, the audit event-type enum, or any
  006a table, grant, or policy.

### 006b/006c/006d/006e/006f (merged)

- The group exists through `create_group_v1` with mode `gift_everyone`;
  members join through 006c acceptance; the room (006d) renders the
  **Gift everyone** label and remains the entry point; 006f governs removal,
  reinvitation, and transfer. This slice adds no invitation, membership,
  removal, transfer, or room behavior.
- The checklist page consumes 006e's member-wishlist route as the
  destination for choosing a gift for a recipient; it does not duplicate
  item data, does not add a wishlist read of its own, and never widens the
  006e projection.

### Phase 6 social layer (reactions, copy, reservations, activity)

- Reservations are the only purchase-coordination mechanism and keep their
  Phase 6 atomicity, conflict behavior, and recipient privacy unchanged.
  The checklist composes with them for display only: it never reads another
  member's reservation state about the caller's own items, never writes
  reservations, and never embeds reservation identity into checklist data
  where the caller is the recipient.
- Activity summaries never leak checklist progress (Phase 6 activity slice
  contract); this brief adds no activity surface.
- At brief-freeze time the Phase 6 briefs are not yet published in
  `docs/delivery/issues/`; 008b implementation cannot start until they are
  approved and merged with recorded heads. Divergence found at freeze is a
  review finding.

### 008a - share-wishlists-only mode (sibling brief)

- 008a binds the `wishlist_only` mode and fixes the cross-mode contract this
  brief honors: every checklist function denies a group whose stored mode is
  not `gift_everyone` inside its own transaction, and a `wishlist_only`
  group's surfaces show no checklist anywhere.
- 008a and 008b share no schema objects. Neither brief edits the other's
  migrations, functions, or test files. The gifting-surface route dispatch
  is defined here; 008a relies on it by contract without importing it.

### Phase 7 secret-draw briefs (008c/008d, not yet drafted)

- The gifting surface's `secret_draw` variant is a generic not-found until
  008d merges. This brief fixes the dispatch contract 008d must consume and
  may not be broadened by it silently. No draw state is read or written
  here; `current_draw_version` stays untouched.

## Scope and schema

### One forward-only migration

Dated after the current migration-ledger head. It creates exactly:

```sql
create type public.gift_checklist_status as enum ('todo', 'completed');

create table public.gift_checklist_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."groups" (id) on delete restrict,
  giver_id uuid not null references auth.users (id) on delete restrict,
  recipient_id uuid not null references auth.users (id) on delete restrict,
  status public.gift_checklist_status not null default 'todo',
  version bigint not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (group_id, giver_id, recipient_id),
  constraint gift_entry_giver_is_not_recipient check (giver_id <> recipient_id),
  constraint gift_entry_version_positive check (version >= 1),
  constraint gift_entry_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null))
);
```

- RLS is enabled. **No policy, no table grant, and no permissive client
  access of any kind** — the pattern of 006b's `group_creation_receipts`:
  only the reviewed definer functions touch the table. `anon`,
  `authenticated`, and `service_role` receive no direct SELECT, INSERT,
  UPDATE, DELETE, or TRUNCATE privilege. A recipient cannot read gifting
  rows about themselves through the table even in principle, because no
  client role can read the table at all.
- Every auth-user reference uses `ON DELETE RESTRICT` per 006a; account
  deletion is denied while any entry references the user. `group_id`
  references `groups` with `ON DELETE RESTRICT`.
- No audit event is added: checklist status is private gifting progress, not
  an authority or lifecycle change, and the 006a audit enum gains no new
  type. Indexes: the unique constraint serves point lookups; add only what
  the snapshot's participation join needs and justify it in the PR.

### Exact function inventory

Two functions, one signature each, no overloads; `SECURITY DEFINER`, owned
by the trusted non-client database role, empty `search_path`,
schema-qualified names, fixed types, no dynamic SQL; EXECUTE revoked from
`PUBLIC`, `anon`, and `service_role` and granted to `authenticated` only.
pgTAP enumerates every overload.

```sql
public.gift_checklist_snapshot(p_group_id uuid)
returns table (
  recipient_user_id uuid,
  recipient_display_name text,
  recipient_is_organizer boolean,
  entry_status public.gift_checklist_status,
  entry_version bigint,
  entry_completed_at timestamptz,
  participating_member_count bigint,
  budget_amount_minor bigint,
  budget_currency text
)
```

```sql
public.set_gift_checklist_entry_status(
  p_group_id uuid,
  p_recipient_id uuid,
  p_expected_version bigint,
  p_status text
)
returns table (result text, version bigint)
```

#### Snapshot semantics

- Derives the giver only from `auth.uid()`. One data-reading SQL statement:
  authorization (caller currently `joined` and `participating`; group
  active; stored mode exactly `gift_everyone`), the recipient set (every
  other currently `joined` and `participating` member), left-joined stored
  entries, and the group budget columns are CTEs or expressions of that one
  statement sharing one PostgreSQL snapshot. No wall-clock call is required,
  so the function is `STABLE`.
- One row per other current participant. Rows with no stored entry surface
  the derived state: `entry_status = 'todo'`, `entry_version` null,
  `entry_completed_at` null. Rows with a stored entry surface its exact
  status, version, and `completed_at`. `recipient_is_organizer` is true
  only where `recipient_user_id = groups.organizer_id`.
- A missing display name is replaced inside the projection by the
  established generic **Member** fallback (006a/006d/006e); the application
  never queries profiles directly.
- **Authorized empty sentinel.** When authorization succeeds and the caller
  is the only current participant, return exactly one sentinel row:
  `recipient_user_id` null, `recipient_display_name` populated with the
  caller's own fallback display name, `recipient_is_organizer` true,
  `entry_status` null, `entry_version` null, `entry_completed_at` null, and
  the count/budget fields populated. Every denial returns zero rows.
  Authorized-empty and denied are distinguishable only through
  authorization, never by shape ambiguity.
- Ordering is deterministic and presentation-only: caller's sentinel first
  if present; then recipients by case-folded display label ascending, then
  `recipient_user_id` ascending.
- `budget_amount_minor`/`budget_currency` repeat the stored group budget on
  every row for the per-recipient guidance line (Resolved decision 8). No
  currency conversion is introduced here.

#### Status-change semantics

- Validates `p_status` against the enum values; anything else, a null
  actor, or any failed authority check returns the generic
  `unavailable` result and performs no write.
- Lock order per 006a: lock the `groups` row `FOR UPDATE` first, then the
  giver's and recipient's `group_members` rows by ascending user id. All
  authority checks run inside the transaction after the locks, against the
  locked rows: caller currently `joined` and `participating`; recipient
  currently `joined` and `participating`; `recipient_id <> caller`;
  group active; stored mode exactly `gift_everyone`.
- **Optimistic compare-and-swap.** With `p_expected_version` null the
  function inserts the missing entry (unique constraint arbitrates a
  concurrent first insert; the loser returns `conflict` with the winner's
  new version and writes nothing). With a non-null expected version it
  updates the existing row where `version = p_expected_version`, setting
  `status`, `completed_at` (`clock_timestamp()` when completing, null when
  reopening), `updated_at`, and `version = version + 1` atomically. A
  version mismatch returns `conflict` with the current version and writes
  nothing. There is no blind update path.
- Results are exactly `updated` or `conflict` with the resulting version,
  or `unavailable`. The result reveals nothing about the recipient's own
  checklist, other members' entries, or which check failed.
- The function never reads or writes reservations, wishlists, assignments,
  or audit state, and never sends anything asynchronous.

## Mode dispatch for the gifting surface

- The gifting surface lives at the protected route
  `/groups/[groupId]/gifting` (the destination referenced by the V18
  design). 008b owns the route shell and its server-side mode dispatch,
  derived only from reviewed server projections of the stored mode:
  - `gift_everyone`: the caller's own checklist as specified below;
  - `wishlist_only`: the same generic application not-found result as an
    outsider — members browse through the 006d roster and 006e browsing,
    and reservations live on the Phase 6 surfaces (008a contract);
  - `secret_draw`: the same generic not-found until the 008d assignment
    brief merges and amends this dispatch.
- Every response is dynamic and private, no-store, never statically
  generated or shared-cacheable, mirroring 006d. Denials and errors are
  non-cacheable and non-enumerating.
- The caller's checklist is a semantic list; each row shows the recipient's
  display name, truthful state text (`To gift` / `Completed` — never
  color-only), the per-person budget line rendered from integer minor
  units and the stored currency, and one action per state: **Mark
  completed** for a `todo` entry and **Reopen** for a `completed` entry,
  each at least 44 by 44 CSS pixels. Each row links to that recipient's
  006e wishlist for choosing and reserving a gift.
- Optimistic-concurrency handling is honest: on `conflict` the UI refetches
  the snapshot and surfaces the true current state; it never silently
  overwrites, claims success for a lost update, or disables the control
  while pretending the change landed.
- Loading, authorized-empty, populated, conflict, safe-error, and not-found
  states are designed; the loading state preserves broad geometry without
  names, counts, or progress and is not cached.
- Focus, headings (`h1` group name consistent with the room; checklist
  heading as `h2`), list semantics, full accessible names, visible focus,
  200% zoom, 320-pixel reflow, and reduced motion follow the design
  contract and 006d's accessibility bar.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Schema and invariants (pgTAP).** The enum and table exist with exactly
   the declared columns, constraints, FK actions (`ON DELETE RESTRICT`
   throughout), and unique key; giver-equals-recipient, negative versions,
   and status/completed-at contradictions are rejected at the constraint
   level; RLS is enabled with zero policies and zero client table
   privileges, proven by inventory and by direct-read denial for `anon`,
   `authenticated`, and `service_role`.
2. **Exact function surface.** Both functions have exactly the declared
   signatures and result shapes, `SECURITY DEFINER` ownership, empty search
   path, default-EXECUTE revocation, and the single `authenticated` grant;
   no overload of any kind exists; runtime results contain no additional
   fields.
3. **Snapshot truth.** A participating giver sees one row per other current
   participant with derived `todo` state for absent entries and exact stored
   state otherwise; the sentinel row appears exactly when the caller is the
   only participant; denials return zero rows; ordering is deterministic;
   the generic **Member** fallback appears for missing names; budget fields
   match the stored group budget exactly.
4. **Status lifecycle with CAS atomicity.** First marking inserts one row at
   version 1; completing sets `completed_at` and increments the version;
   reopening clears `completed_at` and increments the version; a stale
   expected version returns `conflict` with no write; every committed
   change is all-or-nothing under induced failure and rollback.
5. **Recipient and cross-member privacy.** No function accepts a giver
   identifier; a member cannot read or mutate another member's checklist
   even as that checklist's recipient; the organizer has no additional read;
   `service_role` application calls gain nothing; no inference channel
   (counts, timing, error classes) distinguishes denial causes.
6. **Participation and mode gating.** Non-participating joined members
   appear on no checklist and are denied both functions; left, removed,
   declined, cross-group, outsider, invited, and null-auth callers are
   denied; a group whose stored mode is `wishlist_only` or `secret_draw`
   receives the generic denial from both functions with zero writes, even
   when checklist rows exist from a prior `gift_everyone` period.
7. **Route honesty.** `/groups/[groupId]/gifting` renders the checklist only
   for a currently joined, participating member of an active `gift_everyone`
   group; every other state — signed-out, incomplete profile, outsider,
   invited, declined, left, removed, wrong mode, malformed UUID, unknown
   group — receives the uniform not-found/error result with no group,
   member, checklist, or count data in HTML, RSC payload, or browser bundle;
   responses are non-cacheable.
8. **Reservation composition.** Checklist state never creates, releases, or
   impersonates a reservation; reserving through the linked recipient
   wishlist uses the Phase 6 surfaces unchanged; two givers reserving the
   same recipient's item produce exactly one active reservation with the
   friendly conflict for the loser, while each giver's checklist entry
   remains independently truthful; the recipient still sees nothing.
9. **Real races (two-session CI harness).** A committed, bounded harness
   with two independent database sessions, explicit barriers, finite
   lock/statement/client timeouts, and synthetic fixtures proves: (a) two
   concurrent first markings of the same pair produce one row and one
   counted change; (b) concurrent complete/complete and complete/reopen
   with the same expected version serialize so exactly one wins and the
   loser gets `conflict` with the current version; (c) a completion held
   open against an uncommitted recipient-leave transaction ends wholly
   pre-commit or wholly post-commit — never a completed entry against an
   absent recipient after the leave commits; (d) a status change held open
   against an uncommitted mode change serializes per the fixed lock order
   with no partial state; (e) the harness fails CI on any assertion failure
   or timeout and cleans up its fixtures. No new broad write endpoint is
   created to satisfy this criterion.
10. **Accessible responsive UI.** The checklist passes keyboard and axe
    checks in every state at 390 by 844 and 1440 by 1000, with textual
    statuses, truthful conflict handling, and reduced-motion support.
11. **Visual fidelity.** The gift-everyone checklist screen is a new visual
    candidate: V18 has no approved frozen equivalent for the production
    checklist, so captures at both viewports require independent
    product/design review and approval before any baseline commit. The
    existing room and browsing baselines remain unchanged and green.
12. **Analytics and privacy.** Exactly one new server event,
    `gift_checklist_progressed`, is emitted after successful authorization
    only, once per committed status change, with the closed property set
    `action` (`completed` | `reopened`) and `checklist_total_bucket`
    (`one_to_five` | `six_to_ten` | `eleven_plus`). Every denial class, the
    sentinel state, and the conflict result emit nothing. Recipient
    identities, giver-recipient mappings, entry counts below the bucket
    granularity, group names, and item data never enter analytics, logs,
    replay, or error reports; the checklist screen is blocked from
    autocapture and session replay. The implementation PR adds the event to
    `docs/analytics/tracking-plan.md` with exactly these properties.
13. **Regression safety.** All existing pgTAP suites, race suites, unit,
    component, browser, and visual suites, `pnpm verify`, and the CI
    database job remain green on the exact implementation head; no existing
    function signature, grant, policy, or projection changes.
14. **Exact-head gates and staging.** The forward migration, pgTAP, the
    checklist race harness, stack-gated browser/axe suites, visual runs,
    `pnpm verify`, CI, and the Railway preview are green on the exact
    independently reviewed head. Staging proof applies the reviewed
    migration to the existing staging Supabase project only after owner
    approval and uses synthetic accounts with cleanup; production
    Supabase/Railway is never mutated.

## Required pull-request evidence

- Acceptance-criteria table linking every item to exact tests, check runs,
  screenshots, and staging records.
- Exact-head `pnpm verify`, CI `verify` and `database` jobs including the
  checklist race step, named stack-gated suite, axe run, visual run, and
  Railway deployment.
- Migration ledger entry, complete table/function/grant/RLS inventory,
  forward-fix notes, and the deliberate `supabase/tests/smoke.sql`
  amendment recording the public-table inventory change from nine to ten
  reviewed application tables — recorded as a scoped amendment, never a
  silent relaxation.
- The `gift_checklist_progressed` tracking-plan amendment and analytics
  sink proof for all positive, conflict, sentinel, and denial states.
- Mobile and desktop before/after images for the populated, authorized-empty,
  and conflict states, with actual-image review, hashes, and the owner's
  written baseline decision for the new visual candidate.
- Confirmation that no Magic Patterns mock data, Vite/editor scaffolding,
  service-role credential, new dependency, production mutation, or
  baseline change made only to silence CI shipped.

## Migration and rollback notes

- One forward-only migration adds `gift_checklist_status`,
  `gift_checklist_entries`, the two functions, their exact revokes/grants,
  and any single justified index. No existing table, enum, function, grant,
  or policy changes. Tested from a fresh database and from a populated
  006a-006f state.
- Rollback is forward-fix only: the safe disabling migration revokes
  `authenticated` EXECUTE on both functions immediately, after which the
  surface fails closed everywhere; a later reviewed migration may drop the
  functions and table once the application no longer calls them. Stored
  entries are durable progress; never delete rows to restore behavior, and
  never weaken RLS.
- Mode transitions into and out of `gift_everyone` are data-neutral: they
  change no checklist row, and the functions' mode predicates hide or reveal
  state by derivation.

## Implementation plan

1. **Freeze merged dependencies.** Confirm the merged 006a-006f heads, the
   approved and merged Phase 6 briefs, and the approved 008a contract.
   Record the final schema, lock order, and reservation surface.
2. **Write database denial and shape tests first.** pgTAP signature,
   privilege, snapshot, lifecycle, gating, and privacy cases, proven failing
   before the migration exists.
3. **Add the migration.** Enum, table, functions, revokes/grants, index;
   amend the smoke inventory deliberately; keep every existing suite green.
4. **Add the two-session race harness.** New local-stack script and package
   script following the 006a harness pattern, wired as an explicit step in
   the CI `database` job after the existing race step, with a bounded
   timeout.
5. **Build the route and UI.** Protected no-store route, server mode
   dispatch, checklist rendering, honest conflict handling, accessibility,
   deterministic fixtures, and visual candidates.
6. **Verify, review, and stage.** Local gates, independent
   implementation/security/accessibility/image review, CI, Railway preview,
   staging migration and synthetic verification, cleanup, and evidence
   preservation. No production mutation.

## Non-goals

- No shared, claimable, or cross-member checklist task list; no item link on
  an entry (a future brief if product wants it).
- No draw, assignment, redraw, or secret-draw behavior; no change to the
  audit event-type enum.
- No reservation logic changes, no wishlist read of its own, no activity
  feed, no reminders, no emails.
- No mode-change UI or new mode-transition constraint.
- No budget enforcement, currency conversion, or purchase tracking.
- No production Supabase/Railway mutation, new dependency, Magic Patterns
  code or mock-data import, or unapproved visual-baseline change.

## Dependencies and gates

- Phase 5 exit and merged 006a-006f heads; approved, merged Phase 6 briefs
  (reactions, copy, reservations, gifting view, activity) with recorded
  heads.
- The approved 008a brief's cross-mode gating contract; 008a's own merge is
  not a hard blocker for this brief's implementation, but if 008b merges
  first, 008a's verification suite re-proves checklist denial for
  `wishlist_only` on its own head.
- 002b/002c, 004e, 005h foundations as published; 006d/006e room, roster,
  and browsing surfaces as the entry and destination paths.
- The secret-draw briefs (008c/008d) consume the mode-dispatch contract
  fixed here and may not broaden it retroactively.
- Staging migration is a separate owner-approved gate; the staging gate does
  not close merely because local/CI tests pass.

## Analytics, security, and privacy

The single new event `gift_checklist_progressed` follows the typed catalog:
server-emitted only, closed property schema, coarse buckets, no identifiers,
no giver-recipient mappings, no entry contents. The tracking plan's
prohibited-data list is binding; the implementation review confirms the
event against it before merge.

Checklist contents, recipient identities, progress mappings, budget values,
and denial causes never enter PostHog properties, logs, traces, error
reports, session replay, or screenshots used as telemetry. The screen
combines private group content with gifting progress and is blocked from
autocapture and session replay.

Authorization lives entirely in the database under the caller's
authenticated session: actor from `auth.uid()`, authority checked inside
the transaction after the locks, CAS on the stored version, no service-role
credential in the application path, no client-side mode or participation
claim, no feature flag as authorization. The recipient's invisibility is
enforced by the absence of any read path, not by UI filtering.

## Planning status

Brief only. This document does not authorize implementation, migrations,
cloud changes, Linear state changes, baseline commits, or merge. The owner
must approve the exact commit and link it from the matching Linear issue
first, and must rule on the owner-review flags in Resolved decisions 1, 2,
3, 5, 6, and 7.
