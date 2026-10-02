# 007d — Activity summaries that never leak private gifting state

## Outcome

Joined group members see a bounded, per-viewer-filtered activity summary for
a group and for a member, aggregated from consequential events that already
exist: the 006a audit trail, 007c reservation events, and reactions as
committed by 007a. The summary is filtered per viewer so that no viewer ever
sees private-gifting facts about themselves or facts their viewer class is
not entitled to. The binding rule it implements is the repository rule:
**never let wishlist recipients see reservations, purchase progress, or
private gifting assignments about themselves** — and its corollary: no
viewer sees gifting facts they are not entitled to, and the organizer is
not omniscient.

This slice is read-only over committed events. It adds no new event source,
no write path, no notification, and no aggregate that could reveal a hidden
entry.

## Scope

### Event source inventory (binding)

The activity read model consumes exactly the following committed sources,
filtered per viewer. It never reads a source outside this inventory, and no
source may be added without a reviewed revision of this brief.

| Source (as merged)              | Event kinds consumed                                                                                                                                                                                                 | Excluded kinds                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 006a `public.audit_events`      | `group_created`, `invitation_accepted`, `member_left`, `member_removed`, `organizer_transferred`                                                                                                                      | `invitation_issued`, `invitation_revoked`, `invitation_declined`, `member_reinvited` (invitation mechanics and token-adjacent state) |
| 007c `public.audit_events` rows | `item_reserved`, `reservation_released` — per-viewer filtered (below)                                                                                                                                                 | —                                                                                                                    |
| 007a reactions (as merged)      | Reaction entries carry only the fields 007a's committed read surface already exposes to eligible members (reaction kind, reacted item, actor)                                                                         | Any reaction internals 007a does not already expose                                                                   |

- **Decision — reaction source.** If 007a ships a queryable event or
  summary surface eligible members can already see, 007d joins it for
  reaction entries. If 007a ships no such surface, reaction entries are
  excluded from this slice's first implementation and added later by a
  reviewed amendment; the membership and reservation classes below ship
  regardless. This slice never reads reaction tables through a broader
  shape than 007a approved.
- **Decision — list only, no aggregates.** The v1 summary is a bounded,
  ordered list of event entries. No count, total, or aggregate field is
  returned by any projection, because a total that is stable across viewer
  classes would let the owner infer the number of hidden reservation events
  about their own items. A count-bearing variant requires its own reviewed
  brief.
- **Decision — no assignment state.** Draws and assignments do not exist in
  Phase 6. No assignment, checklist, or draw-version field is read,
  referenced, or reserved for future inclusion in this slice.

### Per-viewer visibility matrix (exact)

Every entry is evaluated against the viewer (`auth.uid()`) before it can
appear. The matrix is the contract; pgTAP must prove every cell, including
the blind spots, with negative tests.

| Entry kind                                                      | Item owner viewing | Reserver viewing | Other joined member viewing | Organizer viewing (as member) | Outsider / pending / left / removed / signed out |
| --------------------------------------------------------------- | ------------------ | ---------------- | --------------------------- | ----------------------------- | ------------------------------------------------- |
| Membership events (006a kinds above)                            | Yes                | Yes              | Yes                         | Yes                           | Generic denial (empty/unauthorized, per 006d)     |
| Reaction entries on someone's item                              | Yes (owner sees the same read-only summary 007a approves) | Yes | Yes | Yes | Generic denial |
| Reaction entries on the viewer's own item                       | Yes (read-only)    | Yes              | Yes                         | Yes                           | Generic denial                                    |
| Reservation events on the viewer's own item (any kind)          | **Never**          | N/A (not owner)  | N/A (not owner)             | **Never** — organizer role confers no access | Generic denial |
| Reservation events on another member's item, viewer is reserver | N/A                | Yes, self-labelled ("you") | Yes, state-only   | Yes, state-only               | Generic denial                                    |
| Reservation events on another member's item, viewer not reserver| N/A                | Yes, state-only  | Yes, state-only             | Yes, state-only               | Generic denial                                    |
| Reservation reserver identity                                   | Never              | Own only         | Never                       | Never                         | Generic denial                                    |

- **State-only reservation entries** contain the item reference (id and
  title), the owner's display name, the event kind, and the timestamp.
  They never contain the reserver's identity, reservation id, or any
  free-form reason. A viewer who is the reserver sees their own entry with
  a self flag instead of an actor name.
- **The owner's blind spot is total.** While reservations demonstrably
  exist on the owner's items, the owner's summary contains no entry, no
  placeholder, no gap marker, and no count for them. Because no
  total-count field exists (decision above), the owner cannot infer how
  many entries were withheld.
