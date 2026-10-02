# 007b — Copy a friend's item to your own wishlist

## Outcome

A joined group member can copy a friend's visible wishlist item from the
member-wishlist browsing surface into their own persistent wishlist in one
action. The copy is a brand-new, fully owned manual item carrying the
product metadata the copier saw; it contains nothing that lets anyone —
including the source owner — discover that a copy happened or who made it.
Copying is idempotent per source item per copier in the database, so a
double-click, two tabs, or a retried request can never produce duplicates.

Outsiders, pending members, former members, and signed-out users can copy
nothing and learn nothing.

## Decision record (binding choices made at planning)

The product sources are silent or explicitly open on four points; this brief
resolves them and the resolutions are binding acceptance surface.

1. **Provenance: a write-path-only marker, never a read-path leak.** The
   sources do not say whether copies keep a link to their source. Decision:
   the copy keeps a single internal provenance column
   (`wishlist_items.copied_from_item_id`) used **only** to make the copy
   idempotent. It is written exclusively by the reviewed definer function,
   is excluded from every client INSERT/UPDATE column grant, appears in no
   group-facing function result, and is rendered by no UI. The source owner
   has no read path — direct or functional — that reveals a copy's
   existence, count, or copier. If review prefers zero persistence, the
   documented alternative is dropping the column and its unique index and
   accepting non-idempotent copies; that trade-off is rejected here because
   the duplicate-copy race is a real defect. Recorded per the planning
   instruction as the no-source-leakage decision.
2. **The note is not copied.** The product spec lists "whether copying an
   item also copies its note or only product metadata" as an open question.
   Decision: only product metadata is copied. The note is the source
   owner's personal voice; copying it verbatim into someone else's
   wishlist misattributes it and can leak intent the owner wrote for
   themselves. The new item starts with a null note the copier may edit.
3. **Desire level resets to the default.** The source owner's
   `desire_level` expresses their wanting, not the copier's. The copy uses
   the schema default (`would_love`) and the copier edits their own.
4. **Exactly what is copied:** `title`, `source_url`, `retailer`,
   `image_url`, and the original money pair
   (`original_amount_minor`, `original_currency`). Explicitly **not**
   copied: `note`, `desire_level`, `image_snapshot_path` (a Storage object
   under the source owner's own-prefix policy — the path is both private
   and unreadable to the copier), the converted-money tuple (approximate,
   rate-stamped conversions are presentation state regenerated under 005g,
   never duplicated as stale provenance), and `client_submission_id`.

## User stories

1. As a group member browsing a friend's wishlist, I want to copy an item I
   love into my own wishlist so I do not lose it.
2. As that member, I want the copy to be a normal editable item in my
   wishlist, appended in my order, so I can maintain it like any other.
3. As a member who tapped copy twice or retried, I want one copy, not two.
4. As a wishlist owner, I want no one — not other members, not any screen —
   to be able to tell that my item was copied, so copying never feels like
   surveillance of my list.

## Dependency contract

### Phase 4 exit

- Implementation starts only after Phase 4's accepted exit evidence. The
  copy writes a real `wishlist_items` row and depends on the Phase 4
  owner-only RLS, money-pair constraints, bounds, and append conventions.

### 005a/005c/005d — wishlist schema, item creation, ordering

- The copy inserts through the established `wishlist_items` shape. The
  append position follows the 005c/005d convention exactly: calculated
  inside the transaction, after acquiring the copier's `wishlists` row
  lock, at maximum finite `sort_position` plus one, or 1 for an empty list,
  with the total order remaining `(sort_position ASC, id ASC)`.
- The new provenance column is added by a new forward migration; the
  applied 005a migration is never edited. Existing owner CRUD column grants
  are not extended to write it (below).

### 006a — group security model

