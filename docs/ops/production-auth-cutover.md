# Production authentication cutover

This runbook accompanies the 4 October 2026 production sign-in bug report.
It does not assert that any hosted setting has been inspected or changed.

## Confirmed application failure

The previous trusted email-redirect allowlist omitted https://getmethis.fun.
Requests and resends from that host returned the generic unavailable state before
Supabase signInWithOtp ran. Add exactly https://getmethis.fun/auth/confirm as
that origin's trusted destination. Do not replace the allowlist with an arbitrary
request URL. APP_ORIGIN alone does not populate the authentication allowlist.

## Owner-managed hosted configuration

1. Check which Supabase project the live Railway service uses. Public Supabase URL
   and publishable/anon key must belong to that intended project. Do not delete a
   project called staging solely because of its name: the earlier delivery notes
   recorded a single shared project. Account/data migration is a separate task.
2. In that project's Authentication URL Configuration, set Site URL to
   https://getmethis.fun and add the exact redirect URL
   https://getmethis.fun/auth/confirm. Keep any still-used development/staging
   callbacks until their retirement is verified. The www host should redirect to
   the canonical host; it is not added as a second authentication origin here.
3. In Authentication email SMTP settings, verify custom SMTP is enabled. For the
   existing Resend path use smtp.resend.com, port 465, username resend, and a valid
   Resend API key as the password. Verify the key permits the selected sender
   domain. Sender email can remain hello@getmethis.fun when that domain is
   verified; sender name is owner-managed. Template copy is not SMTP configuration.
4. In Resend, confirm getmethis.fun is verified for sending. Publish the exact
   DNS record names/values shown for that domain in Resend at Namecheap. Do not
   blindly copy the historical apex-SPF example in the staging notes or replace
   unrelated website/inbound-mail records. Keep click tracking disabled for auth
   links. Supabase's built-in mail service is restricted and is not a production
   replacement for custom SMTP.
5. Check both Confirm signup and Magic Link templates (new and returning users).
   Preserve {{ .Token }} and the existing token-bearing link mechanism; changing
   branding must not replace the verification link with a plain homepage URL.
   The documented template uses {{ .ConfirmationURL }}. If a custom link using
   {{ .TokenHash }} is intentionally used, it must retain the app's existing
   /auth/confirm contract. Do not publish tokens or full email contents in logs.
6. Set Railway APP_ORIGIN=https://getmethis.fun for canonical links and deploy the
   reviewed code fix. This setting alone does not fix the missing auth entry.
7. Test one new and one existing account with owner-approved inboxes, respecting
   the resend cooldown. Verify code delivery, OTP sign-in, then a separately
   issued email link. Check Supabase Auth logs and Resend delivery events if a
   request reaches the provider but does not arrive. Record error codes/statuses,
   never keys, codes, bearer links or email bodies.

Retiring a staging web hostname does not require changing a working email sender
at the root domain. Retiring staging infrastructure/keys requires a separate
inventory of live dependencies before removal.

## Canonical www redirect

The application redirects requests whose Host is exactly www.getmethis.fun to
https://getmethis.fun, using a permanent 308 redirect at the start of the request
proxy. Paths and query parameters survive, including invitation, public wishlist,
and email-confirmation links. The redirect sets no cookies, and uses no-store and
no-referrer headers because those links can contain private identifiers. Local,
staging, preview, apex and lookalike hosts do not match. Forwarded host headers
cannot trigger this rule. Browser fragments are not sent to the server.

Before deploying this behavior, add www.getmethis.fun to the same Railway service
and replace Namecheap's www URL Redirect record with the exact CNAME and ownership
TXT records Railway supplies. Wait for ownership verification and HTTPS certificate
issuance. The app cannot redirect HTTPS traffic that never reaches Railway.
Keep the apex domain and existing email-verification records intact.

Verify a www link redirects once to the apex with its path and query intact, then
continues through the ordinary authentication or sharing flow. Production hosting
and DNS configuration remain owner-managed. Reverting the canonical-host proxy change removes the
www redirect without changing DNS.

## Validation and rollout boundaries

Regression tests exercise the real request/resend server actions with an external
Supabase client double: production HTTPS must send with the exact callback and
advance the flow; HTTP, lookalike hosts, arbitrary subdomains and another port
must not send or create carry state. No email is sent by automated tests.

No UI or database schema changes; no visual baseline changes; no Magic Patterns
mock data or editor artifacts. No migration required. Reverting the code change
reinstates the production-origin rejection; hosted settings are not altered by a
code revert. Production SMTP/DNS changes and live delivery remain owner-managed.

## References

- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
- https://resend.com/docs/send-with-supabase-smtp
- https://resend.com/docs/dashboard/domains/introduction

- https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects
- https://docs.railway.com/networking/domains/working-with-domains
