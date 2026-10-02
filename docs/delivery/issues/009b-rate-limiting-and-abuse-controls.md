# 009b — Rate limiting, free/low-cost CAPTCHA selection, and abuse controls

## Outcome

The product's public and authenticated surfaces — the raw invitation landing
(`/invite/[opaqueToken]`), authentication entry, OTP verification attempts,
link extraction, and the invitation/acceptance write paths — gain deliberate,
budget-conscious abuse controls. Unauthenticated attackers cannot enumerate
tokens or accounts, brute-force OTP codes, or drive unlimited extraction and
email volume through the product; authenticated users cannot hammer
transactional email or extraction endpoints; and every control degrades
safely to a denial rather than an outage.

Two binding constraints shape every choice:

- **Free/low-cost tiers only.** Every control specified here is achievable
  on Resend's and Supabase's free tiers, Railway's base pricing, and a
  free-tier CAPTCHA. Where a paid-only service would be the easy answer
  (managed WAF, paid rate-limiting edge), a concrete free-tier fallback is
  the specified design and the paid option is a documented alternative,
  never a requirement.
- **Design honesty.** `scope-v1.md` explicitly states there is no
  requirement for CAPTCHA in the design; abuse protection is production
  implementation work. CAPTCHA therefore appears only where abuse pressure
  is realistic (authentication entry, per `scope-v1`'s production-work
  carve-out), is selected here, and is wired as a staged, owner-approved
  enablement — never as a redesign of approved screens.

The slice is database-change-averse: the specified design prefers
zero-schema-change rate limiting where feasible, and any schema change (the
documented fallback) ships as one forward migration with deny-all exposure
and pgTAP proof, per the working rules.

## Scope

### Rate limiting — primary design (zero schema change)

- **Authentication surfaces** are rate limited first by the platform:
  Supabase Auth's built-in per-identity and per-IP send/verify limits
  (configurable on the existing staging project, no schema change, no new
  dependency) are enabled at values recorded in the implementation plan.
  This is the primary OTP brute-force and email-flood control; the
  application must not reimplement it.
- **Application-request limiting** uses fixed-window counters in a
  server-side in-process store **only as a best-effort first layer** — the
  implementation plan must state plainly that per-instance counters are
  probabilistic across Railway's multi-instance deployments, and must pair
  them with one durable authoritative layer below.
- **Authoritative durable layer (zero-schema option):** a free-tier managed
  key-value store (e.g. Upstash free tier or an equivalent) holding
  fixed-window counters keyed by bounded identifiers — route family plus a
  coarse key (hashed IP prefix for anon traffic; internal user id for
  authenticated traffic). Keys contain no raw tokens, addresses, or
  secret URLs. If the owner declines an external free-tier dependency, the
  **documented fallback** is one new private-schema counter table
  (`private.rate_limit_windows`, no client grants, SECURITY DEFINER
  read/increment, one forward migration with pgTAP privilege tests and a
  bounded indexed cleanup) — selected in the implementation plan and
  reviewed as a schema change, not slipped in.
- **Limited envelope (bind to 006c):** the coordinator's existing
  at-most-eight-envelope inventory is itself an abuse control and is
  re-tested here under adversarial rates: sustained raw-landing traffic
  from one coarse key must never exhaust the envelope budget of other
  browsers (keys are per-browser/coarse-network, never global) and must
  receive the uniform unavailable recovery, not a distinguishing error.
- **Limits** (exact numbers pinned in the implementation plan, chosen
  generously for real friend groups and hostile to scripts): raw invitation
  landings per coarse key, OTP sends and verifies per identity and per
  coarse key, extraction attempts per authenticated user, and email-worker
  enqueue rate per group. Every limit's response is the **existing generic
  state** for that surface (006c unavailable; 004c/004d recovery classes;
  005e manual fallback), never a new error that distinguishes rate limiting
  from invalid input, and never any enumeration oracle.
- **Resend budget guard:** the email worker (009a) enforces its own send
  ceiling under the Resend free-tier quota, failing closed with
  `rate_limited` category logging (identifiers only) rather than burning
  the monthly quota against an enqueue storm.

### CAPTCHA selection (free/low-cost, decided here)

- **Selection: Cloudflare Turnstile** — free, no payment, privacy-friendly
  (no image challenges), and natively supported by Supabase Auth captcha
  protection, which covers the highest-risk surface (OTP send/verify) with
  the smallest integration. **Fallback if Turnstile is unavailable at
  enablement time:** hCaptcha's free tier, with the same Supabase Auth
  integration point. No paid CAPTCHA is required anywhere in v1.
