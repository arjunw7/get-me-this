# 007a — Reactions and read-only owner summaries

## Outcome

A joined group member can react to a friend's visible wishlist item from the
member-wishlist browsing surface with exactly one reaction per item —
`Very you`, `Questionable`, or `Want it too` — switch it by selecting another,
and remove it by selecting the active one. The wishlist owner sees a read-only
per-kind count summary and breakdown on their own items, with no reactor
identities and no way to react to their own items. Reaction state is
group-scoped, enforced one-row-per-user-per-item in the database, and never
carries or implies reservation, purchase, or any other private gifting state.

Outsiders, pending members, former members, and signed-out users learn
nothing: no reaction existence, no counts, no item existence.

## Decision record (binding choices made at planning)

The product sources leave four points open; this brief resolves them and the
resolutions are binding acceptance surface, not suggestions.

1. **No amendment to the 006e snapshot.**
   `public.member_wishlist_snapshot(p_group_id uuid, p_member_id uuid)` keeps
   its exact 10-column shape frozen. Reactions render through a separate,
   narrowly-granted `SECURITY DEFINER` read
   (`group_item_reaction_snapshot`, below) whose rows zip to the browsing
   surface by `item_id`. Amending the snapshot's shape would force a reviewed
   revision of 006e and invalidate its committed result-shape tests for a
   concern that needs no new wishlist field. This is the smallest reviewed
   change.
2. **No reactor identities in v1.** Every summary — friend-facing and
   owner-facing — exposes per-kind counts only. No function returns a
   reactor's user id, profile, or avatar; no UI shows who reacted. This
   avoids new profile read paths entirely and is the least-privilege shape.
3. **Owner visibility is exactly the approved exception.** DESIGN.md and the
   permissions matrix ("View visible reaction summary — Owner: Yes") approve
   the owner seeing read-only per-kind summaries and breakdowns about their
   own items. This brief encodes that exception and nothing more: the owner
   sees counts, never identities, never per-reactor data, and gains no other
   gifting visibility. Every other recipient-privacy rule (reservations,
   assignments, purchase progress) remains untouched and is re-proven by
   regression tests.
4. **Reactions from members who are no longer joined are excluded from
   counts but kept as durable history**, mirroring 006a's durable
   membership model: rows are never deleted on leave or removal, and the
   summary statements count only reactions whose author is currently
   `joined` in the same group. A member reinstated by a targeted
   reinvitation therefore sees their prior reaction reappear; this is the
   accepted consequence of durable history, not a bug.

## User stories

1. As a group member browsing a friend's wishlist, I want to react with
   `Very you`, `Questionable`, or `Want it too` so browsing feels social.
2. As that member, I want selecting a different reaction to switch mine and
   selecting my active reaction to remove it, so I never need an undo.
3. As a member viewing an item with no reactions, I want `Be the first to
   react` so the empty state invites action.
4. As a wishlist owner, I want a read-only summary and breakdown of the
   reactions to my own items so I can see what lands, without knowing who
   reacted and without being able to act on my own items.
5. As the product, I want one reaction per user per group/item context
   enforced in the database so no client bug can create doubles.

## Dependency contract

### Phase 4 exit

- Implementation starts only after Phase 4's accepted exit evidence. The
  reaction summary reads the Phase 4 item model and depends on its
  owner-only RLS remaining unchanged.

### 006a — group security model

- All authorization derives the caller from `auth.uid()` and reuses 006a's
  joined-membership predicate semantics
  (`private.is_joined_group_member(group_id)` for the caller; the identical
  joined predicate evaluated for the target inside the same statement).
- Any function that can contend on a group follows 006a's fixed lock order.
  Reaction writes take no group lock (they contend only on their own unique
  key and the item row); see the race harness for the interleavings that
  this choice is proven against.
- Organizer authority confers nothing here beyond ordinary joined-member
  read/react ability when eligible.

### 006b and 006c — creation and acceptance

