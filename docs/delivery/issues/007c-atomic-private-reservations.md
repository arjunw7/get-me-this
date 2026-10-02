# 007c — Atomic private reservations with race tests

## Outcome

A joined, participating group member can privately reserve a friend's
wishlist item inside a group so that duplicate gifting is prevented and the
surprise is preserved. The reservation is claimed atomically — two members
racing on the same item produce exactly one winner and a friendly conflict —
and the item's owner learns nothing: not that the item is reserved, not how
many reservations exist, not who reserved, not when. This slice implements
the reservation schema, the transactional claim/release API, the
owner-blind read model, the minimal reserve affordance on the existing
member-wishlist browse surface, and a committed two-session race harness in
CI.

The repository rule is absolute and binds every line of this slice:
**never let wishlist recipients see reservations, purchase progress, or
private gifting assignments about themselves.** A reservation on a friend's
item must be invisible to the item's owner in the owner's wishlist
experience and in every view, projection, count, error, log, and payload the
owner can access.

## Scope

### Reservation model and decision record

- Add one forward-only migration with table, enum, grants, RLS, and tests.
  Follow the established conventions: UUID primary keys,
  `clock_timestamp()` for wall-clock values and managed timestamps, bounded
  text, `ON DELETE RESTRICT` for auth-user and group references, durable
  history rows, explicit REVOKE-then-exact-GRANT inventory, and SECURITY
  DEFINER functions with an empty `search_path`.
- `public.group_item_reservations` stores:

  | Column                | Type / constraint                                                       |
  | --------------------- | ----------------------------------------------------------------------- |
  | `id`                  | uuid primary key, `gen_random_uuid()`                                   |
  | `group_id`            | uuid, references `public."groups"` (id) `ON DELETE RESTRICT`, not null  |
  | `item_id`             | uuid, references `public.wishlist_items` (id) `ON DELETE SET NULL`, nullable |
  | `reserver_id`         | uuid, references `auth.users` (id) `ON DELETE RESTRICT`, not null       |
  | `status`              | `public.group_reservation_status` (`active`, `released`), not null      |
  | `item_title_snapshot` | text, not null, bounded to the 005a title length and whitespace rules   |
  | `reserved_at`         | timestamptz, not null, `clock_timestamp()`                              |
  | `released_at`         | timestamptz, nullable                                                   |
  | `released_reason`     | `public.group_reservation_release_reason` (`by_reserver`, `item_deleted`, `reserver_departed`), nullable |
  | `created_at` / `updated_at` | timestamptz, not null, database-managed (`clock_timestamp()` triggers, as 006a) |

  A partial unique index on `(group_id, item_id)` where
  `status = 'active'` is the database-level backstop for the one-winner
  invariant. Rows are never deleted: released rows are durable history, and
  `item_id` becoming null (item deletion) keeps the row meaningful through
  `item_title_snapshot`, captured at claim time.
