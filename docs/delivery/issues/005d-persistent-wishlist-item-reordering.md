# 005d / ARJ-29 — Persistent wishlist item reordering

## Outcome

The signed-in owner can put items in the order they want friends to see,
using the approved Version 18 `Reorder` / `Done` view. Each drag or arrow
move saves immediately and survives a reload or second tab. A concurrent
change cannot silently overwrite a newer order. Only the owner may reorder;
the recipient's private gifting state remains outside this feature.

## Scope

- Add the V18 `Reorder` / `Done` toggle to the populated `/wishlist` view.
  In reorder mode, show the compact, image-and-desire-chip rows from
  `ShelfieReorderList` and the approved explanatory line. Keep the normal
  card grid outside that mode. The list is empty-state-free: a zero-item
  wishlist continues to show 005b's empty state, with no reorder control.
  The toggle has a pressed state, visible focus, and a 44-by-44 CSS-pixel
  minimum target. Drag handles, arrow buttons, and any removal control
  meet the same target size; an icon's visual size does not define its hit
  area. Arrows provide full keyboard operation, with boundary buttons
  disabled and named for the item. Dragging supports pointer and touch;
  reduced motion removes decorative movement without removing function.
- Persist **one move at a time**, immediately after a drop or arrow
  activation. `Done` exits reorder mode; it is neither a batch-save step
  nor a way to discard already confirmed moves. If activated while a
  move is saving, `Done` waits for that move to settle and for any
  required authoritative refetch to finish before exiting. During
  unresolved recovery, keep reorder mode open with a retry affordance;
  never let `Done` hide an uncertain order. While a move is in flight,
  prevent another move against an unconfirmed local sequence.
  Show a saving state, a concise success announcement, and an actionable
  recovery state. A confirmed response and a fresh read supply the next
  expected sequence. Do not treat a local drag preview as authoritative.
- Keep the V18 reorder row's remove control, routed to 005c's confirmed
  permanent-delete dialog. V18's immediate removal and `Undo`
  toast are an approved deviation here: no deletion occurs before
  confirmation and no undo promise is shown for hard deletion. A cancel
  leaves the row in place. Delete outcomes and uncertain-response
  reconciliation keep 005c's meanings; the reorder list refetches after
  deletion or uncertainty.
- The canonical order is the existing `(sort_position ASC, id ASC)` order
  over **all** items in the owner's persistent wishlist. The request
  carries the exact ordered UUID sequence the owner last received, the
  moved item ID, and its target index. The server never trusts a posted
  owner ID, wishlist ID, new sort key, or full replacement order. It
  derives the owner from a fresh authenticated session, requires a
  complete profile, and uses the authenticated server client. The
  database function independently checks `auth.uid()` and ownership.
  Malformed or duplicate input and a foreign moved item produce a
  data-free unavailable result. Any difference in the owner's canonical
  sequence, including an item deleted since the read, produces stale.
  Neither result returns another user's item details.
- Add a **forward-only migration** for a narrowly granted, authenticated
  `SECURITY DEFINER` reorder function with an empty `search_path`, fully
  qualified relations, a fixed argument/return contract, and an explicit
  owner check. Revoke default `EXECUTE` from `PUBLIC`, `anon`, and
  `service_role`; grant only to `authenticated`. The function takes a row lock on the owner's
  `wishlists` row, then locks that wishlist's item rows in a stable ID
  order. After locks are acquired it reads the canonical ordered IDs in
  a fresh statement and compares them, element for element and length
  for length, with the expected sequence. A version number, item count,
  maximum sort key, or set equality alone is insufficient: ties and
  concurrent moves can preserve all of those while changing order.
  Return a stale result without writing when the sequences differ.
- For a valid adjacent or nonadjacent move, change only the moved row's
  `sort_position` when a **finite, strictly ordered** key exists between
  its new neighbors. At a boundary, use a finite key strictly outside
  the nearest neighbor. Reject NaN, infinity, rounding to a neighbor,
  and overflow; do not claim a move succeeded if the canonical order
  would remain unchanged. If no key can represent the requested place,
  rebalance only that owner's locked wishlist rows into dense finite
  positions in the requested order, in the same transaction. Rebalancing
  may touch all of that owner's rows, never another wishlist. A same-index
  move is a successful no-op after freshness validation. Return the
  authoritative ordered IDs or a signal that requires an owner refetch.
- Remove `sort_position` from the authenticated **direct UPDATE column
  grant**, preserving the other 005a/005c UPDATE columns, the owner-only
  RLS policies, and the authenticated INSERT grant including
  `sort_position`. Do not add a general table UPDATE grant, remove the
  INSERT path, weaken RLS, or expose service-role credentials. The
  privileged function may update only the verified owner's sort keys.
  pgTAP must prove direct owner and foreign sort UPDATE denial, owner
  function success, and signed-out/foreign function denial.
