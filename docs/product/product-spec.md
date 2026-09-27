# Product specification

## Summary

**Get Me This** is a playful, private social wishlist for young friend groups. A user maintains one persistent wishlist, reuses it across occasion-based groups, and can save products from any store. Group members browse one another's wishlists, react to items, choose how gifting works, and privately reserve gifts so recipients remain surprised and duplicate purchases are avoided.

The product is India-born and globally usable across Diwali, Eid, birthdays, weddings, housewarmings, Secret Santa, and informal friend-group traditions.

## Problem

Gift ideas are scattered across messages, retailer wishlists, saved posts, and memory. Group gifting also creates coordination problems: people do not know what friends genuinely want, budgets are unclear, assignments get lost, duplicate gifts happen, and coordinating purchases can ruin the surprise.

Existing products often feel like formal registries, family utilities, or one-off Secret Santa organizers. Young friend groups need something useful enough for gifting and expressive enough to keep current throughout the year.

## Audience

Primary audience: digitally native friend groups, initially people aged roughly 18–30. The product should still remain understandable and usable outside this range.

Core roles:

- Wishlist owner
- Group member
- Group organizer
- Gift giver
- Signed-out invite recipient

## Product promise

Make a wishlist, share it with your people, and give without guessing.

## Goals

1. A new user can authenticate and add a first wishlist item without creating a password.
2. An organizer can create a group, choose an occasion, date, budget, currency, and gifting mode, then share an invitation.
3. An invite recipient can understand the invitation before signing in and join without losing invitation context.
4. Group members can find suitable gifts and reserve them without revealing reservations to the recipient.
5. Product-link extraction accelerates entry without ever blocking manual creation.
6. The experience feels socially expressive enough that members react to or copy friends' items.

## Early success signals

- At least 60% of users who request authentication complete it.
- At least 50% of newly authenticated users add one item during the first session.
- A created group reaches at least four joined members.
- Median active member adds at least three wishlist items before the occasion.
- At least 80% of issued private assignments are viewed.
- At least 50% of joined members react to, copy, or reserve an item.
- Fewer than 2% of completed reservations become conflicting active reservations.

Targets are launch hypotheses and should be revisited after the first meaningful cohort.

## Core user stories

1. As a new user, I want to authenticate using my email so I can start without creating a password.
2. As a wishlist owner, I want to save any product link and correct extracted information so my wishlist reflects what I actually want.
3. As a wishlist owner, I want one persistent wishlist across groups so I do not rebuild it for every occasion.
4. As an organizer, I want to configure a group's occasion, budget, currency, and gifting mode so expectations are clear.
5. As an invite recipient, I want to preview the group before authenticating so I know what I am joining.
6. As a secret-draw participant, I want to see only my assignment so the exchange remains secret.
7. As a member in “Gift everyone” mode, I want a checklist of the other members so I can track my gifting privately.
8. As a casual group member, I want to browse and reserve without assignments when the group chooses wishlist-only mode.
9. As a gift giver, I want to reserve an item privately so another person does not buy it and the recipient is not alerted.
10. As a friend, I want to react to an item or copy it to my wishlist so browsing feels social rather than administrative.
11. As a returning user, I want to see upcoming occasions and relevant private actions immediately.

## Product loop

1. Continue with email using an OTP or magic link.
2. Complete a minimal profile with display name and optional avatar.
3. Add products to a persistent wishlist.
4. Create or join an occasion-based group.
5. Browse member wishlists and react or copy items.
6. View an assignment or recipient checklist when the mode requires it.
7. Reserve a gift privately and purchase on the original retailer's site.
8. Return for activity, reminders, future occasions, and wishlist maintenance.

## Gifting modes

### Draw names privately

Each participating member receives exactly one private recipient. No participant is assigned to themselves. Only the giver can see their assignment before any optional reveal.

### Gift everyone

Each participant receives a private checklist containing every other participating member. The configured budget applies per recipient.

### Share wishlists only

No assignments or obligations. Members browse, react, copy, and reserve gifts privately.

Reservations are group-scoped and invisible to the wishlist owner in every mode.

## Trust rules

- Wishlists are private by default and visible only through shared group membership.
- A signed-out invitation preview exposes only the limited information needed to understand the invitation.
- Reactions are visible to eligible group members.
- Reservations, assignment state, and gifting progress are hidden from recipients.
- Imported product information remains editable.
- Failed extraction falls back to manual entry.
- Original prices and currencies are preserved; conversions are labelled approximate.
- Budgets guide decisions but do not hide or block expensive items.
- Saved item information survives retailer changes or link failure.
- Leaving after a draw alerts the organizer and does not silently reshuffle assignments.
- Redrawing or otherwise invalidating assignments requires explicit confirmation and an audit record.
- Logging out does not delete wishlists, memberships, reservations, or assignments.

## Open questions

### Blocking before the relevant slice

- Which production domain and sending subdomains will be used?
- Which exchange-rate source will power approximate currency conversion?
- What product metadata extraction strategy/provider will be used after the initial standards-based extractor?
- What constitutes participation eligibility when some invited members have not joined before a draw?

### Non-blocking

- Whether reminders are opt-out or individually configurable after launch.
- Whether group organizers can archive groups in v1 or only leave them completed.
- Whether copying an item also copies its note or only product metadata.