- All authorization derives the caller from `auth.uid()` and applies 006a's
  joined-membership predicate semantics for the caller and for the source
  item's owner inside the same transaction. No arbitrary user id is
  accepted. Denials are uniform and non-enumerating, per the 006a
  function conventions (empty `search_path`, qualified names, fixed return
  types, exact grants).

### 006b/006c — creation and acceptance

- Membership authority comes only from currently-`joined` `group_members`
  rows established by these slices. No invitation, use, or audit table is
  read or written by the copy path.

### 006d/006e — room and member wishlist browsing (the surface)

- The copy action renders only on the 006e member-wishlist page's item
  cards (`/groups/[groupId]/members/[memberId]/wishlist`), whose
  authorization, generic not-found behavior, owner redirect, pinned V18
  card hierarchy, and exact 10-column `member_wishlist_snapshot` contract
  are unchanged by this brief. The copy authorization reuses 006e's exact
  active-item predicate (`extraction_status` in (`manual`, `extracted`),
  item exists, owner is the target member joined in the same group).
- No snapshot function gains columns; the smallest reviewed change is a
  single write function, one new column, and one partial unique index.

### 007a — reactions (sibling Phase 6 brief)

- 007a is an independent contract on the same 006e item card. Neither brief
  depends on the other's schema or functions; whichever slice implements
  second must not alter the first's committed behavior, tests, or approved
  baselines except through its own reviewed change. Shared-file collisions
  are limited to the 006e item-card component and its fixtures, and both
  briefs require the existing committed baselines to remain green.

## Data model

One forward-only migration amending `public.wishlist_items`, following the
005a/006a conventions (UUID keys, `clock_timestamp()` semantics, bounded
fields, explicit grants, RLS everywhere).

```sql
alter table public.wishlist_items
  add column copied_from_item_id uuid
    references public.wishlist_items (id) on delete set null;

create unique index wishlist_items_one_copy_per_source
  on public.wishlist_items (owner_id, copied_from_item_id)
  where copied_from_item_id is not null;
```

- The partial unique index is the database-level idempotency rule: at most
  one live copy of a given source item per copier. `ON DELETE SET NULL`
  means deleting the source item dissolves the provenance (and with it the
  duplicate guard for that source — accepted, since the source no longer
  exists to be copied); the copied item itself is never deleted by the
  source's deletion.
- **Grant discipline.** The existing authenticated column grants on
  `wishlist_items` are NOT extended: the new column appears in no client
  INSERT or UPDATE column list, so only the definer function writes it.
  The whole-row owner SELECT grant lets the copier's own RLS-protected
  reads include it — acceptable, because the value is meaningful only to
  the copier — but no group-facing read ever returns it (below).
- The copy itself is a normal `wishlist_items` row: `extraction_status`
  `manual` (the default), null `note`, default `desire_level`, and the
  copied fields per the decision record. It participates in the owner's
  normal 005c edit/delete and 005d reorder flows with no new code.

## Database function

```sql
public.copy_group_item(p_group_id uuid, p_item_id uuid)
returns uuid  -- the new (or existing) copied item id
```

One `SECURITY DEFINER` function, empty `search_path`, fully qualified,
fixed return type, no dynamic SQL. EXECUTE revoked from `PUBLIC`, `anon`,
and `service_role` (including default privileges) and granted exactly to
`authenticated`. It is the entire public function inventory of this brief;
the migration pins the signature and rejects overloads.

- Authorization inside the transaction, before any write: the caller is
  currently `joined` in `p_group_id`; the source item's owner is currently
  `joined` in the same group; the source item satisfies the 006e
  active-item predicate; the caller is not the source owner (copying your
  own item is a no-op denial, not a feature); the group's lifecycle status
  is the currently supported active state per 006a.
- **Idempotency under a lock.** The function locks the caller's single
  `wishlists` row `FOR UPDATE` (the 005d append convention), then looks up
  an existing row for `(owner_id = caller, copied_from_item_id = p_item_id)`.
  If one exists, it returns that id and writes nothing (no new item, no
  sort-position churn, no duplicate). The lock serializes a user's
  concurrent copies, so the check-then-insert cannot interleave for the
  same copier; the partial unique index is the backstop if any future path
  forgets the lock.
