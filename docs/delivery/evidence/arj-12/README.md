# ARJ-12 evidence — analytics foundation (002f)

Captured on 2026-09-27 (UTC) from the isolated worktree
`/home/factory-user/worktrees/arj-12` on branch
`foundation/arj-12-analytics-foundation`, branched from `main` at `b63e8b5`
(the ARJ-11 local Supabase foundation, merged through PR #6).

Every file here is an allowlisted summary. No PostHog token, host, API key,
credential, or synthetic secret value appears in this directory: the test
suite uses synthetic values internally, but evidence captures only reference
their names, never their contents.

## SDK versions and entry-point rationale

| Dependency | Pinned version | Why |
| --- | --- | --- |
| `posthog-js` | 1.434.15 (exact) | Official browser SDK: consent mode, session replay with masking options, autocapture allowlists/masks, `before_send` sanitization, anonymous→authenticated identity linking. |
| `posthog-node` | 5.54.1 (exact) | Official server capture SDK: validated server-side capture, per-capture awaited `flush()`, explicit idempotent `shutdown()`. |
| `server-only` | 0.0.1 (exact) | Build-time guard making `src/analytics/server.ts` unimportable from client code. |

Entry points inspected from the installed packages at implementation time:

- `posthog-js@1.434.15` publishes **no** subpath exports — there is no
  `posthog-js/next` or `posthog-js/init` in this version. The supported
  integration used is the official Next.js `instrumentation-client.ts`
  client-instrumentation hook; `onRouterTransition` is present in the pinned
  Next.js 16.3.6 runtime.
- `posthog-node@5.54.1` exposes the default entry with `new PostHog(apiKey,
  { host })`, `capture({ distinctId, event, properties, groups })`,
  `flush()`, and `shutdown()`.
- Autocapture privacy options (`maskAllText`, `maskAllElementAttributes`,
  `disableCaptureUrlHashes`, `getCurrentUrl`) are supported at runtime by the
  pinned SDK but missing from its `@posthog/types` config type; the cast in
  `src/analytics/client.ts` is documented in place.

## Files

| File | Contents |
| --- | --- |
| `verify-pass.txt` | Full `pnpm verify` (format:check, lint, typecheck, unit tests, production build) passing. |
| `unit-tests.txt` | The unit suite detail: 107 tests across 14 files, including the analytics boundary matrices. |
| `tests-fail-without-implementation.txt` | The analytics test files run with the implementation sources removed: 7 of 8 files fail, proving the tests would fail without the implementation; sources restored afterwards. |
| `no-network-proof.txt` | How the no-network property is proven: SDKs mocked before initialization, every browser transport (fetch, XHR, sendBeacon, image beacons) stubbed to fail, and the unconfigured lanes constructing nothing. |
| `browser-suites.txt` | `pnpm test:e2e` (10 passed, including the integration-level `instrumentation-hook.spec.ts` Next.js hook-discovery checks) and `pnpm test:visual` (2 passed) demonstrating the visually unchanged result; no baseline files changed. |
| `type-level-boundary.txt` | The `tsc --noEmit` output passing with the `@ts-expect-error` boundary tests active against the real `ServerAnalytics.capture()` surface, plus the compiled failure demonstration. |

## Independent-review fixes (round 1)

The five blocking review findings were fixed on this branch:

1. The unsupported `onRouterTransition` export was replaced with
   `onRouterTransitionStart`, the exact hook name the pinned Next.js
   16.3.6 runtime discovers and invokes; `tests/e2e/instrumentation-hook.spec.ts`
   proves discovery against the production build. Consented users get one
   sanitized initial pageview after asynchronous initialization, one per
   navigation, the current pageview on post-init consent grant, with
   consecutive-duplicate suppression across those paths.
2. `ServerAnalytics.capture()` is generic over the event name and accepts
   `EventProperties<E>`; the no-op, configured adapter, and memory sink all
   implement the typed signature while runtime validation still guards
   untyped callers. Compile-time tests run against the real exported
   surface.
3. Pageview sanitization rebuilds page events from an explicit property
   allowlist (sanitized route template + current URL only) — SDK-enriched
   properties (`$initial_*`, `$referrer`, `$raw_event_path`, UTM/attribution)
   never pass through — and unknown client event names are dropped unless
   explicitly approved.
4. `identifyAuthenticatedUser()` is consent-aware (no-op while pending or
   denied); withdrawal stops capture via the supported API and resets the
   authenticated identity.
5. PostHog counts as configured only with both token and host (token-only,
   host-only, and neither all return the true no-op adapter); identity
   context is runtime-validated as UUIDs with a safe `invalid-context`
   failure that never reaches PostHog.

## Acceptance criteria coverage

- **Unknown event names and unsupported properties fail TypeScript
compilation** — `event-definitions.test.ts` compile-time cases plus
`pnpm typecheck` (`type-level-boundary.txt`).
- **Tests can observe emitted events without a network request** — memory
sink and SDK mocks (`unit-tests.txt`, `no-network-proof.txt`).
- **Analytics is inert when required public configuration is absent** —
server true no-op and client never-initializes tests.
- **Server-only secrets cannot be referenced by client analytics code** —
`server-only` build guard (`server-only-guard.test.ts`) and the production
build; analytics reads only the two `NEXT_PUBLIC_*` PostHog variables.
- **Privacy exclusions represented in types or tests** — catalog allowlist
validation, route-template sanitization, autocapture property allowlist,
sensitive-region mechanism (`unit-tests.txt`).
- **`pnpm verify` passes** — `verify-pass.txt`.

## Required proof

- Type-level and runtime adapter tests — see `unit-tests.txt`.
- Demonstration that development/test execution makes no PostHog request —
  see `no-network-proof.txt`.
- Documented boundary for enabling PostHog in staging and production —
  `docs/analytics/enabling-posthog.md`.

## Scope confirmations

- No product flow is instrumented with the ten business events: the
  foundation establishes and verifies the boundary only.
- Session replay ships disabled (`disable_session_recording: true`);
  production recording cannot begin until the consent UI, persisted consent,
  withdrawal, staging masking verification, and sampling/retention gates in
  `docs/delivery/issues/002g-analytics-consent-and-production-enablement.md`
  pass.
- No Magic Patterns mock data or editor artifacts were shipped.
- No production credentials or real PostHog project were configured.
