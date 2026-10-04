# Confirmed admin group deletion

Requested on 4 October 2026. Base: `1488a8e5ad567d7da8d74ff749934e0ffd6605f5`.

## Acceptance criteria and proof

Copied from [the bounded issue](../../issues/admin-delete-group.md):

| Criterion | Evidence |
| --- | --- |
| An admin has an option to delete the group at the bottom of Organizer tools. | Organizer screenshots below; `tests/e2e/group-delete-local.spec.ts` exercises the real organizer route and verifies non-organizers have no tools/delete button. |
| Clicking Delete group opens a confirmation modal, consistent with the logout confirmation. | Desktop/mobile modal screenshots; component tests check initial Cancel focus, Tab containment, Escape, pending state, and failure recovery; browser axe check passes. |
| Cancel dismisses the modal without deleting the group. | Browser test cancels, reloads, and verifies organizer and member can still open the group; component test verifies no action call. |
| Confirming deletes the group and returns the organizer to the groups list; the group is no longer available to any member or through its invite links. | Browser test confirms, reloads Groups, checks the member's old room, and checks the stored deleted state. Database tests prove old invitation preview/acceptance and gifting reads are unavailable. |
| Only the current joined organizer can delete a group, enforced server-side. Personal wishlists remain saved. | Database tests cover anonymous, null, outsider, ordinary member, former organizer, and non-joined organizer denials; populated fixtures preserve wishlist items and release reservations. Four independent-session races verify deletion/transfer/removal serialization. |

## Screenshots

Synthetic fixture: **Birthday crew**, **Organizer Ona**, **Member Jay**, 7 November 2027, secret draw, INR 2,500, two empty personal wishlists. Screenshots use `/groups/<fixture-id>`, Organizer tools open, and scroll position 0 for before/after. IDs and synthetic authentication emails differ between isolated runs; displayed content is the same. The before capture runs the base commit's actual page and Organizer tools code; the after capture runs this feature. No DOM elements are hidden to manufacture the comparison.

| State | Mobile · 390 × 844 | Desktop · 1440 × 1000 |
| --- | --- | --- |
| Organizer tools before | [Before](organizer-before-mobile.png) | [Before](organizer-before-desktop.png) |
| Organizer tools after | [After](organizer-after-mobile.png) | [After](organizer-after-desktop.png) |
| Delete confirmation | [Modal](delete-confirmation-mobile.png) | [Modal](delete-confirmation-desktop.png) |

Organizer screenshots show the full page at the stated viewport width. Modal screenshots show the viewport itself. This new user-requested destructive action has no matching V18 delete state. Its modal follows the existing logout layout and semantic tokens. Existing frozen baselines remain unchanged and require independent approval for any future update.

## Validation

- `pnpm verify`: format, lint, types, 159 test files / 1,570 unit tests, and production build pass. Two pre-existing unused-variable lint warnings remain in unrelated files.
- `pnpm test:db`: 27 suites / 1,861 assertions pass against a fresh isolated local stack, including 46 deletion assertions and an injected late audit-write failure proving atomic rollback.
- `python3 scripts/test-group-deletion-races.py`: four races pass (delete/delete, transfer/delete, delete/transfer, remove/delete). The second session is proven waiting on a database lock before the first commits.
- Local production-build deletion journey: desktop and mobile pass, including modal axe accessibility checks. The new spec is registered in the full stack runner.
- `bash scripts/e2e-local-stack.sh`: **240 pass, 6 skipped, 8 fail**. Every failure is an existing pinned-screenshot mismatch: all four mobile create-group states, plus empty/filled wishlist on mobile and desktop. All eight reproduce against a clean archive of base `1488a8e` with the same local runtime and viewports (12-test base comparison: 4 pass, 8 fail); all eight actual screenshot files are byte-identical between base and this branch. No baseline is changed. The six existing skips comprise two desktop-only name-layout cases under the mobile project and four optional populated-fixture review captures.

Local tests use an isolated Supabase project and unused app port; those local configuration changes are not part of the PR. No staging or production Supabase/Railway resources were changed. A Railway preview was unavailable at preparation; check the PR deployment status for automatic provisioning. Testing the delete action on a shared preview also requires its two migrations to have been applied through the normal reviewed process.

## Migration, rollback, and provenance

See [the issue's migration/rollback notes](../../issues/admin-delete-group.md#migration-and-rollback). Application deletion retains inaccessible audit/membership/assignment history, ends live memberships, revokes invites, removes saved invite bearers, and retires outstanding group email rows. There is no restoration path. Personal wishlists and other groups are preserved.

No dependencies, Magic Patterns mock data, editor artifacts, or visual baseline replacements were shipped. All displayed fixture data lives in tests only. Independent review and explicit human merge approval remain required.
