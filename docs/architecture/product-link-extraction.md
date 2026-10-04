# Product-link extraction boundary

The `/wishlist/items/extract` browser endpoint is a same-origin, authenticated
Node.js POST boundary. It accepts one bounded JSON URL and returns only an
editable metadata proposal. It does not create a wishlist item, write Storage,
or emit analytics.

## Amazon product pages (managed browser)

Recognized `dp`/`gp/product` ASIN links on the listed Amazon marketplaces use
Firecrawl's standalone Interact browser directly. Other links, including short
links, use the product scraper below. Amazon's product scraper yielded no usable
products in the ten-link benchmark; a fresh Chromium context read seven pages.
The same read-only DOM program then succeeded in Firecrawl's managed browser,
including the main image and INR 1,699 current price for B0DGTSRX3R.

The server creates a disposable session with a 30-second TTL, ten-second idle
TTL, no saved profile and no streamed viewer. A fixed Playwright program renders
the URL, waits briefly and reads the product title, selected ASIN, main image,
main product buy-price nodes and explicit page currency code. It does not read
MRP, recommendations, apply coupons, sign in or solve CAPTCHAs. Final retailer,
URL ASIN and selected ASIN must match the pasted product. Blocked/non-2xx pages
fail into manual entry. Missing, unavailable, conflicting or unsupported prices
stay empty; title and image can still be proposed. Prices are exact minor-unit
strings. This is a snapshot of the browser's offer, not a checkout-price promise.

Creation, execution and deletion use fixed Firecrawl API endpoints; user input
is JSON-encoded into the static program. Session identifiers are restricted to
safe path characters. Decoded JSON uses the same 256-KiB ceiling as scraping.
The request has a 30-second budget and attempts deletion in `finally`, using
an independent three-second cleanup signal even after user cancellation. If
creation returns no usable session ID or deletion fails, the provider TTL bounds
orphan lifetime. No session viewer URLs, credentials or vendor errors are logged.

The provider owns browser DNS, redirects and subrequests; the app's public-DNS
preflight does not pin those connections. Candidate images still pass the
existing guarded image-save pipeline. Browser starts are limited to two per
minute per Node instance, additionally to overall extraction admission and the
existing durable per-user budget. A multi-instance rollout needs shared account
quota coordination before increasing capacity. Firecrawl code execution consumes
browser credits (currently two credits per minute with a one-minute minimum);
use a dedicated free account/key with automatic top-ups disabled. No paid plan or
production browser infrastructure is provisioned by this change. Both browser
execution and scraping use Firecrawl credits. Exhaustion leads to manual entry;
there is no independently hosted Chromium fallback.

Coverage is not universal: deleted products, location-dependent offers, missing
variants, layout changes, blockers and short-link redirects can still need edits.
Only Amazon India was tested live; other recognized marketplace hosts use the
same conservative reader and may return partial proposals or manual entry.

## Primary product acquisition for other stores (Firecrawl)

The user selected Firecrawl on 4 October 2026. The endpoint now calls the
server-only `firecrawl.ts` adapter. `FIRECRAWL_API_KEY` is read only on the
server; an absent key fails safely to manual entry. No SDK dependency is added.
The old direct HTML extractor remains available for regression tests and
rollback, but is not an automatic production fallback.

Each admitted non-Amazon import makes one authenticated request to the fixed Firecrawl v2
scrape endpoint, requesting native `product` output plus rendered markdown evidence. Firecrawl handles
retailer rendering and proxy selection. Requests use automatic proxy selection,
certificate verification, fresh acquisition, no provider cache storage, and an
India/English location. Location is a price context, never a currency inference.
No user cookies, browser session, custom target headers, or browser actions are
forwarded. No application retries or extra JSON/LLM extraction are enabled.

URL syntax/IP classification and all initial DNS answers are checked before
sending the URL to Firecrawl. This is an admission check, not socket pinning:
Firecrawl owns subsequent retailer DNS resolution, redirects, and browser
subrequests. Those requests no longer pass through the local transport.
This changes the acquisition trust boundary and must receive independent review
before rollout. A provider API redirect is refused so credentials cannot be
forwarded to another endpoint.