- **Decision — no co-reservation.** Exactly one active reservation may exist
  per group and wishlist item. This follows
  `docs/flows/groups-and-gifting.md` ("Only one active reservation may exist
  for a group and wishlist item") and the duplicate-prevention promise. Two
  members who want the same gift coordinate outside the reservation; the
  second claimant receives the friendly conflict state.
- **Decision — eligibility is uniform in this slice (decided in review).**
  A member may claim
  exactly when, in the same statement: the caller is a currently `joined`
  member of the group (via the 006a
  `private.is_joined_group_member(group_id)` semantics), the item's owner is
  a currently `joined` member of the same group, and the caller is not the
  item's owner. This applies to all three group modes. Restricting
  reservations to `wishlist_only` groups was considered and rejected: it
  would wrongly disable reservations in `gift_everyone` groups, where
  members also browse and reserve without assignments. The permissions
  matrix marks reserve eligibility "mode-dependent"; the remaining
  mode-specific narrowing (secret-draw assignments) requires
  Phase 7 assignment tables that do not exist yet. Any narrowing is a
  reviewed revision of this brief, never a silent policy edit. Self-
  reservation of one's own item is denied in every mode.
- **Decision — departure auto-releases the reserver's active
  reservations.** When a reserver's `group_members` row transitions to
  `left` or `removed`, every `active` reservation they hold in that group
  is released in the same transaction with
  `released_reason = 'reserver_departed'`, by a SECURITY DEFINER trigger
  added in this slice's migration. The release is silent: owner-blind
  rules are unchanged (the owner still learns nothing), no notification or
  email is sent, and the departing member retains no access. The released
  item is immediately claimable again through the normal atomic claim
  path. Rows remain durable history.
- **Decision — reservation identity is visible only to the reserver.** Other
  eligible members see only that an item is reserved (a boolean state), never
  who reserved it. This is the most private reading of "visible only to the
  reserving user and other eligible non-recipient gift givers when
  coordination requires it": preventing duplication requires the state, not
  the identity.

### Atomic claim and lifecycle

- `public.reserve_group_item(p_group_id uuid, p_item_id uuid)` returns
  `(result text, reservation_id uuid)`. SECURITY DEFINER, empty
  `search_path`, caller derived from `auth.uid()`. Results:
  `reserved` (success), `already_yours` (the caller already holds the active
  reservation — an idempotent no-write replay: no second row, no second
  audit event, and no analytics event),
  `conflict` (another member holds the active reservation — the friendly
  conflict), and `unavailable` for every denial class (signed out,
  outsider, pending/declined/left/removed, cross-group item, unknown
  group/item, own item, stale membership). Denial classes are mutually
  indistinguishable; only eligible callers can ever observe `conflict` or
  `already_yours`.
- Fixed lock order, extending the 006a convention: lock the `groups` row
  `FOR UPDATE` first; then the `wishlist_items` row; then any existing
  `group_item_reservations` rows for `(group_id, item_id)` by ascending
  id; then evaluate eligibility and the active-reservation state and insert.
  `clock_timestamp()` is evaluated only after all locks are held. The
  partial unique index backstops the function: a concurrent insert that
  still wins the index race is converted to the generic `conflict` result
  with a full rollback and no partial effects.
- `public.release_group_reservation(p_group_id uuid, p_reservation_id uuid)`
  returns `(result text)`. Reserver-only, authority checked inside the
  transaction after the group lock; sets `status = 'released'`,
  `released_at = clock_timestamp()`, `released_reason = 'by_reserver'`.
  Releasing an already-released own reservation is an idempotent success
  with no second audit event. A member cannot release another member's
  reservation; the result for every failure class is `unavailable`.
- **Owner deletion must never fail or differ because of a reservation.** A
  SECURITY DEFINER `BEFORE DELETE` trigger on `public.wishlist_items`
  releases any `active` reservation on the deleted item with
  `released_reason = 'item_deleted'` before the FK `ON DELETE SET NULL`
  nulls `item_id` on the durable rows. The owner's delete path therefore
  has no new error, no new latency contract, and no observable difference
  between a reserved and an unreserved item; no notification, email, or
  analytics event reaches the owner from this path.
- **Departure releases the reserver's active reservations.** A SECURITY
  DEFINER trigger on `public.group_members` — added by this slice's
  migration — watches the status transition to `left` or `removed` and, in
  the same transaction, releases every `active` reservation that member
  holds in the group with `released_reason = 'reserver_departed'` and
  `released_at = clock_timestamp()`. The release is silent: no
  notification or email reaches anyone, the owner-blind rules are
  unchanged, and the freed item is immediately claimable through the
  normal atomic claim path. The trigger appends the same single
  `reservation_released` audit event as an explicit release (actor is the
  departing reserver) so 007d's source inventory stays complete. If the
  membership transition rolls back, the release and its audit event roll
  back with it.
- **Audit via the private appender.** Successful claim and release append
  one event each to `public.audit_events` in the same transaction, through
  the existing `private.append_group_event` (never a direct client write
  path): actor is the reserver, `subject_user_id` is the item's owner, and
  metadata carries only bounded identifiers —
  `jsonb_build_object('item_id', …, 'reservation_id', …)`. This requires
  two reviewed amendments of 006a internals, in the same migration:
  1. `alter type public.group_audit_event_type add value 'item_reserved'`
     and `'reservation_released'`. Because an added enum value cannot be
     used by statements in the same migration transaction, either ship the
     enum addition as its own forward migration immediately ahead of the
     reservation migration, or never use the new values in the migration
     itself (runtime appends are unaffected).
  2. Extend the `private.audit_metadata_is_safe` allowlist with exactly
     `item_id` and `reservation_id` (string values only, same shape rules).
     The allowlist may not be loosened beyond these two keys.
- New audit rows inherit the existing guarantees: no client role has any
  direct privilege on `audit_events`, and metadata never contains tokens,
  emails, wishlist contents beyond the item identifier, or reserver-facing
  free text.

### Read model and authorization (owner-blind)

- `public.group_item_reservations` has **no client grants and no RLS
  policies** — the same posture as `group_members` and `audit_events` in
  006a. There is no direct client read or write path of any kind, for any
  role, including `service_role` through the application API.
- `public.my_group_reservations(p_group_id uuid)` returns the caller's own
  active reservations in the group: exactly `reservation_id`, `item_id`,
  `item_title_snapshot`, `owner_display_name` (with the established generic
  **Member** fallback), and `reserved_at`, ordered by `reserved_at desc,
  id asc`. Empty for every denial class. Bounded result: it returns only
  the caller's own rows, so it never reveals another member's reservations.
- `public.member_wishlist_gifting_snapshot(p_group_id uuid, p_member_id
  uuid)` is the gifting read model for the 006e browse surface: the exact
  006e item columns (same active-item predicate, extraction states, 005d
  ordering, and image contract) plus exactly two additional columns,
  `viewer_reserved boolean` and `reserved_by_other boolean`. It never
  returns a reservation id, reserver identity, reserver count, or
  reservation timestamp. Rules:
  - `viewer_reserved` is true exactly when the caller holds the active
    reservation for that item.
  - `reserved_by_other` is true exactly when another member holds the
    active reservation and the caller is an eligible member. It is never
    true for the item's owner.
  - **Authorized-empty sentinel.** On the 006e authorized-empty case (a
    successfully authorized target whose visible item set is empty), the
    projection returns exactly the 006e sentinel row — `item_id` null and
    every other item column null — with both flags `false`. Shape tests
    assert these exact values; no reservation state is evaluated for a
    sentinel row.
  - **Owner-blind evaluation.** When the target member is the caller (own
    wishlist), both flags are false and the statement does not read the
    reservation table for the caller's own items at all. The owner's
    result is byte-identical whether zero, one, or many reservations exist
    on their items.
  - The merged 006e projection `member_wishlist_snapshot` is **not**
    modified. This is a new function composing the same item predicate;
    006e's read shape is unchanged and its brief's non-broadening clause is
    honored.
- Like 006e, each projection is one data-reading SQL statement sharing one
  PostgreSQL statement snapshot; authorization and reads never straddle a
  membership change, and a leave/removal that commits before the snapshot
  yields the generic denial.
- Migration work ships as one forward-only migration (plus the enum
  migration if split per above) with matching pgTAP privilege,
  result-shape, positive, negative, and enumeration tests. Existing 005a
  owner CRUD, 006a group behavior, and 006e browsing must remain unchanged
  outside the named 006a amendments and the two triggers this slice adds
  (item deletion on `wishlist_items`; departure on `group_members`).

### Browse-surface UI states

- The 006e member-wishlist browse route gains the per-item reserve
  affordance for eligible viewers, reproducing the reserve affordances of
  the pinned **gifting-browse member-wishlist region** of the approved V18
  prototype (`docs/design-reference/baselines/v18/gifting-browse--mobile-
  390x844.png`, `.../gifting-browse--desktop-1440x1000.png`). Still omitted
  from scope even though the V18 region shows them: the gifting banner,
  budget-fit summary, gift tracking, budget-comparison filtering, and
  gifting navigation.
- States: reserve action on unreserved eligible friend items; **Reserved by
  you** with a release action on the caller's own reservations; a
  **Reserved** state chip (no identity) on items reserved by another;
  friendly conflict feedback when a claim loses the race; loading,
  success, failure, and empty states. All states are keyboard accessible
  with visible focus; touch targets remain at least 44 by 44 CSS pixels;
  destructive/release requires confirmation per the design contract.
- The owner's own wishlist experience (`/wishlist`) gains nothing: no
  visual diff, no reservation wording, no count, no placeholder space where
  a reservation state would sit. This is a binding zero-diff requirement,
  evidenced by the existing owner visual baselines remaining green.
- The V18 region's reserve affordances were previously explicitly omitted
  from 006e's scope, so the populated reserved/unreserved card states are
  reviewed visual candidates against the pinned V18 region; a missing
  distinct frozen state becomes a reviewed candidate, not an invented
  approved baseline. No baseline changes without explicit product/design
  approval.
- The gifting view, external purchase action, and per-reservation purchase
  tracking (backlog item 31) remain later slices.

### Deterministic fixtures

Provide deterministic, non-production fixtures for: an eligible viewer
reserving a friend's item; the reserved-by-you state; the reserved-by-another
state (no identity); a conflict on a claimed item; release; the owner's
unchanged wishlist and browse views while a reservation is active; and the
generic denial states. Fixtures must not contain Magic Patterns runtime
data, real identities, live retailer dependencies, or assignment state, and
must register through the established local-stack helpers
(`scripts/e2e-local-stack.sh`, `tests/helpers/local-stack.ts`) without
changing the owner-visible fixture content that existing visual baselines
pin.

### Race harness (required)

- Add `scripts/test-reservation-races-local.sh` following the
  `scripts/test-group-races-local.sh` conventions exactly: selects this
  repository's local Supabase database container exactly; opens TWO
  INDEPENDENT psql sessions interleaved with explicit output barriers;
  finite timeouts; exits nonzero on any assertion failure or timeout;
  synthetic fixed-uuid fixtures cleaned up on every exit path; no bearer or
  credential material ever printed.
- Required scenarios, asserting final rows, status, released reasons, and
  audit events after each, including both commit orders where relevant:
  1. **Two members claim the last unreserved state.** Exactly one `reserved`
     result and one active row; the loser receives `conflict` and no row.
  2. **Claim vs. release race** (R1 is member A's active reservation;
     member B claims the same item). The harness encodes these exact
     expected results per order, with no runtime semantic derivation:
     - **Order 1 — A's release of R1 commits first.** B's waiting claim
       then receives `reserved`; R1 is `released` with reason
       `by_reserver`; B's new row is the only active reservation; the
       audit trail holds exactly two events (`item_reserved` for B's
       claim, `reservation_released` for R1).
     - **Order 2 — B's claim commits first.** B receives `conflict` and
       no row (R1 was still active); A's release of R1 then succeeds with
       reason `by_reserver`; a subsequent re-claim by B receives
       `reserved` and creates a new active row; the audit trail holds
       exactly two events (R1's release and B's successful re-claim) —
       B's conflicting claim appends none, per the analytics rule.
     Both orders assert exact final rows, statuses, reasons, and audit
     counts.
  3. **Claim vs. owner-delete.** Delete commits first: the waiting claim
     resolves `unavailable` with zero rows and the owner delete produced no
     error. Claim commits first: the delete still succeeds without error,
     and the fresh active reservation is released with reason
     `item_deleted`, `item_id` nulled, the row durable. The owner sees no
     difference in either order.
  4. **Double-claim by the same user.** Two concurrent claims by one
     reserver produce exactly one active row; the second result is
     `already_yours` or `conflict`, never a second row or second audit
     event.
  5. **Loser rollback.** A forced rollback of a losing transaction leaves
     no partial reservation, audit, or lock effects, and a subsequent claim
     by the other member succeeds.
- Membership-transition race note: a `release_group_reservation` call that
  contends with the reserver's own leave/removal must serialize through the
  group lock. Both commit orders leave the reservation released exactly
  once (reason `by_reserver` from the explicit release or
  `reserver_departed` from the departure trigger) with exactly one audit
  event, and a subsequent claim by another member follows the normal
  atomic claim path. The harness asserts these exact outcomes without
  deriving them at runtime.
- The implementation adds `pnpm test:db:races:reservations` to
  `package.json` and an explicit `Run reservation two-session races` step
  to the existing CI `database` job **after** the existing group race step
  and **before** the stack-gated e2e step, with `timeout-minutes: 5`. A
  green pgTAP step alone never satisfies the race criterion.

## Non-goals

- No gifting view screen, external purchase action, purchase/purchased
  state, or per-reservation checkout tracking (backlog item 31).
- No assignments, draws, checklists, or mode-specific eligibility.
- No reactions, reaction summaries, copy-to-wishlist, or activity feed.
  Reservations stay hidden from every activity surface until 007d's
  filtering rules exist; 007c adds no activity surface.
- No notifications or emails about reservations to anyone, including the
  reserver.
- No group-scoped "my reservations" page; the read model and per-item
  states above are the entire v1 surface.
- No reservation counts, aggregates, or analytics for owners.
- No new dependency, no Magic Patterns mock data, no owner-visual-baseline
  change, and no production or staging Supabase mutation from this slice's
  implementation PR.

## Acceptance criteria

1. **Single-winner model (pgTAP).** The table, enums, bounds, FK actions,
   partial unique index, and managed timestamps match this brief; no two
   active reservations can exist for one group and item through any write
   path, including the index backstop.
2. **Eligibility (pgTAP).** Claim succeeds for a joined, participating,
   non-owner member; fails generically for signed-out, outsider, pending,
   declined, left, removed, cross-group, unknown-item, stale-membership,
   and own-item attempts; every denial returns the same `unavailable`
   shape.
3. **Atomic claim and friendly conflict (pgTAP + races).** Race scenario 1
   produces exactly one winner, one active row, one audit event, and a
   friendly `conflict` for the loser with no partial effects.
4. **Lifecycle (pgTAP).** Release is reserver-only and idempotent;
   released rows are durable history with reason and timestamp; re-claiming
   after release creates a new row and works.
5. **Owner deletion safety (pgTAP + races).** Owner delete succeeds
   identically with and without active reservations, in both commit orders
   against a concurrent claim; active reservations become
   `item_deleted`-released; no error, notification, or observable
   difference reaches the owner.
6. **Departure release (pgTAP + races).** Leaving and being removed each
   auto-release the departing member's active reservations in that group
   with reason `reserver_departed`, in the same transaction as the
   membership transition; the release is silent (owner-blind rules
   unchanged, no notification), a rolled-back transition leaves the
   reservation active, and a subsequent claim by another member succeeds
   through the normal atomic path.
7. **Owner-blind privacy (pgTAP, negative).** As the item's owner: direct
   table access is privilege-denied; `member_wishlist_gifting_snapshot`
   for the owner's own items returns both flags false, and its output is
   byte-identical whether zero, one, or many reservations exist on the
   owner's items (an observable, pgTAP-assertable equivalence); no
   projection, count, error, or payload reveals reservation
   existence, count, identity, or timing for the owner's items, with
   reservations demonstrably present in the database during the test.
8. **Identity privacy (pgTAP, negative).** A non-reserver eligible member
   observes `reserved_by_other` without any reserver identity, id, or
   timestamp; only `my_group_reservations` returns reserver-scoped rows,
   and only to the reserver.
9. **Grants, RLS, and inventory (pgTAP).** The REVOKE-then-exact-GRANT
   inventory matches the brief for the new table and every new function,
   including overloads; no client SELECT/INSERT/UPDATE/DELETE/TRUNCATE
   exists on the reservation table; `audit_events` remains write-only
   through the private appender; the two 006a amendments are exactly as
   scoped (enum values; the two metadata keys).
10. **Audit and analytics correctness (pgTAP).** Exactly one safe event
    per state-changing success — a first `reserved` claim, a release that
    changes state, or a departure-triggered release — same-transaction,
    bounded metadata; the idempotent `already_yours` replay, `conflict`
    outcomes, and every failed or denied attempt append nothing; metadata
    contains no tokens, emails, or wishlist content.
11. **Race harness in CI.** `pnpm test:db:races:reservations` runs all
    five scenarios in the CI `database` job on the exact PR head with the
    registered step, timeouts, cleanup, and no credential output.
12. **Fresh migration and smoke.** A reset from committed migrations and
    seed succeeds; all existing pgTAP suites pass; `smoke.sql`'s public-
    table inventory (now ten reviewed tables) and plan count are amended
    deliberately and recorded as a scoped amendment.
13. **UI states and zero owner diff.** Eligible viewers see the reserve,
    reserved-by-you, reserved-by-another, and conflict states per the
    pinned V18 region at both approved viewports with accessible,
    confirmed release; the owner wishlist and owner-facing routes produce
    zero visual diff and existing baselines stay green without
    modification.
14. **Regression safety and delivery evidence.** `pnpm verify`, existing
    database tests, stack-gated e2e, and existing race harnesses pass on
    the same head; the PR includes acceptance criteria with evidence,
    migration and forward-fix notes, the staging ledger (below), and
    confirmation that no Magic Patterns mock data or editor artifacts
    shipped.

## Required proof

- pgTAP proves every criterion above, including negative owner-blind and
  identity-privacy tests where a reservation demonstrably exists while the
  owner's and non-reserver's views are asserted.
- The two-session race transcript is committed as PR evidence with bounded
  run time and negative-gate proof (the harness fails when an assertion is
  intentionally broken, shown once in the PR).
- Playwright covers reserve, reserved-by-you with confirmed release,
  reserved-by-another chip, conflict feedback, denial uniformity, and the
  owner's unchanged experience; axe runs the new states at both approved
  viewports.
- Analytics tests use the development sink for the events below, including
  zero-emission denial proof.
- Visual evidence: new reserved-state candidates at 390 by 844 and 1440 by
  1000 compared by an independent reviewer against the pinned V18
  gifting-browse region; owner routes evidenced as unchanged. A Railway
  preview is attached when available.

## Dependencies

- 006a (groups, membership, fixed lock order, private schema, audit
  appender) and 006b must be merged; the two named 006a amendments are part
  of this slice's reviewed migration.
- Phase 4 (005a–005d) supplies wishlist items, owner-only policies, item
  bounds, extraction states, and ordering.
- 006d/006e supply the group room and the member-wishlist browse surface
  where the reserve affordance lives; their read shapes are consumed, not
  modified.
- 007d consumes this slice's event and visibility contracts and cannot ship
  reservation activity entries before this slice merges.
- Planning may complete before these dependencies merge. Implementation
  cannot start until the approved exact brief commit is linked to its
  Linear issue and the dependencies above are complete.

## Analytics, security, and privacy

- Two privacy-safe server-emitted events, emitted only for a
  **state-changing success** — a first `reserved` claim, a release that
  changes state (explicit or departure-triggered), exactly once each:
  `reservation_created` and `reservation_released`. The idempotent
  `already_yours` replay is a no-write result and emits **no** event of
  either name. Closed property schemas:

  | Event                  | Property      | Type        | Allowed values (exact enum)                                                     |
  | ---------------------- | ------------- | ----------- | -------------------------------------------------------------------------------- |
  | `reservation_created`  | `outcome`     | string enum | `reserved` — the only emitting outcome; `already_yours`, `conflict`, and every denial never emit |
  | `reservation_created`  | `gifting_mode`| string enum | `secret_draw`, `gift_everyone`, `wishlist_only`                                  |
  | `reservation_released` | `reason`      | string enum | `by_reserver`, `reserver_departed` (never emitted for `item_deleted`)            |
  | `reservation_released` | `gifting_mode`| string enum | `secret_draw`, `gift_everyone`, `wishlist_only`                                  |

  No other property, identifier, or count is sent: no item, group, user, or
  reservation ids, no titles, no timing. Owner-deletion releases emit
  nothing.
- **Tracking-plan change required.** The implementation PR adds both events
  to `docs/analytics/tracking-plan.md` as server-source events with exactly
  the properties above, reviewed against that plan's prohibited-data list.
- **Zero-emission denial proof.** Every denial class, the friendly
  `conflict` outcome, and the idempotent `already_yours` replay emit no
  event of either name and no other new event.
- Server authorization is authoritative; client state, hidden buttons, and
  analytics never grant eligibility. Cache behavior is private and
  user-specific. Security logging uses identifiers and coarse categories,
  never item titles, reservation identities, or owner-linked facts.

## Implementation plan and gates

1. Review the 006a and 005a migration and pgTAP patterns plus
   `scripts/test-group-races-local.sh`; implement the forward migration(s),
   trigger, functions, projections, REVOKE/GRANT inventory, and RLS posture.
2. Add the pgTAP suites (positive, negative, privilege inventory,
   enumeration) and the two-session race harness; wire the CI step and the
   package script; amend `smoke.sql` deliberately.
3. Implement the minimal browse-surface states; produce visual candidates
   and accessibility evidence; keep owner routes byte-identical.
4. Applying the committed migration(s) to the dedicated **staging** Supabase
   project is a separate owner-approved gate before any staging validation
   or later Phase 6 staging deployment. Evidence must include the exact
   migration commit and ledger version, inventory/RLS verification,
   synthetic claim/denial smoke results, and an owner approval record. No
   dashboard SQL or production deployment is included here. The staging
   gate does not close merely because local/CI tests pass.

## Planning status

Brief only. This document does not authorize implementation, migrations,
cloud changes, Linear state changes, baseline commits, or merge. The owner
must approve the exact commit and link it from the matching Linear issue
first.