- No reaction path may read `group_invitations`, `group_invitation_uses`, or
  audit state. Membership authority comes only from currently-`joined`
  `group_members` rows established by those slices.

### 006d — private group room

- The room is the entry point to the browsing surface. This brief adds no
  room UI, no activity region, and no room snapshot change. Room activity
  summaries are a later Phase 6 slice.

### 006e — member wishlist browsing (the surface)

- Reactions render only on the 006e member-wishlist page's item cards
  (`/groups/[groupId]/members/[memberId]/wishlist`). This brief does not
  change that route's authorization, the generic not-found behavior, the
  owner server-side redirect to `/wishlist`, the pinned V18 card hierarchy,
  or the 10-column snapshot contract.
- The reaction read shares 006e's exact active-item predicate
  (`extraction_status` in (`manual`, `extracted`), item exists, owner is the
  target member) and 005d ordering, so the two snapshots describe the same
  item set. The page joins them by `item_id`, never by row position.
- Because the owner is redirected to `/wishlist` by 006e, the owner-facing
  read-only summary ships on the owner's own wishlist page.

### 007b — copy to own wishlist (sibling Phase 6 brief)

- 007b is an independent contract on the same 006e item card. Neither brief
  depends on the other's schema or functions, and both require the existing
  committed baselines to remain green.
- **Shared-file conflict set.** Implementing either brief touches the same
  repository plumbing, so the collisions are NOT limited to UI files. Both
  briefs require edits to: `package.json` (race-script entry),
  `.github/workflows/ci.yml` (a `database`-job race step),
  `supabase/tests/smoke.sql` (deliberate inventory amendment),
  `scripts/e2e-local-stack.sh` and likely `tests/helpers/local-stack.ts`
  (gated-spec registration), `docs/analytics/tracking-plan.md` (the new
  catalogued event), plus the 006e item-card component and its fixtures.
- **Sequencing rule.** The first Phase 6 slice to merge lands the shared
  CI/smoke/script plumbing; later slices rebase onto that plumbing instead
  of re-adding it. For orchestrator dispatch, 007b (copy) is recommended to
  merge first if its plumbing proves smallest — but the binding rule is
  simply: whichever slice merges last rebases and may not alter any earlier
  slice's reviewed behavior, tests, or baselines except through its own
  reviewed change.

## Data model

One forward-only migration. Follow the 005a/006a conventions: UUID primary
keys, `clock_timestamp()` for wall-clock and managed timestamps, bounded
fields, closed enum vocabularies, explicit grants, RLS on every public table.

- New enum, values exactly:

  ```sql
  create type public.group_item_reaction_kind as enum
    ('very_you', 'questionable', 'want_it_too');
  ```

  These map 1:1 to the approved display strings `Very you`, `Questionable`,
  and `Want it too` (full phrase `questionable, but supported` is display
  copy, never a stored value).

- New table:

  ```sql
  create table public.group_item_reactions (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public."groups" (id) on delete restrict,
    item_id uuid not null references public.wishlist_items (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete restrict,
    reaction public.group_item_reaction_kind not null,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    constraint group_item_reactions_unique_context
      unique (group_id, item_id, user_id)
  );
  ```

  - The unique `(group_id, item_id, user_id)` key is the database-level
    one-reaction-per-user-per-context rule (the groups-and-gifting flow's
    "one reaction per user per group/item context"). Every write path goes
    through it.
  - `item_id` uses `ON DELETE CASCADE`: deleting an item deletes its
    reactions; orphaned reactions are unrepresentable. `group_id` and
    `user_id` use `ON DELETE RESTRICT` per the 006a durable-history
    convention; no application delete path for groups or users exists while
    these rows reference them.
  - A database-managed `updated_at` trigger using `clock_timestamp()`
    follows the 005a pattern.
  - An index on `item_id` supports the summary joins.

- No text columns are introduced; the enum is the only payload. There is no
  soft-delete column: row existence is the active state.

## Database functions

