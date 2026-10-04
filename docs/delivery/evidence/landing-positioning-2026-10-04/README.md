# Wishlist-first landing — final review, 4 October 2026

## Approved scope and final direction

The user approved the marketing review after new visitors could not understand how a wishlist works without a group. The approved headline is **“Good gifts start with a wishlist.”** Following review of two interactive illustration alternatives, the user explicitly asked to restore **both original illustrations**: the overlapping hero product-card collage and the Santa Party group snapshot. This document describes that final state. `DESIGN.md` records the scope of the approved departure from V18's group-first marketing hierarchy.

## Acceptance criteria and evidence

- [x] Remove the How it works eyebrow, optional-next-step eyebrow, and group-mode footnote. Give the final Create my wishlist CTA a light face with a visible dark bottom/right shadow and hover lift.

- [x] Lead with a shareable individual wishlist. Primary action: **Create my wishlist**, preserving `/auth?intent=wishlist`.
- [x] Explicitly say no group is needed and friends can view without signing up. How it works explains add → share → buy at the original store before introducing groups.
- [x] Preserve the selected headline, supporting copy and new page structure while restoring the original hero collage: three overlapping product cards, tape, avatars, reaction bubbles and entrance motion. The restored illustration is decorative, not interactive.
- [x] Make the secondary hero action useful: **How it works** scrolls to `#how` at desktop and mobile sizes. The removed interactive example is not moved elsewhere; its unused component and unit tests are deleted.
- [x] Keep public-sharing claims truthful. The original hero's “Reserved secretly” sticker is omitted because public wishlist links never expose reservations. This is the only change inside the restored hero illustration; its composition and remaining content stay intact.
- [x] Introduce groups as optional and use existing individual wishlists. Restore the original Santa Party member/product illustration, including its private reservation badges, budget states and explicit explanation that Kabir cannot see reservations on his own list. The three current benefits use the original numbered tomato markers (1, 2, 3), as requested. The old universal “No double gifts” headline is not restored.
- [x] Restore the original **Any excuse to gift.** events section with its colorful occasion tiles between groups and FAQ. Remove the condensed “Birthdays · Diwali · Eid · Secret Santa · Just because” line beneath groups. Keep the original colors and content. The latest user-approved refinement puts occasion cards on the left and text on the right at desktop widths, with full-width top/bottom section borders on both occasions and FAQ. Mobile keeps the introductory text above the cards.
- [x] Explain public-link visibility, sign-in requirements for reactions/groups and external purchases in accessible disclosure questions.
- [x] Preserve authentication intent, session-aware navigation and logout confirmation. No schema, permissions, protected-app, dependency or production-resource changes.

## Current review evidence

Route `/`, anonymous session, fixed demo content, no overlays, desktop **1440×1000**, mobile **390×844**, device scale1, local fonts and images. Before uses the PR78-head landing from3100; after uses the isolated new build on3300. The content hierarchy intentionally changes under the approved direction; these comparisons do not claim pixel parity with superseded group-first copy.

- [Original before — desktop](before-desktop.png)
- [Original before — mobile](before-mobile.png)
- [Final after — desktop](after-desktop.png)
- [Final after — mobile](after-mobile.png)
- [How it works — desktop](how-desktop.png) / [mobile](how-mobile.png)
- [Groups section — desktop](groups-section-desktop.png) / [mobile](groups-section-mobile.png)
- [Final raised CTA — desktop](final-cta-desktop.png) / [mobile](final-cta-mobile.png)
- [Final hero — desktop](hero-desktop.png)
- [Final hero — mobile](hero-mobile.png)
- [Restored group illustration — desktop](group-desktop.png)
- [Restored group illustration — mobile](group-mobile.png)
- [Restored occasions — desktop](occasions-desktop.png)
- [Restored occasions — mobile](occasions-mobile.png)
- [FAQ section borders — desktop](faq-desktop.png)
- [FAQ section borders — mobile](faq-mobile.png)

