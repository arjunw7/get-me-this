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
