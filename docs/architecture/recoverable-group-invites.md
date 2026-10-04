# Recoverable generic group invitations

The user-approved **Invite people** modal should display the active link directly
and reopen with the same link. Migration
`20261024000000_recoverable_group_invite_links.sql` adds this behavior without
weakening invitation authority or silently replacing links already shared.

## Database boundary

`private.group_shareable_invitation_tokens` stores the bearer token only for
newly issued generic invitations. It references the invitation row with a
cascading delete and accepts only canonical 256-bit base64url tokens. RLS is
enabled with zero policies; PUBLIC, anon, authenticated, and service_role have
no direct table privileges. Targeted invitation tokens are never stored here.
No client cache, browser storage, analytics event, or log may persist the token.

The reviewed generic issuance implementation is moved, without changing its
body, to `private.issue_group_invitation_digest_core(uuid,bigint)`. EXECUTE is
revoked from every application role and PUBLIC. A public wrapper retains the
exact existing `issue_group_invitation(uuid,bigint)` API and authenticated grant.
It locks the active group, rechecks current joined organizer authority, calls
the existing CAS implementation, and atomically saves its new token. Old saved
bearer material for that group is removed; invitation digests and audit events
remain. A failure to retain the token rolls back issuance as one transaction.
Existing invitation version checks, token generation, 30-day expiry, acceptance,
continuations, explicit revocation, targeted issuance, and audit semantics remain.

`get_group_invite_link(p_group_id uuid)` returns exactly:

- `result`: `ready` or `replacement_required`;
- `invitation_version`: current durable CAS version;
- `token`: the bearer only for `ready`;
- `expires_at`: stored expiry.

Only authenticated callers can execute it. Caller identity is always
`auth.uid()`; the active group row is locked before checking current organizer
and joined membership. Denied/unknown/archived groups and unverified callers
return zero rows. It then locks the latest generic invitation and captures time
after locking. A live, unexhausted invitation with a saved token matching its
digest returns the same bearer, expiry, and version. No audit event or rotation
occurs on reopening.

A live legacy invitation stores only its digest; it cannot be reconstructed.
The projection returns `replacement_required`, current version, and no token.
Opening or reopening the modal never revokes that link. Only the organizer's
explicit replacement confirmation invokes the existing CAS issuance action.
A mismatched stored bearer fails closed through this same confirmation state.

When no usable generic link exists (never issued, expired, revoked, exhausted),
the locked operation issues and stores one new link. Concurrent opens serialize
on the group row: the first creates it and the next returns that same token.
Organizer transfer/removal and invitation mutation already follow the group
lock order, so authority is reevaluated after any earlier transaction commits.

## Application contract

`getGroupInviteLinkAction(groupId)` requires a complete verified profile and a
valid UUID before calling the authenticated projection. It returns:

- `{ok:true, token, version, expiresAt}`;
- `{ok:false, reason:'replacement_required', version}`;
- `{ok:false, reason:'unavailable' | 'retry'}`.

Unknown/malformed responses and provider failures carry no raw error details.
The modal holds the token only in component state. Explicit legacy replacement
reuses `issueGroupInviteLinkAction(groupId, expectedVersion)`; CAS versions are
passed as exact strings rather than being rounded through JavaScript Number.

## Validation and local rollout

The migration was first validated inside a rolled-back transaction, then applied
and recorded additively on the isolated `get-me-this-main` local stack on
2026-10-04. No database reset, review-account deletion, or server restart occurred.
All 43 new database assertions and all 70 existing `groups-006b` regression
assertions passed; 19 focused action/data tests passed. The existing regression
suite's pre-rollback count was scoped to its generated organizer UUID so unrelated
local review groups do not change the fixture assertion.

The new database suite checks exact shape/grants, private-core denial, stable
reopening, legacy non-rotation, explicit replacement, stale CAS, expiration,
revocation, token binding, organizer transfer/removal, and archived/unknown/
anonymous/non-organizer denials. A separate two-session local race harness was syntax-checked but not executed:
automatic approval review rejected its synthetic-fixture creation/cleanup and
local-session termination. Concurrent opens and authority-change ordering have
been reviewed in code, but are not claimed as runtime race-tested.

## Disable and rollback

Prefer disabling the new modal/action and revoking authenticated EXECUTE on
`get_group_invite_link(uuid)`. Existing explicit issuance remains usable through
the wrapper; existing invitation links remain valid. Do not revoke active links
merely to disable this presentation feature.

For a reviewed structural rollback, remove the new getter and public wrapper,
rename the private digest core back to `issue_group_invitation`, move it to
`public`, and restore only its original authenticated EXECUTE grant. Existing
accept/revoke APIs and invitation/audit rows stay unchanged. Drop the private
secret table only with explicit approval: it irreversibly loses recovery ability
for otherwise still-valid links, which then require confirmation for replacement
if the feature is enabled again. Do not modify applied migrations in place.