- Coordinate with 005c's create and delete behavior. The application
  create path must calculate its append position **inside a transaction
  holding the same owner-wishlist lock**, while preserving 005c's
  submission-key replay and conflict semantics. A separate max read
  followed by a direct INSERT can choose a stale key while reorder is
  committing; it is insufficient for this race. Keep authenticated
  INSERT permission, but move the app's append calculation into a
  narrowly scoped owner-checked database operation (or an equivalent
  transaction proven by the same tests). A create committed before the
  reorder lock is observed as a changed canonical sequence and makes
  the move stale; a create after the reorder transaction appends after
  the newly ordered tail. Existing item locks serialize a concurrent
  005c hard delete with the move: a delete that commits first makes the
  expected sequence stale, while a delete that commits afterward removes
  its row from the just-committed order. The UI refetches after either
  change and never re-creates a deleted row.
- On stale, definite failure, timeout, or lost response, refetch the
  owner's authoritative list before enabling a further move. If the
  response was lost after commit, the refetch may show the requested
  order; do not replay the same move blindly or report that it newly
  committed. If it shows a different order, display that order and let
  the owner choose a new move. A failed refetch keeps controls in a
  recoverable retry state; it does not present the speculative local
  order as saved. A second tab or a reload reads the same database order.

### Design and architecture decisions

This brief binds the independently approved ARJ-29 architecture. The
Version 18 reference is
`docs/design-reference/magic-patterns-v18/source/pages/Shelfie.tsx` and
`components/shelfie/ShelfieReorderList.tsx`; the frozen `wishlist-reorder`
mobile and desktop captures are the visual authority. The prototype's
local `setItems`, drag library, mock context, and immediate remove/undo
behavior are illustrative UI code, not persistence or deletion contracts.
The 005a finite `double precision` sort key and total ID tie-break are
retained. The 005c confirmed-delete contract supersedes V18 remove/undo.
No new dependency is justified by this brief; use the stack's existing
capabilities and a small accessible drag implementation if needed.

## Non-goals

- No new wishlist or group model, member viewing, sharing, reactions,
  reservations, assignments, or gifting-progress display.
- No full-list replacement API, delayed batch save, automatic retries of
  an uncertain move, soft deletion, or undo of a hard delete.
- No product extraction, image upload, currency conversion, or visual
  redesign outside the reorder state and its documented controls.
- No staging or production database mutation as part of planning.

## Implementation plan

1. **Recheck the exact base.** ARJ-28 / 005c must merge first. Before
   writing implementation code, inspect `main` at its actual merged head:
   create append/replay, edit and hard delete, current column grants,
   routes, visual baselines, and CI stack-gated spec list. Reconcile this
   plan with the merged behavior in the implementation PR; do not assume
   the current ARJ-28 branch draft is the final base.
2. **Migrate and prove the database contract.** Add a new migration for
   the owner-checked reorder function, exact-sequence validation,
   wishlist-then-item locking, finite-key calculation, owner-only
   rebalance, and the narrow UPDATE-grant change. Make the application
   create append calculation use the same wishlist lock atomically while
   retaining 005c's idempotency contract. Add pgTAP allow/deny and
   interleaving tests for grant boundaries, same-owner and foreign
   calls, ties, precision exhaustion, boundary overflow, creates, and
   deletes. Do not edit applied migrations.
3. **Wire the server and UI.** Add one server-only reorder action that
   gates on the complete profile and passes only the current owner's
   expected IDs, item ID, and target index to the function. Keep the
   list's server read authoritative. Build the V18 reorder composition
   with accessible pointer/touch drag, named arrow controls, saving and
   recovery announcements, and the 005c confirmation dialog. One
   response must settle before the next move; `Done` awaits that result
   and any required refetch before leaving the mode.
4. **Verify the full behavior.** Unit/component tests cover transition
   and accessibility states. Local-stack browser tests exercise real
   actions, exact DB order after move/reload/second tab, stale cross-tab
   moves, concurrent create/delete, lost-response reconciliation,
   activating `Done` during saving and recovery, signed-out and
   incomplete-profile denials, foreign denials, keyboard, touch,
   reduced motion, and axe. Add every new `E2E_LOCAL_SUPABASE` spec to
   `scripts/e2e-local-stack.sh` in the same PR so the `database` CI job
   actually runs it at both viewports. Run `pnpm verify` and prove green
   `verify` and `database` jobs on the exact implementation PR head.
