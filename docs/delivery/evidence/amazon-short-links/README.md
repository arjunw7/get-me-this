# Amazon short-link verification

Issue: [Amazon app short links](../../issues/amazon-short-links.md).

## Acceptance criteria and evidence

- [x] Recognize exact Amazon short-link hosts, including Amazon India's `amzn.in`.
  Four parameterized integration tests cover `amzn.in`, `amzn.to`, `amzn.eu` and `a.co`. Deceptive-domain tests reject suffix matches and unapproved aliases.
- [x] Resolve supported short links to a matching Amazon product and use the independent browser worker without Firecrawl.
  Client integration tests check the worker endpoint and canonical marketplace/ASIN DTO. The live supplied link returned product metadata through the existing Railway worker.
- [x] Preserve the pasted source URL and editable metadata proposal.
  Tests assert the short source URL and resolved retailer. The live result retains the supplied short URL.
- [x] Validate every redirect under the existing network protections, with bounded redirects, bytes, cancellation and deadlines.
  The shared transport is unchanged. Resolver tests cover a three-redirect chain, private/mixed DNS at initial/final hops, socket-peer mismatch, loops, cancellation, foreign hosts, embedded credentials and HTTP downgrade. Resolution has an eight-second budget within the existing 30-second import deadline, three redirects and the existing 1 MiB HTML cap/prefix.
- [x] Fail safely into manual entry for unsafe redirects, unsupported destinations or provider failures.
  The existing ExtractionError boundary and manual form remain in place. Tests reject interstitials without an ASIN, blocked destinations and absent worker configuration.

## Live validation — 5 October 2026

Called the revised server extractor locally with the user's exact `https://amzn.in/d/08uwFjwv` link and the already deployed worker's authenticated API. Returned:

- Retailer: `amazon.in`.
- Product: AGARO Elegant Whiskey Glass, Set of 6, 325ML, Vertical Stripe Cut Design.
- Main product image URL on `m.media-amazon.com`.
- Source URL: the original supplied short link.
- No confirmed price/currency in the worker response; these remain manually editable.

No Firecrawl request, wishlist save, image upload or production configuration change was made. This is metadata extraction evidence; it does not establish universal Amazon success or image-storage success.

## Verification

- Focused resolver/client/shared transport tests: 70 passed.
- Full `pnpm verify`: passed (177 test files, 1,735 tests; formatting, lint, type checks, worker checks and production build). Two existing unrelated lint warnings remain.
- Local Supabase start attempted from the current-main-based worktree; blocked because another local stack owns port 54322. Database and stack-gated E2E checks cannot run against this checkout without disrupting another task. No schema, authorization or UI change is included.
- UI screenshots: not applicable; no UI changes.
- Railway preview: pending PR deployment availability.
- Migrations: none. Rollback: revert this change; short links return to editable manual fallback.
- No Magic Patterns mock data or editor artifacts shipped. No new dependencies, worker deployment or infrastructure changes.

## Complete provider pipeline — approved extension

The same PR now includes Amazon directly to its narrow Playwright route, and
other stores through Firecrawl → independent Playwright → editable manual entry.
Missing Firecrawl configuration/credits/errors or absent title/image trigger the
browser; missing optional money alone does not consume browser capacity.
Incomplete Firecrawl fields remain editable if the browser fails. Invalid/private
URL admission failures and cancellation never start another provider.

Acceptance criteria copied from the approved extension in the issue:

- [x] Amazon, including supported short links, goes directly to its dedicated browser route — routing and short-link tests; live original link proof above.
- [x] Other stores use Firecrawl first, then independent Playwright, then editable manual input — routing/client tests exercise each branch and final failure.
- [x] Missing Firecrawl configuration, credit exhaustion and failed/incomplete extraction attempt the browser without dropping the source URL or available fields — actual adapter tests cover absent key and HTTP 402; routing tests preserve partial data.
- [x] Preserve cancellation, safe URL admission and one overall import deadline — cancellation/blocked admission tests, eight-second Firecrawl budget inside a shared 35-second deadline.
- [x] Keep the worker isolated, authenticated and bounded; retain Amazon’s existing restrictions — negative worker API/DTO tests, resource policy tests, guarded CONNECT regression tests and isolated Docker runtime checks. No app credentials enter Chromium.
- [x] Verify routing, negative network/resource controls, real rendering and representative live URLs — 1,786 automated tests; real Chromium CSP test blocks network/blob/shared workers and automatic navigation, with fixed-reader title/price proof. [Final live corpus evidence](playwright-corpus.md) covers 60 unique URLs plus 27 targeted retests.

Release-source `pnpm verify` passed: 181 test files / 1,786 tests, formatting,
lint, typecheck, browser checks and production build. Two existing unrelated
lint warnings. Independent review found worker creation, query identity and
automatic-navigation gaps; these were fixed and re-reviewed with no further
important findings. Retailer canonical URLs that omit selected variants remain
a documented conservative manual-fallback limitation.

A preliminary long worker run exposed unreaped Chromium children and eventual
process-limit exhaustion. That run is not reliability evidence. Tini was added
as an OS-level image dependency/subreaper, and the final corpus was repeated.
A real Chromium runtime fixture confirmed all three worker creation modes blocked,
no unexpected outbound requests, and blocked automatic document navigation.

The new image needs deployment to the existing separate Railway worker before
the app rollout. The service is currently pinned to the older Amazon-only commit;
its custom Node start command also must become
`/usr/bin/tini -s -- node --conditions=react-server dist/amazon/workers/amazon/railway.js`
to retain the subreaper on Railway. No new project, API key, worker service or app
variables are required when reusing the existing URL/secret. The PR does not
modify production resources. Docker/local success is not Railway-source-IP proof.

No UI/schema changes or screenshots/migrations apply. Local DB/stack checks remain
blocked by another task owning port 54322; exact-head CI is the final full-stack
check. Railway preview deployment is not available in the current service inventory.

Final corpus: 30/60 title-and-image proposals, two with confirmed money; see
[per-store results and run limitations](playwright-corpus.md). Both stable long
runs ended with zero zombie processes. Provider failures still retain manual
entry; the combined Firecrawl/browser historical union is not a production
success-rate guarantee. All temporary worker containers used for this task
were stopped after testing.