Intermediate interactive-demo screenshots have been removed from the final evidence tree. The original before captures and current after/section captures remain; superseded iterations are recoverable in Git history.

These are review evidence, **not approved replacement golden screenshots**. No baseline files or manifest were changed. The landing still differs from the old group-first goldens, so a separate explicit baseline approval is required after human review.

## Final integrated verification

After the final copy removals and CTA refinement, `pnpm verify` passed again: formatting, lint, types, all **154 files /1,512 tests**, and production build. Rendered checks at 1440×1000 and 390×844 confirmed all three removed lines are absent, the CTA retains `/auth?intent=wishlist`, its dark shadow extends 2px right/down, and hover lifts it 2px. Current full-page captures include these latest changes. Earlier verification history follows for context.

Final screenshots use the integrated landing branch based on **ad2dfd7**, plus the border/column refinements committed with this evidence. It includes the approved landing changes, integrated CI fixes and brand/favicon/social assets. The coordinating agent built and served this branch on3300 with the actual local Supabase configuration. The server was not stopped or rebuilt during evidence collection.

- Combined `pnpm verify` passed formatting, lint, type-check, **154 test files /1,512 unit tests**, and production build (run by the coordinating agent before the final styling-only refinement). The latest border/column build also passed.
- Focused final landing/browser accessibility run: **23 passed, 1 intentional mobile-navigation skip**. The two viewport variants of the test requiring an unconfigured auth provider were explicitly excluded with `--grep-invert`, because this integrated server has Supabase configured. That failure-recovery scenario passed earlier on the isolated unconfigured build; no production behavior or test files were altered to accommodate this run.
- Independent rendered-page checks at both sizes confirmed markers **1,2,3**, three original hero product images, no hero reservation sticker, original **Santa Party 🎉** group illustration, seven occasion tiles, occasions before FAQ, and absence of the condensed occasion line. No horizontal overflow:1440/1440 desktop and390/390 mobile.
- Final border/column checks passed on the latest running build: occasions and FAQ each span the full viewport (1440px desktop /390px mobile), each has2px top and bottom borders, and their shared edge overlaps by2px to remain a single line. Cards are left of text on desktop; text precedes cards vertically on mobile. Screenshots were visually inspected; no broad test rerun was needed for this styling-only refinement.
- Anonymous page metadata renders `/assets/brand/share-banner-v2.png` for both Open Graph and Twitter images. Favicon, PNG icon and Apple icon links are present. Asset correctness was checked separately in the integrated brand work.
- Existing golden files are untouched. The last comparison before restoring the occasion section reported two expected landing differences from the old group-first design. New final screenshots require explicit review and baseline approval; they were not adopted automatically.
- This public-only revision does not mutate data. Database suites were handled separately by the CI-fix work.

## Boundaries and rollback

The restored illustrations use existing local marketing fixtures only; they are never a data source for application features. No Magic Patterns contexts, router, scaffolding, editor artifacts or application mock data were added. No claims of universal extraction, permanent free pricing, conversion improvement or guaranteed duplicate-free gifting are made.

No migration is required. Reverting the landing commits restores the previous page without changing authentication or persisted data. A Railway preview was not created during this local implementation. Local review: `http://127.0.0.1:3300/`.

## Occasion-section restoration

The final follow-up restores the original V18 occasion section immediately before the FAQ, as explicitly requested. It reuses the original seven fixed tiles, semantic colors, rotation rhythm and copy. A later explicit refinement reverses the desktop columns (cards left, text right) and adds full-width top/bottom borders to occasions and FAQ. Their shared separator overlaps by one border width to avoid a doubled line. The condensed occasion line is removed. Focused formatting and11landing unit checks passed on this change. The coordinating agent subsequently verified and built the integrated branch; final screenshots now show this restored section. No server was started or stopped during the screenshot follow-up.
