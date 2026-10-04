# Firecrawl product import and Amazon browser extraction

## Outcome

Replace production product-page acquisition with Firecrawl, and use an independent
headless browser for recognized Amazon ASIN URLs. Return editable product name,
image and reliable original price/currency where available. Preserve manual
entry for blocked, unavailable, ambiguous or incomplete products. The user
approved Firecrawl and the Amazon headless approach on 4 October 2026.

This bounded slice changes acquisition and timeout/admission settings only.
There is no redesign, schema migration or paid subscription. The user later
approved a separate capped Railway staging worker project/service and chose
a Railway-compatible browser design. It supersedes the local HTML acquisition
requirement in 005e for the primary extractor; guarded image acquisition remains.

## Acceptance criteria

1. Other stores use the fixed server-only Firecrawl product scrape API with
   rendered price evidence. Recognized Amazon ASIN URLs use a disposable independent
   browser and a static read-only DOM program, without also paying for a scrape.
2. Proposals retain the source URL, require a product title, restrict image
   candidates and preserve exact original minor-unit money. Explicit product-ID
   mismatches, conflicting currency, ambiguous prices and CAPTCHA pages cannot
   become confident imports. Partial results remain editable.
3. Authentication, complete-profile, origin, durable abuse control, guarded
   image saving and explicit-save behavior remain enforced. Initial private DNS answers are rejected. Amazon browser traffic uses a
   separate-project worker with an application-enforced, public-address-pinned
   loopback CONNECT broker; redirects and all subresources are blocked. Railway
   has no host-level egress firewall; Firecrawl owns
   other stores' redirects/subrequests.
4. API keys remain server-only. Provider bodies, deadlines, browser starts and
   concurrency are bounded. Sessions are stopped on success, error and
   cancellation; the worker watchdog kills the whole browser process. Credit exhaustion produces
   manual entry without retry or automatic paid upgrades.
5. Automated tests cover provider mapping, wrong-product/currency rejection,
   browser price selection, failure cleanup and manual-entry preservation.
   Verification and local-stack results are recorded, including pre-existing
   failures. No unapproved visual baseline is changed.

## Rollout and rollback

The branch is a proposal requiring independent review. A preview needs a
server-only FIRECRAWL_API_KEY from a dedicated account/key with automatic top-ups
disabled, plus the isolated worker and its server-only endpoint/secret. Production credentials and deployment are separate from this local
implementation. No schema changes or migration rollback are required. Reverting
this slice restores the original local HTML extractor and its admission/timeouts.
Multi-instance provider quota coordination and universal-store support are
follow-up work; neither is claimed by this slice.

The worker runtime dependency is `playwright-core`; the web app calls a narrow
authenticated HTTPS API using native fetch. The Chromium binary lives in the
worker image, not the web application. No schema or visual changes are included.
