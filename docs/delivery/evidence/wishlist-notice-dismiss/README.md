# Wishlist notification close button

Acceptance criteria from the user: “In the wishlist screen, when i add or remove an item, there's this notification. This should have an option to close on the right side.”

- [x] Add, update, and remove notices have a right-aligned close button. Evidence: component tests and after screenshots.
- [x] Mouse, touch, and keyboard dismissal removes the notice. Evidence: four interaction tests and Chromium checks at 1440×1000 and 390×844; target is 44×44 CSS pixels.
- [x] Existing message copy and design tokens are retained. Evidence: before/after captures of the same local route, empty wishlist fixture, deleted notice, viewport, and scroll state. The new affordance is explicitly requested by the user.

`pnpm verify` passed with Node 24.21.0: formatting, lint, types, 168 test files / 1621 tests, and production build. Two pre-existing lint warnings remain. No schema changes, dependencies, prototype mock data, or editor artifacts shipped. Temporary screenshot route was removed. No visual baseline was updated. Railway preview pending PR CI.
