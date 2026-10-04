# Enabling PostHog in staging and production

This is the boundary document for enabling PostHog. ARJ-12 / 002f established
the typed analytics boundary. Product actions now emit validated events only
when the current request grants consent. Production configuration uses the
Get Me This US project; local tests use a synthetic ingestion fixture.

## Two lanes

- **Server lane** (`src/analytics/server.ts`, `posthog-node` 5.54.1) owns the
  catalog business events in `docs/analytics/tracking-plan.md`. Every
  payload is validated against `src/analytics/event-definitions.ts` (unknown
  keys, missing keys, and invalid enum values are rejected before capture)
  and every capture is followed by an awaited `flush()`.
- **Client lane** (`src/analytics/client.ts`, `posthog-js` 1.434.15, wired
  through Next.js `instrumentation-client.ts` `onRouterTransition`) owns
  session replay (shipped disabled), sanitized pageviews, consent-gated
  autocapture, and anonymous→authenticated identity linking. It can never
  emit a business event.

Both lanes use the internal Supabase user UUID as the distinct id, so server
and client activity shares one stable identity. The SDK's anonymous
identifier is used before authentication; `identify()` is called exactly
once after authentication (the pinned SDK links anonymous history during
identify, so no `alias()` call is made); `reset()` runs on logout so
identities cannot leak between users of a shared browser.

## Configuration

Both lanes read only the two public environment variables already reserved
in `.env.example`:

```
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=
NEXT_PUBLIC_POSTHOG_HOST=
```

There are no server-only PostHog secrets. Server-only secrets
(`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`) are never read by analytics
code, and the server module cannot be imported from client code at all (the
`server-only` build guard, proven by build and by
`src/analytics/server-only-guard.test.ts`).

### Inertness (the default)

- **Server lane**: with the token absent, `getServerAnalytics()` returns a
  true no-op adapter. Nothing is captured, retained, or sent.
- **Client lane**: with the configuration absent, the SDK is never even
  loaded, so none of its transports (fetch, XHR, sendBeacon, image beacons)
  can be constructed. With configuration present but consent absent, the
  SDK initializes but captures and records nothing.

**Rollback for either lane is to unset the environment variables.** No data
loss or cleanup is required; both lanes degrade to full inertness.

### Consent and production enablement

1. Set the two `NEXT_PUBLIC_*` variables on production only and rebuild the
   application. The public host is `https://us.i.posthog.com`.
2. Because the staging gate below has not passed, session replay stays
   disabled (`disable_session_recording: true`). The optional consent panel
   grants or denies capture for 180 days. Analytics preferences remain
   available in the landing-page footer to withdraw permission. The floating
   panel disappears after either choice. The cookie governs both lanes; local
   storage only signals changes to other tabs.
3. Verify first with **synthetic accounts only**: synthetic email, OTP,
   invitation, wishlist, extraction, assignment, and reservation values.
   Confirm in the PostHog project that:
   - no prohibited data class from `docs/analytics/tracking-plan.md`
     appears in any event, pageview, or autocapture payload;
   - pageviews contain only approved route templates
     (`/invite/:token`, `/groups/:groupId`, …, `/:unlisted`) — never a
     real token, query, or fragment;
   - autocapture events contain only the approved properties
     (`$event_type`, `$el_tag_name`) plus validated UUID transport identifiers.

### Staging gate for session replay (blocking)

Unit and jsdom tests prove initialization options, consent gating,
sensitive-region attributes, and selector coverage. They deliberately do
NOT prove that the recorder's emitted payload is masked. Before session
recording may be enabled anywhere:

1. Exercise staging with synthetic sensitive values in every region marked
   with the reusable sensitive-region mechanism (`ph-no-capture` /
   `ph-mask`, exposed by `sensitiveAnalyticsAttributes()` and
   `sensitiveTextMaskAttributes()` in `src/analytics/privacy.ts`).
2. Watch recorded sessions and confirm masking: all form inputs masked by
   default; wishlist descriptions, gift notes, invitation messages, email
   addresses, names, pasted product URLs, and extracted product content
   blocked or masked.
3. Only then flip `disable_session_recording` and set recording sampling,
   retention, and eligibility in `src/analytics/client.ts` — one reviewed
   change.

Until that gate passes, session replay, console-log capture, and
network-body capture remain disabled everywhere.

## Sampling, retention, and eligibility changes

When replay is enabled, the initial policy is: conservative sampling
(starting at `sampleRate` configured in the enablement change), short
retention set in the PostHog project (weeks, not months), and eligibility
limited to consented sessions. Changing recording eligibility later is a
code change to `src/analytics/client.ts` plus a PostHog project settings
change, both reviewed against `docs/analytics/tracking-plan.md`, with the
privacy checks above re-run. Never use analytics as an authorization or
application-state system.

## Currency allowlist

`SUPPORTED_CURRENCIES` in `src/analytics/event-definitions.ts` mirrors the
complete active ISO 4217 List One (published 2026-09-17 by the ISO
maintenance agency). The mirror is complete and unedited so analytics never
rejects a legitimate currency or independently defines product
availability. When the product defines its single shared supported-currency
constant, that decision replaces the mirror in the event definitions.

## SDK ownership

Direct imports of `posthog-js` and `posthog-node` are blocked by an ESLint
architecture rule everywhere except `src/analytics/**` and
`instrumentation-client.ts`, so product code can only use the typed
boundary. This restriction is tested by
`src/analytics/sdk-import-boundary.test.ts`.
