# 006e - Member wishlist browsing through a private group

## Outcome

A joined group member can open another joined member's persistent wishlist from
the private group room, understand whose wishlist they are viewing, and follow
an item's original retailer link. The owner sees their own normal wishlist
experience. Outsiders, pending members, former members, and signed-out users
learn nothing about the group, roster, profile, wishlist, item count, or item
existence.

This slice establishes the least-privilege read path later reactions, copying,
reservations, and gifting views consume. It does not implement those actions.

## Scope

### Entry and route contract

- Add the protected route `/groups/[groupId]/members/[memberId]/wishlist`.
- Entry comes from the joined-member roster in 006d. A direct visit performs
  the same server-side session, complete-profile, group-membership, and target
  membership checks before rendering any private data.
- A joined member may view a currently joined member's wishlist, including
  their own. The organizer has no additional read authority beyond joined
  membership.
- Signed-out users follow the existing safe authentication path. Authenticated
  incomplete profiles follow the existing onboarding gate. No group or target
  identifiers are persisted in a new client-controlled carry mechanism.
- Unknown groups, outsiders, pending members, declined members, left members,
  removed members, stale target membership, and unknown item states return the
  same generic not-found result. They do not reveal which check failed.

### Read model and authorization

- Keep `profiles` and `wishlist_items` owner-only policies unchanged. Do not
  add broad direct table SELECT grants for group browsing.
- Add one narrow `SECURITY DEFINER` projection owned by the private database
  owner. It has an empty `search_path`, fully qualified names, explicit
  `REVOKE EXECUTE` from `PUBLIC`, `anon`, and `service_role`, and exact EXECUTE
  granted only to `authenticated`.
- The projection derives the viewer from `auth.uid()` and accepts only the
  group and target-member identifiers. It authorizes both the viewer and
  target as currently joined in the same group inside the statement.
- **Exact projection.** One function, one signature, no overloads:

  ```sql
  public.member_wishlist_snapshot(p_group_id uuid, p_member_id uuid)
  returns table (
    member_display_name text,
    item_id uuid,
    title text,
    source_url text,
    retailer text,
    image_url text,
    note text,
    desire_level public.wishlist_item_desire_level,
    original_amount_minor bigint,
    original_currency char(3)
  )
  ```

  Column nullability: `member_display_name` and `title` and `desire_level`
  are never null; `source_url`, `retailer`, `image_url`, `note`,
  `original_amount_minor`, and `original_currency` are nullable, with
  `original_amount_minor` and `original_currency` null together (the 005a
  money-pair constraint). The runtime result contains no additional field.

- **Authorized empty representation.** On successful authorization of a
  target whose visible item set is empty, the projection returns exactly one
  sentinel row: `item_id` is null and every other item column is null, while
  `member_display_name` is populated. Every denial returns zero rows. Empty
  and denied are therefore distinguishable only through authorization, never
  by shape ambiguity.
- **One-statement snapshot.** The function body is one data-reading SQL
  statement, not a PL/pgSQL sequence or a series of application queries.
  Authorization, the active-group predicate, item visibility, ordering, and
  returned rows are all CTEs or expressions of that single statement and
  share one PostgreSQL statement snapshot. Because no volatile wall-clock
  call is required here, the function may be declared `STABLE`; atomicity
  comes from the single statement regardless. It never authorizes in one
  statement and reads items in a later statement, and the page never
  assembles the wishlist through separate browser calls.
- **Active-item predicate.** A wishlist item is visible exactly when both
  are true in the same statement: (1) the row exists in
  `public.wishlist_items` joined through the composite
  `(wishlist_id, owner_id)` foreign key to the target member's single
  `public.wishlists` row — there is no soft-delete column, so row existence
  is the active state; and (2) `extraction_status` is `manual` or
  `extracted`. Items in any other extraction state are not returned; a
  future displayable state requires a reviewed revision of this brief.
- **Deterministic ordering.** The projection orders rows by
  `sort_position asc, id asc` (the 005d total order) inside the statement.
  `sort_position` is not a returned column; the client never reorders.
- **Read-versus-membership-change race proof.** All authorization and data
  come from one statement snapshot. If a leave or removal transaction
  commits before the reader's statement snapshot is taken, the reader sees
  zero rows and the route renders the generic not-found result. If it
  commits after the snapshot, the reader sees the complete pre-commit
  authorized snapshot: header plus every visible item, never a partial
  roster-free or half-empty result. No read can straddle a membership
  change.
- The projection is read-only and cannot mutate profiles, memberships, or
  items.
- A missing display name is replaced inside the projection by the
  established generic **Member** label (the 006a/006d fallback), so the
  application never performs a direct profile lookup. A missing or unusable
  image uses the approved branded placeholder. Original price and currency
  are shown when present. No conversion is introduced here.
- **Image contract.** The projection returns `image_url` — the item's
  optional remote `https?://` image URL — and never returns
  `image_snapshot_path` or any raw Storage object path to the application
  payload, HTML, or RSC flight data. An item with only a snapshot path (or
  no image at all) renders the branded placeholder, exactly as 005b does;
  this slice adds no Storage bucket, signed-URL resolution, or image proxy.
  If a later slice introduces protected image reads, it amends this brief.