- On the creating path it appends the new item at maximum finite
  `sort_position` plus one (or 1 for an empty list) inside the same
  transaction and returns the new id. The result is the minimum: an item
  id — no source metadata echo, no owner data.
- Every denial — signed-out (`auth.uid()` null), outsider, pending,
  declined, left, removed, cross-group, unknown group/item, invisible
  (`extracting`/`failed`) item, own item — is the same uniform generic
  failure with no distinguishing detail and no enumeration of groups,
  members, items, or copies.

## RLS and grants inventory (sketch)

- `wishlist_items`: no new policy; the five 005a owner-only policies stand
  unchanged. RLS is nowhere weakened — the copy path adds a definer
  function, not a group-member SELECT/INSERT policy.
- `copied_from_item_id`: absent from the authenticated INSERT and UPDATE
  column grants (function-only write); present only in owner-scoped reads.
- `copy_group_item`: EXECUTE revoked from `PUBLIC`, `anon`, and
  `service_role`; granted exactly to `authenticated`.
- No change to `groups`, `group_members`, `group_invitations`,
  `group_invitation_uses`, `audit_events`, `profiles`, `wishlists`, or any
  007a object. The full privilege inventory (tables, columns, schemas,
  functions, sequences, default privileges) is asserted by pgTAP in the
  same PR per the 006a criterion-2 pattern, and
  `supabase/tests/smoke.sql`'s inventory and fixture counts are updated
  deliberately in the same PR — any changed smoke assertion is recorded as
  a scoped amendment, never silently relaxed.

## pgTAP suite and race harness

Transaction-wrapped pgTAP under `supabase/tests/` plus a committed, bounded
two-session CI harness per the 005h/006a conventions, run by the existing
CI `database` job against a fresh local Supabase stack on the exact
implementation PR head.

- **pgTAP positives.** Column type/default/FK action and the partial unique
  index exist; the definer function's signature, security mode,
  `search_path`, and grant inventory are exact; a copy carries exactly the
  approved fields (title, source_url, retailer, image_url, original money
  pair) and exactly the approved defaults (null note, default desire level,
  `manual` extraction, no snapshot path, no converted tuple); the append
  position follows 005c/005d under the wishlist lock; a repeat call for the
  same source returns the existing id with no new row.
- **pgTAP negatives (uniform denials).** Signed-out, outsider, pending,
  declined, left, removed, cross-group, unknown ids, invisible extraction
  states, and own-item attempts: uniform generic failure, no item written,
  no enumeration. Direct client attempts to INSERT or UPDATE
  `copied_from_item_id` are denied by the column grants.
- **Privacy assertions.** `member_wishlist_snapshot`,
  `group_room_snapshot`, the 007a reaction functions (where present), and
  every other group-facing function expose no `copied_from_item_id` value
  and no copy existence signal (declared return columns and runtime rows
  both inspected); the source owner cannot, through any grant, policy, or
  function, discover that their item was copied or by whom.
- **Two-session race scenarios** (independent sessions, barriers, finite
  timeouts, nonzero exit on unexpected results, synthetic cleanup):
  1. concurrent same-source copies by the same user → exactly one new
     item; both sessions return the same id (the loser idempotent behind
     the wishlist lock);
  2. copy vs. the source owner hard-deleting the item (both commit orders)
     → copy either fails uniformly or lands complete; never a partial
     metadata row; deleting the source later nulls the provenance;
  3. copy vs. the copier's own concurrent manual item creation (005c) →
     both succeed under the wishlist lock with a preserved total order;
  4. copy vs. organizer removal of the copier (both commit orders) →
     removal-first denies the copy uniformly; copy-first persists a valid
     owned item.
  The harness follows the 006a pattern: a committed script (for example
  `scripts/test-copy-races-local.sh` with a matching `package.json` script)
  that selects the local Supabase database container exactly and an
  explicit CI `database`-job step after `pnpm test:db` with
  `timeout-minutes: 5`. A green pgTAP step alone never satisfies the race
  criterion.

