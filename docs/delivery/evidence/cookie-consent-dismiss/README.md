# Cookie banner dismissal

Acceptance criteria copied from the user: “Once cookies are accepted or rejected, this box should go away.”

- [x] The entire floating banner disappears after Allow or Reject; it does not collapse into another floating box. Evidence: component tests, desktop/mobile browser checks, and matched before/after screenshots of the landing route with granted consent.
- [x] The choice persists across reload and remount. Evidence: production analytics browser suite and component tests.
- [x] Consent can still be withdrawn through an inline Cookie preferences link in the landing-page footer. It opens the existing panel, which closes again after either choice. No change to analytics permissions or capture rules.

Validation: `pnpm verify` passed (167 files / 1617 tests). `pnpm test:analytics` passed both production-browser tests with all analytics requests intercepted locally; the consent test proves withdrawal stops outgoing events. Additional Chromium checks passed at desktop 1440×1000 and mobile 390×844, including both choices and reloads. Before/after use the same route, viewport, content, stored choice, and scroll position. Development toolbar excluded from screenshots.

No schema changes, dependencies, prototype mock data, editor artifacts, or visual baseline changes shipped. Railway preview pending PR CI. Existing lint warnings are unrelated.
