# Groups and gifting flow

## Group creation

The organizer supplies:

1. Group name
2. Occasion
3. Date and optional location/description
4. Budget cap and currency
5. Gifting mode
6. Participation confirmation

After creation, the organizer sees **Invite people** and **Open group** side by side, with **Go to home** below on the left. Invite people opens the same invitation dialog used in the room. The dialog reads or creates the usable generic link only after that click, offers copy and WhatsApp sharing, and recovers the same saved active link on subsequent opens. A live legacy digest-only invitation requires the explicit replacement action before rotation. Creating or reloading the confirmation page never issues a link; organizer-only access and invitation authorization are reverified server-side.

Sharing a generic invitation link provides a dynamic banner containing the group
name, current organizer's display name, and the occasion date in the group's own
time zone. The banner uses the app wordmark, Bricolage Grotesque and DM Sans,
and the existing colorful visual language. Reading a chat preview never joins a
group or consumes an invitation use. Invalid or no-longer-live links return a
generic preview; messaging apps may retain previously cached previews.

## Invitation

A signed-out visitor with a valid invitation sees a limited preview: host, group name, occasion date, budget, gifting mode, and joined member count. The visitor selects **Join the group**, authenticates, completes onboarding if needed, and joins automatically after the profile is complete. That first Join click is retained in the browser-bound, sealed continuation; both OTP and magic-link sign-in use the same automatic reconciliation POST. Successful acceptance lands on Home. Preview GETs, prefetch, and email scanners never join a group. Invalid, expired, revoked, exhausted, or account-mismatched continuations remain denied by the existing database acceptance function. A continuation created before this change without recorded Join consent still requires an explicit Join.

Expired, revoked, or invalid invitations reveal no private group data and provide a clear recovery message.

## Membership

States: invited, joined, declined, left, and removed. Organizers cannot silently read private assignments or reservations. Organizer capabilities are administrative, not omniscient.

## Delete a group

The current joined organizer sees **Delete group** at the bottom of Organizer tools. It opens a confirmation modal styled like the logout confirmation, with Cancel focused first. The modal explains that the group disappears for everyone, invitations stop working, and group gifting plans and reservations become unavailable; personal wishlists remain saved. Cancel or Escape closes without mutation. Confirmation disables repeat submission and dismissal while deletion is pending. Success returns to **Groups**; failures remain visible, and a changed member-admin version requires reviewing the refreshed group and confirming again.

Deletion permanently ends app access to the group. Historical membership and audit records remain inaccessible to application users; there is no restore operation. The database checks the current organizer and joined membership under lock, so stale tabs and direct calls cannot bypass authorization.

## Draw names privately

- Include only eligible joined participants.
- Never assign a member to themselves.
- Each participant receives exactly one giver and one recipient.
- The draw is generated atomically; partial assignments are never visible.
- Re-running a draw requires confirmation, invalidates the prior version, and creates an audit event.
- A member leaving after a draw alerts the organizer; the system does not silently redraw.

## Gift everyone

Each participant sees every other eligible participant as a private checklist. Budget applies per recipient. Progress is private from recipients.

## Share wishlists only

No assignments or mandatory checklist. Members may browse, react, copy, and reserve.

## Reservations

- Reservation identity is visible only to the reserving user and other eligible non-recipient gift givers when coordination requires it.
- The recipient sees neither reservation state nor reserving identity for their own item.
- Only one active reservation may exist for a group and wishlist item.
- Reserving is atomic and reports a friendly conflict if another user wins the race.
- A user can release their reservation.
- External checkout does not automatically mark a purchase; purchase state is optional/private metadata if implemented.

## Reactions

- One reaction per user per group/item context.
- Selecting a different reaction switches it.
- Selecting the same reaction removes it.
- Reactions remain visible to eligible members, including the wishlist owner.
- Reservations and gifting progress never appear in reaction activity.

## Invite more people from the room

The organizer sees **Invite people** in the group header beside Organizer tools. It opens the existing invitation manager, where the organizer explicitly creates a link and can copy it or share it through WhatsApp. Active-link replacement and revocation keep their existing confirmation and version checks. Other members cannot mint or replace group invitation links; the UI and server both enforce that boundary.

The group date field accepts ISO text entry and offers a branded keyboard-accessible calendar. Currency choices search their code and name while submitting only an explicitly selected supported code. These controls retain the existing server validation and exact budget semantics.
