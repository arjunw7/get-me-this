# Independent Amazon browser worker

This worker serves authenticated Playwright sessions for Amazon product imports.
It consumes no Firecrawl credits. Compute and network usage depend on hosting.
It is a proposal, not a production deployment.

## Local setup

Build/start `workers/amazon/compose.yaml` with Docker Compose, setting a dedicated
random secret of at least 32 characters through your private environment. Do not
commit it, embed it in a URL, print Compose configuration or share browser logs
containing credentials. Use the same secret as `AMAZON_BROWSER_SECRET` on the app.
Set the app's `AMAZON_BROWSER_WS_URL` to `ws://browser:3105/session` and attach
its container to the compose `isolated` network. The app may have its normal
outbound network for public-DNS preflight; the browser must have only `isolated`.
No browser/proxy port is published. The proxy receives no application secrets.
Stop your own Compose project after testing; do not stop other local stacks.

## Required deployment boundary

Browser: non-root, sandbox enabled, one ephemeral process per admitted session,
no direct external network, bounded CPU/memory/PIDs and temporary storage.
Only the credential-free broker joins both the isolated and outbound networks.
The broker accepts HTTPS CONNECT on port 443, validates all DNS answers, pins
and checks the actual public peer, and enforces byte/time/concurrency limits.
Keep both services inaccessible to public clients. Private hostnames by
themselves do not restrict egress. Do not deploy on a platform that cannot
enforce this topology; do not disable the Chromium sandbox to make startup pass.
Public worker transport requires WSS; private WS is accepted only for the fixed
local/service names recognized by the adapter. Keep app and worker Playwright
versions equal (`1.63.0`). No production Railway resources were modified.

The seccomp profile is the Apache-2.0 upstream [Playwright v1.63.0 Docker
profile](https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json).
The browser drops all capabilities and includes only SYS_CHROOT in the bounding
set so Chromium's inner user-namespace sandbox can chroot. The non-root browser
has no effective capabilities; no SYS_ADMIN or privileged container is needed.
The proxy drops all capabilities. TLS verification stays enabled.

## Operational limits

One active worker session, 5-second startup and 28-second watchdog; disconnect
kills the entire browser. App deadline 30 seconds, output 16 KiB and at most
120 page requests. Broker: 16 tunnels, 2-second DNS/connect deadlines, 5-second
idle and 30-second lifetime, 16 MiB/tunnel and 64 MiB/minute aggregate. There are
no retries, persistent profiles, user cookies, CAPTCHA-solving or stealth flags.
Missing configuration/capacity, private destinations or blocked pages return
manual entry. Health returns process availability, not product-import readiness.

Run `pnpm browser:check` and `pnpm verify` from the root. Docker image compilation
checks the worker independently. Test live products through the app-side network
before enabling a staging/production endpoint; local success does not establish
Amazon's behavior on a production IP. Amazon price is a snapshot and may differ
with delivery location, seller or selected variation.