## UI scope

- **Friend items (006e page).** Each friend item card gains a
  `Copy to my wishlist` action (exact label proposed here; it is new
  user-visible copy and therefore a design-review candidate alongside the
  visual candidate below). Selecting it copies without navigation; the card
  shows a brief designed success confirmation. If a copy already exists,
  the action reports the already-copied state (for example `Already in
  your wishlist`) rather than creating a second copy or pretending to
  succeed freshly. Copying your own item never offers the action (owner is
  redirected by 006e; the server denies it regardless).
- States are designed and explicit: idle, in-progress, success,
  already-copied, and a generic failure with the prior state restored.
  The action is keyboard accessible with visible focus, at least 44 by 44
  CSS pixels on mobile, uses only semantic design tokens, and respects
  reduced motion.
- The copied item appears in the copier's own wishlist at the end of their
  order, fully editable through the existing 005c flows. Nothing about the
  copy — provenance, source owner, source group — is shown on any screen
  to anyone.
- **Visual candidate.** The copy affordance is not present in the pinned
  V18 gifting-browse region 006e reproduced; it is a new visual candidate
  requiring independent product/design review before any baseline is
  committed. Existing 005b and 006e committed baselines change only
  through that explicit approval; agents may not update baselines to make
  CI pass.

## Non-goals

- No copy of notes, desire level, snapshot paths, conversion tuples, or
  `client_submission_id`.
- No copy history, copy counts, or "copied from" display anywhere.
- No notifications, activity entries, or analytics identifiers about
  copies.
- No link extraction, retailer health checking, or re-extraction of copied
  items (the copy is manual and editable; re-running extraction is the
  owner's normal 005e/005f flow).
- No reservation, purchase, assignment, or gifting-private behavior.
- No change to 006e's snapshot shape, route authorization, or baselines;
  no new dependency; no Magic Patterns mock data or editor artifacts.

## Acceptance criteria

1. **Copy creates an owned manual item.** A joined member copying a
   friend's visible item through the approved UI gets a new
   `wishlist_items` row they own, carrying exactly the approved fields and
   defaults, appended in their order per 005c/005d, and editable through
   existing owner flows.
2. **Idempotent in the database.** Repeated or concurrent copies of the
   same source item by the same user produce exactly one row, via the
   partial unique index and the lock-then-lookup function flow; the race
   harness proves the concurrent case.
3. **Approved copied fields only.** Title, source URL, retailer, remote
   image URL, and the original money pair are copied; note, desire level,
   snapshot path, conversion tuple, and submission id are not, per the
   decision record.
4. **No source leakage.** No UI, function result, RSC payload, log, error,
   or analytics event reveals to the source owner or any third party that
   an item was copied, by whom, or how often; `copied_from_item_id` is
   exposed only in the copier's own owner-scoped reads and in no
   group-facing path, and the implementation PR updates
   `docs/architecture/permissions-matrix.md` with a copy-to-wishlist row
   encoding exactly this.
5. **Least privilege.** `copied_from_item_id` is absent from client write
   grants; `copy_group_item` has the exact revoked-then-granted EXECUTE
   inventory; no existing grant, policy, or projection is broadened; the
   smoke inventory amendment is deliberate and scoped.
6. **Uniform denial.** Signed-out, outsider, pending, declined, left,
   removed, cross-group, unknown-resource, invisible-item, and own-item
   attempts are indistinguishable generic failures that enumerate nothing
   and write nothing.
7. **Membership-correct authorization.** Authorization uses the 006a/006e
   joined predicates inside the copy transaction; a stale or forged
   identity cannot copy, and no read or write straddles a membership
   change into a partial or unauthorized result.
8. **Accessible, token-driven UI.** The action and its states are keyboard
   accessible with visible focus, 44-pixel minimum touch targets,
   semantic tokens, reduced-motion respect, and zero automated
   accessibility violations at both approved viewports.
9. **Reviewed visuals.** The copy affordance receives independent
   product/design approval before any baseline commit; existing committed
   baselines stay green without unapproved edits.
10. **Delivery evidence.** The exact PR head passes `pnpm verify`, the
    pgTAP suite, the two-session copy race step, and stack-gated
    e2e/visual/axe checks; the PR copies these criteria with evidence,
    includes migration and rollback notes, and confirms no Magic Patterns
    mock data or editor artifacts shipped.

## Required proof

- pgTAP transcripts for every shape, grant-inventory, positive, negative,
  and privacy assertion above.
- The two-session race transcript with bounded run time, both commit orders
  where relevant, and negative-gate proof.
- Unit/component tests for the copy action's states (idle, in-progress,
  success, already-copied, failure) against deterministic fixtures with no
  real identities and no gifting-private data.
