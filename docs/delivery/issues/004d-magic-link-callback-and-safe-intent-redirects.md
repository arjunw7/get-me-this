# 004d — Magic-link callback and safe intent redirects

## Outcome

Let users complete the same email sign-in by clicking the emailed link, with
the session created only after an explicit user action, no open redirects, and
no authentication material left in URLs, logs, analytics, or replayable
client-readable storage.

## The recorded design gate from 004c (resolved by this brief)

004c pins the emailed link to the exact form
`https://get-me-this-staging.up.railway.app/auth/confirm?token_hash={{ .TokenHash }}&type=email`
and requires `/auth/confirm` to **never verify on GET** (an email-scanner
prefetch must not consume the one-time token) and to **redirect to a clean URL
before rendering substantive content or running analytics**. 004c therefore
deliberately discards the query and left open — as a recorded 004d design
gate — *how the token hash survives the clean-URL redirect until the user
explicitly chooses to verify*. This brief is that resolution.

### Carriage decision: a one-shot app-owned link cookie set on GET (recommended; owner sign-off required)

- **GET `/auth/confirm?token_hash=...&type=...` never verifies and never
  consumes.** It only *parks* the hash: it validates the query server-side
  (present, non-empty `token_hash`; `type` from the closed set actually
  emitted by the 004c email templates — `email` per the pinned URL form,
  extended only if staging review proves the magic-link template's token
  requires `magiclink`; every other value rejected to recovery, never an
  error leak), and if valid sets the **link cookie**, then issues the same
  clean 302 to `/auth/link` that 004c ships — `Cache-Control: no-store` and
  HTTP `Referrer-Policy: no-referrer` on the redirect response itself,
  query never logged, no substantive content, no analytics.
- **The link cookie mirrors the approved 004c carry-cookie pattern:**
  app-owned, HttpOnly, Secure, SameSite=Lax, scoped to `Path=/auth`,
  never proof of identity by itself, validated server-side on every read,
  value a base64url envelope (`tokenHash`, `type`, `issuedAt`) like the
  existing carry cookie. **Owner decision required:** 004c's brief calls the
  token hash *authentication material*, so this brief flags one open choice —
  (a) the plain base64url envelope, consistent with the approved carry
  cookie, which also stores PII (the email) un-obfuscated but HttpOnly; or
  (b) additionally sealing the value with a server-only secret
  (authenticated encryption) so the cookie jar never holds a readable hash,
  at the cost of one new server-side secret in local `.env` and Railway.
  Recommendation: **(a)** — HttpOnly means the value is not JS-readable, and
  with the single-use deletion below the exposure is equivalent to the
  approved carry cookie, while (b) adds a new secret and config surface for
  marginal gain. The owner
  ruling is recorded here before code starts.
- **One-shot carriage:** the explicit verify action deletes the link cookie
  on the **first attempt regardless of outcome** (success, provider failure,
  or crash-safe degradation). The provider's one-time token semantics
  remain the authoritative replay guard; cookie deletion is defense in
  depth so the hash cannot be re-carried after the first verify attempt.
- **The clean `/auth/link` page is a server component** that reads only the
  *presence and validity* of the link cookie server-side to render the
  honest choice state: an explicit, accessible control — **"Use my sign-in
  link"** — alongside the path back to code entry. No hash in props, no
  hash in client bundles, no JavaScript-readable storage. Without a valid
  link cookie it renders the approved missing/expired recovery state. Copy
  changes from the 004c interim screen get owner side-by-side review
  (ARJ-23 acceptance).

### Why the alternatives were rejected

- **URL fragment carriage** (`/auth/link#token_hash=...`): fragments are
  never sent to the server, so the verify server action would need
  client-side JS to lift the hash into the POST, making verification
  JS-dependent and persisting authentication material in browser history.
- **Keeping the hash in the query until the click:** contradicts the 004c
  gate — the URL must be clean before substantive content and analytics,
  and query strings leak into history, referrers, and screenshots.
- **A server-side pending-verification store (DB or in-memory):** adds
  schema or statefulness that the one-time Supabase token already provides;
  the cookie carries the hash to the same server that will verify it.

## Scope

- **Verification action (explicit user action only):** the
  "Use my sign-in link" control fires a server action that reads and
  deletes the link cookie, validates it server-side (shape, closed `type`
  enum, checked expiry), and calls `verifyOtp` with the carried
  `token_hash` and `type` on the server client. No GET path, no automatic
  prefetch, and no route ever calls `verifyOtp` without this action.
- **Session equivalence:** link verification uses the same standard
  `@supabase/ssr` cookie storage as the six-digit code path, so successful
  link and code verification create equivalent session behavior, proven by
  test. The response that establishes the session is `no-store`. Failed or
  reused links create no session and cannot bypass onboarding or
  protected-route checks.
