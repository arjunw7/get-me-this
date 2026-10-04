# Public how-it-works guide: review evidence

Base: merged main `1488a8e5ad567d7da8d74ff749934e0ffd6605f5` (PR #80). New route: `/how-it-works`. This is an owner-authorized SEO content extension; there is no V18 equivalent guide screen. The existing fonts, semantic tokens, wordmark and CTA component follow DESIGN.md. New-page visual approval remains pending the requested live review. No frozen baseline was changed.

## Matching UI captures

Chromium on macOS, desktop1440×1000 and mobile390×844, anonymous/no-provider content, bundled app fonts, animations disabled. Guide captures use the same route and viewport; before the new route returns404. Homepage captures both open the first FAQ, where the contextual guide link was added. No personal data, email addresses, invite tokens or public wishlist tokens appear.

| State | Desktop | Mobile |
| --- | --- | --- |
| Guide before (missing route) | [before](before-desktop.png) | [before](before-mobile.png) |
| Guide after (full page) | [after](after-desktop.png) | [after](after-mobile.png) |
| Guide viewport preview | [preview](after-desktop-viewport.png) | [preview](after-mobile-viewport.png) |
| First homepage FAQ before | [before](home-faq-before-desktop.png) | [before](home-faq-before-mobile.png) |
| First homepage FAQ after | [after](home-faq-after-desktop.png) | [after](home-faq-after-mobile.png) |

These captures demonstrate the explanatory page itself. Actual-product walkthrough videos and demonstration screenshots for later use-case pages remain separate content work; no old prototype screenshots or real user wishlists are published as proof.

## Verification

- Final `pnpm verify`:157 files /1,561 tests, formatting, lint, typecheck and production build passed. Two existing unused-variable lint warnings remain.
- An intermediate broad run hit three failures in unchanged asynchronous profile/image tests. They passed in a47-test focused run and in the subsequent full verification. No tests, timeouts or assertions were weakened.
- Broad guide/landing/SEO journeys:37passed /one intentional mobile nav skip. The two existing landing visual comparisons differed locally from the frozen CI captures by2–3% of pixels, predominantly text/edge rasterization; final CI must establish the exact-head result. Baselines remain untouched. Same-machine mobile content before the FAQ is pixel-identical; desktop differences above the FAQ are confined to the animated collage.
- Final focused desktop/mobile guide and SEO journeys:16passed, including no-JavaScript reading, CTA click-through, native FAQ keyboard controls, no horizontal overflow, axe WCAG2A/AA+2.1AA,44×44 Home targets and negative preview/private indexing checks.
-13 raw HTTP checks on the production-mode build/runtime passed:guide index/follow and canonical, rendered explanation/schema, alternate/private noindex, www308 path/query preservation, sitemap with only two reviewed routes and crawler policy. Exact results: [production-responses.json](production-responses.json).
- Independent read-only review: no remaining findings after the three Home targets were corrected.

## Rollout

Guide metadata can be prerendered, so production configuration must be present at build AND runtime: `APP_ORIGIN=https://getmethis.fun`, `SEO_INDEXING_ENABLED=true`, production environment and no Railway PR number. Previews retain disabled indexing. A config change requires rebuilding/redeploying. No production settings were changed here.

Deployment/owner live review, exact-head CI and a Railway preview URL are pending. No database or data-access changes; database/fullstack CI remains the integration gate. The user's occupied local3100 and other Supabase stack were not interrupted. No migration rollback is needed. Revert this guide slice to remove its route/link/allowlist entry; disabling the indexing flag also noindexes marketing and empties the sitemap after rebuild. No dependencies, Magic Patterns mock data or editor artifacts were added.
