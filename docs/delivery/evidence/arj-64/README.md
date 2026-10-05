# ARJ-64 evidence

Acceptance criteria copied from the report:

- [x] “Onboarding flow for new users requires three steps including adding items to a wishlist, sharing the wishlist, and creating a group for the next occasion.” First-use Home presents those three steps in order. Saved items complete the first; sharing activates the group step.
- [x] “Sharing the wishlist via the share modal opens a link sharing dialog.” Home uses the existing public wishlist sharing sheet and existing verified owner share-state read and change action.
- [x] “Completing sharing actions should mark the step as done in the onboarding experience.” Successful copy and WhatsApp handoff complete sharing. Opening the dialog and clipboard denial do not. Unit tests cover storage failure and persistence; browser tests use the real clipboard and confirm completion survives reload.

Progress is a browser-local hint scoped to the owner's wishlist ID. Only `done` is stored; no URL or capability token. It does not claim message delivery or change authorization. If browser storage is unavailable, completion remains for the current visit. This behavior is documented in the wishlist flow.

`pnpm verify` passes on Node 24, including all unit tests, formatting, lint, type checking, browser-worker checks and production build. Desktop 1440×1000 and mobile 390×844 browser tests pass. Screenshots match the same signed-in fixture, `/home`, one item, no groups, and the same interaction state against the main-branch local build. Modal screenshots redact the public capability. No visual baselines changed.

No schema change or migration. Rollback is reverting the PR; the unused browser hint is harmless. Existing sharing/RLS and negative authorization suites remain in CI alongside the full database, upgrade, browser and visual tests. No Magic Patterns mock data or editor artifacts shipped. Railway preview deployment is unavailable through the configured PR checks.
