# Firecrawl product extraction — review evidence

Branch: `codex/firecrawl-product-extraction`, started at main commit `c18b7b6` and updated through `8798d1b` via non-rewriting merges. The only conflict was `.env.example`; both server-only settings were preserved.
Issue: [Firecrawl product import and Amazon browser extraction](../../issues/firecrawl-product-extraction.md).
Architecture: [Product-link extraction boundary](../../../architecture/product-link-extraction.md).

## Acceptance evidence

1. **Provider routing:** `product-link.ts` selects independent Playwright for
   recognized Amazon ASIN URLs; other URLs use `firecrawl.ts`. A dedicated server-only worker key protects the browser; other-store API
   requests remain fixed. `playwright-core` is a production remote client; the
   Chromium binary is isolated in the separate worker image. Unsupported Amazon
   paths do not fall through to Firecrawl.
2. **Conservative product fields:** 28 scraper tests, 18 Amazon tests and 10 egress tests cover
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
   app process and one active worker session. Whole-browser disconnect cleanup
   and a 28-second watchdog bound lifetime. Chromium is non-root and sandboxed,
   with zero effective capabilities; only SYS_CHROOT is in its bounding set.
   Browser network is internal-only; the credential-free broker pins/checks
   public peers and caps tunnels, bytes and deadlines. Ten automated broker
   tests cover private/mixed DNS, invalid authorities and actual-peer mismatch.
   No credentials or browser endpoint identifiers are committed.
5. **Verification:** `VITEST_MAX_WORKERS=2 pnpm verify` passed on Node 24.21.0:
   170 files, 1,676 tests, formatting, lint, typecheck and production build.
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

[Independent Linux-worker results](amazon-independent-browser.json) record the
actual production adapter connected to sandboxed Chromium through the isolated
network and pinned CONNECT broker. Three Amazon India ASINs returned matching
product titles/images; B09MTQ23X4 exposed INR 2,799, while the other two
prices stayed blank because no current offer was confirmed. The client ran in a separate app-side container; the credential-free
broker never received the worker secret. Invalid credentials returned 401,
caller cancellation returned timeout, and a subsequent session succeeded after
cleanup. Browser public-DNS resolution was denied by the internal-only network.
This validates local runtime and network topology, not production-IP behavior
or image storage. The initial integration caught an unbound Playwright method;
the adapter now preserves its receiver and a regression test covers it.

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
follow-up. No paid plan, auto-top-up or infrastructure was enabled.

## Deployment and rollback

Draft proposal only; independent review is required before merge. The automatic [Railway preview](https://get-me-this-get-me-this-pr-87.up.railway.app/)
returned HTTP 200 on its public landing page. No production resources were
modified. Its real import path still needs server-only `FIRECRAWL_API_KEY` for other stores,
plus a separately provisioned isolated Amazon worker, `AMAZON_BROWSER_WS_URL`
and `AMAZON_BROWSER_SECRET`. Amazon imports safely require manual entry until
that worker is configured. No independent production worker has been deployed. No schema migration is
required. Revert this slice to restore the original HTML extractor/timeouts and
admission settings. No Magic Patterns mock data/editor artifacts were added to
the application; existing automated test fixtures remain test-only.
