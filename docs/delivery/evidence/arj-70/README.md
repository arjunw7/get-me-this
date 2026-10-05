# ARJ-70 — Unavailable invite recovery

Issue: https://linear.app/arjun-wadhwa/issue/ARJ-70/removing-discard-button-from-unavailable-invite-page

- [x] “Removing the secondary discard option leaves only the ‘Back to Get Me This’ CTA.” The route no longer mounts the discard form. The regression renders the actual page and checks that the recovery link remains while no discard action is offered.
- [x] `pnpm verify` passed: full unit/component suite, formatting, lint, types, worker check and production build. Two existing unused-variable lint warnings. Full database/E2E/visual CI is required on the PR head.
- Matched `/invite/unavailable`, signed out, 1440×1000 and 390×844 local before/after screenshots are included. Existing baselines were preserved.
- Existing server-side continuation expiry and discard authorization remain intact. The page never implicitly discards invitations.
- Railway preview pending availability; no production configuration changes. No migrations/dependencies; revert the PR to roll back. No Magic Patterns mock data or editor artifacts shipped.
