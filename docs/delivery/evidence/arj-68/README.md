# ARJ-68 evidence

Acceptance criteria copied from the report:

- [x] “Two CTAs in one row” / “Invite People - Same invitation modal used in other places”. The confirmation uses the existing InvitePeopleButton and its recoverable invitation modal; no separate inline invitation UI remains.
- [x] “Ope Group - Exact same CTA as invite poeple but in white color”. Invite people and Open group share the same shape and interaction style, with white background and dark text for Open group. Browser measurements confirm equal width/height and one row at both approved widths.
- [x] “Go to Home CTA below these 2 CTAs on the left corner.” Browser geometry confirms its lower, left-aligned placement and verifies actual Home navigation. Wishlist navigation is removed from this screen.

The new component regressions failed before implementation and now pass. `pnpm verify` passes on Node 24: 176 files, 1,707 current unit tests, formatting, lint, type checking, browser-worker checks and production build. The old inline-invitation component tests are replaced by confirmation composition tests; the existing shared modal retains its recovery, stale replacement, denial, keyboard-focus and clipboard tests.

All 14 targeted desktop/mobile browser journeys pass: organizer-only access, recovering a saved link, a true legacy digest-only fixture with no automatic replacement, stored expiry preservation, renewal of an expired invitation only on explicit modal open, targeted invitation isolation, manual copy fallback, two-CTA geometry, modal focus restoration, Open group and Home destinations. Invitation acceptance tests now obtain the same real link through the shared modal. Database functions, RLS and negative authorization coverage are unchanged.

Before/after screenshots compare the same signed-in local group fixture and route at desktop 1440×1000 and mobile 390×844. `visual-review/` additionally contains the six current baseline candidates and their approved before images for the exact ARJ-37 fixture. Capabilities are redacted. The visible families are now confirmation, recoverable link modal and legacy replacement modal; expired/revoked/stale handling remains in functional and database tests. Historical baselines for retired inline cards are retained as provenance, not used as expectations for the new UI.

No approved baseline has been changed. The visual comparison fails against the former UI as expected; candidate adoption requires explicit human product/design approval. This PR remains a draft until that gate and exact-head CI are complete.

No schema migration; rollback is reverting the PR. No Magic Patterns mock data or editor artifacts shipped. No PR preview deployment is currently present in GitHub deployment records; earlier PR previews exist, so a current preview remains pending availability.
