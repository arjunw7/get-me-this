# 004c — Email request and OTP verification

## Outcome

Turn the approved static email-entry and verification screens into a real
Supabase email-code flow for new and returning users, with a session created
only on successful verification and no account-existence information
intentionally disclosed publicly.

## Scope

- **New dependencies: `@supabase/ssr` and, if the setup requires it,
  `@supabase/supabase-js`** (Supabase's Next.js guide documents installing
  both). Justification in the pull request per repository rules; no other new
  dependencies. **The standard `@supabase/ssr` cookie scheme is used as-is:
  Supabase's session cookies are not required to be HttpOnly, because the
  browser client needs cookie access to maintain the session.**
- **Two Supabase clients from one typed factory in `src/supabase/`:** a
  browser client and a server client, both configured from
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only.
  No service-role key in any client code.
- **Session-refresh proxy and caching:** this app is Next.js 16, so the proxy
  is **`proxy.ts` exporting a `proxy` function** (not `middleware.ts`), per
  the Supabase SSR setup. It maintains the session (refreshing expired
  tokens, redirecting signed-out users away from authenticated data access).
  The proxy matcher must cover the auth Server Action requests — Next.js
  notes a matcher can accidentally exclude Server Actions — and this is
  proven by test. Every response that sets or clears session or carry
  cookies is non-cacheable (`Cache-Control: no-store` on the relevant
  actions and proxied auth responses) — cached Set-Cookie responses can
  leak sessions; this too is proven by test.
- **Email request (server action on `/auth`):** client-side validation, then
  a server action performs `signInWithOtp` (email-only, no password) with
  `emailRedirectTo` **derived from a trusted, environment-specific
  server-side allowlist** (the same origin configuration that backs the
  Supabase `uri_allow_list`), never a hard-coded staging URL and never
  client input. The approved intent enum (`home`/`wishlist`/`create-group`)
  is preserved exactly as parsed today; no arbitrary destinations.
- **Carry cookie (owner decision, 2026-09-28):** the email and approved
  intent travel from `/auth` to `/auth/verify` in a short-lived, app-owned
  HttpOnly cookie — marked `Secure` and `SameSite`, set by the server
  action, **validated server-side (format-checked email, intent from the
  closed enum, checked expiry), never treated as proof of identity**, and
  cleared on **explicit cancel or flow restart, successful verification,
  and expiry**. Beyond this cookie, the flow uses **no JavaScript-readable
  storage**, and the email and intent never appear in URLs, logs, or
  analytics. (The Supabase session cookies are exempt per the standard
  scheme above.)
