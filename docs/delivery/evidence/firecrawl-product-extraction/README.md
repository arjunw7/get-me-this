# Firecrawl product extraction — review evidence

Branch: `codex/firecrawl-product-extraction`, based on main commit `c18b7b6`.
Issue: [Firecrawl product import and Amazon browser extraction](../../issues/firecrawl-product-extraction.md).
Architecture: [Product-link extraction boundary](../../../architecture/product-link-extraction.md).

## Acceptance evidence

1. **Provider routing:** `product-link.ts` selects the managed browser for
   recognized Amazon ASIN URLs; other URLs use `firecrawl.ts`. Fixed API URLs,
   server-only credentials and no new SDK/dependency. Adapter tests assert the
   HTTP sequence, request contract and no retries.
2. **Conservative product fields:** 23 scraper tests and 17 Amazon tests cover
   original source, exact minor units, safe images, explicit product mismatches,
   currency conflicts, ambiguous prices, CAPTCHA/non-2xx pages and partial
   proposals. A DOM fixture proves MRP/recommendations and blank price nodes
   cannot replace the main buy price.
3. **Authorization and image boundary:** existing request-boundary tests pass;
   private DNS prevents provider creation/disclosure. All 34 local extraction
   flow checks pass at both viewports, including signed-out/incomplete sessions,
   foreign-owner rejection, explicit save, persistence, replay conflicts,
   preserved input/manual fallback and snapshot-first images. No schema/RLS or
   selected-image transport change.
4. **Resource and secret handling:** missing keys/payment errors fail safely;
   no API retry. Browser starts are bounded to two/minute per process, overall
   admission to ten/minute/two concurrent. Cancellation still executes deletion
   with a separate bounded signal; malformed session IDs cannot change API
   paths. Thirty-second TTL bounds provider orphan lifetime. Provider responses
   have a 256-KiB decoded ceiling. No credentials/session-viewer URLs are in
   committed evidence.
5. **Verification:** `VITEST_MAX_WORKERS=2 pnpm verify` passed on Node 24.21.0:
   161 files, 1,613 tests, formatting, lint, typecheck and production build.
   Two existing unrelated lint warnings remain. The first parallel run hit
   three existing HTML/image subprocess deadlines; the complete two-worker
   rerun passed without changing any safety deadline. Local database suites
   passed: 27 files/1,861 tests.

## Local-stack and visual results

The full stack runner passed 238 checks, skipped six and failed ten. Eight
visual golden comparisons (wishlist empty/filled at both viewports and four
mobile group-creation states) reproduced on unchanged main. Two additional
failures were a transient home journey and an image fixture reaching a different
worktree's port-3100 server. With the isolated test port and matching fixture,
all four viewport rechecks passed. No baseline was updated.

After the Amazon implementation, the standard-port extraction E2E/visual suite
passed **34/34**, including axe and target-size checks. Ports and the temporary
isolated Supabase configuration/runner were restored before final verification;
only this task's isolated stack was stopped (with its local backup preserved).
Other task servers were left running.

There is no markup, styling or layout change; the client timeout changes from
12 to 37 seconds. The committed captures show the existing review/manual states
with synthetic contract fixtures at the approved 390×844 and 1440×1000 widths.
They are review evidence, not new approved design baselines or a live-provider
end-to-end claim.

| State | Mobile | Desktop |
| --- | --- | --- |
| Editable extracted proposal | [Capture](add-extracted-review-mobile.png) | [Capture](add-extracted-review-desktop.png) |
| Preserved-URL manual entry | [Capture](add-manual-fallback-mobile.png) | [Capture](add-manual-fallback-desktop.png) |

## Live provider evidence and limits

[Sanitized managed-browser output](amazon-managed-browser.json) records the
exact committed read-only DOM program executed through the authenticated
Firecrawl connector on 4 October 2026. B0DGTSRX3R returned HTTP 200, the matching
ASIN/title/main image and explicit INR 1,699. B07PR1CL3S returned the matching
product/image and `unavailable: true`, with no price. All sessions were stopped.
The standalone HTTP lifecycle itself is covered by injected-fetch unit tests;
a real application preview with its server-only key is still required before
rollout. No production import or production key configuration was performed.

A separate 60-link native scrape benchmark had 24 core-field, 14 partial and
22 failed responses; product/currency mistakes make raw completeness an
insufficient success metric. Offline replay through conservative validation
produced 37 proposals, of which 20 had title/image/money, rejecting the observed
Nykaa ID mismatch and domestic Nicobar USD/rupee conflict. These are captured
responses, not 60 new live integration requests or proof of current accuracy.

The local unsigned Chromium ten-link Amazon trial read seven matching pages;
two had current prices, five lacked prices and three returned 404. Managed
browser validation covers two Amazon India pages only. Images were discovered;
those real images were not saved/decoded through the production storage flow.
Other marketplaces, layout changes, location/variant-specific offers and short
links remain coverage limitations. Universal extraction is not promised.

Firecrawl's free plan has a monthly credit allowance; this implementation is
not unlimited free scraping. Keep top-ups disabled and use a dedicated account
or key; account-wide quota contention and multi-instance coordination require
follow-up. No paid plan, auto-top-up or infrastructure was enabled.

## Deployment and rollback

Draft proposal only; independent review is required before merge. No Railway
preview URL is available yet and no production resources were modified. Configure
a preview server-only `FIRECRAWL_API_KEY` to validate the real application-to-API
path, provider trust boundary and free-account limits. No schema migration is
required. Revert this slice to restore the original HTML extractor/timeouts and
admission settings. No Magic Patterns mock data/editor artifacts were added to
the application; existing automated test fixtures remain test-only.
