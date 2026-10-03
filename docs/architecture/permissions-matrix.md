# Permissions matrix

`Owner` means the owner of the wishlist item. `Eligible giver` means a joined group member permitted to gift under the current group mode.

| Resource/action | Signed out | Owner | Joined member | Eligible giver | Organizer |
|---|---:|---:|---:|---:|---:|
| View landing/auth | Yes | Yes | Yes | Yes | Yes |
| View limited invitation preview with valid token | Yes | Yes | Yes | Yes | Yes |
| View private group | No | Only if member | Yes | Yes | Yes if member |
| View member wishlist through shared group | No | Yes | Yes | Yes | Yes if member |
| Edit wishlist/item | No | Yes | No | No | No |
| React to another member's item | No | No | Yes | Yes | Yes if eligible |
| View visible reaction summary | No | Yes | Yes | Yes | Yes if member |
| Reserve an item | No | Never own item | Mode-dependent | Yes | Only if eligible giver |
| View reservation for recipient's item | No | **Never** | Mode-dependent | Yes when needed to prevent duplication | No special access |
| View who reserved own item | No | **Never** | N/A | N/A | **Never through organizer role** |
| View own assignment/checklist | No | N/A | Own only | Own only | Own only |
| View another member's assignment | No | No | No | No | No |
| Create/update group settings | No | No | No | No | Organizer only |
| Run/redraw secret draw | No | No | No | No | Organizer, confirmed and audited |
| Invite/remove members | No | No | No | No | Organizer |
| Read/write `wishlist-item-snapshots` Storage objects (005f) | No | Own `{owner_id}/` prefix only | No | No | No |
| Read/write `private.email_outbox` (009a) | No | No (no grant, no policy) | No | No | No |
| Read/write `private.rate_limit_windows` (009b) | No | No (no grant, no policy) | No | No | No |

## Group room snapshot (006d)

The private group room reads through exactly one projection,
`public.group_room_snapshot(uuid)` (migration
`20261016000000_groups_006d_group_room.sql`): SECURITY DEFINER owned by the
trusted non-client database role, empty `search_path`, one data-reading SQL
statement (one statement snapshot; honestly VOLATILE because it captures
`clock_timestamp()` once). The caller is derived only from `auth.uid()`; a
currently joined membership and an active group are required, and every other
state — anon, outsider, invited, declined, left, removed, cross-group,
archived — returns zero rows. EXECUTE is revoked from `PUBLIC`, `anon`, and
`service_role` and granted only to `authenticated` for the exact `(uuid)`
overload. Pending rows appear only for a currently `invited` membership with
a live, matching-generation, capacity-available targeted invitation.
Organizer status grants no extra read: organizer and ordinary joined callers
receive identical facts and roster. No table, schema, or sequence grant is
added, RLS is unchanged, and the projection exposes no emails, tokens,
generations, invitation metadata, or wishlist data (pgTAP:
`supabase/tests/groups-006d.sql`, race harness
`scripts/test-group-room-snapshot-races-local.sh`).

## Member wishlist browsing (006e)

A joined member browses another joined member's wishlist through exactly
one projection, `public.member_wishlist_snapshot(uuid, uuid)` (migration
`20261017000000_groups_006e_member_wishlist_browsing.sql`): SECURITY
DEFINER owned by the trusted non-client database role, empty
`search_path`, one data-reading SQL statement, honestly STABLE (no clock
or volatile call). The caller is derived only from `auth.uid()`; the
viewer and the target must both be currently joined to the same active
group, and every other state — anon, outsider, invited, declined, left,
removed (either side), cross-group viewer or target, archived group,
guessed ids — returns zero rows. EXECUTE is revoked from `PUBLIC`, `anon`,
and `service_role` and granted only to `authenticated` for the exact
`(uuid, uuid)` overload. The projection exposes only the authorized
display fields (display label with the generic `Member` fallback, title,
source URL, retailer, `image_url` — never `image_snapshot_path` — note,
desire level, and the original money pair) for items whose
`extraction_status` is `manual` or `extracted`, in the committed 005d
order (`sort_position asc, id asc`). An authorized caller browsing a
member with no visible items receives one sentinel row (null item
fields, populated label) instead of an indistinguishable denial. The
owner self-view renders through the same projection and redirects to the
owner's own wishlist route; reactions and reservations are absent by
design (006e non-goals). No table, schema, or sequence grant is added and
RLS is unchanged (pgTAP: `supabase/tests/groups-006e.sql`).

## Transactional email outbox (009a)

The private `email_outbox` table (migration
`20261014000000_email_outbox.sql`) holds queued transactional email state.
It carries no grant for any application role — `anon`, `authenticated`, and
`service_role` have no direct table privilege and no permissive RLS policy
(deny-by-default, no policy substitute). All writes go through three
SECURITY DEFINER functions granted for EXECUTE to `service_role` only
(server-side worker and server actions; never a browser path):
`private.enqueue_email` (idempotent, allowlist-validated payload),
`private.claim_due_emails` (SKIP LOCKED claim lease with claim-time attempt
accounting), and `private.record_email_result` (claimed-only resolution).
The outbox never stores recipient addresses (profile email is a send-time
lookup), raw tokens, secret URLs, or assignment identities.

## Rate limiting (009b)

The durable fixed-window limiter counters live in
`private.rate_limit_windows` (migration
`20261014010000_rate_limit_windows.sql`). They carry no grant for any
application role — deny-by-default with RLS enabled and no permissive
policy; only the SECURITY DEFINER `private.rate_limit_increment` and
`private.rate_limit_cleanup` are executable, by `service_role` only.
Counter keys are bounded coarse identifiers (route family plus hashed IP
prefix or internal user id) and never contain raw tokens, addresses, or
secret URLs. The limiter is a secondary defense: every database-level
invariant from 006a/006c/007c/008c remains the authority, and a limiter
failure can never create, reveal, or resurrect any state the database
forbids. Selection rationale, pinned limits, and the CAPTCHA wiring are
recorded in `docs/architecture/abuse-controls.md`.

## Storage (005f)

The private `wishlist-item-snapshots` bucket (migration
`20261002000000_wishlist_item_snapshot_bucket.sql`) stores the normalized
WebP snapshot of an item's selected image under
`{owner_id}/{client_submission_id}.webp`. Access is owner-only: the four
`storage.objects` policies (`wishlist_item_snapshots_select_own`,
`_insert_own`, `_update_own`, `_delete_own`) are granted to `authenticated`
and scoped to the first path folder equaling `auth.uid()::text`. There is
no anon policy and no service-role policy; the application path uploads
through the authenticated server client and reads only through short-expiry
server-generated signed URLs — raw paths and signed URLs never reach logs,
analytics, or the client. A foreign user cannot read or mutate another
user's objects by direct authenticated storage API (pgTAP:
`supabase/tests/wishlist_snapshot_bucket.sql`).

## Required negative tests

- A non-member cannot enumerate groups, members, profiles, or items.
- A member cannot access a group after leaving/removal.
- A recipient cannot infer reservation state through direct table access, counts, activity, APIs, emails, or error differences.
- An organizer cannot use organizer status to read others' assignments or reservations.
- A user cannot reserve their own item.
- A user cannot react or reserve through a group where they are not joined/eligible.
- Guessing an invitation ID without the bearer token reveals nothing.
- Expired/revoked invitation tokens cannot create membership.
- Public client credentials cannot call service-role operations.

Every exposed table requires explicit grants, RLS policies, and allow/deny database tests in the same pull request.

