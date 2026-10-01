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
- The result shape is closed to the fields needed for browsing:
  `item_id`, `title`, `source_url`, `retailer`, `selected_image_path`,
  `original_price_minor`, `original_currency`, `note`, `desire_level`, and
  `sort_position`. It returns the target member's display name separately or
  in a small typed header projection. It never returns email, avatar storage
  internals, candidate images, extraction diagnostics, provenance, owner edit
  metadata, invitation data, audit data, assignments, reservations, purchase
  state, or other members' data.
- Return only active saved wishlist items in the owner's persisted order. The
  projection is read-only and cannot mutate profiles, memberships, or items.
- A missing display name uses the established generic member label. A missing
  or unusable image uses the approved branded placeholder. Original price and
  currency are shown when present. No conversion is introduced here.
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
- Own-wishlist state reuses or links to the existing owner experience and
  never shows friend-only controls on the owner's items.
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
   preserves the owner experience and does not expose friend-only actions.
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
  joined viewer/target success, owner success, every denial class, cross-group
  denial, stale membership denial, and absence of gifting-private fields.
- Unit or integration tests prove result mapping, safe URLs, missing optional
  fields, generic member fallback, image fallback, and stable ordering.
- Playwright proves navigation from the 006d roster, direct-route checks,
  empty and populated states, own-wishlist behavior, keyboard use, safe
  external links, uniform denial, and no private data in rendered output.
- Axe runs on populated, empty, own, and not-found states at both approved
  viewports.
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

- Add one privacy-safe `member_wishlist_viewed` event only after successful
  authorization. Properties are limited to group mode, empty/non-empty state,
  item-count bucket, and own/friend view. Do not send group IDs, user IDs,
  member names, titles, URLs, notes, prices, currencies, or item IDs.
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
