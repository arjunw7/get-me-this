# Member wishlist action consolidation

This is a separate proposal stacked on PR #106. The approved Stamp Counter implementation remains in that dependency; this change consolidates gifting actions and adds the release confirmation design approved October 7, 2026.

## Approved acceptance criteria and evidence

- [x] One action area below stamps: **Reserve secretly** is the coral primary action and **Copy to my wishlist** is the outlined secondary below it. Browser geometry and color assertions pass on desktop/mobile; the original-store link remains near retailer/price with the original external destination.
- [x] Reservation states: **Reserved by you** plus outlined **Release reservation**; **Someone’s on it** without reserve/release controls for another member's reservation. Copy stays available independently. Browser tests cover actual reserve, release and another eligible giver's claim without revealing that giver's name.
- [x] Pending operations explicitly say **Reserving…**, **Releasing…**, or **Copying…** and block repeats. Unit tests cover immediate repeat guards, pending controls, release Escape/backdrop/cancel suppression, and copy suppression.
- [x] Errors/conflicts stay beside the affected action; failed release remains in its modal for retry. Unit tests cover reserve conflict/error, release error/thrown failure/retry, and copy failure recovery. Successful copy has one visible **Copied to your wishlist ✓** button and a screen-reader-only live confirmation.
- [x] Release uses a logout-style desktop modal/mobile bottom sheet in a portal outside the clipped card. It says **Release your reservation?** and **Other eligible group members will be able to reserve this gift. The recipient won’t be notified.** Keep reservation receives initial focus; Tab wraps, cancellation/Escape preserve the reservation and restore trigger focus. Actual browser proof verifies portal placement, viewport geometry, focus, cancellation, confirmed release and local database state.
- [x] Interactive stamps have no visible total-reaction heading or divider. Individual badges, full accessible button labels, and screen-reader totals remain. Read-only owner summaries are unchanged.
- [x] Recipient/private authorization stays intact: recipient member-wishlist access redirects to the owner wishlist, which exposes no reservation/release controls or dialog. Existing public/group permission and negative authorization tests remain unchanged; no data-access, RLS, migration or server-action behavior changed.

## Verification

`pnpm verify` passes: format, lint, TypeScript, browser-worker checks, 183 unit-test files / 1,799 tests, and production build. One pre-existing unused test-variable lint warning remains outside scope. The new reservation regression suite failed on the old implementation (10 of 11 cases), then all 11 passed. Copy tests include the additional pending-repeat regression.

The new local-stack browser case passes at mobile 390×844 and desktop 1440×1000. It covers the action order, color hierarchy, nearby store link, divider removal, actual reserve/release, the anonymous other-member state, independent copy, accessible copied confirmation, portal modal behavior, safe cancellation/focus restoration, and recipient privacy. Axe WCAG 2 A/AA reports no violations in the changed card and confirmation dialog.

Other gifting surfaces were audited: they use the same reservation control and gain its explicit state/pending/confirmation behavior. Their existing card/checkout layout remains; owner/public surfaces receive no reservation controls. The separate public reaction-summary request is excluded from this proposal.

## Screenshots

The before build is PR #106 head `1db12a0`; the after build is this branch. Each before/after pair uses the same local fixture group/item, member route, viewport, content, authoritative reservation state and corresponding interaction state. Available/yours/other states are paired; the release pair compares the prior inline confirmation with the approved modal/bottom sheet. Full-page captures include the existing fixed shell controls at the viewport boundary. Copied confirmations are additional after-state evidence.

| State | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | --- | --- | --- | --- |
| Available | [Before](wishlist-actions-available-before-mobile.png) | [After](wishlist-actions-available-after-mobile.png) | [Before](wishlist-actions-available-before-desktop.png) | [After](wishlist-actions-available-after-desktop.png) |
| Yours | [Before](wishlist-actions-yours-before-mobile.png) | [After](wishlist-actions-yours-after-mobile.png) | [Before](wishlist-actions-yours-before-desktop.png) | [After](wishlist-actions-yours-after-desktop.png) |
| Someone else | [Before](wishlist-actions-other-before-mobile.png) | [After](wishlist-actions-other-after-mobile.png) | [Before](wishlist-actions-other-before-desktop.png) | [After](wishlist-actions-other-after-desktop.png) |
| Confirm release | [Before](wishlist-release-before-mobile.png) | [After](wishlist-release-after-mobile.png) | [Before](wishlist-release-before-desktop.png) | [After](wishlist-release-after-desktop.png) |
| Copied | — | [After](wishlist-actions-copied-after-mobile.png) | — | [After](wishlist-actions-copied-after-desktop.png) |

No visual baselines changed. No dependencies, production resources, migrations, RLS or backend access changes. Railway PR previews are not configured in current checks; local proof uses production builds. No Magic Patterns mock data, editor artifacts or preview plumbing shipped. Rollback: revert this proposal. Independent review is required; no automatic merge or deployment.

## Follow-up: equal-height row and persistent copied state

The user requested the two CTAs in one row while retaining their height. `side-by-side/` contains desktop/mobile evidence for available, yours, other, copied and modal states. Both CTA heights are asserted at 48px, with equal top alignment. The original vertically stacked evidence above remains available for comparison.

The copy button now initializes from an authenticated owner-only read of the viewer's current copies, restricted to item IDs already authorized by the member-wishlist projection. No other person's copy provenance is exposed. The copy write and database idempotency remain unchanged. No migration is required.

Validation: `pnpm verify` passed (184 files, 1,804 tests). The two viewport browser journeys passed, including navigating away and back, reload, another viewer's independent copy action, removal of the fixture's own copy, reservation release/cancel, recipient guards and Axe. A temporary browser run on an untrusted local origin was stopped; final proof used the existing allowlisted 3100 origin without any auth-policy changes. No visual baselines were replaced.

GitHub Actions could not start due to the account billing/spending-limit error reported on PR #107. Local checks do not replace the required CI merge gate. No production resources were changed.