Three `SECURITY DEFINER` functions, each with an empty `search_path`, fully
qualified names, fixed return types, no dynamic SQL, and no arbitrary user id
parameters. Exact EXECUTE is revoked from `PUBLIC`, `anon`, and
`service_role` (including default privileges) and granted only to
`authenticated`. The public function inventory is exactly these three; the
migration pins signatures and rejects overloads.

- **Write:**

  ```sql
  public.set_group_item_reaction(
    p_group_id uuid,
    p_item_id uuid,
    p_reaction public.group_item_reaction_kind  -- null removes
  )
  returns table (
    very_you_count bigint,
    questionable_count bigint,
    want_it_too_count bigint,
    viewer_reaction public.group_item_reaction_kind
  )
  ```

  - Authorization is checked inside the statement, before any write: the
    caller is currently `joined` in `p_group_id`; the item's owner is
    currently `joined` in the same group; the caller is not the item's
    owner; the item satisfies the 006e active-item predicate; the group's
    lifecycle status is the currently supported active state per 006a.
  - `p_reaction is null` removes the caller's row; a non-null value upserts
    it (insert or replace). Both behaviors execute as one statement (data
    modifying CTEs or a single upsert), so a concurrent replace and remove
    resolve to a single committed winner under the unique key — never two
    rows and never a half-state.
  - The result is the authoritative post-write summary for that item,
    counting only currently-joined authors, with `viewer_reaction` set to
    the caller's resulting reaction (null after removal). The UI updates
    from this result, not from optimism alone.
  - Any denial is a uniform generic failure: no error detail distinguishes
    outsider, pending, left, removed, cross-group, unknown item, invisible
    item, or own-item cases.

