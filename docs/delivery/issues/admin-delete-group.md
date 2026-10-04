# Admin group deletion

User-requested bounded extension, 4 October 2026. This issue covers only confirmed deletion from the existing Organizer tools.

## Acceptance criteria

1. An admin has an option to delete the group at the bottom of Organizer tools.
2. Clicking Delete group opens a confirmation modal, consistent with the logout confirmation.
3. Cancel dismisses the modal without deleting the group.
4. Confirming deletes the group and returns the organizer to the groups list; the group is no longer available to any member or through its invite links.
5. Only the current joined organizer can delete a group, enforced server-side. Personal wishlists remain saved.

## Implementation boundary

The database deliberately retains membership and audit history through restrictive foreign keys. Deletion is therefore a permanent application tombstone (`status = deleted`) with all live memberships ended, all invitations revoked, saved invitation bearers removed, and outstanding group emails retired. There is no restore API. This is not physical erasure of historical records. Personal wishlists, wishlist items, other groups, and public wishlist links are unaffected.

The action requires the member-admin version shown when the confirmation opened. A stale version requires review and a new confirmation. Database authorization is checked after the group lock and before version comparison, so guessed IDs/versions and former organizers receive a generic denial. Deletion commits atomically and appends one private audit event. Existing RLS and table grants remain unchanged.

The new delete control and modal are a user-requested extension to the approved design. They reuse the existing semantic tokens and logout modal layout. Evidence compares the same synthetic group, route-equivalent state, viewport, and scroll position against the base commit; no frozen visual baselines are replaced. The prototype has no delete-group state to compare against.

## Migration and rollback

Apply `20261025000000_group_deletion_types.sql` before `20261025000001_group_deletion.sql`; the enum values must commit before use. Existing groups and memberships are unchanged by migration. The deletion function requires an authenticated current organizer and changes only the selected group when explicitly invoked.

To disable the feature, remove its UI/action and revoke authenticated EXECUTE on `public.delete_group(uuid,bigint)` in a forward migration. Retain enum values, deletion tombstones, ended memberships, and audit history. Do not reactivate old groups or invite links during rollback. An email delivery already in flight cannot be recalled; queued/claimed outbox rows for the group are retired when deletion commits, preventing future retries.

## Evidence

See [verification and screenshots](../evidence/admin-delete-group/README.md).
