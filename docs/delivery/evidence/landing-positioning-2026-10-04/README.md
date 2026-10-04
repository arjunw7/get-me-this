# Wishlist-first landing — final review, 4 October 2026

## Approved scope and final direction

The user approved the marketing review after new visitors could not understand how a wishlist works without a group. The approved headline is **“Good gifts start with a wishlist.”** Following review of two interactive illustration alternatives, the user explicitly asked to restore **both original illustrations**: the overlapping hero product-card collage and the Santa Party group snapshot. This document describes that final state. `DESIGN.md` records the scope of the approved departure from V18's group-first marketing hierarchy.

## Acceptance criteria and evidence

- [x] Lead with a shareable individual wishlist. Primary action: **Create my wishlist**, preserving `/auth?intent=wishlist`.
- [x] Explicitly say no group is needed and friends can view without signing up. How it works explains add → share → buy at the original store before introducing groups.
- [x] Preserve the selected headline, supporting copy and new page structure while restoring the original hero collage: three overlapping product cards, tape, avatars, reaction bubbles and entrance motion. The restored illustration is decorative, not interactive.
- [x] Make the secondary hero action useful: **How it works** scrolls to `#how` at desktop and mobile sizes. The removed interactive example is not moved elsewhere; its unused component and unit tests are deleted.
- [x] Keep public-sharing claims truthful. The original hero's “Reserved secretly” sticker is omitted because public wishlist links never expose reservations. This is the only change inside the restored hero illustration; its composition and remaining content stay intact.
- [x] Introduce groups as optional and use existing individual wishlists. Restore the original Santa Party member/product illustration, including its private reservation badges, budget states and explicit explanation that Kabir cannot see reservations on his own list. The three current benefits use the original numbered tomato markers (1, 2, 3), as requested. The old universal “No double gifts” headline is not restored.
- [x] Explain public-link visibility, sign-in requirements for reactions/groups and external purchases in accessible disclosure questions.
- [x] Preserve authentication intent, session-aware navigation and logout confirmation. No schema, permissions, protected-app, dependency or production-resource changes.

## Current review evidence

Route `/`, anonymous session, fixed demo content, no overlays, desktop **1440×1000**, mobile **390×844**, device scale1, local fonts and images. Before uses the PR78-head landing from3100; after uses the isolated new build on3300. The content hierarchy intentionally changes under the approved direction; these comparisons do not claim pixel parity with superseded group-first copy.

- [Original before — desktop](before-desktop.png)
- [Original before — mobile](before-mobile.png)
- [Final after — desktop](after-desktop.png)
- [Final after — mobile](after-mobile.png)
- [Final hero — desktop](hero-desktop.png)
- [Final hero — mobile](hero-mobile.png)
- [Restored group illustration — desktop](group-desktop.png)
- [Restored group illustration — mobile](group-mobile.png)

`collage-before-*` records the immediately preceding compact interactive design. `refinement-before-*`, `example-review-desktop.png` and `friend-view-*` preserve earlier review evidence only; those interactions are no longer shipped.

These are review evidence, **not approved replacement golden screenshots**. No baseline files or manifest were changed. The landing still differs from the old group-first goldens, so a separate explicit baseline approval is required after human review.

## Verification

- Initial implementation: `pnpm verify` passed formatting, lint (two existing unrelated warnings), type-check, **154 test files /1,503 unit tests**, and production build. Local test helpers required loopback-port permission. A real local dependency copy was required by Next.js; dependency versions are unchanged.
- Final restored-illustration revision: focused landing unit tests **11 passed**, production build passed. Browser coverage verifies CTA click-through, keyboard navigation, FAQ disclosure, original collage reduced-motion behavior, no hero reservation status, correct group reservation illustration and public-route WCAG A/AA accessibility at both widths. Final browser results: **25 passed, 1 intentional mobile-navigation skip**.
- Final landing visual comparison reported two expected failures against the old group-first goldens. The tests remain active; no golden files were rewritten, skipped or loosened.
- This public-only change does not mutate data. Database authorization/race suites were not rerun. Email entry and honest provider-failure recovery are checked in the unconfigured-provider build.

## Boundaries and rollback

The restored illustrations use existing local marketing fixtures only; they are never a data source for application features. No Magic Patterns contexts, router, scaffolding, editor artifacts or application mock data were added. No claims of universal extraction, permanent free pricing, conversion improvement or guaranteed duplicate-free gifting are made.

No migration is required. Reverting the landing commits restores the previous page without changing authentication or persisted data. A Railway preview was not created during this local implementation. Local review: `http://127.0.0.1:3300/`.