- **Friend-facing read:**

  ```sql
  public.group_item_reaction_snapshot(
    p_group_id uuid,
    p_member_id uuid
  )
  returns table (
    item_id uuid,
    very_you_count bigint,
    questionable_count bigint,
    want_it_too_count bigint,
    viewer_reaction public.group_item_reaction_kind
  )
  ```

  - Authorization is exactly 006e's predicate (caller joined, target member
    joined, same group, active group). Denials return zero rows.
  - One-statement snapshot in the 006e style: authorization, the
    active-item predicate, per-kind aggregation, and the viewer's own
    reaction are all expressions of a single SQL statement sharing one
    PostgreSQL statement snapshot. Declared `STABLE`.
  - Returns one row per item the 006e snapshot would show, in the 005d
    order (`sort_position asc, id asc`), including zero-count rows so the UI
    can render the approved empty states without another query.
  - Counts include only reactions whose author is currently `joined` in the
    group. `viewer_reaction` is the caller's own row's reaction (null when
    the caller has none; always null when the caller is the target member,
    since owners cannot react to their own items).
  - The friend-facing snapshot may be called with the caller as the target
    member (the own-item case, where `viewer_reaction` is always null).
    This is sanctioned by `docs/flows/groups-and-gifting.md` ("Reactions
    remain visible to eligible group members, including the wishlist
    owner") and adds no visibility beyond what any joined member already
    has.

- **Owner-facing read:**

  ```sql
  public.own_item_reaction_summary()
  returns table (
    item_id uuid,
    very_you_count bigint,
    questionable_count bigint,
    want_it_too_count bigint
  )
  ```

  - No parameters; the caller is derived from `auth.uid()` (null returns
    zero rows). One-statement, `STABLE`, returns zero rows on any failure.
  - One row per the caller's own item satisfying the 006e active-item
    predicate, in 005d order, including zero-count rows ("No reactions yet").
  - Counts aggregate across every group context where the caller is
    currently `joined`, counting only currently-`joined` authors of that
    group. A group the owner has left contributes nothing.

## RLS and grants inventory (sketch)

- `public.group_item_reactions`: RLS enabled; **no** permissive policy for
  `anon`, `authenticated`, or `service_role`; **no** direct table privilege
  of any kind for client roles (no SELECT/INSERT/UPDATE/DELETE/TRUNCATE).
  All reads and writes go through the three functions above. Table-owner
  and administrative capabilities are outside the application-role claim,
  as in 006a.
- The three functions: EXECUTE revoked from `PUBLIC`, `anon`, and
  `service_role`; granted exactly to `authenticated`. Nothing is granted to
  `anon`. No default PUBLIC EXECUTE survives.
- No change to `wishlist_items`, `wishlists`, `profiles`, `groups`,
  `group_members`, or any 005/006 grant or policy. The migration's full
  privilege inventory (tables, columns, schemas, functions, sequences,
  default privileges) is asserted by pgTAP in the same PR, per 006a
  criterion 2, and `supabase/tests/smoke.sql`'s public-table inventory and
  fixture counts are updated deliberately in the same PR — any changed
  smoke assertion is recorded as a scoped amendment, never silently
  relaxed.
- RLS is nowhere weakened: no new policy is added to any existing table,
  and the reaction table is deny-all at the policy layer.

## pgTAP suite and race harness

Transaction-wrapped pgTAP under `supabase/tests/` plus a committed,
bounded two-session CI harness per the 005h/006a conventions, run by the
existing CI `database` job against a fresh local Supabase stack on the
exact implementation PR head.

- **pgTAP positives.** Exact enum values, table shape, constraints, trigger,
  and function signatures (no overloads); EXECUTE grants and absent table
  privileges; set/replace/remove results with authoritative counts; snapshot
  rows for visible items including zero-count rows; 005d ordering;
  owner-summary aggregation across two groups; leaver exclusions; item
  cascade on delete.
- **pgTAP negatives (uniform denials).** Signed-out (`auth.uid()` null),
  outsider, pending, declined, left, removed, cross-group, unknown
  group/item, item in `extracting`/`failed` state, and own-item reaction
  attempts: every write is a uniform generic failure and every read returns
  zero rows, with no distinguishing error detail and no enumeration of
  groups, members, items, or counts. Direct table access by
  `anon`/`authenticated`/`service_role` is denied at both the grant and
  policy layers.
- **Privacy assertions.** No function result contains reactor identities,
  timestamps of individual reactions, reservation, assignment, purchase, or
  any other gifting-private field; declared return columns and runtime
  results are both inspected.
- **Two-session race scenarios** (independent sessions, barriers, finite
  timeouts, nonzero exit on unexpected results, synthetic cleanup):
  1. replace vs. replace with different kinds → exactly one row, a valid
     final kind, consistent counts;
  2. replace vs. remove (both commit orders) → final state is either the
     replaced kind or removed, never two rows and never a stale count;
  3. same-kind double set from two tabs → one row;
  4. reaction set vs. organizer removal of the reactor (both commit orders)
     → removal-first denies the write; write-first persists the row but the
     summary excludes it while the author is not `joined`;
  5. reaction set vs. owner hard-deleting the item → no orphan rows; the
     losing write fails atomically or cascades, never partially commits.
  The harness follows the 006a pattern: a committed script (for example
  `scripts/test-reaction-races-local.sh` with a matching `package.json`
  script) that selects the local Supabase database container exactly and an
  explicit CI `database`-job step after `pnpm test:db` with
  `timeout-minutes: 5`. A green pgTAP step alone never satisfies the race
  criterion.

## UI scope

- **Friend items (006e page).** Each friend item card gains the approved
  interactive reaction row: the three choices with their approved labels,
  the caller's active reaction visibly selected, selecting another replaces,
  selecting the active one removes. With zero reactions the row shows
  `Be the first to react`. The full phrase `questionable, but supported`
  appears exactly where the approved prototype shows it, as display copy.
- **Own items (`/wishlist`).** Each own item card gains a read-only summary:
  per-kind counts and breakdown, `No reactions yet` at zero. No interactive
  control exists on own items anywhere; the server data and the UI both
  make own-item reaction impossible.
- Updates apply the authoritative function result; transient failure
  restores the prior state with a designed inline error. Loading, success,
  failure, and empty states are designed, keyboard accessible, and respect
  reduced motion. Touch targets are at least 44 by 44 CSS pixels. Only
  semantic design tokens are used.
- **Two-read composition and accepted straddle.** The page composes two
  separate `SECURITY DEFINER` calls: 006e's `member_wishlist_snapshot` and
  this brief's `group_item_reaction_snapshot`. Each is internally
  one-statement; the page zips them by `item_id` (never row position) and
  explicitly excludes 006e's authorized-empty sentinel row (`item_id`
  null) from the zip while still rendering the empty-state copy. A
  reaction write that commits between the two reads renders at most zero
  counts or a dropped reaction row until the next refetch; this straddle
  is accepted and documented here, mirroring how 006e specifies its
  read-versus-membership races — each call's own single-statement snapshot
  still prevents any partial or unauthorized result.
