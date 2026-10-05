# ARJ-67 evidence

Acceptance criteria copied from the report:

- [x] “Selecting a month with an extra row in the date picker compresses the calendar layout and adds a scrollbar.” The calendar allows 460px, measures its real content when deciding whether to open above, and remains bounded to the viewport. The browser regression opens May 2027 (six date rows), measures no scrollbar where the viewport has room, confirms 44px day targets and all controls within the viewport, and selects the last day.
- [x] “The budget input field accepts letters and characters instead of numbers only.” Controlled entry rejects letters, invalid pasted text, signs and multiple decimal separators while preserving decimal editing. Strict server-side amount validation remains in place.

The new input regression failed before the fix and passes afterward. `pnpm verify` passes on Node 24: 176 files, 1,717 tests, formatting, lint, types, browser-worker checks and production build. Desktop and mobile browser regressions both pass. Existing currency and calendar keyboard tests pass.

The screenshots compare the same signed-in fixture, `/groups/new`, May 2027 selection and desktop 1440×1000 / mobile 390×844 viewports against the main-branch local build. No visual baselines changed. On a genuinely short viewport the popup retains scrolling rather than clipping controls.

No schema changes or migration required. Rollback is reverting the PR. No Magic Patterns mock data or editor artifacts shipped. Railway previews are not available through the configured PR checks. Full database, authorization, upgrade, browser and visual checks run in CI.