- Playwright coverage of copying from the 006e page, the already-copied
  state, the copied item's appearance and editability in the copier's
  wishlist, and the uniform denial classes; axe runs on populated,
  already-copied, and denied states at 390 by 844 and 1440 by 1000.
- Analytics sink tests proving the exact event name, property enum, and
  zero emission for every denial class.
- Visual evidence per the baseline-approval rule, plus a Railway preview
  when available.

## Migration and staging gate

- One forward-only migration adding the column and index; the applied 005a
  migration is never edited; fixes go forward. The rollback/forward-fix
  note follows the established pattern (drop the index and column; the
  provenance history is lost, copied items remain — a deliberate, scoped
  gate, not a hotfix).
- Applying the committed migration to the dedicated **staging** Supabase
  project is a separate owner-approved gate, applied by the orchestrator
  under delegated authority mirroring 006a/006b: evidence includes the
  exact migration commit and ledger version, inventory/RLS verification,
  synthetic copy smoke results, and an owner approval record. No dashboard
  SQL and no production deployment are included here; the staging gate
  does not close merely because local/CI tests pass.

## Analytics, security, and privacy

- One privacy-safe server-emitted event, `item_copied`, only after a
  successful call, exactly once per call. Its property schema is closed:

  | Property        | Type        | Allowed values (exact enum)   |
  | --------------- | ----------- | ----------------------------- |
  | `copy_outcome`  | string enum | `created`, `already_copied`   |

  No identifiers (no user, group, item, member, or copied-item IDs), no
  titles, URLs, prices, currencies, or counts are sent. The implementation
  PR adds `item_copied` to `docs/analytics/tracking-plan.md` as a
  server-source event with exactly this property, reviewed against that
  plan's prohibited-data list, in the same change.
- **Zero-emission denial proof.** Every denial class emits no
  `item_copied` event and no other new event in the test sink.
- Server authorization is authoritative; client state, hidden controls,
  and analytics never grant access. Security logging uses request
  identifiers and coarse denial categories only, never source item
  content or provenance values. Caching of any copy-bearing response is
  private and user-specific, never shared across users.

## Dependencies and planning status

- Consumes Phase 4's wishlist schema, grants, and append conventions,
  006a's security model and function conventions, 006b/006c membership
  establishment, 006d's room entry point, and 006e's browsing surface and
  active-item predicate, exactly as contracted above.
- Later Phase 6 slices (reservations, activity summaries) consume 006e but
  may not broaden it or this brief's copy semantics silently.
- **Brief only.** This document does not authorize implementation,
  migrations, cloud changes, Linear state changes, baseline commits, or
  merge. The owner must approve the exact commit and link it from the
  matching Linear issue first; implementation then starts from that commit
  on its own branch after the dependencies above are complete.
