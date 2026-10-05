# ARJ-65 evidence

Acceptance criteria copied from the report:

- [x] “The Create group button lacks the hover interaction and loading state seen on other buttons.” The entry button now uses the shared button styles and pointer cursor, shows “Opening form…” immediately, and blocks repeat submission while Next.js opens the form. Unit and delayed-navigation browser tests cover the state.
- [x] “The group creation section lacks an equivalent custom option to match the options available on the inner page.” “Something else” carries `other` into the existing creation form without replacing a hand-entered group name. Unit and browser coverage verify this handoff.

`pnpm verify` passed on Node 24: 176 test files and 1,718 tests, formatting, lint, type checking, browser-worker checking and production build. Vitest concurrency is bounded to two workers for local service stability. The two existing lint warnings are unchanged.

Before/after screenshots use the same signed-in local fixture, `/groups`, and desktop 1440×1000 / mobile 390×844 viewports. Loading evidence deliberately holds the destination request. No visual baselines were changed. CI runs the complete database, authorization, upgrade, end-to-end and visual suites on this PR head.

No schema changes or rollback are needed. No Magic Patterns mock data or editor artifacts are shipped. Railway preview deployment is not configured as a PR check in this repository.
