# 002c — Establish the test and visual-proof harness

## Outcome

Make functional, accessibility, end-to-end, and visual evidence repeatable locally and in later CI.

## Scope

- Vitest and React Testing Library configuration.
- Playwright configuration for the approved 390px and 1440px viewports.
- Automated accessibility checks for the deterministic reference route.
- Deterministic visual fixture and baseline workflow.
- Test commands composed into `pnpm verify` where appropriate, with browser-specific checks documented separately when required.

## Non-goals

- No exhaustive browser matrix.
- No real authentication or external-service tests.
- No approval of production product screens.

## Acceptance criteria

- A component test fails when expected semantics are removed.
- An end-to-end test renders the deterministic route at both approved viewports.
- Accessibility checks fail on a known injected violation and pass after it is removed.
- Visual output is stable across two consecutive clean runs.
- Test failures return a non-zero exit code and preserve useful evidence.

## Required proof

- Passing unit, accessibility, end-to-end, and visual-test output.
- Mobile and desktop screenshots from the harness.
- Documentation for creating, reviewing, and updating baselines.

## Dependencies

- `002a-scaffold-application-command-surface.md`.
- Uses the fixture created by `002b-establish-design-foundation.md` when available; it may begin against the minimal reference route after 002a.

## Analytics, security, and privacy

- Fixtures use synthetic data only.
- Test artifacts must not capture credentials, tokens, or personal data.
