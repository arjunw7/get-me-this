# Product-link extraction boundary

The `/wishlist/items/extract` browser endpoint is a same-origin, authenticated
Node.js POST boundary. It accepts one bounded JSON URL and returns only an
editable metadata proposal. It does not create a wishlist item, write Storage,
or emit analytics.

## Amazon product pages (independent Playwright)

Amazon marketplace URLs bypass Firecrawl entirely. Recognized `dp`/`gp/product`
ASIN links use a separately hosted, authenticated Playwright worker. Exact
`amzn.in`, `amzn.to`, `amzn.eu` and `a.co` short-link hosts resolve through the
existing guarded HTTP transport first. Every hop must be an approved Amazon
host with public DNS and a matching socket peer; HTTPS downgrade is blocked.
Resolution allows at most three redirects and eight seconds within the same
30-second import budget. A bounded HTML fetch (at most 1 MiB for a final product
prefix) establishes the final URL; no retailer scripts execute. Only a final
Amazon `dp`/`gp/product` ASIN is sent to the worker. The pasted short URL remains
the proposal's source URL, while the resolved marketplace supplies the retailer.
Unsupported paths, interstitials, loops and unsafe redirects fail into editable
manual entry without spending Firecrawl credits.
Missing worker configuration, blocked/deleted pages and timeouts also fail safely.
Only Amazon India has live benchmark evidence; universal extraction is not claimed.

The app performs public-DNS preflight, strips tracking/query input and sends
only marketplace plus ASIN to an authenticated narrow HTTPS API. The worker
constructs the canonical selected product URL, launches a fresh sandboxed
Chromium process as a non-root user and runs a fixed DOM reader with retailer
JavaScript disabled. Final host, URL ASIN and selected ASIN must match. Title,
main image, current buy-price nodes and explicit currency evidence supply an
editable proposal. MRP/recommendations and conflicting prices do not supply
money. Missing money does not prevent title/image proposals.

`AMAZON_BROWSER_URL` (HTTPS `/extract`) and a dedicated
`AMAZON_BROWSER_SECRET` stay server-only. Worker admission is ten starts/minute
and one concurrent job, with a 25-second deadline, 5-second startup, 80 requests,
1 KiB input and 16 KiB output. App deadline remains 30 seconds and durable user
controls remain in place. Cancellation kills the browser; failed cleanup exits
the container before another job. Chromium receives no app credentials.

Deploy one worker in a separate Railway project, capped at 1 vCPU/1 GB.
Sandboxed Chromium launch was verified on Railway. Only the selected Amazon product document passes the browser policy; automatic
redirects and all subresources are blocked before fetching. Image URLs come
from inert attributes.
Chromium uses a guarded loopback CONNECT broker that validates every DNS answer,
pins a public address and checks the connected peer. TLS remains verified.
QUIC/non-proxied WebRTC are disabled. Candidate images use the existing guarded
save pipeline.

Railway regular services cannot enforce host-level deny-direct-egress. The
forced proxy and hostname policy are application/browser controls; they do not
provide the former Docker network firewall guarantee. A separate project has
no app private-network access or app/database secrets. This containment
assumption needs independent review before production activation. See
[worker deployment instructions](../../workers/amazon/README.md). Independent
browsing uses no Firecrawl credits; Railway compute can cost money. Other
stores use Firecrawl first and its allowance, then the general Playwright worker.

## Primary product acquisition for other stores (Firecrawl)

The user selected Firecrawl on 4 October 2026. The endpoint now calls the
server-only `firecrawl.ts` adapter. `FIRECRAWL_API_KEY` is read only on the
server; an absent key skips to the browser fallback. No SDK dependency is added.
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

