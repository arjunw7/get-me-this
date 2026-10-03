# Groups and gifting flow

## Group creation

The organizer supplies:

1. Group name
2. Occasion
3. Date and optional location/description
4. Budget cap and currency
5. Gifting mode
6. Participation confirmation

After creation, the organizer receives a shareable invitation link and email/share actions, including a WhatsApp-friendly share path.

## Invitation

A signed-out visitor with a valid invitation sees a limited preview: host, group name, occasion date, budget, gifting mode, and joined member count. The visitor selects **Join the group**, authenticates, completes onboarding if needed, and returns to the invitation before membership is created.

Expired, revoked, or invalid invitations reveal no private group data and provide a clear recovery message.

## Membership

States: invited, joined, declined, left, and removed. Organizers cannot silently read private assignments or reservations. Organizer capabilities are administrative, not omniscient.

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
