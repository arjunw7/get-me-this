# Stamp Counter restoration evidence

User acceptance criteria copied from the request:

- [x] “yes please bring it back” — restored the Magic Patterns Version 2 Stamp Counter design in the shared interactive reaction row: round sparkle/question/heart stamps, slight tilts, chunky shadows, individual corner counters, coral/yellow/blue selection, bounce/ring/count feedback. The approved restoration is recorded in `DESIGN.md` and supersedes the Version 18 reaction treatment only.
- [x] “start a subagent with can implement it and raise a PR.” — implementation is isolated on `codex/stamp-counter-reactions` and proposed for independent review.

## Behavior and verification

- Real confirmed counts appear per kind in both compact and standard rows. A new component regression failed on the prior UI, then passed after implementation; all eight reaction-row tests pass.
- One reaction per person remains authoritative: select persists through reload, switching replaces, pressing the selected stamp removes. Pending buttons remain disabled. Owner reaction summaries remain read-only and aggregate-only.
- The real local-stack group browser regression passes at mobile 390×844 and desktop 1440×1000: 64px circles, 12px caption spacing, overlapping corner counters, no overflowing captions, selection/persistence/switch/removal, correct counts, reduced-motion suppression, and no WCAG 2 A/AA Axe violations in the changed reaction controls.
- Four existing public-wishlist journeys pass for fresh and returning sign-ins at both viewports, including reaction persistence/switch/removal, no auto-reaction after sign-in, public privacy, and read-only owner controls. The test's stale heading expectation was corrected to the current `Wishlist Host` heading; no heading behavior changed.
- `pnpm verify` passes: formatting, lint, type checking, browser-worker checking, 183 unit test files / 1,793 tests, and production build. Two existing lint warnings are outside this change.
- No authorization policies, server data access, schema, migrations, dependencies, visual baselines, or frozen references changed. Existing negative authorization coverage remains intact; broader database suites run in CI.

## Matched screenshots

The before server was built from exact `origin/main`; the after server was built from this branch. Both used the same local stack, fixture group/item, route, viewport, unselected state, and scroll position. These are actual application browser screenshots. Selected after screenshots separately show the blue heart stamp and confirmed counter.

| Viewport | Before | After | Selected after |
| --- | --- | --- | --- |
| Mobile 390×844 | [Before](room-reactions-before-mobile.png) | [After](room-reactions-after-mobile.png) | [Selected](room-reactions-selected-mobile.png) |
| Desktop 1440×1000 | [Before](room-reactions-before-desktop.png) | [After](room-reactions-after-desktop.png) | [Selected](room-reactions-selected-desktop.png) |

No Railway PR preview is configured in the current checks, so no preview URL is available. Local browser proof uses production builds. No production resources were modified or deployed. No Magic Patterns mock data, avatar fixtures, editor artifacts, routing, animation dependency, or preview plumbing were shipped. The original SVG appearance was adapted as a visual specification using existing semantic tokens and CSS.

No migrations are required. Rollback: revert the restoration PR.

## CI follow-up (October 7, 2026)

The initial CI run had 255 passing browser/visual cases and three failures: the two copy-to-wishlist journeys found an extra live status in the zero-reaction state, and mobile navigation measured a temporarily absent element immediately after reload. Zero-reaction copy again has no live-status role, matching the prior contract; confirmed nonzero totals still announce updates. Component regressions cover both states. The navigation check now waits for both boxes before asserting the same above-bottom-navigation geometry. No visual baselines or approved stamp appearance changed.

After repair, all six targeted local browser cases pass (navigation, copy-to-wishlist and stamp reactions at both approved viewports), and `pnpm verify` passes again with 183 files / 1,793 tests. No production resources changed.
