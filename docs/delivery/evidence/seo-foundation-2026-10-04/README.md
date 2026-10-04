# Technical SEO foundation — verification

4 October 2026. Based on PR79 head8f8566d. Scope: nonvisual metadata, crawl
policy and explicit indexing boundaries. No schema/data access/dependencies or
UI components changed. No visual goldens, mock data or editor artifacts added.

## Current proof after PR82 integration

Rebased onto main 0f96db999feeea5ddaffcdc48999fa5f63d3982f. The proxy
conflict preserves canonicalization before all authentication handling and applies
noindex to www redirects. New integration assertions cover the 308, exact path and
repeated query values, private-link headers and absence of cookies.

- Full pnpm verify passed: 157 files / 1,554 tests, formatting, lint, typecheck,
  production build. The two pre-existing lint warnings remain.
- SEO + landing desktop/mobile browser journeys: 27 passed / 1 intentional skip.
- Twelve production-mode built-server HTTP checks passed; current evidence is
  `post-auth-integration-responses.json`. The www response is now a permanent 308.
- Independent read-only review found no blocking issues; its 65 focused SEO,
  redirect, proxy and metadata tests passed on Node24.
- Local database execution was attempted but unavailable: the configured
  supabase_network_get-me-this does not exist and a different project owns the
  default ports. No stack was stopped, reset or repointed. The standard stack
  browser runner also reserves the user's occupied port3100. Exact-head CI must
  pass its database/race and fullstack jobs before merge.

## Historical pre-PR82 proof

The original `rendered-responses.json` below predates canonicalization and must
not be read as current www behavior; use the post-auth integration evidence above.


- `pnpm verify`: passed,156test files /1,532tests; formatting, lint, type checking
  and production build passed. Two pre-existing unused-variable lint warnings.
- Built-app desktop/mobile journeys:27passed /1intentional mobile navigation
  skip across `tests/e2e/seo.spec.ts` and `tests/e2e/landing.spec.ts`.
  Isolated temporary configuration used port3600, two workers, both committed
  viewport definitions and a fresh production build. It is not committed.
- Production-mode server on isolated port3601, APP_ORIGIN=https://getmethis.fun,
  SEO_INDEXING_ENABLED=true, RAILWAY_ENVIRONMENT_NAME=production: canonical-host
  homepage has index/follow and a clean canonical; utility and alternate hosts
  have noindex headers; runtime sitemap has exactly one canonical URL. Details
  in `rendered-responses.json`. Next normalizes the root canonical's trailing
  slash in this configured mode; both URL forms identify the same root resource.
- Unit coverage includes early auth redirects, unknown paths, public capability
  paths, methods, configuration opt-in, invalid origins, inherited preview flags,
  internal listener hostname vs original Host, and spoofed forwarded-host data.
- Public https://getmethis.fun/ independently returned200 with TLS verification
  enabled during this work. This is domain evidence, not deployment of this PR.

## Validation history and limits

An initial full unit run caught two pre-existing timing-sensitive UI assertions
(edit profile pending state and delete refresh). Both passed in isolation; full
verification passed on retry and on the final run. No assertions or tolerances
were weakened. A shared dependency symlink was rejected by Turbopack; the final
run uses a frozen-lockfile offline installation in this worktree.

No database or authorization implementation changed. Database/race/fullstack
results from the prerequisite PR are not claimed as tests of this PR. Its own
GitHub CI remains required. The standard local fullstack command reserves3100,
which remains occupied by the user's review app; targeted SEO/landing journeys
used3600 without disrupting it. No database reset or production change occurred.

Before/after UI screenshots are not applicable to this nonvisual change. Existing
landing interaction/accessibility journeys passed at both approved viewports.
Railway preview URL: unavailable at PR preparation; check deployment result after
CI. Search Console/Bing ownership, real bot visits and production SEO activation
are separate unchecked rollout tasks, not simulated by these local requests.

Rollback/configuration and full acceptance checklist:
[SEO launch execution](../../seo-launch-execution.md).
