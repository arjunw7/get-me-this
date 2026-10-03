# Abuse controls — implementation record (009b)

The binding contract is `docs/delivery/issues/009b-rate-limiting-and-abuse-controls.md`.
This page records the implementation-time selections the brief requires to be
pinned. Owner action items remain open where marked.

## Limiter option selection

**Selected: the documented fallback — `private.rate_limit_windows`
(migration `20261014010000`).** The zero-schema option (a free-tier external
key-value store such as Upstash) was weighed and declined for now: the owner
has recorded no dependency preference (009b owner action item 2 is open), the
repository working rules forbid new dependencies without demonstrated need,
and the fallback table is testable end-to-end in CI without network or
secrets. Moving to an external KV later is a contained change behind
`DurableIncrement` in `src/rate-limit/window-limiter.ts` (one function).

## Layering and the multi-instance caveat

- **Staged enablement:** the controls ship WIRED but are enabled by
  deployment configuration — `ABUSE_LIMITS_ENABLED=1` on the service (plus
  the CAPTCHA configuration for the OTP-send gate). Local development and
  the stack-gated e2e suites run with the flag off, so approved flows,
  timings, and pinned baselines are untouched; the unit suites exercise the
  enabled behavior with injected clocks and stubbed verifiers. The kill
  switch is the same setting (clearing it disables every control without a
  code deploy). **Deploy checklist:** set `ABUSE_LIMITS_ENABLED=1` on the
  Railway service when this slice deploys — recorded as an owner action
  item, never silently off in production.

- **Layer 1 — in-process fixed-window counters** (`src/rate-limit/window-limiter.ts`):
  best-effort first filter ONLY. Per-instance counters are PROBABILISTIC
  across Railway's multi-instance deployments — each instance sees only its
  own traffic, so the aggregate admission rate is up to N instances' worth
  above the pin.
- **Layer 2 — the authoritative durable layer**: `private.rate_limit_increment`,
  an atomic test-and-increment keyed by `(limit_key, window_start)`. Its
  verdict is the decision; concurrent increments serialize on the row and can
  never exceed the window. The local commit is the durability point.
- **Availability posture:** a reachable-but-erroring durable layer fails OPEN
  (logged, identifier-only) — a limiter must not convert a database outage
  into a total application outage. Database-level invariants (006a/006c/007c/
  008c locks, CAS, one-use, generations, tombstones, the envelope cap) remain
  the authority in every state.
- The CAPTCHA gate is the one deliberately fail-closed surface (below).

## Pinned limits (env-overridable via `LIMIT_<FAMILY>_MAX` / `LIMIT_<FAMILY>_WINDOW_SECONDS`)

| Surface (route family) | Max | Window | Denial state |
|---|---:|---|---|
| `invite_landing` — raw invitation landings per coarse key | 120 | 5 min | 006c uniform unavailable (byte-identical to invalid token) |
| `otp_send` — per coarse key (Supabase Auth platform limits primary) | 10 | 10 min | 004c `over-limit` recovery |
| `otp_verify` — per coarse key | 30 | 10 min | 004c `over-limit` recovery |
| `extraction` — per authenticated user | 30 | 1 min | 005e manual-entry fallback (per-user; others unaffected) |
| `email_enqueue` — per group (009a worker quota guard inside) | 20 | 1 h | fails closed, `rate_limited` category, identifiers only |

Keys are route family + hashed IP prefix (anon) or internal user id
(authenticated); raw tokens, addresses, and secret URLs never enter a key, a
log line, or a request body echo.

## CAPTCHA — selection, coverage verification, and enablement

- **Selection:** Cloudflare Turnstile (free, no payment, privacy-friendly,
  non-intrusive managed mode only). Fallback at the same integration point:
  hCaptcha free tier. No paid CAPTCHA anywhere in v1.
- **Coverage verification (performed 2026-10-03 against
  https://supabase.com/docs/guides/auth/auth-captcha):** Supabase Auth's
  native captcha protection is documented for sign-up, password sign-in, and
  password reset ONLY. The OTP send (`signInWithOtp`) and OTP verify
  (`verifyOtp`) endpoints are NOT covered. **Wiring that ships:
  application-level** — the Turnstile token is verified server-side on the
  OTP send path (`src/auth/captcha.ts`, wired in
  `src/auth/abuse-gate.ts`) before any provider call. The hCaptcha fallback
  shares this integration point, so absent native coverage both options are
  affected equally and neither is a shortcut.
- **Failure posture:** an unavailable or degraded CAPTCHA provider FAILS
  CLOSED for new OTP sends while the control is enabled, landing in the
  existing generic `unavailable` recovery. Operational risk, honestly: while
  degraded, no new OTP can be sent.
- **Kill switch:** clearing `TURNSTILE_SECRET_KEY` disables the control at
  next server start without a code deploy; its use is logged with identifiers
  and coarse categories only. (Railway applies the env change on restart —
  no code deploy, a short restart window is required. This is the documented
  honest shape of "without a deploy".)
- **No approved-screen redesign:** with no configured site key the client
  widget renders nothing, so no visual baseline changes; the widget presence
  on enablement is a documented difference requiring product/design approval.

## Platform auth limits (Supabase Auth, staging — owner-gated)

Pinned values for the staging project's Auth limits (Supabase Dashboard →
Authentication → Limits), the PRIMARY OTP brute-force and email-flood
control: OTP/email sends 5 per hour per identity and per IP; token verify
attempts 25 per hour per identity and per IP; anonymous sign-ins 30 per hour
per IP. **Blocked on owner:** the staging credentials have been broken since
2026-09-29 (009b owner action item 1); configuration evidence and a synthetic
exceedance test are recorded only after restoration. Never silently skipped;
no automated test is weakened or skipped as a substitute — all suites are
credential-independent and pass against stubbed verifiers.

## Staging enablement gates (owner-approved, blocked)

Both the platform-limit configuration and CAPTCHA enablement on staging are
owner-approved gates, conditional on the restored staging credentials
(broken since 2026-09-29). Production enablement is Phase 8 item 4
territory and out of scope.

## Observability and analytics

Maintainer-facing structured logs with identifiers and coarse categories
only (`src/rate-limit/log.ts`): route family, limiter outcome, key KIND.
No new PostHog event; the tracking plan is untouched; abuse telemetry is
infrastructure, not product analytics.