- **Intent and safe redirects:** the link carries no intent. The verify
  action resolves the destination server-side from the 004c carry cookie's
  approved intent (`home`/`wishlist`/`create-group`) when present, else
  defaults to `home`. Resolution uses an explicit, tested **intent-to-route
  table of server-defined routes only** — unbuilt `wishlist`/`create-group`
  intents resolve to the honest authenticated `/home` with no claim that a
  wishlist or group was created. Redirect targets are never constructed from
  user input.
- **Expiry:** the link cookie's `MaxAge` comes from a **named server-side
  configuration constant** (`AUTH_LINK_CARRY_MAX_AGE_SECONDS`) aligned with
  the provider's configured OTP expiry — the same pattern as the 004c
  resend countdown — and is checked against the wall clock on every read.
  An expired cookie renders the approved expired recovery state with the
  resend path. When cookie and provider expiry disagree, the provider
  response is authoritative and maps into the same closed generic error
  set as 004c; neither state claims success.
- **Replay protection:** a second click (double-click, back-button, or a
  re-carried cookie) finds no link cookie and renders the honest
  already-used/missing recovery state; if the cookie somehow survives, the
  consumed provider token fails and maps to the same recovery. No path
  replays into a second session.
- **Generic responses and no leakage:** public status codes, bodies, and
  copy do not distinguish new vs returning users; provider errors map into
  004c's closed generic message set; the token hash, email, and auth
  errors never appear in URLs after the initial GET, logs, analytics,
  replay files, or committed PR evidence.
- **Cross-device honesty:** clicking the link on a device without the
  carry cookie still verifies (Supabase's token hash does not need the
  email) and lands on authenticated `/home`. The screen copy never promises
  a carried intent it cannot honor.

## Non-goals

Invitation acceptance; arbitrary post-login return URLs; wishlist/group
creation; onboarding, protected routes, and session restoration (004e);
Google login; production rollout; any change to the 004c email templates or
the pinned link URL form.

## Acceptance criteria

- **Carriage tests (unit):** GET sets the link cookie only from a valid
  query (present hash, `type` in the closed enum) and always issues the
  clean no-store/no-referrer 302; the cookie payload's server-side
  validation rejects absent, malformed, wrong-`type`, and expired
  payloads; the verify action deletes the cookie on the first attempt
  regardless of outcome.
- **GET-safety tests:** a GET (or scanner HEAD/prefetch) creates no
  session, does not consume the token (the six-digit code still verifies
  afterward), sets no JavaScript-readable state, and is non-cacheable with
  `Referrer-Policy: no-referrer` on the redirect response.
- **Replay/expiry tests:** double-click and back-button replays render the
  already-used/missing recovery state with no second session; an expired
  link cookie and an expired provider token each render the expired
  recovery state with the resend path; a cookie older than the named
  constant is rejected by the server-side read.
- **Redirect-safety tests (the ARJ-23 bypass corpus):** the intent-to-route
  table rejects external URLs, protocol-relative URLs (`//evil.example`),
  encoded bypasses (`%2F%2F`, `\/`, mixed-case schemes), backslash tricks,
  and unexpected intent values — each resolving to a server-defined route
  or recovery, never to attacker-controlled input.
- **Session-equivalence e2e (local, Mailpit):** new and returning staging
  users complete sign-in by link click on both email paths (new-user
  confirmation and returning-user magic link): request → read the email →
  click the link → explicit verify → session exists; the equivalent code
  path still works from the same email; sign-out (004c) clears it.
- **Failure e2e:** expired, reused, malformed, and missing links create no
  session and cannot reach onboarding or protected routes; every failure
  state has accessible recovery back to code entry or resend.
- **No-leakage assertion:** request logs, analytics payloads, screenshots,
  and committed evidence never retain the `token_hash` query value; a test
  asserts analytics events from `/auth/link` carry no URL parameters.
- **Copy/visual:** the changed `/auth/link` states are compared
  side-by-side against the approved static baselines at the same route,
  viewport, and content fixture, and get owner review before merge
  (ARJ-23 acceptance).

## Required proof

- Local test transcripts (unit + Mailpit-based e2e including the failure
  corpus), `pnpm verify` green.
- Real staging link clicks on both email paths proving: clean redirect,
  explicit-action verification, session equivalence with the code path,
  no consumption on GET/prefetch, and no session on failure or replay.
- The owner's recorded ruling on the cookie-envelope choice above, and
  side-by-side copy review, before merge.
- Sanitized notes only: no addresses, codes, token hashes, or secret URLs.

## Dependencies

004c (ARJ-22) working and accepted — this issue's code does not start
before that. Parent tracker ARJ-19. The repository brief governs if the
Linear draft differs.

## Planning status

Brief only. ARJ-23 stays in Backlog until this brief is owner-approved at
its exact commit and 004c is working and accepted; no branch, code, remote
configuration, or Factory implementation before that gate.
