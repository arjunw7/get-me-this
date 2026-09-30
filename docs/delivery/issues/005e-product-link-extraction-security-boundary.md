# 005e — Product-link extraction security boundary

## Outcome

Give an authenticated wishlist owner a bounded, same-origin, server-side way to
turn a product link into an editable metadata proposal. The Node runtime may
fetch remote HTML and candidate images only through one reviewed outbound
transport that prevents server-side request forgery (SSRF), rebinding, and
unbounded work. A bad link, inaccessible page, ambiguous price, or unsafe image
returns a safe failure or partial proposal; manual item entry remains possible.
This is [ARJ-30](https://linear.app/arjun-wadhwa/issue/ARJ-30/) and backlog
slice 005e. The repository brief governs implementation if the Linear draft
differs.

This slice is the extraction boundary and its tests. It does not save a
wishlist item, create a Storage object, or add an extraction review UI. 005f
owns the `/wishlist/items/new` review state machine, private Storage upload,
and snapshot-first display integration.

## Scope and contract

### Entry, authorization, and resource admission

- A same-origin `POST` Route Handler under the protected wishlist namespace
  (implementation name `/wishlist/items/extract`) runs in the **Node.js**
  runtime. It accepts one JSON object containing one `url` string. No GET
  extraction, client-side retailer fetch, generic URL fetch endpoint, service
  role, or cross-origin CORS permission is introduced.
- Before parsing the URL or making any outbound request, require a valid
  complete-profile session with the existing server-side auth pattern; reject
  missing/incomplete sessions. Check `Origin` against a trusted configured
  application origin (not an attacker-supplied `Host`/forwarded host) and
  reject an absent or mismatched `Origin` for this browser POST. This is a
  defense alongside the session cookie and SameSite policy, not a substitute
  for either. Responses, including errors, are `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`.
- Bound the inbound body to **8 KiB** and **2 seconds** from route entry
  through the complete body, before JSON parsing; abort a slow or oversized
  upload before any egress. Reject non-JSON, arrays, unknown fields,
  non-string URL values, and strings over **2,048
  characters**. Empty/whitespace-only input fails. The route never accepts a
  batch. Admit at most **5 attempts per authenticated user** and **60 attempts
  per Node process** per rolling minute, plus **2 simultaneous attempts per
  user** and **16 simultaneous attempts per Node process**. Acquire rate and
  concurrency permits before egress; deny excess work with a generic
  `429`/`503`. Release concurrency permits on success, parse failure, abort,
  worker termination, timeout, and every exception. The implementation must
  provide a process-safe limiter for a single Node process and document the
  per-instance limit of this first deployment;
  scaling to multiple instances requires a shared limiter before raising
  capacity. Do not add a production service for this slice.
- A successful extraction returns only a validated `ExtractionResult`:
  `sourceUrl`, optional `title`, `retailer`, `originalAmountMinor` (decimal
  **string**), `originalCurrency` (uppercase ISO 4217), and at most **8**
  `candidateImageUrls`. Missing values are omitted or `null`, never invented.
  Title ≤ 200 characters; retailer ≤ 120; URLs ≤ 2,048. Normalize text to
  plain Unicode text, trim/collapse whitespace, remove control/bidi override
  characters, and never return markup, script, arbitrary metadata, headers,
  page bodies, cookies, or remote error text. The proposal is not trusted
  item data: 005f must revalidate edited fields when saving.
- Expected failures use a small typed code (`invalid_url`, `blocked_url`,
  `unavailable`, `too_large`, `timeout`, `unsupported_content`, or
  `extraction_failed`) and generic user-safe wording. Do not echo the link,
  response headers, retailer text, DNS answers, or exception details in
  errors. No extraction result, source URL, query string, page metadata,
  image bytes, or raw error is logged or sent to analytics. Bounded metrics
  may count only reason codes without a URL or user-derived label.

### One transport for every remote byte

- Parse with the platform URL parser; reject credentials, fragments,
  malformed/ambiguous host syntax, non-FQDN single-label names, and any
  scheme other than `http:` on port **80** or `https:` on port **443**.
  Explicit default ports are allowed; all other ports are rejected. Normalize
  an accepted URL once, retaining its path/query for the request and the
  proposal. Do not silently upgrade an HTTP URL to a different resource.
- The destination policy allows only publicly routable unicast addresses.
  For IPv4, deny **0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12,
  192.0.0/24, 192.0.2/24, 192.31.196/24, 192.52.193/24, 192.88.99/24,
  192.168/16, 192.175.48/24, 198.18/15, 198.51.100/24, 203.0.113/24,
  224/4, and 240/4** (including limited broadcast). For IPv6, admit only
  `2000::/3` and then deny every IANA special-purpose entry within it,
  including **2001::/23, 2001:db8::/32, 2002::/16, 2620:4f:8000::/48,
  and 3fff::/20**. The initial `2000::/3` rule also denies unspecified,
  loopback, IPv4-mapped/embedded and translation prefixes, discard/dummy,
  segment-routing, unique-local, link-local, and multicast addresses;
  scoped/zone-identifier forms are denied at URL parsing. Deny the whole
  IANA special-purpose registries, including entries marked globally
  reachable, as a deliberately conservative policy; the explicit ranges
  above are the reviewable baseline, not exceptions. Maintain and test the
  classification against the [IANA IPv4 registry][iana-v4] and
  [IANA IPv6 registry][iana-v6].
  Do not treat `isIP` as an allow decision. Apply the policy to literal IP
  hosts and every DNS result.
- Resolve **all** A and AAAA answers for the host on each hop, with at most
  **32 raw answers total** before deduplication; 33 answers fail before dial.
  If resolution fails, produces no address, or contains even one disallowed
  answer, fail the whole hop before dialing. Canonicalize and sort the
  approved addresses by family (IPv4 before IPv6), then numeric address
  bytes, and choose the first: DNS answer order cannot change the selected
  peer. Connect to that exact IP on a fresh socket for each hop and each
  image fetch, with connection pooling, keep-alive, and socket reuse disabled.
  Preserve the original hostname for HTTP `Host` and HTTPS SNI and
  certificate validation, and verify the connected socket's remote address
  equals the selected IP **before sending HTTP application bytes**. Never let
  a second library lookup choose the peer. Ignore system HTTP proxy settings
  and bypass any framework fetch behavior that could follow redirects or
  resolve again. Treat peer mismatch as failure and close the socket.
- Handle redirects manually, at most **3** across the whole request. Parse,
  classify, resolve, select, pin, and verify every `Location` as a fresh hop;
  a relative redirect is resolved against the prior URL. Reject HTTPS to
  HTTP downgrade. No credentials, cookies, authorization headers, or
  previous-hop headers are forwarded. A blocked redirect makes **zero**
  dials to its target. A blocked initial URL makes **zero** dials overall.
- Set a single **10-second** wall-clock deadline per extraction or selected
  image operation, from its entry through inbound reading where applicable,
  DNS, connects, redirects, response reading, HTML parsing or image
  normalization, and response serialization. Each hop also has a
  **2-second DNS**, **2-second connect/TLS**, **2-second response-header**,
  and **1-second body-idle** deadline; the shorter remaining deadline wins.
  Abort and close sockets on expiry or client cancellation. Send
  `Accept-Encoding: identity` and reject any response with a non-identity
  `Content-Encoding`; neither HTTP clients nor parsers may
  decompress an unbounded payload. Bound response headers to **16 KiB** and
  **100 fields** before header merging. Reject excessive `Content-Length`
  before reading, and enforce byte caps
  while streaming even when the header is absent or false: **1 MiB** of HTML
  and **5 MiB** of image data. Do not buffer past the cap. Reject non-2xx
  final responses and content types outside the exact consumer allowlist.

### Inert metadata and exact money

- The HTML consumer accepts only `text/html` and `application/xhtml+xml`
  responses. Decode only explicitly supported character sets, with bounded
  output. Parse inertly: no scripts, DOM resource loads, CSS imports, forms,
  browser execution, or network access from the parser. Isolate parsing in a
  killable worker with a **500 ms** wall-clock budget and **64 MiB** heap cap;
  terminate it on timeout/error. Bound parsed nodes to **50,000**, HTML
  nesting depth to **64**, JSON-LD depth to **8**, JSON-LD blocks to **16**
  and **128 KiB aggregate source text**, and any single metadata value to
  **8 KiB**, independently of the transport byte cap. Malformed or hostile
  HTML yields a partial proposal or typed failure, never an unhandled process
  crash.
- Extract only a small allowlist of metadata (`og:*`, product JSON-LD, and
  ordinary title/meta fallbacks) with deterministic precedence. Treat JSON-LD
  as data, never code; reject excessive nesting, arrays, or metadata strings.
  Process at most **32 raw image candidates** and **32 KiB aggregate candidate
  URL text** before resolution against the final page URL; excess candidate
  work fails safely rather than silently scanning an unbounded list. Then
  deduplicate, scheme/port/syntax check, and return at most eight; **listing
  a candidate does not approve a later fetch**. Re-run the complete transport
  policy when 005f selects one.
- Price parsing accepts a **decimal string** plus an explicit supported ISO
  4217 currency. Reject JSON numeric price tokens, exponent notation,
  signs, separators/locale ambiguity, NaN/Infinity, negatives, excess
  fractional precision, unsupported currency exponents, and amounts outside
  signed PostgreSQL `bigint` minor-unit range. Convert using string digits
  and `BigInt`, never binary floating point, then serialize
  `originalAmountMinor` as a decimal string. Zero-decimal (for example JPY)
  and two-decimal (for example INR) cases, leading zeros, maximum bigint,
  and overflow are explicit tests. If price/currency cannot be established
  together, omit both; never guess a currency from locale or a symbol.

### Candidate image normalization

- Provide a **server-only** image normalization function for 005f to call
  after user selection. It uses the identical URL classifier, all-answer
  DNS resolution, chosen-peer pinning, redirect policy, deadline, and
  streaming cap above. It accepts only declared and sniffed **JPEG, PNG, or
  WebP**. Reject SVG, GIF, AVIF, HTML disguised as an image, polyglots,
  animation/multiple frames, and unknown/unsafe decoders. Verify dimensions
  before full decode (1–8,192 pixels on each side and at most **20 million**
  pixels), decode under bounded memory/time, resize preserving aspect ratio
  so the longest output side is at most **1,600 pixels**, and re-encode one
  static **WebP** frame. Strip EXIF/ICC/comments and all remote metadata.
  Isolation uses a killable **1-second**, **256 MiB** worker; normalized WebP
  output is at most **2 MiB**. If bounded encoding cannot meet the output cap,
  or decode/encode fails, return no image. A needed codec dependency must be
  justified in the implementation PR; no decoder is added by this planning
  brief.
- The function neither writes Supabase Storage nor exposes arbitrary bytes
  as a public proxy. 005f owns the private object path, upload, owner-only
  access, and preference for `image_snapshot_path` over remote `image_url`.
  A failed snapshot uses the branded placeholder or allowed remote fallback
  under 005f's review contract; it never prevents manual item creation.

## Implementation plan

1. Add a server-only policy module with URL and IP classification, DNS
   resolution, manual redirect handling, pinned socket transport, byte/time
   guards, and injected resolver/dialer/clock for deterministic tests. Route
   both HTML and image consumers through it; no direct `fetch(url)` to
   retailer-controlled addresses remains.
2. Add the authenticated same-origin Node POST route with admission control,
   bounded request parsing, generic typed responses, and no-store headers.
   Keep admission ahead of network work. Wire its pathname into the existing
   protected-route policy only as needed; the route itself rechecks session
   and origin before egress.
3. Add the killable inert HTML parser and pure normalization functions for
   metadata, candidate URLs, sanitized output, currency, and exact money.
   Keep the public result schema narrow and validate it at the response
   boundary.
4. Add the guarded static image normalization function behind the same
   transport. Expose it only to server code; leave invocation, private
   Storage, and UI to 005f.
5. Prove the failure boundaries with fake DNS and sockets plus a controlled
   external preview fixture. Verify the complete command surface and attach
   evidence to the implementation PR. A reviewer inspects the outbound
   transport and parser/image decoder before any merge.

## Non-goals

- No item create/update, persistence of extraction attempts, migration,
  RLS/grant change, new Supabase Storage bucket or object, signed image URL,
  review UI, visual baseline, converted price, exchange-rate lookup, retailer
  adapter, browser extension, or third-party extraction service.
- No fetch of arbitrary `srcset`/CSS/script resources and no extraction from
  PDF, JSON API, or pages requiring authentication or JavaScript rendering.
- No staging or production Supabase/Railway mutation in this slice. Preview
  validation uses the approved PR environment when available.

## Acceptance criteria

1. **Admission and auth.** Signed-out, incomplete-profile, wrong-origin,
   missing-origin, malformed-body, over-8-KiB-body, and over-limit requests
   return no extraction data and make zero outbound dials; an authenticated
   same-origin bounded POST can return a partial or complete proposal. A
   slow or stalled inbound stream hits the 2-second read limit with zero
   dial. Rolling-window tests exhaust the 5/user and 60/process rates;
   parallel tests exhaust the 2/user and 16/process concurrency caps. Tests
   prove permits release after success, malformed input, client abort,
   worker termination, timeout, and exception so capacity recovers.
2. **URL classification.** Table-driven tests cover valid HTTP:80 and
   HTTPS:443, explicit defaults, disallowed schemes/ports, credentials,
   fragments, ambiguous encodings, single-label hosts, literal IPv4/IPv6,
   mapped/embedded IPv4, each explicitly denied IPv4 CIDR, the IPv6
   `2000::/3` boundary, and each denied special-purpose IPv6 prefix. Include
   addresses immediately inside/outside each range and representative
   globally routable controls. Every denied initial URL has zero DNS/dial
   activity as appropriate.
3. **DNS and pinned peer.** Mixed public/private A/AAAA answers fail with
   zero dial; DNS failure, empty answers, and 33 raw answers fail closed.
   The same valid answers in different order select the same canonical peer.
   Fake rebinding, second-lookup attempts, peer mismatch, proxy
   configuration, pooled socket reuse, and cross-hop/image socket reuse
   cannot move the request to another address or send application bytes to
   it. Every allowed hop uses a fresh connection. HTTPS tests prove hostname
   certificate verification is retained when connecting to a selected IP.
4. **Redirect and transport bounds.** Tests prove every hop revalidates,
   HTTPS downgrade and private redirects are denied with zero target dials,
   and the fourth redirect is denied. The 10-second total deadline covers
   inbound reading, redirects, parsing/normalization, and serialization;
   each 2-second DNS, connect/TLS, and header deadline plus the 1-second
   body-idle deadline is tested independently. Cancellation, over-16-KiB
   headers, 101 header fields, lying/absent `Content-Length`, chunked body,
   encoded response, unsupported type, and over-1-MiB HTML or over-5-MiB
   image abort without buffering or passing untrusted data to a parser.
   Socket assertions count transmitted bytes and closed connections.
5. **Parser and output.** Script/resource-bearing HTML cannot execute or
   trigger any outbound dial. Fixtures exceed 50,000 nodes, HTML depth 64,
   JSON-LD depth 8, 16 blocks, 128-KiB aggregate JSON-LD text, one 8-KiB
   metadata value, 32 raw image candidates, and 32-KiB aggregate candidate
   URLs; each fails within the 500-ms worker and 10-second total budgets.
   Malformed content degrades safely. Every returned field is bounded,
   plain text or an approved URL; no HTML, control/bidi character, response
   header, cookie, or error detail escapes.
6. **Exact money.** String decimal inputs for zero- and two-decimal
   currencies map exactly to bigint minor units and decimal JSON strings;
   JSON numbers, exponent notation, ambiguous separators, unsupported or
   missing currency, excess precision, negative/overflow values are
   rejected as a money pair without losing other safe metadata.
7. **Image normalization.** Selected candidates are independently
   revalidated through the same transport. Static JPEG/PNG/WebP fixtures
   normalize to bounded re-encoded bytes with metadata stripped; spoofed
   MIME, SVG/GIF/AVIF, animation, decompression bombs, corrupt files,
   input dimensions over 8,192 pixels or 20 million pixels, over-5-MiB
   input, and blocked redirects produce no bytes for storage. For valid
   JPEG/PNG/WebP input, assert static WebP output only, longest side at most
   1,600 pixels, output at most 2 MiB, aspect ratio retained, and metadata
   absent. The 1-second/256-MiB worker and 10-second total deadline fail
   closed. A disallowed candidate causes zero target dial.
8. **Privacy and no mutation.** The endpoint creates no wishlist row,
   Storage object, analytics event, URL-bearing log, or cacheable response.
   A 005f consumer can edit or discard every proposed field, and a failed
   attempt leaves manual entry available. No reservation or gifting state is
   touched or revealed.
9. **Controlled preview proof.** In a Railway PR preview, use a deliberately
   controlled public fixture domain with benign HTML/images and DNS records
   under the tester's control; demonstrate success, a safe failure, exact
   response/cache headers, and no private-network connection. Do not probe
   production internal addresses. Record redacted request/response shapes,
   fixture hashes, and the exact preview URL. If preview is unavailable,
   state why and retain deterministic socket-level proof; do not claim the
   preview criterion passed.
10. **CI and scope.** `pnpm verify` and relevant new tests pass on the exact
    implementation PR head. Any new stack-gated Playwright spec is listed
    in `scripts/e2e-local-stack.sh` in the same PR. Review confirms no
    Magic Patterns mock data/editor artifacts, no migration or Storage
    write, and no unrelated UI change.

## Required proof

- An acceptance-criterion table in the implementation PR, with test names,
  executed counts, and negative zero-dial/zero-byte assertions. Include the
  bounded HTML, image, DNS, redirect, deadline, limiter-release, and price
  fixture definitions without sensitive URLs or response bodies.
- Green `pnpm verify` locally and green `verify` plus any applicable
  `database` job on the exact PR head. Report unavailable checks precisely.
  The repository's standard implementation PR proof remains applicable;
  before/after screenshots are **not applicable** because 005e changes no UI.
- The controlled Railway preview evidence in criterion 9 when available.
  Migration/rollback note: no schema migration; rollback removes the route,
  transport, parser, normalizer, and tests. No Storage cleanup is needed.
- Explicit confirmation that no retailer content, secret URL, Magic Patterns
  mock data, or editor artifact shipped in code, logs, analytics, or evidence.

## Dependencies and privacy

- 005a supplies the owner-only wishlist schema and exact bigint minor-unit
  storage contract; 005b supplies protected-route patterns and no-store
  responses. 005c's manual create path must remain the fallback; 005f
  consumes this result and owns UI/Storage/snapshot-first behavior.
- This slice changes no data grant or RLS policy. The permissions matrix
  remains owner-only for editing items. Server egress is the new trust
  boundary: all remote content is untrusted, and no extracted metadata is
  persisted without the owner's later review and explicit save.

[iana-v4]: https://www.iana.org/assignments/iana-ipv4-special-registry
[iana-v6]: https://www.iana.org/assignments/iana-ipv6-special-registry

## Planning status

Brief and implementation plan only. No 005e production behavior is authorized
by this commit alone. Bind implementation to the reviewed exact brief commit
before cutting the implementation branch; record any changed limit or policy
as a reviewed brief amendment rather than an undocumented code choice.
