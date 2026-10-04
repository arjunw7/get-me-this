# Production analytics consent evidence

The user requested production-only PostHog setup, a mobile footer flush with
both sides and the bottom edge, a desktop panel floating at the bottom right,
and generic cookie wording. The banner says **Allow cookies?**, explains
optional analytics, and offers **Reject** / **Allow cookies**. Cookie preferences
remain available after a choice; the mobile shortcut sits above navigation.

## Matched UI evidence

Route `/`, signed out, no analytics-consent cookie, approved landing content,
device scale factor 1, production Next.js builds, Chromium, fonts loaded:

| Viewport | Latest main (`7084c5f`) | Integration |
| --- | --- | --- |
| Desktop 1440 × 1000 | [Before](before-desktop.png) | [After](after-desktop.png) |
| Mobile 390 × 844 | [Before](before-mobile.png) | [After](after-mobile.png) |

The baseline build uses the latest main source without changes. The integration
adds only the requested optional consent surface. These are review candidates,
not replacements for approved visual baselines. No Magic Patterns mock data,
editor plumbing, new dependencies, or visual baseline updates are shipped.

## Verification

- `pnpm verify`: passed; 167 test files, 1,615 tests, production build. Two
  pre-existing lint warnings remain in unrelated copying/redraw code.
- `pnpm test:analytics`: passed, two real browser tests. A local synthetic
  ingestion endpoint receives events; no request is allowed to leave the app
  origin. Evidence covers initial and client-side pageviews, sanitized routes,
  transport UUIDs, location-enrichment suppression, pending consent, grant,
  persistence across reload, withdrawal, and exact mobile footer edges.
- `pnpm test:db`: passed; 28 files, 1,881 authorization/database checks on an
  isolated local stack. No schema or production database changes.
- `bash scripts/e2e-local-stack.sh`: 243 passed, six intentionally skipped,
  eight visual comparisons failed, plus one resend-timing failure. The resend
  test passes when rerun alone. All eight visual failures reproduce on latest
  main with the same local stack and viewports: four mobile group-creation
  states and empty/filled wishlists at mobile and desktop widths. Approved
  baselines remain untouched.

## Account and deployment status

Production project: Get Me This, US region. IP discard is enabled. Replay,
console recording, performance recording, and automatic exception capture
remain off. The timezone is Asia/Kolkata. The user configured the two public
PostHog variables on Railway production; their presence and the successful
configuration rebuild were confirmed without reading secret values.

[Production product health dashboard](https://us.posthog.com/project/631122/dashboard/2169201)
contains authentication/item activity, group creation and invitation acceptance,
extraction outcomes, gifting activity, wishlist browsing/copying, and an ordered
same-person onboarding-to-first-item funnel with a 24-hour conversion window.
New event definitions are documented but remain unverified until production
delivery is confirmed after an approved merge.

`invite_sent` is reserved for confirmed delivery, which link copying cannot
prove. `group_activated` remains planned and needs a persisted threshold-crossing
receipt; neither is reported as implemented. Session replay's synthetic staging
masking gate is outstanding and recording sampling remains zero. The
production-only request does not enable recording or bypass that gate.

The code is a pull-request proposal. Independent review, exact-head green CI,
and explicit human merge approval are required before production rollout. No
production Railway or Supabase resource was changed by this implementation.
Rollback: unset both public PostHog variables and rebuild; both adapters become
inert. To immediately stop capture in one browser, choose Reject in Cookie
preferences. The choice expires after 180 days; the cookie is authoritative for
both browser and server events, and local storage only signals other tabs.
