# Public wishlist guides: expanded review evidence

Owner request: add the remaining birthday, cross-store and Secret Santa pages and visible homepage references. This extends the public guide issue in PR #83, on the same branch. Base before these additions: `cbd07bb3fec6bac31a273d78f5935bb2c0869b5a`; PR base main is `1488a8e5ad567d7da8d74ff749934e0ffd6605f5`.

## Acceptance evidence

- Add/share/shop and standalone wishlist before optional groups: existing how-it-works guide plus three distinct topic guides. Copy checked against implemented behavior and docs/flows; organizer participation statement corrected during independent review.
- Birthday: practical notes, mixed prices, optional sharing message and persistent wishlist. Cross-store: review variants, editable manual fallback, original currencies and retailer checkout. Secret Santa: joined eligibility, organizer participation, private draw, explicit redraw and group-scoped reservations; no advanced exclusions claim.
- Guest viewing vs signed-in reactions and private gifting: stated in copy. No public reservation controls, global duplicate-prevention, live price or universal extraction claims.
- Server-rendered public content and crawlable links: all four guides have native anchor links; visible Helpful guides on homepage, related guides on each page. No JavaScript or account required to read. No changes to auth or data access.
- Canonical/social identity and WebPage/BreadcrumbList: policy unit tests and no-JavaScript browser assertions cover the new routes. Local production-mode response checks verify the exact five sitemap URLs (homepage plus four guides).
- Fail-closed indexing: unit and browser negative checks cover previews, disabled flags, personal/utility URLs, similar unknown routes and non-GET methods. HTTP checks verify private noindex, preview host noindex, canonical www redirect preserving repeated query parameters.
- Existing fonts, tokens and CTA component used. Both approved viewports have no horizontal overflow; native FAQ keyboard interactions and CTA intent click-through pass; axe finds no WCAG 2 A/AA or 2.1 AA violations.
- Before/after desktop 1440×1000 and mobile 390×844 screenshots saved in this directory. Before new routes are404; homepage before and after both use ordinary anonymous view, FAQs collapsed. New guides have no V18 equivalent screen; they are owner-requested new marketing designs pending live approval. No visual baselines replaced.

## Validation

Final `pnpm verify` passed:157 files /1,564 tests, format, lint, typecheck and build. Two existing unused-variable warnings remain. An intermediate full run failed the unchanged PNG image-normalization test; its isolated15 tests and two subsequent full verification runs passed. Assertions and timeouts were not weakened.

Final browser run:
`pnpm exec playwright test tests/e2e/search-guides.spec.ts tests/e2e/how-it-works.spec.ts tests/e2e/seo.spec.ts tests/e2e/landing.spec.ts --config=playwright.seo-review.config.ts`
**57 passed,1 intentional mobile navigation skip.** Temporary review config uses port3600 and is not committed; standard CI uses the repository config.

Isolated local build and runtime with `APP_ORIGIN=https://getmethis.fun`, `SEO_INDEXING_ENABLED=true`, Railway environment production: **20 HTTP checks passed**, recorded in production-responses.json. These are local deployment-mode checks, not claims of live production indexing. Direct HTTP Host-header requests were used; the Node fetch client did not override Host as expected. Next normalizes the homepage canonical trailing slash when metadataBase is set; URL comparison verifies its equivalent canonical identity.

Frozen landing visual comparisons: **2 expected failures**. Homepage gained the Helpful guides section; height changes from5173 to5997mobile and3421 to3839desktop. Existing frozen baselines remain unchanged. Owner design/baseline approval is required before replacing them. This is not attributed solely to platform rasterization.

Independent review by seo_merge_review is clean after three copy corrections. Exact new-head CI remains separate from local checks; no automatic merge or publication. Earlier PR83 head cbd07bb had all six CI jobs green before this scope extension.

## Local review and release

- http://127.0.0.1:3600/
- http://127.0.0.1:3600/how-it-works
- http://127.0.0.1:3600/birthday-wishlist
- http://127.0.0.1:3600/wishlist-from-different-stores
- http://127.0.0.1:3600/secret-santa

The review server uses the verified noindex build. Railway preview URL is not available at evidence capture. No production Railway/Supabase settings changed. Activation still requires production-only SEO opt-in at build and runtime, then live checks and Search Console/Bing submission. No promised ranking or AI-citation timeline.

No dependencies, schema migrations, data-access changes, user fixtures, Magic Patterns mock data or editor artifacts shipped. Rollback: revert the guide slice to remove routes/navigation/allowlist entries, or disable indexing and rebuild/redeploy. No database rollback.