- **Visual candidates.** The reaction row and the owner summary row do not
  exist in the pinned V18 regions; both are new visual candidates requiring
  independent product/design review before any baseline is committed. The
  existing 005b and 006e committed baselines change only through that
  explicit approval; agents may not update baselines to make CI pass.
- No reaction UI appears on the group room, invitation, or creation
  surfaces, and no reaction data appears in any RSC payload, HTML, log, or
  analytics payload beyond the catalogued event below.

## Non-goals

- No reservations, purchase state, assignments, checklists, draws, or any
  gifting-private data.
- No activity feed, notifications, comment or chat surface.
- No reactor identities, avatars, or per-reaction timestamps in any UI.
- No reactions outside a group context, no reactions to non-visible items,
  no organizer moderation tooling.
- No change to 006e's snapshot shape, route authorization, or baselines.
- No new dependency; no Magic Patterns mock data or editor artifacts.

## Acceptance criteria

1. **One reaction, enforced in the database.** A joined member can set,
   replace, and remove their single reaction per group/item through the
   approved UI and `set_group_item_reaction`; the unique
   `(group_id, item_id, user_id)` constraint makes any second concurrent or
   sequential reaction for the same context unrepresentable, and the race
   harness proves it.
2. **Approved interaction semantics.** Selecting another reaction replaces
   the current one; selecting the active reaction removes it; the three
   choices, their labels, the `questionable, but supported` phrase, and the
   zero-reaction copy (`Be the first to react`, `No reactions yet`) match
   DESIGN.md exactly.
3. **Read-only owner summaries.** The owner sees per-kind counts and
   breakdowns for their own items, aggregated over currently-joined group
   contexts, with no reactor identities and no way to react to their own
   item through UI, function, or direct table access.
4. **Least privilege.** `group_item_reactions` has no client table
   privileges and a deny-all policy set; exactly the three functions are
   executable by `authenticated`; no existing grant, policy, or projection
   is broadened; the smoke inventory amendment is deliberate and scoped.
5. **Uniform denial.** Signed-out, outsider, pending, declined, left,
   removed, cross-group, unknown-resource, invisible-item, and own-item
   attempts are indistinguishable generic failures that enumerate nothing.
6. **Privacy boundary.** No reaction payload, HTML, RSC data, log, error, or
   analytics event contains reactor identities, reaction timestamps, or any
   reservation/assignment/purchase/gifting-private data; recipient
   invisibility of gifting state is re-proven green by regression tests.
7. **Snapshot composition.** Each snapshot remains internally one-statement
   (`group_item_reaction_snapshot` per this brief; 006e's
   `member_wishlist_snapshot` unchanged). They are two separate
   `SECURITY DEFINER` calls, never one statement snapshot: the page zips
   the two result sets by `item_id`, explicitly excludes 006e's
   authorized-empty sentinel row (`item_id` null) from the zip while the
   empty-state copy still renders, and a reaction write committing between
   the two reads renders at most zero counts or a dropped row until the
   next refetch — an accepted straddle documented in the UI scope.
   Membership-change straddles are resolved inside each call by its own
   single-statement snapshot.
