# Product-link extraction boundary

The `/wishlist/items/extract` browser endpoint is a same-origin, authenticated
Node.js POST boundary. It accepts one bounded JSON URL and returns only an
editable metadata proposal. It does not create a wishlist item, write Storage,
or emit analytics.

## Amazon product pages (independent Playwright)

Amazon marketplace URLs bypass Firecrawl entirely. Recognized `dp`/`gp/product`
ASIN links use a separately hosted, authenticated Playwright worker; unsupported
Amazon paths and short links fail into editable manual entry without spending Firecrawl credits.
Missing worker configuration, blocked/deleted pages and timeouts also fail safely.
Only Amazon India has live benchmark evidence; universal extraction is not claimed.

The app performs public-DNS preflight, strips tracking/query input, creates a
fresh context and runs a fixed read-only DOM program. Final host, URL ASIN and
selected ASIN must match. The reader uses title, main image, main buy-price nodes
and explicit currency metadata. MRP/recommendations, unavailable offers and
conflicting prices never supply money. Original source and exact minor-unit
prices remain editable; missing prices do not prevent title/image proposals.

`AMAZON_BROWSER_WS_URL` and a dedicated `AMAZON_BROWSER_SECRET` stay server-only.
The frontend admits one authenticated browser session at a time, launches fresh
sandboxed Chromium as a non-root user and kills the entire process on disconnect
or its 28-second watchdog. The app has a 30-second budget and bounded cleanup;
a late connection after cancellation is closed. Admission is ten starts/minute,
one concurrent per app process, in addition to existing durable user controls.
App page requests are bounded to 120, service workers/downloads/WebSockets are
blocked, TLS verification remains enabled and output is capped at 16 KiB.

Chromium has no direct internet route. Its only network path is the separate
credential-free HTTPS CONNECT broker. That broker checks every DNS answer,
dials a public numeric address and verifies the actual socket peer before
opening a tunnel. Private/metadata/loopback destinations, non-443 ports and
plain HTTP fail closed. DNS/connect/header deadlines, connection counts and
byte/idle/lifetime limits bound resources. Chromium verifies retailer TLS
end-to-end. Candidate images still use the existing guarded save pipeline.

The supplied local Docker configuration enforces this boundary. A staging or
production host must enforce equivalent network isolation; a private service
hostname alone does not provide it. See [worker deployment instructions](../../workers/amazon/README.md).
The app needs access to the worker network and public DNS; the browser must not
inherit application credentials. This requires independent review and a tested
worker deployment before rollout. No production infrastructure is provisioned.
Independent browsing consumes no Firecrawl credits, but hosting compute can
still cost money. Other stores continue to use Firecrawl and its allowance.

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
