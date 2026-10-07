# Permissions matrix

`Owner` means the owner of the wishlist item. `Eligible giver` means a joined group member permitted to gift under the current group mode.

| Resource/action | Signed out | Owner | Joined member | Eligible giver | Organizer |
|---|---:|---:|---:|---:|---:|
| View landing/auth | Yes | Yes | Yes | Yes | Yes |
| View limited invitation preview with valid token | Yes | Yes | Yes | Yes | Yes |
| View wishlist through its valid enabled public link | Yes | Yes | Yes | Yes | Yes |
| Enable/revoke or retrieve own wishlist public link | No | Yes, own link only | No | No | No |
| React through a valid public wishlist link | No | Never own item | Yes, signed-in non-owner; membership not required | Same | Same |
| Read raw public-link/reaction tables or reactor identities | No | No | No | No | No |
| View private group | No | Only if member | Yes | Yes | Yes if member |
| View member wishlist through shared group | No | Yes | Yes | Yes | Yes if member |
| Copy another member's item to own wishlist (007b) | No | Never own item | Yes | Yes | Yes if eligible |
| Read raw source provenance or source-side copy counts (007b) | No | **Never** — no read path, function, log, or event exposes source provenance or source-side copy counts | Only for own copies via own owner-scoped reads (`copied_from_item_id`) | Only for own copies | Only for own copies |
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
| Permanently delete group from the app | No | No | No | No | Current joined organizer, confirmed and audited |
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

## Organizer membership controls (006f)

The current joined organizer mutates the roster through four
compare-and-swap SECURITY DEFINER functions owned by the trusted
non-client database role with empty `search_path` (migration
`20261018000000_groups_006f_organizer_membership_controls.sql`):
`remove_group_member(uuid, uuid, bigint)`,
`transfer_group_organizer(uuid, uuid, bigint)`,
`revoke_group_invitation(uuid, uuid, bigint)`, and
`reinvite_group_member(uuid, uuid, bigint)`. The non-CAS predecessors were
dropped; every mutation evaluates
`p_expected_member_admin_version` against
`groups.member_admin_version` (nonnegative, durable) before authority,
locks the group row and then both membership rows in a fixed order, and
returns the new version — the targeted issue and reinvitation also return
the one-time 43-character token material and expiry, which exist only
inside the transaction and the initiating response. Every committed
action appends exactly one privacy-safe `group_admin_events` row
(`member_removed`, `organizer_transferred`, `member_reinvited`,
`invitation_revoked`; display label only, resolved at event time; no
tokens, emails, wishlists, assignments, reservations, or reaction
targets). Reinvitation restores declined/left/removed rows to `invited`
at a new `membership_generation`, creates absent rows at generation 1,
and reissues invited-no-live rows keeping status and generation; tokens
are stored digest-only, expire in 30 days, and are single-use.

EXECUTE is revoked from `PUBLIC`, `anon`, and `service_role` and granted
only to `authenticated` for the exact four CAS overloads (plus the
existing 006c `accept_group_invitation` surface, unchanged). Four
organizer-only projections — `group_admin_members` (full roster across
all five membership states with generation and former-state timestamps),
`group_admin_audit` (the bounded recent event feed),
`group_admin_version`, and `group_admin_live_invitations` (invitation
ids and expiry, never token material) — return zero rows for
`anon`, `service_role`, outsiders, invited, declined, left, removed,
and former organizers; only the current joined organizer reads them.
The application surface consumes only these projections: a
non-organizer's room payload carries no admin markers, no former-member
rows, and no audit content (pgTAP:
`supabase/tests/groups-006f.sql`; race harness:
`scripts/test-group-admin-races-local.sh`).

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

- Group deletion denies anonymous callers, outsiders, ordinary members, former organizers, and organizers without joined membership. Deleted groups, old invite links, and private gifting projections are unavailable to all former members. Deletion never changes personal wishlists.

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


## Profile Vibe

Migration `20261022000000_profiles_vibe.sql` adds the constrained, non-null
`profiles.vibe` column with default `marigold`, preserving existing profile
appearance. The only added table privilege is authenticated `UPDATE(vibe)`;
owner-only profile SELECT/UPDATE RLS is unchanged.

The separate `public.group_member_vibes(uuid)` projection exposes exactly
`member_user_id` and `vibe` for joined members of one active group to a
currently joined caller of that same group. Caller identity comes only
from `auth.uid()`. The STABLE, single-statement SECURITY DEFINER function is
owned by the trusted `postgres` role and has an empty search path; EXECUTE
is revoked from PUBLIC, anon, and service_role and granted only to
authenticated. Invited/declined/left/removed targets are absent, and denied
callers or unknown/cross-group/archived groups receive zero rows. No direct
foreign-profile access, assignment data, or reservation data is added.