The provider call is aborted after 30 seconds (or the earlier caller deadline).
The entire authenticated endpoint has a 35-second deadline; the browser waits
37 seconds and still permits cancellation/manual entry. Decoded provider JSON
is capped at 256 KiB. API errors, credit exhaustion, malformed responses and
retailer non-2xx statuses produce safe errors without raw provider messages.
A product title is required. Results are normalized and revalidated through
the existing proposal contract; at most eight safe, distinct image candidates
are returned. The original pasted URL remains the saved source. Recognizable Nykaa, Etsy,
IKEA, Amazon India and Flipkart product identifiers must match the provider
product URL on the same retailer. An explicit mismatch falls back to manual
entry. Generic slugs and omitted variant options still require user review.

Only a single returned variant can supply its price and explicit ISO
currency, and only when rendered page evidence contains the same amount and
currency without a conflicting currency for that amount. Bare dollar/yen
symbols never establish a currency. Multiple variants leave price/currency blank for the user's review;
the adapter does not guess the selected option, use a range minimum, or intentionally substitute
an original/list price. The provider may itself mislabel an MRP, omit variants
or associate the wrong product; rendered agreement is a sanity check, not
independent accuracy proof. Unsupported currencies and invalid numeric precision
also leave money blank. If product images are absent, a markdown image is proposed only when its alt
text contains the normalized product title. Missing images remain editable. A successful HTTP scrape
is not proof of complete metadata, field accuracy or successful image saving.

The 60-link benchmark and its live-image checks are separate evidence. Production
activation requires a dedicated server key, reviewed benchmark results, and
account spending settings appropriate to the user's budget. Free credits are a
finite allowance, not an unlimited free production service. Keep automatic
credit top-ups disabled for the initial free rollout. The app's existing rate
limits bound traffic per user/process; they do not enforce an account-wide
monthly credit cap across deployments. No account or production configuration
is changed by this implementation.

## Selected-image transport and retained direct extractor

Selected images still pass through `transport.ts`: every DNS answer is checked,
one public address is selected and pinned to a fresh socket, the connected peer
is verified, and every redirect repeats those checks. Images retain the
10-second total, 2-second DNS/connect/header, 1-second body-idle, three-redirect,
16 KiB/100-header and 5 MiB input bounds. Compressed responses are rejected.
The retained direct HTML extractor uses its existing 1 MiB limit and narrowly
scoped Amazon metadata-prefix exception. It is no longer the endpoint default.

## Process admission

Admission is deliberately local to one Node process for the first deployment:
five attempts per user and 10 per process in a rolling minute, with two
simultaneous attempts per user and two per process. Every acquired concurrency
permit is released in `finally`. Scaling to more than one application instance
must add a shared limiter before aggregate capacity is raised.

## Untrusted parsing and images

HTML metadata is parsed as inert text in a killable 500 ms worker with a 64 MiB
heap limit and explicit node, depth, JSON-LD, metadata-value, and image-candidate
bounds. Returned text is normalized to plain Unicode and exact money uses
decimal strings and `BigInt` only.

For an eligible final Amazon product URL, bounded inert markup selectors can
supplement standard metadata with the product title, main image, current
`priceToPay` / `apex-pricetopay-value`, and explicit ISO currency. A price and currency must come from
the same complete metadata source. Symbols and locale are not used to guess
currency, and unrelated recommendation or list prices are not substituted.
Missing or incomplete metadata remains editable manual entry. This exception
changes the original oversized-response rejection policy only for the named
product URLs and requires independent review with the implementation.

Selected JPEG, PNG, or WebP candidates are fetched independently through the
same transport. A separate codec process is killed on the one-second deadline;
its V8 old space is capped at 64 MiB, libvips caching is disabled, and codec
concurrency is one. A 5 MiB input cap and 20-million-pixel cap further bound
work. These defenses are approved for staging but do not hard-limit native-code
RSS; production launch remains blocked until the service or container enforces
a hard memory boundary, or a separate production risk decision is explicitly
approved. The worker verifies the declared and sniffed static container,
dimensions, pixel count, and single-frame shape, then re-encodes a metadata-free
WebP no larger than 1,600 pixels on its longest side and 2 MiB. The function
returns bytes only to server code; private Storage selection and writing belong
to 005f.
