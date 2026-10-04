# Onboarding spacing and submission feedback

User report: “When a new use signs up, the profile form inputs have unusually extra padding on the left side. On sibmission, the CTA does not go in the loading state and teh user feels like nothing is happening.”

## Acceptance criteria and evidence

- [x] Display name and taste line use the reference's regular 16px inset on both sides. The browser regression failed on main with 48px left padding, then passed at 1440×1000 and 390×844 after the fix. `before-padding.json` and `after-padding.json` record the rendered measurements.
- [x] A valid live submission shows “Saving…”, disables the CTA, and exposes `aria-busy=true` until completion. The new local Supabase browser test deliberately holds the Server Action request, verifies the pending state, releases it, and verifies successful navigation to Home. It passed on desktop and mobile.
- [x] A rejected save restores the CTA and retains the entered name. Component tests cover ordinary and invitation completion actions. Blank input remains a validation error without starting a save. The two pending-state tests failed before implementation and passed afterward.
- [x] The email input retains its 48px icon inset. The browser spacing regression checks this separately.

## Screenshots

All screenshots use Chromium, device scale factor 1, local fonts/assets, name `Arjun`, empty taste line, and default Marigold Vibe. Before/after captures use `/onboarding?state=default`, the same viewport, scroll position (top), and unfocused form. Pending captures use the live `/onboarding` route with the same profile values and a held save request; they demonstrate the new interaction state rather than serving as an idle screenshot comparison.

| Viewport | Before | After | Saving |
|---|---|---|---|
| Desktop 1440×1000 | [Before](before-desktop.png) | [After](after-desktop.png) | [Saving](pending-desktop.png) |
| Mobile 390×844 | [Before](before-mobile.png) | [After](after-mobile.png) | [Saving](pending-mobile.png) |

Reference: the frozen V18 onboarding screenshots at the same two viewports and with `Arjun`/empty taste-line values, plus the frozen `AuthLayout.tsx` input style (`px-4`). The corrected input inset matches that reference. Main already includes the approved Vibe picker, which the older V18 capture lacks, so these full-page images are not claimed as whole-screen pixel matches. Existing typography/spacing differences and the Vibe extension are outside this fix. No visual baseline was regenerated or approved.

## Validation

- `pnpm verify`: passed (formatting, lint, typecheck, 167 unit-test files / 1,620 tests, production build). Lint reports two existing unused-variable warnings in unrelated group files, with zero errors.
- `src/auth/onboarding-form.test.tsx`: 15 component tests passed.
- `tests/e2e/onboarding-spacing.spec.ts`: 2 passed (desktop/mobile).
- New `tests/e2e/auth-otp.spec.ts` pending-to-success test: 2 passed (desktop/mobile) against the already-running local `get-me-this-main` stack, exporting its configuration privately and rebuilding the app against it.
- `pnpm exec supabase test db --local` and `bash scripts/e2e-local-stack.sh` were attempted from this current-main worktree but could not run: its default `get-me-this` stack/network is absent. The machine's existing stack is named `get-me-this-main`; the targeted real-auth test used that running local stack. No local database reset, production change, or stack replacement was performed. Full database/stack validation remains a CI review input.

One final verification attempt hit an unrelated transient failure in `src/wishlist/reorder-list.test.tsx`: “refetches the authoritative list after an uncertain delete without removing the row speculatively”. Its 13 tests passed on an isolated rerun, and the subsequent full `pnpm verify` passed with all 1,620 tests. No wishlist implementation or test was changed. The successful final verification output is saved in `verify-pass.txt`.

## Delivery

No migrations or new dependencies. Rollback is a commit revert. No Magic Patterns mock data or editor artifacts are shipped. Screenshots are review evidence, not baseline updates. Railway preview URL was unavailable at PR creation. Independent review, required green CI checks, and human approval remain required before merge.
