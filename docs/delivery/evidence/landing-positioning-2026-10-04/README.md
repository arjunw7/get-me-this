# Standalone wishlist landing — 4 October 2026

## Approved scope

The user approved the marketing review and explicitly requested a parallel agent to revamp the landing page. The reported comprehension failure was that new visitors could not understand using a wishlist without a group. This is an approved landing-only departure from V18's group-first hierarchy, recorded in `DESIGN.md`.

## Acceptance criteria and evidence

- [x] Lead with a shareable individual wishlist. Hero: “Good gifts start with a wishlist.” Primary action: Create my wishlist. The existing `/auth?intent=wishlist` path is preserved.
- [x] State that no group is needed and friends can view without signing up. How it works completes the add → share → buy-at-store journey before groups appear.
- [x] Provide an anonymous, keyboard-operable example. Visitors see two gifts, choose **Share this example**, and immediately see the same wishlist as a friend. The caption explains “They can browse. No sign-up needed.” A small Try again action replays the example. It is labelled Example, never requests an account, and does not write the clipboard or create a public link.
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
- [Friend view desktop](friend-view-desktop.png)
- [Friend view mobile](friend-view-mobile.png)

These are review evidence, **not approved replacement golden screenshots**. Existing landing golden comparisons are expected to differ following this explicitly requested redesign. No baseline files or manifest were changed. Human review of the new evidence is required before a separate baseline approval/update.

## Implementation boundaries

All new demonstration state lives in the landing component, resets on reload, and never becomes real product data. Existing vendored marketing images remain local. No Magic Patterns contexts, routing, editor artifacts, scaffolding or application mock data were added. Only two product photos and short labels remain in the illustration; prices, shop labels, editable fields, tabs, notes and the illustrative URL were removed in the user-requested simplification. No claim of universal extraction, permanent free pricing, conversion improvement or duplicate-free gifting is made.

No database migration or rollback is needed. Reverting the landing commit restores the prior page; authentication and persisted data are unaffected. A Railway preview is not created by this local implementation; the isolated local preview is `http://127.0.0.1:3300/`.

## Verification

- `pnpm verify` passed: formatting, lint (two existing unrelated warnings), type-check, **154 test files / 1,503 unit tests**, and production build. First sandbox-only attempt could not bind the existing local helper port; rerun with local-port permission passed. Next.js required a real local dependency directory rather than a cross-worktree symlink; no dependency versions changed.
- After the final user-selected headline **“Good gifts start with a wishlist.”**, focused landing tests passed (**13 tests**), production build passed, and browser checks were rerun against that build.
- Landing journeys and public-route accessibility: **27 passed, 1 intentionally skipped** (desktop-only anchor navigation is absent at mobile width). Covers wishlist/group/login click-through, logout/session unit behavior, one-action sharing, anonymous preview, keyboard replay and focus preservation, FAQs, WCAG scans for both example states, and horizontal-overflow checks at both widths.
- Frozen visual comparison: **2 expected failures** (desktop and mobile) because this approved landing redesign differs from the old group-first screenshots. Tests and golden files remain active and unchanged in behavior; no new golden images were written. New evidence requires human review and a separately authorized baseline update.
- This public-only change does not mutate data, so database authorization/race suites were not rerun. Auth click-through was checked with the unconfigured-provider build; existing email entry and honest provider failure recovery remain functional.


## Hero illustration simplification

After reviewing the initial3300 page, the user asked for a lighter illustration that explains sharing with much less text. The follow-up retains the chosen headline and all other sections, replacing the three-step editable demo with two image-led gifts and one share action. One outer outline replaces the stack of outlined controls/cards. A minimal You → Friend row changes the friend avatar to a green check when shared, making the transfer visible without relying on explanatory copy. The anonymous friend view retains the exact same gifts and changes the view label and caption. The action button remains the same DOM element, preserving keyboard focus for replay; a polite live region announces the new caption. There is no autoplay or animated content transition, so the interaction also works under reduced motion.

- [Before this refinement — desktop](refinement-before-desktop.png)
- [Before this refinement — mobile](refinement-before-mobile.png)
- The `after-*`, `hero-*` and `friend-view-*` images now show the compact version. `example-review-desktop.png` is retained as evidence of the superseded initial design, not the current implementation.
- Follow-up checks: focused landing unit tests **13 passed**, production build passed, and landing/accessibility browser checks **27 passed, 1 intentional mobile-nav skip** on the isolated3300 build. Existing golden screenshots remain untouched.