- Turnstile runs in **non-intrusive managed mode only**; no puzzle UI, no
  redesign of the approved 004c email-entry or 006c invitation-auth
  screens, no visual-baseline change beyond the unavoidable presence of
  the invisible/managed widget, which is reviewed as a documented
  difference requiring product/design approval.
- **Staged enablement:** the site key is public by nature; the secret lives
  only in server-side secure configuration (never in client bundles,
  fixtures, commits, logs, or screenshots). Enablement on staging is an
  owner-approved gate; production enablement is Phase 8 item 4 territory
  and is out of scope here.
- **Failure posture:** an unavailable or degraded CAPTCHA provider must
  **fail closed for new OTP sends** on staging only while the flag is on,
  with the existing generic recovery classes — and the implementation must
  document the operational risk honestly. A kill switch (server
  configuration) restores delivery without a deploy; the kill switch is
  itself an owner-controlled setting, and its use is logged with
  identifiers and coarse categories only.

### Abuse controls

- **Link extraction (005e):** per-user rate limiting plus the existing
  allowlist/timeouts; a flood of extraction attempts degrades to the
  manual-entry fallback for that user, never to a server-wide outage, and
  never bypasses the SSRF boundary (which is 005e's, unchanged).
- **Invitation token guessing:** the 006c uniform-unavailable design is the
  control; this slice adds the rate limiter that makes brute force
  computationally and economically unattractive, and a test proving that
  repeated guessing receives the byte-identical unavailable response at
  any attempt count up to the limiter's threshold and beyond it.
- **Account-enumeration resistance:** limiter responses on auth surfaces
  reuse the existing non-enumerating recovery classes; no timing, status,
  copy, or header difference reveals whether an address exists.
- **Write-path integrity:** rate limiting is a secondary defense; every
  database-level invariant from 006a/006c/007c/008c (locks, CAS, one-use,
  generations, tombstones) remains the authority. No limiter can be
  bypassed into a state where a database invariant depends on it.
- **Observability:** maintainer-facing structured logs with identifiers and
  coarse categories only (route family, limiter outcome, coarse key class
  — never raw keys that could embed tokens/addresses, never request
  bodies). No new PostHog event; the tracking plan is untouched; abuse
  telemetry is infrastructure, not product analytics.

## Non-goals

- **Phase 8 item 4 — production environment, domain, sender DNS, backups,
  launch checklist — is explicitly out of scope** of this planning mission;
  no brief is drafted for it and no production enablement is authorized
  here.
- No WAF, paid bot management, IP blocklists maintained by hand, or
  device fingerprinting.
- No CAPTCHA on group creation, wishlist editing, reactions, reservations,
  or any authenticated product surface — authenticated users are already
  bounded by the database invariants and per-user limiters.
- No redesign of approved screens; no visual-baseline change beyond the
  reviewed managed-widget presence on the auth entry screen.
- No new analytics event and no tracking-plan change.
- No change to 006a/006c/007c/008c database contracts; the envelope
  inventory, CAS guards, and lock orders are consumed, not modified.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Platform auth limits (configuration evidence).** Supabase Auth
   send/verify limits are enabled on the staging project at the plan-pinned
   values, with configuration evidence (values, no secrets) recorded; a
   synthetic exceedance receives the existing generic recovery with no
   enumeration signal.
2. **Authoritative limiter (tests).** The durable fixed-window limiter
   enforces each pinned limit exactly: the Nth allowed request succeeds and
   the N+1th within the window receives the surface's generic failure; a
   new window restores access; concurrent increments cannot exceed the
   window. If the zero-schema option is chosen, no migration exists; if
   the fallback table is chosen, it ships with the full REVOKE/GRANT and
   deny-all pgTAP inventory and bounded cleanup, mirroring 009a's
   `email_outbox` posture.
3. **Uniform-denial and no-enumeration proof (tests).** Rate-limited
   responses are byte-identical to the surface's invalid-input response
   (status, body, headers) for: raw invitation landings, OTP sends and
   verifies, and extraction attempts — including a sustained guessing
   campaign against a synthetic token, which receives the identical
   unavailable state at every attempt count and never a distinguishing
   limiter error.
4. **Envelope safety under load (tests).** Sustained raw-landing traffic
   from one coarse key never exceeds, evicts, or competes with another
   browser's eight-envelope inventory; per-key isolation is asserted, and
   a global-keyed implementation fails the test by construction.
5. **CAPTCHA selection and staging enablement (conditional, owner-gated).**
   Turnstile (or the documented hCaptcha fallback) is integrated with
   Supabase Auth captcha protection on OTP send/verify only; the secret is
   provably absent from client bundles, fixtures, commits, logs, and
   screenshots (automated scan); the kill switch restores delivery without
   a deploy (staging test); approved screens carry no redesign and
   visual-baseline deltas are limited to the reviewed widget presence.
   **Enablement is conditional on the owner restoring the staging
   credentials (broken since 2026-09-29) and is an explicit owner action
   item — never silently skippable and never a reason to weaken criteria
   1–4 or the automated suites, which pass without live CAPTCHA by testing
   against a stubbed provider verifier.**
6. **Extraction and email-bound degradation (tests).** Extraction flood
   from one user degrades that user to the manual fallback while other
   users are unaffected and the SSRF boundary is intact; the 009a worker's
   quota guard fails closed with `rate_limited` category logging and
   identifiers only.
7. **Database invariants remain authoritative (pgTAP unchanged).** All
   existing pgTAP suites, race harnesses, and negative authorization tests
   pass unchanged on the same head; no limiter state, flag, or middleware
   can create, reveal, or resurrect any state the database forbids
   (assignment secrecy, reservation owner-blindness, tombstone semantics,
   envelope cap).
8. **Log hygiene and analytics.** Automated scans over limiter logs, test
   artifacts, and error reports find no raw token, address, secret URL,
   request body, or provider payload; the event catalog test asserts no
   new PostHog event and an untouched tracking plan.
9. **Delivery evidence and rollback.** `pnpm verify`, the CI database job,
   and all stack-gated suites pass on the exact head; rollback notes
   document disabling each control without a deploy where feasible
   (kill switch, owner configuration) and state that the fallback counter
   table, if chosen, is dropped in dependency order; if the zero-schema
   option ships, rollback is configuration-only and says so.

## Required proof

- Test evidence per criterion above on the exact reviewed head; limiter
  concurrency tests with bounded runtimes in CI; the byte-identical-denial
  comparisons committed as transcripts; the secret-scan output; staging
  enablement evidence only if the owner credential gate has closed
  (recorded as blocked-on-owner otherwise, with no weakened substitute).
- A Railway preview exercising the auth entry screen with the managed
  widget at both approved viewports, reviewed as a documented difference;
  no other UI change.

## Dependencies

- 006c (raw landing, envelope inventory, uniform-unavailable recovery) and
  004c/004d (recovery classes) must be merged; 009a's worker quota-guard
  contract is consumed when merged and stubbed in planning otherwise.
- 005e (extraction boundary) and the 006a/007c/008c database invariants
  are consumed, never modified.
- Planning may complete before these merge; implementation cannot start
  until the approved exact brief commit is linked to its Linear issue and
  the dependencies are complete.

## Analytics, security, and privacy

- No new analytics event; the typed catalog and tracking plan are
  untouched. Abuse telemetry is maintainer-facing. Limiter keys are coarse
  (hashed prefixes, internal user ids) and are themselves excluded from
  logs at identifier granularity. Rate limiting never substitutes for
  server-side authorization; every database invariant remains the
  authority, per the permissions matrix's required negative tests.

## Implementation plan and gates

1. Pin limits and select the durable limiter option (zero-schema vs
   fallback table) with the owner's dependency preference recorded;
   document the multi-instance caveat of in-process counters.
2. Implement the limiter middleware and per-surface wiring; add the
   uniform-denial, envelope-safety, and concurrency suites.
3. Integrate Turnstile with Supabase Auth captcha protection behind the
   staging kill switch; add the stubbed-verifier test path so all
   automated suites are credential-independent.
4. **Staging enablement gate:** owner-approved, conditional on restored
   credentials, staging resources only. Production enablement belongs to
   Phase 8 item 4 and is excluded here.

## Planning status

Brief only. No implementation, configuration change, cloud change, Linear
change, or merge is authorized by this document.

**Explicit owner action items:** (1) restore staging credentials (broken
since 2026-09-29) before any live CAPTCHA or platform-limit evidence;
(2) confirm the limiter option preference (free-tier external KV vs
private-schema fallback table); (3) confirm Turnstile (with hCaptcha
fallback) as the v1 CAPTCHA and the auth-only surface scope.
