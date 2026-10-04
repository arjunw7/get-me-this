# Invitation sharing: live repair and dynamic banners

## Read-only production findings, 4 October 2026

The live Railway service runs main commit `1488a8e`, whose invitation modal calls
`public.get_group_invite_link(uuid)`. The connected GetMeThis database contains
the user's active Wadhwa Diwali group, but that function and
`private.group_shareable_invitation_tokens` are absent. Its migration ledger
ends at `20261021000000`. The existing modal maps the missing-RPC error to
“The invite link couldn’t be loaded. Try again.” This is deployment drift,
not an organizer permission failure specific to that group.

The production Railway variable inventory also lacks
`INVITATION_CONTINUATION_COOKIE_SECRET`. `AUTH_LINK_COOKIE_SECRET` is present,
but it serves a different flow. Without the invitation key, browser openings
of invitation links return unavailable before starting a continuation.

No production database, hosting, secret, invitation, or membership was modified
during this investigation. Variable values and invitation tokens were not read.

## Concrete repair (requires explicit production authorization)

1. Confirm the Railway production service's configured Supabase project is
   `lfnccxtowemdzemhcroz` before applying anything. The matching group and schema
   support this mapping; the connector withholds environment variable values.
2. Apply the committed `20261024000000_recoverable_group_invite_links.sql` using
   the migration tool, preserving migration history. Its prerequisites already
   exist: generic invitation issuance, group invitation versions, organizer
   authorization, and the private token validator. It does not depend on the
   unrelated profile/public-wishlist migrations dated 22/23; do not silently
   deploy those as part of this repair. Flag their separate deployment drift.
3. Generate a fresh dedicated 32-byte cryptographic secret encoded as unpadded
   base64url, and set `INVITATION_CONTINUATION_COOKIE_SECRET` on this production
   web service. Never echo, paste into an issue, or commit it. Preserve the
   existing auth-link key. Keep the new key stable across redeployments.
4. Redeploy the same reviewed application revision to pick up configuration.
5. Verify the getter exists and authenticated EXECUTE is granted; anonymous
   callers must not have EXECUTE. Open the user's group as its organizer,
   open Invite people, close and reopen: the same link should be shown. If the
   group has a live legacy digest-only invitation, the modal asks for explicit
   replacement; do not replace already-shared links as part of rollout.
6. Open the link in a fresh browser, confirm its limited preview, and verify
   the existing explicit Join/authentication/onboarding flow with a designated
   test account. Do not add real memberships without the owner's consent.

This repair is independent of the delete-group proposal in PR #84 and independent
of the dynamic banner deployment below. It needs no app code change to restore
the existing invitation modal.

## Dynamic banner implementation

The existing `/invite/<bearer>` link remains the shared link. Recognized chat
preview agents receive static HTML Open Graph/Twitter metadata; browser requests
keep the existing sealed-cookie redirect and explicit Join flow. No crawler
request creates a pending start, continuation, session, membership, or invite use.
Agent matching selects representation only; it is not an authorization boundary.

The banner contains group name, current organizer display name, and the occasion
date projected in the group's own time zone. Its image URL contains a SHA-256
digest capability, never the invitation bearer. That capability authorizes only
the same three fields and cannot be used to join or reconstruct the bearer.
It must still be treated as an unlisted preview URL and excluded from logs.

`20261026000000_group_invitation_share_preview.sql` adds a narrowly scoped,
read-only function for anon/authenticated callers. It checks the live generic
invitation and active group on every HTML/image read. Invalid, targeted, expired,
revoked, exhausted, and inactive-group capabilities reveal no group fields.
No base-table grants or membership/gifting permissions change.

The 1200×630 PNG uses the existing semantic palette and is generated server-side
with Next.js ImageResponse. No image-generation API or new dependency is needed.
Only configured APP_ORIGIN/RAILWAY_PUBLIC_DOMAIN can select the image origin;
request headers cannot inject one. Set APP_ORIGIN=https://getmethis.fun at build
and runtime for the live canonical links. Preview responses have no-store,
no-referrer and noindex headers; no analytics or scripts execute in the HTML.

Deploy the banner migration before its web revision. Chat applications may cache
previously fetched cards; revocation prevents fresh reads from this application
but cannot erase a preview already stored in someone's chat. Platform-rendered
cards remain subject to the receiving application's preview settings and cache.

## Rollback

For the existing invitation repair, prefer the non-destructive disable procedure
in [recoverable-group-invites.md](../architecture/recoverable-group-invites.md).
Do not drop the private token table or revoke people's links for a UI rollback.
Removing/rotating the new cookie key invalidates in-flight invitation journeys;
keep it configured unless deliberately disabling that surface.

For banners, revert the application change first, then revoke EXECUTE on
`public.group_invitation_share_preview(text)` from anon/authenticated. The new
function stores no data and can be removed in a subsequent forward migration.
The existing browser invitation flow and issued invitations are unchanged.