For non-Amazon imports the provider call receives eight seconds (or the earlier caller deadline), reserving time for browser fallback.
The entire authenticated endpoint has a 35-second deadline; the browser waits
37 seconds and still permits cancellation/manual entry. Decoded provider JSON
is capped at 256 KiB. API errors, credit exhaustion, malformed responses and
retailer non-2xx statuses produce safe errors without raw provider messages.
A product title is required. Results are normalized and revalidated through
the existing proposal contract; at most eight safe, distinct image candidates
are returned. The original pasted URL remains the saved source. Recognizable Nykaa, Etsy,
IKEA, Amazon India and Flipkart product identifiers must match the provider
product URL on the same retailer. An explicit mismatch falls back to manual
entry through the browser fallback. Generic slugs and omitted variant options still require user review.

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

## General Playwright fallback

Non-Amazon imports use Firecrawl first. Missing credentials, credit exhaustion,
provider errors/timeouts, malformed output, or missing title/image attempt the
independent worker. Missing optional price alone does not consume another browser
job. Invalid/private URL admission failures and caller cancellation never retry.
A usable Firecrawl proposal returns immediately. If an incomplete Firecrawl proposal
exists and the browser fails, its fields remain editable rather than being lost.
If both fail, the existing manual form remains available with the pasted URL.

The entire pipeline retains a single 35-second deadline: up to eight seconds for
Firecrawl and up to the remaining 27 seconds for browser acquisition. The generic
API is authenticated `POST /extract-product` with exactly `{url}`; caller browser
commands, headers, scripts and cookies are not accepted. It shares worker admission
(one job, ten starts/minute) with Amazon. App config reuses `AMAZON_BROWSER_URL` and
`AMAZON_BROWSER_SECRET` by default; optional `PRODUCT_BROWSER_URL/SECRET` can point
to the same reviewed worker in a separate dedicated service.

Generic pages run scripts inside fresh sandboxed Chromium, with only the minimum
process environment and a separate loopback CONNECT broker on 8082. All HTTPS
resource destinations repeat public-DNS pinning and socket-peer verification.
Only GET script/style/XHR/fetch requests are admitted. Images/fonts/media,
WebSockets, service workers, dedicated/shared/blob workers, subframes, downloads,
popups and automatic document navigation are blocked. A separately enforced CSP
policy blocks worker/frame/object creation even when the retailer's CSP allows it.
At most 160 resource requests and three explicit document redirects are allowed;
redirects are inspected before following, and destination acquisition re-enters
routing and the broker. HTTP source acquisition is upgraded to HTTPS while keeping
the original source URL. Sites needing POST data, worker-based rendering, cross-host
product redirects or canonical URLs that omit selected variants may fail manually.

The fixed DOM reader extracts bounded JSON-LD, heading/Open Graph identity and
image URLs. Matching final/canonical/product URLs must stay on the source retailer
and retain meaningful query parameters; only known tracking parameters are ignored.
A mismatched structured product record is discarded entirely, including price.
If the final/canonical page itself still matches, its own title and Open Graph
image can supply a proposal; wrong structured fields are never merged back.
Visible current-price evidence must match structured price and explicit ISO currency
through the same conservative money check as Firecrawl. Multiple offers, ranges,
unavailable products or ambiguous prices leave money editable. Metadata is capped at
16 KiB; visible text and image candidates are trimmed before sacrificing useful title
and image fields. The container's 1 GB memory cap remains the native rendering and
decompression boundary; generic script execution broadens the browser trust boundary
and needs independent review before worker deployment. No universal success is claimed.

The current deployed Amazon-only worker must be upgraded using this PR's Dockerfile
and its Node-only Railway start override must include `/usr/bin/tini -s --`
before deploying the web change. An old worker returns 404 on `/extract-product`,
which safely preserves manual entry. No new project or API key is required when
reusing the existing separate worker. This PR does not change production resources.

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

The guarded acquisition does not have a decoded document-byte cap. The
1 GB container limit bounds process memory; an oversized/decompression-heavy
Amazon response can still terminate the worker and cause safe manual fallback.