- **Same active-group predicate as 006d.** Authorization uses the identical
  active-group membership predicate that 006d's
  `public.group_room_snapshot(uuid)` applies inside its single statement
  (006d, "Exact private read model"): the caller's `group_members` row for
  `p_group_id` is currently `joined`, the target member's `group_members`
  row for the same group is currently `joined`, and the group's lifecycle
  status is the currently supported active state per the 006a contract. The
  caller check reuses the `private.is_joined_group_member(group_id)` helper
  semantics from 006a; the target check is the same joined-membership
  predicate evaluated for `p_member_id` in the same statement. No different
  or broader membership predicate is introduced.
- Migration work, if the projection requires it, ships as one forward-only
  migration with matching pgTAP privilege, result-shape, positive, negative,
  and enumeration tests. Existing 005a owner CRUD and 005d ordering behavior
  must remain unchanged.

### UI states

- The page identifies the member and states that wishlists are shared only
  with joined group members.
- Non-empty state renders the approved member-wishlist card hierarchy in
  persisted order. Cards show only the fields in the authorized projection.
- Empty state says the member has not added anything yet. It does not invite
  the viewer to edit another person's wishlist.
- **Owner behavior is a server-side redirect, exactly one decision.** When
  the authorized target member is the viewer themselves, the route performs
  a server-side redirect to the existing owner wishlist at `/wishlist` and
  renders no member-wishlist region at all. The owner never sees
  friend-only framing on their own items, and this slice adds no new
  owner-facing screen. (The projection still supports the own case for
  tests and future consumers; the route does not render it.)
- **Pinned V18 reference region.** The populated member-wishlist view
  reproduces the **gifting-browse member-wishlist region** of the approved
  prototype: the "Kabir's wishlist" item-grid region of
  `docs/design-reference/magic-patterns-v18/source/pages/GiftingView.tsx`,
  with frozen baselines
  `docs/design-reference/baselines/v18/gifting-browse--mobile-390x844.png`
  and `docs/design-reference/baselines/v18/gifting-browse--desktop-1440x1000.png`.
  Explicitly omitted from this scope even though the V18 region shows them:
  the gifting banner and budget-fit summary ("N of M fit"), the per-item
  reserve action and reservation state, gift tracking, the budget-comparison
  filtering, and any gifting navigation. This slice reproduces only the
  member header and item-card hierarchy backed by the authorized projection.
- **Dedicated empty state is a new visual candidate.** V18 has no dedicated
  member-wishlist-empty screen; the empty state required here is therefore a
  new visual candidate that requires its own independent product/design
  review and approval before any baseline is committed. It is not silently
  part of the pinned V18 region.
- Each valid source URL opens the original retailer in a new browsing context
  with `noopener` and `noreferrer`. Invalid or missing URLs show no broken
  action.
- Loading, not-found, empty, image-fallback, and populated states are explicit
  and keyboard accessible. Mobile touch targets remain at least 44 CSS pixels.
- Use the pinned Version 18 member-wishlist and group-room references at
  390 by 844 and 1440 by 1000. Any missing distinct frozen state becomes a
  reviewed candidate, not an invented approved baseline.

### Deterministic fixtures

Provide deterministic, non-production fixtures for:

- joined viewer browsing a joined member with ordered items;
- joined viewer browsing a joined member with an empty wishlist;
- joined viewer browsing their own wishlist;
- missing image and missing optional price/note;
- generic not-found for every unauthorized or stale state.

Fixtures must not contain Magic Patterns runtime data, real identities, live
retailer dependencies, reservation state, or assignment state.

## Non-goals

- No reactions, reaction summaries, or activity feed.
- No copy-to-wishlist action.
- No reservation, purchase, gifting progress, draw, or checklist state.
- No item editing, deletion, creation, or reordering for another member.
- No organizer-only visibility or moderation shortcut.
- No groups list, invitation flow, membership controls, transfer, removal, or
  leave behavior.
- No approximate currency conversion, retailer health checking, extraction,
  image proxy, or Storage redesign.
- No public profiles, public wishlists, share links, or search.

## Acceptance criteria

1. **Joined-only browse.** A joined member can open another currently joined
   member's wishlist through the shared group and sees the authorized header,
   ordered items, empty state, and image fallback.
2. **Owner behavior.** Opening the viewer's own member-wishlist destination
   performs the server-side redirect to `/wishlist`, preserves the owner
   experience, and does not expose friend-only actions.
3. **Uniform denial.** Signed-out, incomplete-profile, outsider, pending,
   declined, left, removed, cross-group, stale-target, forged-viewer, and
   unknown-resource requests reveal no group, profile, item, or count data and
   resolve to the same generic not-found behavior where authentication or
   onboarding does not already redirect.
4. **Least privilege.** No broad group-member SELECT policy is added to
   `profiles` or `wishlist_items`. Only the reviewed projection can read the
   closed browse shape, and its function privileges match this brief exactly.
