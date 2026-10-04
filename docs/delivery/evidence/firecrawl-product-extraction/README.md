# Firecrawl product extraction — review evidence

Branch: `codex/firecrawl-product-extraction`, started at main commit `c18b7b6` and updated through `8798d1b` via non-rewriting merges. The only conflict was `.env.example`; both server-only settings were preserved.
Issue: [Firecrawl product import and Amazon browser extraction](../../issues/firecrawl-product-extraction.md).
Architecture: [Product-link extraction boundary](../../../architecture/product-link-extraction.md).

## Acceptance evidence

1. **Provider routing:** `product-link.ts` selects independent Playwright for
   recognized Amazon ASIN URLs; other URLs use `firecrawl.ts`. A dedicated server-only worker key protects the browser; other-store API
   requests remain fixed. The app uses native HTTPS; `playwright-core` runs only
   in the separate worker image. Unsupported Amazon
   paths do not fall through to Firecrawl.
2. **Conservative product fields:** 28 scraper tests, 19 Amazon client tests, 11 worker HTTP tests and 12 egress tests cover
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
4. **Resource and secret handling:** missing configuration fails safely; no
   retries. Independent browser admission is ten/minute, one concurrent per
   app process and one active worker job. Worker deadline is 25 seconds;
   cancellation kills sandboxed Chromium. Cleanup failure exits the container.
   JavaScript is disabled and requests are restricted to selected Amazon pages
   with redirects and all subresources blocked. The guarded loopback broker pins/checks public
   peers. Railway has no host egress firewall: application/browser controls are
   the documented containment assumption requiring independent review.
5. **Verification:** `VITEST_MAX_WORKERS=2 pnpm verify` passed on Node 24.21.0:
   171 files, 1,690 tests, formatting, lint, typecheck and production build.
   Two existing unrelated lint warnings remain. Generated Playwright HTML/trace diagnostics were archived outside the source tree before final verification: the existing broad ESLint command otherwise traverses bundled third-party trace assets. The first parallel run hit
   three existing HTML/image subprocess deadlines; the complete two-worker
   rerun passed without changing any safety deadline. Local database suites
   passed: 28 files/1,881 tests.

## Local-stack and visual results

The initial full stack runner passed 238 checks, skipped six and failed ten. After merging current main and rebuilding the isolated local fixture stack, the full runner passed **242**, skipped **six** and failed only the same **eight** visual golden comparisons. Eight
visual golden comparisons (wishlist empty/filled at both viewports and four
mobile group-creation states) reproduced on unchanged main. Two additional
failures were a transient home journey and an image fixture reaching a different
worktree's port-3100 server. With the isolated test port and matching fixture,
all four viewport rechecks passed. No baseline was updated.

The final independent-worker iteration merged main `8798d1b`. Its local database
rerun passed 28 files/1,881 checks after resetting only the dedicated disposable
fixture stack. The first smoke run encountered leftover test users; the clean
rerun passed. Latest-main full stack E2E could not be completed: trusted local
app ports 3000/3100/3200 were occupied by other work. A port-3179 attempt was
aborted when authentication correctly rejected that untrusted origin. Automatic
approval review rejected a temporary application auth-allowlist change; no such
change was made. Those setup failures are not reported as product regressions.
The earlier valid 34/34 extraction flow proof remains historical evidence; CI
and an available trusted local origin must confirm the final integrated suite.
All temporary fixture/configuration changes were restored and only this task's
Supabase/browser/app-test containers were stopped. Other local servers remain.

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

[Earlier independent Linux-worker results](amazon-independent-browser.json) record the
actual production adapter connected to sandboxed Chromium through the isolated
network and pinned CONNECT broker. Three Amazon India ASINs returned matching
product titles/images; B09MTQ23X4 exposed INR 2,799, while the other two
prices stayed blank because no current offer was confirmed. The client ran in a separate app-side container; the credential-free
broker never received the worker secret. Invalid credentials returned 401,
caller cancellation returned timeout, and a subsequent session succeeded after
cleanup. Browser public-DNS resolution was denied by the internal-only network.
This validates local runtime and network topology, not production-IP behavior
or image storage. The initial integration caught an unbound Playwright method;
the earlier adapter preserved its receiver; the current client uses native HTTPS.

[Earlier managed-browser output](amazon-managed-browser.json) is historical
comparison evidence only; the final Amazon adapter does not call Firecrawl.
That earlier run exposed INR 1,699 for B0DGTSRX3R. The different Linux session
had no confirmed price for that ASIN, illustrating location/session-dependent offers.

A separate 60-link native scrape benchmark had 24 core-field, 14 partial and
22 failed responses; product/currency mistakes make raw completeness an
insufficient success metric. Offline replay through conservative validation
produced 37 proposals, of which 20 had title/image/money, rejecting the observed
Nykaa ID mismatch and domestic Nicobar USD/rupee conflict. These are captured
responses, not 60 new live integration requests or proof of current accuracy.

The local unsigned Chromium ten-link Amazon trial read seven matching pages;
two had current prices, five lacked prices and three returned 404. The final isolated worker validation covers three Amazon India pages only. Images were discovered;
those real images were not saved/decoded through the production storage flow.
Other marketplaces, layout changes, location/variant-specific offers and short
links remain coverage limitations. Universal extraction is not promised.

Firecrawl's free plan has a monthly credit allowance; this implementation is
not unlimited free scraping. Keep top-ups disabled and use a dedicated account
or key; account-wide quota contention and multi-instance coordination require
follow-up. No paid plan or auto-top-up was enabled. The user explicitly approved a separate
Railway staging project/service capped at 1 vCPU/1 GB; its usage may add charges.

## Deployment and rollback

Draft proposal only; independent review is required before merge. The automatic
[Railway preview](https://get-me-this-get-me-this-pr-87.up.railway.app/) is available.
The user approved a separate Railway project, `get-me-this-amazon-browser`, with
one staging service capped at 1 vCPU/1 GB. Its runtime probe confirmed sandboxed
Chromium launches. The revised worker exposes only authenticated HTTPS
`/extract`, configured through server-only `AMAZON_BROWSER_URL` and
`AMAZON_BROWSER_SECRET`. The former WebSocket client/control server were removed. A real Chromium
redirect regression proved document and image redirect destinations were never
fetched; normal HTML remained readable. The independent review identified and
confirmed fixes for shutdown/startup cleanup and redirect handling.
Production activation remains gated on review, exact-head CI and human approval.
Other stores require their existing server-only `FIRECRAWL_API_KEY`.

[Local revised API results](amazon-railway-local.json): three Amazon India pages
returned matching title/image proposals; all three left money blank because
this acquisition did not confirm both current price and explicit currency. Earlier
intermediate acquisitions exposed INR 1,699/2,799, illustrating session-dependent
offers; those amounts are not substituted into the final proposals. Invalid credentials returned 401 and arbitrary-host requests returned 422.
This validates the built single-service image, not Railway-IP behavior or image
storage. Retailer JavaScript was disabled and Chromium sandbox remained enabled.

No schema migration is required. Revert this slice to restore the original HTML
extractor/timeouts and admission settings. Remove worker URL/key configuration
when rolling back; the approved cloud worker can be stopped separately by its
owner. No Magic Patterns mock data/editor artifacts were added to the app;
existing automated test fixtures remain test-only.