- **Emailed link is non-consuming (owner reviews, 2026-09-28):** the
  004b email's `{{ .ConfirmationURL }}` points at Supabase's verification
  endpoint, which may consume the one-time token and return session
  material. In 004c the **two staging email templates are updated** —
  `mailer_templates_confirmation_content` (new-user confirmation) and
  `mailer_templates_magic_link_content` (returning-user magic link) — so
  the link in both is built from the trusted destination plus
  `{{ .TokenHash }}` in the exact form
  `https://get-me-this-staging.up.railway.app/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  — never the Supabase endpoint — so clicking it cannot consume the
  token, invalidate the code, or create a session. In 004c that route
  renders the **honest interim state** (no false "signed in", no endless
  loading, a clear not-yet message with a path back to code entry). This
  URL format is also the permanent design, with one additional constraint
  from 004d onward: **the route never verifies the token on GET** — an
  email scanner prefetching the link must not consume the token — so
  004d's verification requires an **explicit user action** (a control on
  the page firing a server action) before `verifyOtp` is called. Proof is
  a **real staging link click on both paths** (new user and returning
  user): the link lands on the interim state, the six-digit code still
  verifies afterward (no consumption), and no session is created by the
  click.
- **The token hash is authentication material (owner review,
  2026-09-28):** the `token_hash` query value is not the six-digit code
  but is still authentication material. The `/auth/confirm` route must
  respond **non-cacheable (`Cache-Control: no-store`)** with a
  **`Referrer-Policy: no-referrer`** header or meta policy, and must
  **redirect to a clean URL (the query stripped) before rendering
  substantive content or running analytics**. Request logs and committed
  evidence must never retain the query value.
- **Resend countdown (owner decision, 2026-09-28):** the displayed countdown
  is a UI reflection of the configured provider limit — **sourced from a
  named server-side configuration constant read by the verify screen
  server-side**, since Supabase's repeat-request limit is configurable and
  the provider's response remains authoritative. A too-early resend renders
  the accessible over-limit recovery state whatever the button or clock
  say. The countdown and recovery paths are tested with the button enabled
  and with a manipulated clock. The static 0:30 fixture remains only for
  deterministic fixture capture and tests.
- **Verification (`/auth/verify`):** six-digit `verifyOtp` from a server
  action using the carried email; wrong, expired, reused, and missing codes
  render the approved error/expired states with accessible recovery.
  Successful verification creates the authenticated session via the
  standard `@supabase/ssr` cookie storage; failed verification creates
  none.
- **Generic public responses (testable form):** there is **no intentional
  distinction in public status code, body, or copy between new and
  returning users, and no account-specific provider error is passed
  through** — provider errors map to a closed set of generic user-facing
  messages. Over-limit (429) and delivery-failure paths have their own
  honest recovery copy.
- **Success boundary and sign-out (owner decision, 2026-09-28):** after a
  successful verify, the verify screen shows an approved "signed in" state
  with a **minimal sign-out action** — a server action calling
  **`signOut({ scope: 'local' })`** (local scope: it clears this browser's
  session and does not revoke other devices' sessions), clearing the
  session, no-store — because 004c creates persistent sessions while the
  full account menu, protected routes, and session restoration remain in
  004e. No navigation to routes that don't exist yet. The local scope is
  asserted by test.
- **Copy honesty (owner correction, 2026-09-28):** the on-screen copy
  promises **the working code flow only** — e.g., "No password. We'll send
  you a secure code to sign in." It does **not** invite use of the email's
  sign-in link, whose callback is not complete until 004d.
- **No email addresses, codes, or auth errors in URLs, logs, analytics,
  replay, or PR evidence.**

## Non-goals

Magic-link callback handling (004d); the full account menu, onboarding,
protected routes, session restoration (004e); wishlist/group actions;
Google login; production rollout.

## Acceptance criteria

- Unit/component tests: validation; intent parsing and preservation;
  countdown sourced from the named server-side constant; generic error
  mapping (no account-specific provider error passes through);
  carry-cookie set/read/clear on explicit cancel or restart, successful
  verification, and expiry; server-side validation of cookie contents.
- **Proxy tests:** the `proxy.ts` matcher covers the auth Server Action
  requests; cookie-setting responses carry `Cache-Control: no-store`.
- Local e2e against the local Supabase stack using its built-in Mailpit
  inbox to read the OTP deterministically: request → read code → verify →
  session exists; sign-out clears it; wrong, expired, reused, and
  over-limit paths recover safely — the over-limit path exercised with the
  resend control enabled and the countdown clock manipulated, proving the
  provider response is authoritative.
- The interim `/auth/confirm` link behavior is proven by **real staging
  link clicks on both email paths** (new-user confirmation and
  returning-user magic link): the link (built from the trusted destination
  plus `{{ .TokenHash }}`, in the exact specified form, never Supabase's
  verification endpoint) lands on the honest not-yet state, the six-digit
  code still verifies afterward (the token was not consumed), and the
  click creates no session. The route responds `no-store` with a
  no-referrer policy and redirects to a clean URL before rendering
  substantive content or running analytics; request logs and committed
  evidence never retain the `token_hash` query value.
- `emailRedirectTo` is derived from the environment-specific server-side
  allowlist in all environments, including local tests.
- Isolated staging rehearsal for a fresh and a returning user completing
  the full request-verify loop, including sign-out.
- A session exists after successful verification and is cleared by
  sign-out; sign-out is local-scoped (other-device sessions are not
  revoked by this minimal control); **no new session after failure in an
  initially signed-out browser**.
- Approved visual states stay matched; the copy changes (real code-flow
  promise, reflected countdown) are reviewed side-by-side against the
  approved baselines before merge.

## Required proof

- Local test transcripts (unit + Mailpit-based e2e), `pnpm verify` green,
  sanitized staging rehearsal notes with no addresses, codes, or tokens.
- Railway staging environment has the two `NEXT_PUBLIC_*` variables set
  (deployment prerequisite; flagged in the PR).
- Dependency rationale for `@supabase/ssr` (and `@supabase/supabase-js` if
  installed).
- Copy-change side-by-side for owner approval before merge.

## Dependencies

004a profiles (Done, staging gate closed) and 004b delivery (Done). Parent
tracker ARJ-19. This brief governs if the Linear draft differs.
