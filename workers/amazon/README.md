# Amazon extraction worker on Railway

Amazon product imports use this independent Playwright worker and consume no
Firecrawl credits. Railway compute/network usage can cost money.

## API and separation

Deploy the root build context with `workers/amazon/Dockerfile`, start command
`/usr/bin/tini -s -- node --conditions=react-server dist/amazon/workers/amazon/railway.js`, health
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

## General-store fallback API

This image also serves authenticated `POST /extract-product` with exactly `{url}`.
The generic job shares Amazon admission/cancellation/container limits. It runs a
fixed DOM reader after JavaScript rendering, using its own public pinned CONNECT
broker on loopback 8082; keep this broker private too. The Amazon `/extract` job
retains JavaScript-disabled, selected-document-only behavior.

Generic requests are HTTPS GET only, capped at 160 requests and three explicit
redirects. Images/fonts/media, popups, subframes, automatic document navigations,
WebSockets, service workers and dedicated/shared/blob workers are blocked. The CSP
restriction is an additional policy, preserving stricter retailer policies. Scripts,
stylesheets and GET XHR/fetch may load through the guarded broker. No caller scripts,
headers, sessions or credentials are accepted. The same Railway application-enforced
containment limitations apply with a broader renderer attack surface.

Deployment order: review and deploy this upgraded image to the existing separate
worker first, verify `/health` plus authenticated Amazon and other-store imports,
then release the web change. The app derives `/extract-product` from its current
Amazon worker URL and reuses its secret. No new project or variables are needed;
optional `PRODUCT_BROWSER_URL/SECRET` allow separate service configuration. An old
worker safely returns 404/manual fallback. Roll back both worker and app together
if necessary; Amazon's narrow route remains compatible with the old image.

Run `pnpm browser:build` and `node --conditions=react-server workers/amazon/product-check.mjs`
where sandboxed Chromium is installed for real CSP worker-blocking, automatic
navigation and fixed DOM-reading checks. The product benchmark is metadata evidence,
not proof that all retailer pages or image uploads work.

The image runs Tini as a child subreaper. Chromium termination can orphan renderer
children; reaping them prevents repeated imports exhausting the process limit.
No application dependency was added; Tini is an OS-level worker image dependency.

The existing Railway service has a custom Node start-command override. Set it to
`/usr/bin/tini -s -- node --conditions=react-server dist/amazon/workers/amazon/railway.js`
when upgrading, or remove the override to use the Dockerfile entrypoint. Railway's
Docker start command [overrides ENTRYPOINT](https://docs.railway.com/deployments/start-command),
so keeping the old Node-only override would skip the process reaper.