- **The organizer is not omniscient.** Organizer status confers exactly the
  joined-member view of the activity model. There is no administrative
  activity view, no organizer-only projection, and no organizer exemption
  from the owner blind spot when the organizer is the item's owner.
- Former members (left/removed), pending, declined, outsiders, and
  signed-out callers receive the same generic denial the 006d group room
  contract defines; they learn nothing about events, kinds, counts, or the
  group's activity volume.

### Read model

- Add one forward-only migration containing read-only
  `SECURITY DEFINER` projections only — no new table, no new enum, no new
  policy, no write path. If implementation cannot proceed without a
  materialized read model, that is a reviewed revision of this brief, not
  an implementation choice.
- `public.group_activity(p_group_id uuid, p_before timestamptz, p_limit
  integer)` returns bounded rows of exactly:

  ```text
  event_kind        text            -- bounded, closed kind set from the inventory
  occurred_at       timestamptz
  actor_display_name  text nullable -- null when the rule withholds identity
  subject_display_name text nullable -- membership-event subject, generic fallback
  item_id           uuid nullable   -- reservation/reaction entries only
  item_title        text nullable   -- bounded item title, snapshot semantics
  owner_display_name text nullable  -- item owner for item entries, generic fallback
  involves_viewer   boolean         -- true when the entry's actor is the viewer
  ```

  with `event_kind`, `occurred_at`, and `involves_viewer` never null.
  Ordering is `occurred_at desc, id desc` (keyset); `p_before` is the
  cursor upper bound; `p_limit` is clamped to the closed range 1–50 with a
  default of 20 inside the function. Display names use the established
  generic **Member**/**Organizer** fallback so the application never
  performs a direct profile lookup.
- `public.member_activity(p_group_id uuid, p_member_id uuid, p_before
  timestamptz, p_limit integer)` returns the same row shape, restricted to
  entries whose actor or membership subject is `p_member_id`. Its
  per-viewer filtering applies the same matrix, which yields one extra
  binding rule: **another member's reservation entries never appear in
  their per-member activity at all** — reserver identity is visible only
  to the reserver, so a viewer who is not the reserver gets no
  reservation-class entries from `member_activity` about that member. The
  viewer's own member activity may include their own reservation entries,
  self-labelled.
- **Authorization predicate.** Both projections authorize the caller as a
  currently `joined` member of the group inside the statement (006a
  `private.is_joined_group_member` semantics). For `member_activity`, the
  target member must also be currently `joined` in the same group. Every
  denial — including stale target membership — returns zero rows, the same
  empty result for every denial class.
- **One-statement snapshot.** As in 006e/007c, each projection is one
  data-reading SQL statement: authorization, source joins, per-viewer
  filtering, and ordering are CTEs or expressions of that single statement
  and share one PostgreSQL statement snapshot, so a concurrent event append
  or membership change can never produce a half-filtered page. The
  functions are declared `STABLE` (no volatile wall-clock call is required
  for filtering; the cursor is a bound parameter).
- **Filtering is in the statement, never the client.** The application may
  not receive unfiltered rows and drop them client-side. No flight data,
  payload, log, or error may contain an entry the matrix withheld.
- The projections are read-only; they cannot mutate any table. Function
  privileges follow the established inventory: `REVOKE EXECUTE` from
  `PUBLIC`, `anon`, `authenticated`, and `service_role`, then exact
  `EXECUTE` to `authenticated` only. `anon` has no activity access; the
  signed-out invitation preview remains the only anon-callable function in
  the database.
- Because no table is added or altered, the `smoke.sql` public-table
  inventory is unchanged; if the implementation touches the smoke suite at
  all, the change is a deliberate, recorded, scoped amendment — never a
  silent relaxation.
- **Reservation entries after item deletion.** A reservation released by
  007c's `item_deleted` path has a null `item_id`; its entry resolves
  `item_title` by joining the audit metadata's `reservation_id` to
  `group_item_reservations.item_title_snapshot` — never through a direct
  `wishlist_items` join, which the deleted item row can no longer satisfy.
  The join stays inside the same single statement.
- **Anon-callable surface.** As of this brief there are zero
  anon-callable functions in the database (006c's invitation preview is
  not yet merged); when 006c merges, its signed-out invitation preview
  becomes the only anon-callable function. In either state, no activity
  projection is ever callable by `anon`.

### UI states

- The group room route (006d) gains an activity section rendering the
  authorized `group_activity` entries with the product's tone, using the
  self-labelling rule (`involves_viewer`) and state-only wording for
  reservation entries ("A gift was reserved" — never "Kabir reserved
  Priya's gift" unless the viewer is Kabir).
- The approved V18 prototype has no activity-feed screen; the group
  activity section is therefore a **new visual candidate** requiring its
  own independent product/design review and approval before any baseline is
  committed. It is not silently part of any pinned region.
- The per-member activity projection ships database-first: its UI entry
  point (placement on the member context) is a follow-up visual candidate
  and is not part of this slice's UI scope.
- Owner-facing routes gain no reservation wording, for the same zero-diff
  requirement as 007c: the owner's wishlist and account surfaces are
  byte-identical whether or not reservations exist.
- Loading, empty, denial, and populated states are explicit, keyboard
  accessible, and responsive; touch targets remain at least 44 by 44 CSS
  pixels; reduced motion is respected. Empty state says there is no
  activity yet without inviting actions the viewer cannot take.
- Entries never render invitation mechanics (issued/revoked/declined/
  reinvited), emails, tokens, or any excluded kind — including in
  `title` attributes, `aria-label`s, or client state.

### Deterministic fixtures

Provide deterministic, non-production fixtures exercising every matrix row:
a group with reservations active on one member's items (so the owner-blind
spot is testable in UI), reaction entries per 007a's committed surface,
membership events, a former member, and every denial class. Fixtures must
not contain Magic Patterns runtime data, real identities, live retailer
dependencies, or assignment state, and must register through the
established local-stack helpers (`scripts/e2e-local-stack.sh`,
`tests/helpers/local-stack.ts`).

## Non-goals

- No notifications, emails, digests, or push of any kind.
- No draw, assignment, checklist, or purchase-progress state (Phase 7
  consumes this model; its addition is a reviewed revision).
- No counts, aggregates, badges, or "N new" markers.
- No event creation, editing, deletion, hiding, or moderation UI; the audit
  trail remains append-only through its existing paths.
- No organizer-only or administrative activity view.
- No comment thread, chat, or free-form text in entries.
- No per-member activity UI surface (projection and pgTAP only).
- No new table, dependency, Magic Patterns artifact, or owner-visual-
  baseline change; no production or staging Supabase mutation from the
  implementation PR.

## Acceptance criteria

1. **Matrix fidelity (pgTAP).** Every cell of the visibility matrix is
   proven positive and negative with a fixture in which the withheld facts
   demonstrably exist in the database while the denied viewer's result is
   asserted — most importantly: the item's owner observes zero reservation
   entries, zero reservation-related fields, and zero withheld-entry
   markers for their own items.
2. **Organizer non-omniscience (pgTAP, negative).** The organizer's
   activity results are identical to any other joined member's for the
   same viewer position; no organizer-only projection or grant exists.
3. **Reserver identity privacy (pgTAP, negative).** State-only entries
   expose no reserver identity, reservation id, or release reason to any
   viewer except the reserver's own self-labelled entries.
4. **Denied classes (pgTAP).** Signed-out, outsider, pending, declined,
   left, removed, cross-group, stale-target, and unknown-group callers all
   receive the identical empty/denied result and learn nothing about
   events, kinds, counts, or volume.
5. **Bounded result shape (pgTAP).** Declared columns and runtime results
   match exactly — no extra fields; `p_limit` clamping, keyset ordering,
   cursor behavior, and bounded text are asserted; display names fall back
   generically.
6. **Excluded kinds never appear (pgTAP).** `invitation_issued`,
   `invitation_revoked`, `invitation_declined`, `member_reinvited`, and any
   kind outside the inventory are absent from every viewer's results, even
   when present in `audit_events`.
7. **Grants and inventory (pgTAP).** EXECUTE is revoked from `PUBLIC`,
   `anon`, `authenticated`, and `service_role` on every new function
   (all overloads) before the exact `authenticated` grants; no new table
   privileges or policies exist; the private schema's helpers are
   unchanged except where 007c already amended them.
8. **Single-statement filtering (pgTAP/code review).** Each projection is
   one statement with one snapshot; no application-level post-filtering of
   private facts exists; concurrent event appends cannot produce
   half-filtered pages (membership-change straddle proof as in 006e).
9. **Owner zero-diff (visual + e2e).** Owner-facing routes render
   byte-identically with and without active reservations; existing owner
   baselines remain green without modification.
10. **UI states.** The group activity section renders authorized entries
    with self-labelling and state-only wording, empty/loading/denial
    states, keyboard access, visible focus, reduced-motion respect, and
    zero automated accessibility violations at both approved viewports.
11. **Regression safety.** `pnpm verify`, existing database tests, both
    race harnesses, and stack-gated e2e pass on the exact PR head.
12. **Delivery evidence.** Acceptance criteria copied into the PR with
    evidence; migration and forward-fix notes; the staging ledger (below);
    visual candidates reviewed independently; confirmation that no Magic
    Patterns mock data or editor artifacts shipped.

## Required proof

- pgTAP covers every matrix cell with positive and negative assertions,
  including fixtures where reservation events exist while the owner's and
  non-reserver's results are asserted empty of them; function signature,
  nullability, clamping, ordering, and grant-enumeration tests; and the
  excluded-kind absence test.
- Playwright proves the group activity section's populated, self-labelled,
  state-only, empty, and denial states, keyboard traversal, and the
  owner's unchanged experience. Axe runs on every rendered state at 390 by
  844 and 1440 by 1000.
- Analytics tests use the development sink for the event below, including
  zero-emission denial proof.
- Visual evidence: the new group-activity candidate at both approved
  viewports, independently reviewed; owner routes evidenced as unchanged; a
  Railway preview attached when available. No baseline changes without
  explicit product/design approval.

## Dependencies

- 006a (audit trail, membership semantics, joined-member authority,
  generic-denial contract) and 006b must be merged.
- Phase 4 (005a–005d) supplies item titles, bounds, and owner semantics
  referenced by entry fields.
- 006d supplies the group room route and generic-denial behavior; 006e
  supplies the browse surface and the one-statement projection pattern.
- 006c supplies invitation acceptance and the signed-out invitation
  preview; once merged it is the only anon-callable function, and these
  activity projections never join it in that state.
- 007c must be merged: the `item_reserved`/`reservation_released` kinds,
  their metadata contract, and the state-only visibility rules are defined
  there and consumed here.
- 007a (reactions, as approved and merged) is the reaction-entry source;
  per the decision above, its absence narrows this slice's entry classes
  rather than broadening its reads.
- Planning may complete before these dependencies merge. Implementation
  cannot start until the approved exact brief commit is linked to its
  Linear issue and the dependencies above are complete.

## Analytics, security, and privacy

- One privacy-safe server-emitted event, `group_activity_viewed`, only
  after successful authorization, exactly once per authorized render (a
  refresh is a new event). Closed property schema:

  | Property            | Type        | Allowed values (exact enum)                                               |
  | ------------------- | ----------- | -------------------------------------------------------------------------- |
  | `scope`             | string enum | `group`                                                                    |
  | `entry_count_bucket`| string enum | `zero` (0 visible entries), `one_to_five` (1-5), `six_to_twenty` (6-20), `twenty_one_plus` (21 or more) — counted over the viewer's **visible** entries only |
  | `gifting_mode`      | string enum | `secret_draw`, `gift_everyone`, `wishlist_only`                            |

  No other property, identifier, or count is sent: no item, group, user,
  reservation, or event ids, no titles, no kinds, no timestamps. The bucket
  reflects visible entries only, so it cannot reveal withheld entries.
- **Tracking-plan change required.** The implementation PR adds
  `group_activity_viewed` to `docs/analytics/tracking-plan.md` as a
  server-source event with exactly the three properties above, reviewed
  against that plan's prohibited-data list.
- **Zero-emission denial proof.** Every denial class emits no
  `group_activity_viewed` event and no other new event.
- Server authorization is authoritative; client state and analytics never
  grant access. Responses are private and user-specific, never publicly
  cacheable and never shared across viewers. Security logging uses request
  identifiers and coarse denial categories, never entry content.

## Implementation plan and gates

1. Review 006a's audit schema, 007c's committed event kinds and visibility
   contract, 007a's committed reaction surface, and the 006e
   one-statement projection pattern; implement the projections and
   privilege inventory in one forward migration.
2. Add the pgTAP matrix suites (every cell, positive and negative) and the
   result-shape/clamping/ordering tests; run the full existing database
   suite; no smoke inventory change is expected, and any smoke edit is a
   recorded scoped amendment.
3. Implement the group-activity UI section and fixtures; produce the new
   visual candidate and accessibility evidence; keep owner routes
   byte-identical.
4. Applying the committed migration to the dedicated **staging** Supabase
   project is a separate owner-approved gate before any staging validation
   or later Phase 6 staging deployment. Evidence must include the exact
   migration commit and ledger version, inventory/RLS verification,
   synthetic filtered/denial smoke results, and an owner approval record.
   No dashboard SQL or production deployment is included here. The staging
   gate does not close merely because local/CI tests pass.

## Planning status

Brief only. This document does not authorize implementation, migrations,
cloud changes, Linear state changes, baseline commits, or merge. The owner
must approve the exact commit and link it from the matching Linear issue
first.
