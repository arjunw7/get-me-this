# Amazon extraction worker on Railway

Amazon product imports use this independent Playwright worker and consume no
Firecrawl credits. Railway compute/network usage can cost money.

## API and separation

Deploy the root build context with `workers/amazon/Dockerfile`, start command
`node --conditions=react-server dist/amazon/workers/amazon/railway.js`, health
path `/health`, one replica, 1 vCPU and 1 GB RAM. Use a separate private Railway
project with no app/database credentials. The HTTPS domain targets the API's
`PORT` (8080); never expose the loopback broker or Chromium control socket.

Set a dedicated random `AMAZON_BROWSER_SECRET` of at least 32 characters on
worker and app. Set app `AMAZON_BROWSER_URL` to `https://<worker-domain>/extract`.
Keep both server-only. Never commit keys or put them in URLs/logs. The API
checks bearer authentication before admitting work and accepts only an Amazon
marketplace plus ten-character ASIN, not caller-supplied URLs/browser commands.
Health reports process liveness; a real product import establishes readiness.

## Browser and network policy

A fresh non-root Chromium process runs with its sandbox enabled for every job.
A staging runtime probe confirmed sandboxed Chromium launches on Railway.
Retailer JavaScript is disabled; a fixed trusted DOM reader obtains title,
main image and current price/currency evidence. Only the selected Amazon product document is fetched; redirects are refused
before following them. All subresources (including images, stylesheets and
fonts), scripts, XHR/fetch, media, WebSockets, service workers, downloads and
other documents are blocked. Image URLs are read from inert attributes. Chromium receives only PATH, HOME and the browser-install path.

Chromium is forced through a loopback HTTPS CONNECT broker, with QUIC and
non-proxied WebRTC disabled. The broker restricts hostnames, rejects every
private DNS answer, pins the public IP and verifies the connected peer. TLS
verification remains enabled. It bounds tunnels, bytes and connection lifetime.
Railway does not provide host-level deny-direct-egress for regular services:
these are application/browser controls, not an independent network firewall.
This residual containment assumption requires independent review before
production rollout. A separate project limits access to the app's private
network and credentials but does not replace an egress firewall.

## Bounds and failures

One active job and ten starts/minute per worker process; one replica. The app
retains its authenticated durable user limits. Worker budget 25 seconds,
launch 5 seconds, app 30 seconds, output 16 KiB, input 1 KiB, 80 page requests.
Cancellation terminates the entire browser. Cleanup failure exits the worker
container for Railway to restart (ON_FAILURE, three retries). There are no
retries, persistent profiles, user cookies or CAPTCHA solving. Missing or
blocked metadata fails into editable manual entry. Prices are snapshots and
may depend on seller, location and variation; missing money remains blank.

## Local checks

Use `workers/amazon/compose.yaml` with a dedicated private environment secret.
The app endpoint is `http://127.0.0.1:3115/extract`. The Compose profile matches
the single-service application-enforced network design, with a local sandbox
seccomp profile; it does not claim host-level deny-direct-egress. Stop only your
own Compose project after testing. Run `pnpm browser:check`, `pnpm verify` and
build the Docker image. Run `pnpm browser:build` followed by
`node workers/amazon/redirect-check.mjs` where sandboxed Chromium is installed. Test real imports from Railway before activating the
production app route; local success is not evidence for Railway's source IP.

The local seccomp profile is the Apache-2.0 upstream
[Playwright v1.63.0 profile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json).

The guarded acquisition does not have a decoded document-byte cap. The
1 GB container limit bounds process memory; an oversized/decompression-heavy
Amazon response can still terminate the worker and cause safe manual fallback.
