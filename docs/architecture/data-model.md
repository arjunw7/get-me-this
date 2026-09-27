# Data model

This is the logical v1 model. Exact SQL belongs in reviewed migrations.

## Core tables

### `profiles`

- `id` UUID primary key referencing `auth.users`
- `display_name`
- `avatar_path` nullable
- timestamps

One profile per authenticated user.

### `wishlists`

- `id`
- `owner_id` unique
- optional personality/theme fields approved by the final UI
- timestamps

One persistent wishlist per user.

### `wishlist_items`

- `id`, `wishlist_id`, `owner_id`
- title, source URL, retailer
- selected image and snapshot metadata
- original amount/currency
- optional converted amount/currency, rate source, and rate timestamp
- note, desire level, sort position
- source/extraction status
- timestamps and optional soft-delete timestamp

Owner redundancy may be used only if it materially simplifies secure policies and is kept consistent by the database.

### `groups`

- `id`, `organizer_id`
- name, occasion, date/time, time zone
- optional location/description
- budget amount and currency
- mode: `secret_draw`, `gift_everyone`, or `wishlist_only`
- lifecycle status and current draw version
- timestamps

### `group_members`

- `group_id`, `user_id`
- role: organizer/member
- status: invited/joined/declined/left/removed
- participation flag
- joined/left timestamps

Unique on group and user.

### `group_invitations`

- `id`, `group_id`, creator
- token hash, expiry, status
- optional intended email
- use count/limit where required
- timestamps

Store a hash, not the raw bearer token.

### `gifting_assignments`

- `id`, `group_id`, `draw_version`
- giver user, recipient user
- status and viewed timestamp
- timestamps

Unique giver and unique recipient within a secret-draw version. Gift-everyone checklists may be derived or materialized using the same relation when useful.

### `gift_reservations`

- `id`, `group_id`, `wishlist_item_id`
- reserver user
- optional private status
- active/released timestamps

At most one active reservation per group and item. The wishlist owner may never read rows for their own item.

### `item_reactions`

- `group_id`, `wishlist_item_id`, `user_id`
- reaction: `very_you`, `questionable`, or `want_it_too`
- timestamps

Unique on group, item, and user, enforcing one reaction.

### `item_copies`

- source item, copied item, copying user
- timestamp

Used for provenance and metrics; copied items remain independent.

### `audit_events`

- actor, group, event type
- safe structured metadata
- timestamp

Required for draw creation/redraw, membership changes, invitation revocation, and other consequential organizer actions.

### `email_deliveries`

- user/group relation where applicable
- template, provider message ID, status, idempotency key
- timestamps

Do not store OTPs, magic-link tokens, or full sensitive email bodies.

## Important constraints

- No self-assignment.
- One persistent wishlist per owner.
- Group membership unique per user.
- One reaction per group/item/user.
- One active reservation per group/item.
- Assignment version is immutable once published; redraw creates a new version.
- Money uses integer minor units plus ISO currency code, never floating point.
- All timestamps use UTC; group display uses the recorded time zone.

