# Public wishlist links

The user explicitly approved public wishlists for **every existing and new
account**, extending the earlier private-by-default wishlist scope. Groups,
memberships, reservations, purchase progress, assignments, and private group
reactions remain private. Public visitors see the owner's chosen display name,
taste line, Vibe, and currently visible wishlist items. Only signed-in non-owners
can react through the public link; group membership is not required.

## Capability lifecycle

Migration `20261023000000_public_wishlists.sql` creates
`private.wishlist_public_links`, backfills every existing wishlist, and installs
an AFTER INSERT trigger on `wishlists`. Each wishlist starts enabled at version
0 with an independent 256-bit random bearer token, encoded as 43 base64url
characters. This is automatic publication, not opt-in.

The private table has RLS enabled, no policies, and no direct application-role
grants. It retains both the token and its unique SHA-256 digest. Retaining the
raw token is deliberate: the authenticated owner can copy the same stable URL
again without accidentally invalidating previously shared links. It is returned
only by owner-scoped functions, never by public content projections. The table
is secret-bearing; exclude tokens from logs, analytics, error messages, and
screenshots of owner link controls.

`own_wishlist_share_state()` returns `(enabled, version, share_token)`. The token
is null when disabled. `revoke_wishlist_share(p_expected_version)` disables the
link and increments its version. `enable_wishlist_share(p_expected_version)`
generates a **new token** when re-enabling; old URLs remain invalid permanently.
Calling enable on an already enabled link, or revoke on an already disabled
link, is an idempotent no-op at the current version. Stale/null versions and
unverified actors return zero rows. Every owner operation derives identity from
`auth.uid()`, with no caller-supplied owner or wishlist ID.

## Public projection

`public_wishlist_snapshot(p_token)` is a single-statement STABLE SECURITY
DEFINER projection granted to `anon` and `authenticated`. A valid enabled token
returns these fields only:

- `display_name`, `taste_line`, `vibe`, `viewer_is_owner`;
- `item_id`, `title`, `source_url`, `retailer`, `note`, `desire_level`;
- original amount as lossless decimal text, original currency, `has_image`;
- public reaction counts for each kind and the caller's own reaction.

It returns only `manual`/`extracted` items in `(sort_position, id)` order. An
empty list returns one header row with null item fields, counts, and image flag.
Malformed, missing, unknown, revoked, and superseded tokens return zero rows.
No owner ID, email, group information, reservation status, assignment, storage
path, copy provenance, or private group reaction counts are projected.

The bearer link intentionally allows reading without a session; UUIDs alone do
not grant access. Existing owner-only `profiles`, `wishlists`, `wishlist_items`,
and Storage policies are unchanged. Public sharing does not make groups public.

## Reactions and concurrency

`public_wishlist_item_reactions` is separate from `group_item_reactions` and has
no direct application-role access. Its `(item_id, user_id)` primary key permits
one public-context reaction per person/item. Existing private group reaction
semantics and activity feeds are unchanged. Public reactions remain as owner
history when a link is revoked or re-enabled; deleting an item or reactor
cascades their public reactions.

`set_public_wishlist_reaction(p_token, p_item_id, p_reaction)` is granted only to
`authenticated`. It derives the actor from `auth.uid()`, refuses self-reactions,
validates the active token and item visibility, and accepts the existing three
reaction kinds; null removes the caller's reaction. Its result includes
`item_id`, the three current public counts, and `viewer_reaction`.

Owner link mutations lock the owner wishlist then link row, check the version
under lock, and update atomically. A reaction holds a `FOR SHARE` lock on the
matching enabled link and a `FOR UPDATE` lock on the visible item before writing.
A revocation committed first causes a waiting reaction to recheck and return no
rows. A reaction already holding the shared lock commits before revocation can
complete. The item lock serializes concurrent reactions and visibility/deletion
changes, making the returned counts authoritative for the committed write order.
No operation locks group, reservation, or assignment rows.

`own_public_wishlist_reaction_summary()` returns the owner's item IDs and public
counts only. Owner UI may deliberately add these to separately authorized group
counts, but must call the result “reactions”, not a count of distinct people.
The public view must never combine public and group counts.

## Image boundary

`public_wishlist_image_source(p_token, p_item_id)` is executable by `service_role`
only. It repeats enabled-token, same-wishlist, and visible-item checks in one
statement, and returns `(image_snapshot_path, image_url, owner_id)` exclusively
for the server image route. The public content projection returns only a boolean
image flag. No browser role can obtain raw Storage sources through this function.

The application route must validate the snapshot owner prefix and deliver image
bytes without exposing Storage paths or signed URLs. Remote fallback must use
the existing SSRF-safe image fetcher with content/size/redirect limits. Public
pages and image responses must avoid shared caches and referrer leakage; image
optimization caches must not retain access after revocation. Revocation stops
new authorized reads; it cannot recall content already downloaded.

## Verification and rollout

`supabase/tests/public-wishlists.sql` uses rolled-back synthetic fixtures for
role/grant/shape checks, signup defaults, precision/order/empty states, private
count isolation, anonymous write denials, non-member writes, owner/cross-item
rejections, replacement/removal, revocation, stale controls, fresh-token
re-enabling, image authorization, and deletion.

`scripts/test-public-wishlist-races-local.sh` uses two independent local database
sessions with explicit lock barriers and bounded timeouts. It covers both
revocation/reaction orders, concurrent reaction counts, stale enable versus
revocation, and deletion versus reaction. Fixture cleanup uses only UUIDs
created by that invocation; tokens and SQL diagnostics are never printed.
`PUBLIC_WISHLIST_TEST_CONFIG` may identify an isolated local Supabase config;
otherwise the harness reads this checkout's `supabase/config.toml`. It verifies
the exact running container name and project label before opening sessions.

Local validation on 2026-10-04: all 83 pgTAP assertions and all five two-session
race scenarios passed against the isolated audit stack. Race fixture cleanup
completed successfully without touching review accounts.

Apply this additive migration to the local stack only after coordinating with
the active browser runner. Do not reset the database or stop the review server.
Run the SQL suite and race harness after application, then the public-route,
image-proxy, signed-in/out reaction, and owner link-control browser checks.
The migration intentionally publishes existing wishlists immediately, so any
non-local rollout requires review of the accompanying disclosure and feature
release. No production migration is authorized by local development work.

## Disable and rollback

Prefer a forward disabling migration that revokes EXECUTE on the public
snapshot, public reaction mutation, and service image source, and disables link
rows. Also disable UI entry points and owner re-enabling before considering the
feature disabled. Retain all tables and reaction history. Stop automatic link
creation by dropping `wishlist_created_public_link` only in a reviewed disabling
migration; update the application to handle absent state before doing so.

An eventual structural rollback drops the seven public RPCs, the wishlist
trigger and its private function, then the public-reaction and private-link
tables. It permanently destroys link state and reaction history and requires
explicit approval. Never alter or roll back existing group reaction, gifting,
profile, or Storage policies as part of disabling public links.
