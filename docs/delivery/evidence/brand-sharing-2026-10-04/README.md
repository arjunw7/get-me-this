# App icon and social sharing preview — 2026-10-04

## Approved request and evidence

- [x] Create and set up an app favicon. `app/favicon.ico` supplies 16, 32 and 48 pixel images; `app/icon.png` supplies a 512 pixel PNG; `app/apple-icon.png` supplies an opaque 180 pixel touch icon. Next.js file-based metadata links them automatically.
- [x] Create a banner for WhatsApp and other messaging platforms. `public/assets/brand/share-banner-v2.png` is a 1200 × 630 PNG, approximately 75 KB. Root Open Graph and Twitter large-image metadata point at this same public asset with descriptive alt text.
- [x] Follow the approved wishlist-first positioning: “Good gifts start with a wishlist.” The design uses existing Bricolage Grotesque and DM Sans fonts, semantic colors from `app/tokens.css`, the wordmark underline, chunky outlines and offset card shadows.
- [x] Keep previews generic. No profile, item, group, reservation, assignment, token or account data enters this image or its metadata. Shared-wishlist `noindex`, `nofollow` and no-referrer controls are unchanged. No root canonical URL or `og:url` is inherited by shared links.

## Visual review

Before this change the root layout exported only a title and description; there were no icon or social-preview assets. This is a newly requested brand asset, not a replacement for an approved screen or visual-regression baseline.

After: [social banner](../../../../public/assets/brand/share-banner-v2.png), [512 pixel app icon](../../../../app/icon.png), [16/32/48/180 pixel size comparison](icon-sizes.png). The banner and all icon sizes were rendered and visually inspected. No page layout, frozen screenshot, or golden baseline is modified by this change.

## Delivery and regeneration

Run `node scripts/generate-brand-assets.mjs` from the repository root to regenerate the committed PNG/ICO/SVG assets. This uses the existing Sharp and Playwright dependencies and vendored licensed fonts. It reads colors directly from the design tokens. Chromium explicitly loads the exact variable WOFF2 font files used by the app before taking the banner screenshot; generation fails if either face is unavailable. No additional package, remote artwork service, prototype mock data, or editor artifact is required.

Configure `APP_ORIGIN` to the deployed app's exact public HTTP(S) origin at build time and runtime. The existing same-origin request configuration is reused; preview metadata also accepts `RAILWAY_PUBLIC_DOMAIN` as an HTTPS fallback. No origin is inferred from visitor headers. Invalid configured origins are rejected; an unconfigured production build omits image metadata instead of emitting a localhost URL. Local development can use localhost, or an explicit origin matching the preview port.

WhatsApp and other remote crawlers cannot fetch a local development server. The metadata and anonymous image response are verified locally; an actual messaging-platform card must be checked after deployment at a publicly reachable URL. Platforms cache previews and may retain an older image temporarily. No WhatsApp message was sent as part of verification.

No schema change or migration is involved. Reverting this commit removes the metadata and brand assets. No production resource was changed and no preview deployment was created by this task.

## Verification

- `pnpm verify` passed: formatting, lint (two existing warnings), strict type checks, 154 unit/component suites with 1,511 passing tests, and production build. No baseline files were changed.
- Brand-specific tests validate canonical and Railway image origins, reject malformed/credential-bearing origins, prevent production localhost fallback, and decode the committed banner/icon formats and dimensions.
- [Anonymous crawler request evidence](crawler-checks.json): root metadata includes the approved headline and absolute Open Graph/Twitter PNG URL; image and all icon endpoints return HTTP 200 without cookies; the image decodes at 1200 × 630. An invalid public wishlist retains HTTP 404, noindex/nofollow and no-referrer.
- The banner was re-rendered in Chromium after confirming both app font faces loaded, then visually inspected. Actual WhatsApp presentation remains a deployment check, not a locally claimed result.

## Typography correction and independent proof

The first Chromium version loaded the correct bundled fonts but omitted the app's `-webkit-font-smoothing: antialiased`; it also used 80px/84.8px headline metrics instead of the desktop app's 72px/72px. The revised image applies the app's smoothing and headline metrics, including weight 800, tracking -1.8px and automatic optical sizing. The wordmark keeps the production component's underline path and proportional geometry.

The actual fonts were inspected through Chromium's `CSS.getPlatformFontsForNode`, not inferred from a CSS font-family name. Both app and banner use the same custom Bricolage Grotesque variable face for display type and DM Sans for body text. At equal text, size, line height and tracking, wordmark, headline and body specimens each have **zero differing color channels**. See the [side-by-side proof](font-comparison-v2.png) (app on the left, banner on the right) and [computed styles / actual faces / pixel results](font-comparison-v2.json). This comparison uses the existing app at port3100; a prior audit confirmed the same faces and typography on the new landing page at port3300. It does not imply the banner has the same page layout.

Metadata now references `share-banner-v2.png`, and the obsolete asset is removed, so the corrected image has a fresh URL. The optional `BRAND_SPECIMEN_HTML` environment variable saves an inspectable local HTML specimen during regeneration.