8. **Accessible, token-driven UI.** All new states are keyboard accessible
   with visible focus, 44-pixel minimum touch targets, semantic tokens,
   reduced-motion respect, and zero automated accessibility violations at
   both approved viewports.
9. **Reviewed visuals.** The two new visual candidates receive independent
   product/design approval before any baseline commit; existing committed
   baselines stay green without unapproved edits.
10. **Delivery evidence.** The exact PR head passes `pnpm verify`, the
    pgTAP suite, the two-session reaction race step, and stack-gated
    e2e/visual/axe checks; the PR copies these criteria with evidence and
    confirms no Magic Patterns mock data or editor artifacts shipped.

## Required proof

- pgTAP transcripts for every positive, negative, grant-inventory, and
  privacy assertion above.
- The two-session race transcript with bounded run time, both commit orders
  where relevant, and negative-gate proof.
- Unit/component tests for the reaction row (toggle, replace, remove,
  loading/failure/empty states) and the owner summary (counts, breakdown,
  zero state) against deterministic fixtures that contain no real
  identities and no gifting-private data.
- Playwright coverage of reacting from the 006e page, the uniform denial
  classes, and the owner summary render; axe runs on populated, empty, and
  denied states at 390 by 844 and 1440 by 1000.
- Analytics sink tests proving the exact event name, property enums, and
  zero emission for every denial class.
- Visual evidence per the baseline-approval rule, plus a Railway preview
  when available.

## Migration and staging gate

- One forward-only migration; never edit it once applied anywhere; fix
  forward. The rollback/forward-fix note follows the 005a pattern (drop the
  trigger, functions, policies, table, and enum in dependency order;
  reverting deletes reaction history, a deliberate data-destroying gate).
- Applying the committed migration to the dedicated **staging** Supabase
  project is a separate owner-approved gate, applied by the orchestrator
  under delegated authority mirroring 006a/006b: evidence includes the
  exact migration commit and ledger version, inventory/RLS verification,
  synthetic reaction smoke results, and an owner approval record. No
  dashboard SQL and no production deployment are included here; the staging
  gate does not close merely because local/CI tests pass.

## Analytics, security, and privacy

- One privacy-safe server-emitted event, `item_reacted`, only after a
  successful write, exactly once per successful call. Its property schema
  is closed:

  | Property        | Type        | Allowed values (exact enum)             |
  | --------------- | ----------- | --------------------------------------- |
  | `reaction_kind` | string enum | `very_you`, `questionable`, `want_it_too` |
  | `action`        | string enum | `added`, `replaced`, `removed`          |

  No identifiers (no user, group, item, or member IDs), counts, names,
  titles, or timestamps are sent. The implementation PR adds
  `item_reacted` to `docs/analytics/tracking-plan.md` as a server-source
  event with exactly these properties, reviewed against that plan's
  prohibited-data list, in the same change.
- **Zero-emission denial proof.** Every denial class emits no
  `item_reacted` event and no other new event in the test sink.
- Server authorization is authoritative; client state, hidden controls, and
  analytics never grant access. Security logging uses request identifiers
  and coarse denial categories only. Caching of any reaction-bearing
  response is private and user-specific, never shared across users.

## Dependencies and planning status

- Consumes Phase 4's item model, 006a's security model and lock-order
  conventions, 006b/006c membership establishment, 006d's room entry point,
  and 006e's browsing surface and active-item predicate, exactly as
  contracted above.
- Later Phase 6 slices (reservations, activity summaries) consume 006e and
  this brief's count semantics but may not broaden them silently.
- **Brief only.** This document does not authorize implementation,
  migrations, cloud changes, Linear state changes, baseline commits, or
  merge. The owner must approve the exact commit and link it from the
  matching Linear issue first; implementation then starts from that commit
  on its own branch after the dependencies above are complete.
