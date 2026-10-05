# ARJ-71 — Invitation recovery navigation

The unavailable-invite recovery now links directly to `/home` for a provider-verified signed-in user and `/` for a signed-out user. It uses one accessible prefetched link with a pointer cursor and an announced Opening… state while navigation is pending.

## Acceptance criteria and evidence
- [x] “The cursor remains a default arrow on hover, and navigation to the home page is slow.” — pointer CSS, Next prefetch, no nested button or extra landing-page redirect, and pending feedback. Browser regression checks the computed cursor and working link.
- [x] “If the user is not logged in, it should redirect to '/', but if the user is logged in, it should redirect to '/home'.” — session-bound page tests cover both; existing authenticated E2E checks the actual destinations. No client-supplied return URL is accepted.

[ARJ-71](https://linear.app/arjun-wadhwa/issue/ARJ-71/slow-navigation-and-missing-pointer-cursor-on-invite-page)

`pnpm verify` passed with `VITEST_MAX_WORKERS=2`: full tests, formatting, lint, types, worker check, build. The first unrestricted run hit existing image deadlines/share-modal scheduling failures; both affected suites and the complete rerun pass with bounded concurrency. Two existing lint warnings. Full isolated database/E2E/visual CI required on this head. Matched desktop/mobile signed-out before/after screenshots included; before captures are reused from the same base commit and route in ARJ-70. No baselines changed. Railway preview pending availability. No migrations/dependencies; rollback by reverting. No Magic Patterns mock data or editor artifacts shipped.

The recovery link has an explicit, stable accessible name. The browser's accessibility tree does not consistently derive a link name from a nested live status region; the name now remains available while the status announces pending navigation. The complete local verification and signed-in/signed-out browser checks were rerun for this correction.