5. **Privacy boundary.** Responses, HTML, logs, analytics, errors, and tests
   contain no reservation, purchaser, assignment, invitation, audit, email,
   extraction-diagnostic, or private profile data.
6. **Persistent order.** Items render in the owner's committed 005d order.
   Browsing never renumbers or mutates positions.
7. **External link safety.** Valid retailer URLs use a safe external-link
   contract; invalid or absent URLs do not create an unsafe or broken action.
8. **Accessible responsive UI.** Mobile and desktop states match the approved
   reference intent, expose a logical heading and landmark structure, support
   keyboard traversal with visible focus, respect reduced motion, and produce
   zero automated accessibility violations.
9. **Regression safety.** Owner wishlist CRUD, ordering, group authorization,
   invitation privacy, and existing committed visual baselines remain green.
10. **Delivery evidence.** The exact PR head passes `pnpm verify`, database
    tests and stack-gated e2e where applicable, plus focused e2e, axe, and
    visual checks. UI evidence includes mobile and desktop before/reference
    comparisons and a Railway preview when available.

## Required proof

- pgTAP proves the projection's exact signature and columns, EXECUTE grants,
  joined viewer/target success, owner success, the authorized empty sentinel
  row, every denial class, cross-group denial, stale membership denial, the
  deterministic order, and absence of gifting-private fields.
- Unit or integration tests prove result mapping, safe URLs, missing optional
  fields, generic member fallback, image fallback, and stable ordering.
- Playwright proves navigation from the 006d roster, direct-route checks,
  empty and populated states, own-wishlist behavior, keyboard use, safe
  external links, uniform denial, and no private data in rendered output.
- Axe runs on populated, empty, own, and not-found states at both approved
  viewports.
- Analytics tests use the development sink to assert the exact event name,
  the four allowed properties and their enum values, the bucket boundaries,
  and zero emission for every denial class.
- Visual candidates cover populated and empty friend-wishlist states at both
  viewports. An independent reviewer compares the actual images against the
  pinned reference before any baseline update.
- The PR records migration and forward-fix notes if a database projection is
  added, the exact staging migration ledger before staging proof, and confirms
  no Magic Patterns mock data or editor artifacts shipped.

## Dependencies

- Phase 4 must have completed with accepted exit evidence.
- 006a group security model supplies joined-member authority and projections.
- 006b and 006c supply group creation and invitation acceptance.
- 006d supplies the private group room and joined roster entry point.
- 005a through 005d supply the persistent wishlist, owner-only policies, item
  display semantics, CRUD, and stable ordering.
- Reactions, copy, reservations, and gifting views consume this slice later
  and may not broaden its read shape silently.

Planning may complete before these dependencies merge. Implementation cannot
start until the approved exact brief commit is linked to its Linear issue and
the dependencies above are complete.

## Analytics, security, and privacy

- Add one privacy-safe server-emitted event, `member_wishlist_viewed`, only
  after successful authorization, exactly once per authorized page render
  (a refresh is a new event). Its property schema is closed:

  | Property            | Type        | Allowed values (exact enum)                                                            |
  | ------------------- | ----------- | -------------------------------------------------------------------------------------- |
  | `view_scope`        | string enum | `own`, `friend`                                                                        |
  | `wishlist_state`    | string enum | `populated`, `empty`                                                                   |
  | `item_count_bucket` | string enum | `zero` (0 items), `one_to_five` (1-5), `six_to_ten` (6-10), `eleven_plus` (11 or more) |
  | `gifting_mode`      | string enum | `secret_draw`, `gift_everyone`, `wishlist_only`                                        |

  No other property, identifier, or count is sent. Do not send group IDs
  (beyond the tracking plan's internal-UUID rule, which this event does not
  use), user IDs, member names, titles, URLs, notes, prices, currencies, or
  item IDs.

- **Tracking-plan change required.** The implementation PR must add
  `member_wishlist_viewed` to the event catalog in
  `docs/analytics/tracking-plan.md` as a server-source event with exactly
  the four required properties above, reviewed against that plan's
  prohibited-data list, in the same change.
- **Zero-emission denial proof.** For every denial class — signed-out,
  incomplete profile, outsider, pending, declined, left, removed, cross-group,
  stale target, unknown group — the test analytics sink records no
  `member_wishlist_viewed` event and no other new event. The empty sentinel
  row is the only state that may emit with `wishlist_state = empty` and
  `item_count_bucket = zero`.
- Denied requests emit no product analytics event. Security logging uses a
  request identifier and coarse denial category only, never private content.
- Server authorization is authoritative. Client routing, organizer status,
  hidden controls, and analytics never grant access.
- Cache behavior is private and user-specific. Responses containing member or
  wishlist data are not publicly cacheable and cannot be shared across users.

## Planning status

Brief only. This document does not authorize implementation, migrations,
cloud changes, Linear state changes, baseline commits, or merge. The owner must
approve the exact commit and link it from the matching Linear issue first.