5. **Review visual evidence independently.** Capture before/after and
   V18 comparisons for `wishlist-reorder` at 390x844 and 1440x1000,
   matching route, fixture, scroll, and interaction state. Include
   drag, arrow, saving/failure, and confirmation states where no frozen
   reference exists. Record the 005c deletion deviation. A product or
   design reviewer independent of the author approves candidate image
   hashes and the exact implementation head before any baseline commit;
   an agent cannot approve its own baseline changes.

## Acceptance criteria

1. A signed-in owner with at least two items can enter `Reorder`, move
   an item by drag or named up/down arrow, leave with `Done`, reload,
   and see the exact same `(sort_position ASC, id ASC)` order in a second
   tab. Each move commits independently; `Done` performs no save. If
   activated during saving, it does not exit until the move settles and
   any required authoritative refetch completes. A browser test covers
   this case and activating `Done` during recovery; an unresolved
   refetch leaves reorder mode open with a retry path.
2. Controls have visible focus and at least 44-by-44 CSS-pixel targets.
   Keyboard alone can enter and leave the mode and move every item to
   every position. Touch drag works; boundary arrows are disabled;
   reduced motion and axe checks pass at both viewports. Empty and
   one-item cases expose no impossible move.
3. A request with the exact prior canonical UUID sequence commits one
   move; a changed order, tie reordering, insertion, or deletion before
   the lock produces stale with zero writes. Invalid or duplicate input
   and a foreign moved item reveal no foreign content. Same-index is a
   verified no-op. Finite midpoint/boundary cases write one row;
   exhausted intervals or boundaries rebalance only the owner's rows.
4. Direct authenticated UPDATE of `sort_position` is denied even for
   the owner; direct INSERT retains its prior privilege; other editable
   UPDATE columns and owner-only RLS remain intact. The function works
   for the authenticated owner and denies anon, foreign, and signed-out
   callers. No service-role client enters the application path.
5. Concurrent creates append correctly under the shared wishlist lock
   while preserving 005c submission-key replay/conflict behavior.
   Concurrent deletes retain 005c's confirmation and exact affected-row
   semantics. Both possible commit orders for create, delete, and
   reorder are tested without resurrecting a removed row.
6. A stale result or uncertain/lost response triggers an authoritative
   owner refetch before another move. No optimistic order is called
   saved without confirmation; a failed refetch offers recovery. The
   current owner sees no private reservation or gifting state.
7. Mobile and desktop evidence compares the same fixture and state with
   the frozen V18 `wishlist-reorder` captures; the 005c confirmed
   deletion deviation and all other visible differences receive
   independent product/design review. No baseline changes are made
   merely to satisfy CI.
8. The implementation PR contains criteria-to-evidence mapping,
   relevant unit, pgTAP, browser, accessibility, and visual proof;
   `pnpm verify` and exact-head CI results or precise unavailable-check
   explanations; before/after mobile and desktop images; a Railway
   preview URL when available; migration/rollback notes; and a
   statement that no Magic Patterns mock data or editor artifacts ship.

## Dependencies and risks

- ARJ-28 / 005c merge and an **exact `main` recheck** are implementation
  gates. This planning commit does not establish that ARJ-28 has merged
  or authorize implementation against an unreviewed branch state.
- 005a supplies finite sort keys, duplicate positions, ID tie-breaks,
  owner-only RLS, and column grants; 005b supplies the protected read
  and populated list. 005c supplies create/edit/delete and confirmed
  permanent deletion. The implementation must preserve all three.
- The owner-wishlist lock serializes the app's append path with reorder;
  item locks and exact sequence comparison protect moves against
  deletion and other moves. PostgreSQL locking, function privileges,
  and numeric edge cases need database-level proof, not only mocked
  client tests.
- Roll forward if the migration needs correction. A rollback must
  restore the prior direct UPDATE grant only in coordination with
  removing the reorder UI/function, and account for any order already
  persisted; dropping data or rewriting applied migrations is not a
  routine rollback.

## Analytics, security, and privacy

No new analytics event contains item titles, IDs, source URLs, notes,
images, or order sequences. Logs and error states use generic outcomes,
not submitted item content. Server actions and function calls operate
only on the authenticated owner's wishlist. The reorder view does not
query or expose reservations, assignments, or purchasing progress.

## Planning status

Binding brief and implementation plan for review. Commit this document
alone on `planning/arj-29-reorder-brief`; implementation starts only
after ARJ-28 merges and the exact merged base is rechecked. This brief
does not approve implementation screenshots, visual baselines, or a
merge to `main`.