The allow/deny proof is `supabase/tests/profiles-vibe.sql`; rollout and
non-destructive rollback guidance are in
[Profile Vibe persistence](profile-vibe.md).


## Public wishlist links

The user-approved public sharing extension supersedes private-by-default wishlist
visibility: migration `20261023000000_public_wishlists.sql` enables a random
256-bit bearer link for every existing wishlist and every new wishlist. Groups
and all gifting context remain private. Base profile, item, wishlist, and Storage
RLS and grants remain unchanged.

The deny-all `private.wishlist_public_links` table is readable only through the
authenticated owner's `own_wishlist_share_state()` function; no direct table
access is granted. Its raw token is retained to support stable repeated copying
and is never returned by public projections. Owner enable/revoke operations
accept only `p_expected_version`, derive identity from `auth.uid()`, and lock the
wishlist/link before comparing versions. Revocation hides the token; re-enable
creates a new token. No operation can target a caller-supplied owner.

`public_wishlist_snapshot(text)` grants anon/authenticated exactly the approved
profile/item fields, public-only reaction counts, and the caller's own reaction.
It never exposes email, owner ID, group/private reaction data, reservation or
purchase status, assignments, copied provenance, or Storage sources. Invalid or
disabled tokens return zero rows; an authorized empty list has a header sentinel.

`set_public_wishlist_reaction(text, uuid, group_item_reaction_kind)` permits a
verified non-owner to set/replace/remove their public-context reaction without
requiring group membership. It locks the active capability and visible item;
revocation/deletion and reaction writes have a tested committed order. The new
public reaction table has RLS enabled, zero policies, and zero application-role
table grants. `own_public_wishlist_reaction_summary()` exposes only the owner's
public counts. Existing group reaction projections are unchanged.

`public_wishlist_image_source(text, uuid)` is service-role-only and performs its
own token/item/visibility authorization before returning an owner-bound source
to the server image route. Browser roles cannot call it; raw paths and signed
Storage URLs must never appear in public responses. Every function is trusted
SECURITY DEFINER with empty search path and explicit grants.

Full lifecycle, concurrency proof, image responsibilities, rollout, and
non-destructive disabling notes: [Public wishlist links](public-wishlists.md).

## Invitation banners

Holders of a valid generic invitation may share a read-only SHA-256 preview
capability with chat applications. `group_invitation_share_preview(text)` returns
only current organizer display name, group name and the occasion wall clock in
the group time zone. The capability cannot join, recover the invitation bearer,
read members/wishlists, or expose gifting activity. Anonymous and authenticated
callers receive the same projection; targeted, inactive, expired, exhausted and
revoked invitations return no rows. Every image request rechecks this boundary.
No table grants are added. See [rollout and rollback](../ops/invitation-sharing-rollout.md).

## Recoverable generic invitation links

Migration `20261024000000_recoverable_group_invite_links.sql` retains newly issued
**generic** invitation bearer tokens in deny-all
`private.group_shareable_invitation_tokens`. No application role has table
access. Targeted invitations remain digest-only. The original generic issuance
implementation moves to a trusted private helper with all client EXECUTE
revoked; its public wrapper keeps the existing CAS signature and atomically
stores the issued token while preserving expiry, audit, and acceptance behavior.

`get_group_invite_link(uuid)` is authenticated-only and locks the active group
before deriving current joined organizer authority from `auth.uid()`. It returns
only state, version, bearer, and expiry. A saved live link is stable on reopen;
a live legacy hash-only link returns `replacement_required` with no bearer and
is never rotated without explicit organizer confirmation. Only a never-issued,
expired, revoked, or exhausted link is created automatically when opening the
modal. Stored bearer/digest mismatch also fails closed to confirmation.

Unknown/archived groups, anonymous/null actors, non-organizers, former organizers,
and organizers without joined membership receive no rows. Current organizers
may recover a link issued by a previous organizer; original creation identity
confers no ongoing access. Base-table grants, targeted invitation boundaries,
group membership, reservations, and assignment visibility are unchanged.

See [Recoverable generic group invitations](recoverable-group-invites.md) for
locking, action shapes, proof, and non-destructive rollback notes.

## Copied destination badges

Product-approved exception: joined members of the same active group may see a
Copy Cat badge on a copied **destination** item. `group_copied_item_ids(uuid, uuid)`
reuses `member_wishlist_snapshot` authorization and returns only visible destination
IDs. It never returns the source item ID, source owner, group of origin, or copy
counts. Owners read their own provenance under existing owner RLS and map it to a
boolean; raw provenance never reaches the rendered card. Public capability links
remain unchanged. Source cards never receive a sticker as a result of being copied.
The existing ON DELETE SET NULL behavior clears provenance when a source disappears.
Rollback: revoke authenticated EXECUTE, remove badge reads, then drop the function.
