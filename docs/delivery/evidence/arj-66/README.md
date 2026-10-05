# ARJ-66 evidence

Acceptance criteria copied from the report:

- [x] “Wishlist profile header displays the 'tomato vibe · 2 things' tag.” Removed the metadata line from the owner profile header; saved Vibe colours and profile text are preserved.
- [x] “Public wishlist view displays the wishlist tag beneath the title.” The public view reuses that profile header and now omits the same metadata tag. Item desire badges are preserved.
- [x] “Public wishlist view displays 'No reactions yet' on items with zero reactions.” Public read-only zero summaries are omitted. Nonzero counts remain visible; signed-out visitors still sign in to react and owners cannot react to themselves. The owner's private summary behavior is preserved.

The regression tests failed before implementation and pass afterward. `pnpm verify` passes on Node 24: 176 files, 1,717 tests, formatting, lint, type checking, browser-worker checks and production build. The focused real browser tests pass on desktop 1440×1000 and mobile 390×844, covering the owner header and the signed-out public view. Existing negative authorization coverage remains in CI.

Before/after screenshots use the same local synthetic owner and two items, same route and viewports and top scroll position against the main-branch build. Capability links are not rendered in the evidence.

The four frozen owner-wishlist visual baselines still describe the former header. They have intentionally not been changed: adoption of the new matched baseline candidates requires explicit product/design approval under AGENTS.md and the visual-baseline workflow. This PR is a draft until that gate and the full CI visual job are satisfied.

No schema changes or migration. Rollback is reverting the PR. No Magic Patterns mock data or editor artifacts shipped. Railway preview deployment is unavailable through the configured PR checks.
