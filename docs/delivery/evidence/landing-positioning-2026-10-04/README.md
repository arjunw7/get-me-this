# Standalone wishlist landing — 4 October 2026

## Approved scope

The user approved the marketing review and explicitly requested a parallel agent to revamp the landing page. The reported comprehension failure was that new visitors could not understand using a wishlist without a group. This is an approved landing-only departure from V18's group-first hierarchy, recorded in `DESIGN.md`.

## Acceptance criteria and evidence

- [x] Lead with a shareable individual wishlist. Hero: “Good gifts start with a wishlist.” Primary action: Create my wishlist. The existing `/auth?intent=wishlist` path is preserved.
- [x] State that no group is needed and friends can view without signing up. How it works completes the add → share → buy-at-store journey before groups appear.
- [x] Provide an anonymous, keyboard-operable example. Visitors edit example item details, save them into the illustration, and preview a friend's view. It is explicitly labelled as an illustration. No account, extraction request, clipboard write or live public-token URL is involved. A reserved `.example` address is explicitly labelled illustrative and is not a clickable link.
- [x] Keep public examples free from reservation status. No public-example reservation information or group controls are rendered.
- [x] Introduce groups as optional, using members' existing individual wishlists. A separate illustration distinguishes another member's reservation visibility from the recipient's wishlist.
- [x] Explain public-link visibility, sign-in requirements for reactions/groups, and external purchases in accessible disclosure questions.
- [x] Preserve the expressive brand tokens, authentication intent, logout confirmation and session-aware navigation. No schema, permission, protected app, dependency or production-resource changes.

## Review evidence

Capture route `/`, anonymous session, deterministic illustration, no overlays, at desktop **1440×1000** and mobile **390×844**, device scale 1. Before uses the PR78-head landing served on3100; after uses the isolated new build on3300. Both use the same route, viewport, fonts and local assets. Content hierarchy intentionally changes per the approved positioning; screenshots compare that change, rather than claim pixel parity with superseded V18 copy.

- [Before desktop](before-desktop.png)
- [Before mobile](before-mobile.png)
- [After desktop](after-desktop.png)
- [After mobile](after-mobile.png)
- [Example review desktop](example-review-desktop.png)
- [Friend view mobile](friend-view-mobile.png)

These are review evidence, **not approved replacement golden screenshots**. Existing landing golden comparisons are expected to differ following this explicitly requested redesign. No baseline files or manifest were changed. Human review of the new evidence is required before a separate baseline approval/update.

## Implementation boundaries

All new demonstration state lives in the landing component, resets on reload, and never becomes real product data. Existing vendored marketing images remain local. No Magic Patterns contexts, routing, editor artifacts, scaffolding or application mock data were added. Prices and shop labels in the explicitly marked illustration are examples, not availability or merchant claims. No claim of universal extraction, permanent free pricing, conversion improvement or duplicate-free gifting is made.

No database migration or rollback is needed. Reverting the landing commit restores the prior page; authentication and persisted data are unaffected. A Railway preview is not created by this local implementation; the isolated local preview is `http://127.0.0.1:3300/`.

## Verification

- `pnpm verify` passed: formatting, lint (two existing unrelated warnings), type-check, **154 test files / 1,503 unit tests**, and production build. First sandbox-only attempt could not bind the existing local helper port; rerun with local-port permission passed. Next.js required a real local dependency directory rather than a cross-worktree symlink; no dependency versions changed.
- After the final user-selected headline **“Good gifts start with a wishlist.”**, focused landing tests passed (**13 tests**), production build passed, and browser checks were rerun against that build.
- Landing journeys and public-route accessibility: **27 passed, 1 intentionally skipped** (desktop-only anchor navigation is absent at mobile width). Covers wishlist/group/login click-through, logout/session unit behavior, example edits and anonymous preview, blank item prevention, keyboard controls, FAQs, WCAG scans for all three example states, and horizontal-overflow checks at both widths.
- Frozen visual comparison: **2 expected failures** (desktop and mobile) because this approved landing redesign differs from the old group-first screenshots. Tests and golden files remain active and unchanged in behavior; no new golden images were written. New evidence requires human review and a separately authorized baseline update.
- This public-only change does not mutate data, so database authorization/race suites were not rerun. Auth click-through was checked with the unconfigured-provider build; existing email entry and honest provider failure recovery remain functional.

