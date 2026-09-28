# ARJ-20 (004b) evidence — Resend authentication delivery and branded email

Evidence for the binding repository brief
`docs/delivery/issues/004b-resend-authentication-delivery-and-branded-email.md`
(planning commit `24541c9`). Configuration-only: no application code, no UI
changes, no production mutation.

Sanitization: this pack contains no credentials, no email addresses (the
owner's test inbox is referenced only as "the owner test inbox"), no OTP
codes, and no link tokens, per the brief's privacy rules.

## What was delivered

- Resend SMTP configured as Supabase Auth's delivery mechanism on the
  **staging project only** (host `smtp.resend.com`, port `465`, credential in
  secure configuration only). Sender domain `getmethis.fun` verified in
  Resend; SPF/DKIM records published per the Resend domain-verification page
  (see `docs/ops/resend-auth-delivery.md`).
- Branded combined templates for confirmation (new users) and magic-link
  (returning users): identical design, subject
  `Your Get Me This sign-in code`, uppercase wordmark with the coral arc,
  borderless body box, six-digit code (`{{ .Token }}`) and sign-in link
  (`{{ .ConfirmationURL }}`) in one message, one-hour expiry copy.
- `mailer_otp_length` set to 6 (six-digit input per the approved design;
  Supabase default was 8).
- `site_url` set to the staging Railway service; `uri_allow_list` contains
  exactly one entry: `<staging-origin>/auth/confirm*`. No broad wildcards.

## Proof

### Configuration verification — `arj20-auth-config.txt`

Read-back of the staging auth configuration after the changes, with the SMTP
credential and all keys redacted. Confirms: SMTP host/port/sender, OTP length
6, both subjects, both templates carrying `{{ .Token }}` and
`{{ .ConfirmationURL }}`, site URL, and the single allowlist entry.

### Real test-inbox delivery — owner-confirmed

Two real sends from staging through Resend SMTP reached the owner test inbox:

1. New-user path (confirmation template) — the request also created the
   staging auth user, whose `public.profiles` row was created automatically
   by the deployed 004a trigger (verified by query: 1 user, 1 profile).
2. Returning-user path (magic-link template) — sent after the 60-second
   per-user SMTP cooldown.

The owner confirmed both emails arrived with: the expected sender, the
branded subject, the wordmark, the six-digit code, and the sign-in button
resolving to the staging `/auth/confirm` route. Screenshots are retained
privately by the owner; per the brief they are not committed, and token
material was never published.

A third send used an explicit allowlisted `email_redirect_to` pointing at the
staging `/auth/confirm` route, confirming the link destination check. The
earlier redirect to the site root with an `#error=...` fragment is the
documented no-`redirect_to` fallback, and an expired/superseded token failing
safely to the error state is expected behavior (a newer request supersedes an
older unverified token).

### Delivery-failure observability — `arj20-delivery-failure.txt`

A request addressed to an undeliverable domain returns the generic empty
`200` response — the public response reveals no account-existence or
delivery information. The resulting bounce is observable to maintainers in
the Resend dashboard.

### Template capability verification

The combined code-plus-link email was treated as feasible per the brief
because Supabase templates expose `{{ .Token }}` and `{{ .TokenHash }}` in
the same template. Verified in practice: `{{ .Token }}` renders the six-digit
code and `{{ .ConfirmationURL }}` (which embeds the token hash) renders the
link, both from the same request. The inbox evidence shows both present in
one message; the separate `{{ .TokenHash }}` variable was not needed.

## Acceptance criteria cross-check

- [x] Real test inbox receives the branded email from staging; code and link
  inspected without publishing tokens.
- [x] No credential, email address, OTP, or link token in the repository, CI
  artifacts, logs, analytics, or this evidence pack.
- [x] Failed delivery observable to maintainers (Resend dashboard) while the
  public response stays generic.
- [x] Staging only: no production auth configuration was changed.
- [x] Documentation deliverable: `docs/ops/resend-auth-delivery.md` (sender,
  DNS, SMTP procedure, quotas, bounce observability, boundaries, rollback).

## Proof boundary

Delivery only, per the brief: no completed sign-in is claimed. End-to-end OTP
verification is 004c; magic-link callback sign-in is 004d.

## Rollback

Documented in `docs/ops/resend-auth-delivery.md`: disable the custom SMTP
configuration to fall back to the Supabase built-in sender, revert template
bodies in the dashboard, or revoke the Resend credential. No stored state
depends on Resend.
