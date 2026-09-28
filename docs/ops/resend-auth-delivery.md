# Resend authentication delivery (staging)

Operational notes for the Supabase Auth email delivery path used by the
identity slice (004b). This configuration exists on the staging Supabase
project only; production keeps the platform default sender until a separate,
owner-approved rollout.

## Sender identity

- Sending domain: `getmethis.fun`, verified in Resend (owner-confirmed).
- DNS: the SPF and DKIM records published at the DNS host are the ones shown
  on the Resend domain-verification page for this domain (SPF include and
  DKIM selector TXT records). Re-verify status in the Resend dashboard,
  Domains, before debugging delivery problems.
- From address: `hello@getmethis.fun` (sender name "Arjun Wadhwa").
- The one email-only sign-in flow means one branded message design for both
  new and returning users; Supabase renders the confirmation template for
  first sign-ups and the magic-link template for returning users, and both
  templates are identical in this project.

## SMTP configuration (Supabase Auth)

- Provider: Resend SMTP, per the Supabase Resend SMTP guide.
- Host `smtp.resend.com`, port `465`, user `resend`, credential stored only
  in the staging project's auth configuration. The credential is never
  committed, logged, screenshotted, or placed in pull-request bodies.
- Templates (branded, table-based HTML using the design-token palette):
  - Subject: `Your Get Me This sign-in code` (both confirmation and
    magic-link).
  - Both templates carry the six-digit code (`{{ .Token }}`) and the signed
    link (`{{ .ConfirmationURL }}`, which embeds the token hash) in one
    message.
- `site_url`: the staging Railway service; `uri_allow_list` contains exactly
  one entry: `<staging-origin>/auth/confirm*`. No wildcard patterns that
  would allow other Railway apps to receive redirects.

## OTP and expiry

- `mailer_otp_length`: 6 (six-digit input, per the approved design).
- `mailer_otp_exp`: 3600 (one hour); the template copy states the same.
- One code and one link per message; each can be used once. A newer request
  supersedes an older unverified token (an older email link then fails
  safely to the error state).

## Rate limits and quotas

- Supabase: `rate_limit_email_sent` 30 per minute per project;
  `smtp_max_frequency` 60 seconds per user between sends.
- Resend free tier: roughly 2 requests per second and a daily email cap;
  confirm current numbers on the Resend billing page before any rehearsal
  that sends more than a handful of messages. Staging rehearsals use a
  single test inbox and a handful of synthetic users.

## Delivery failure observability

- Bounces and failed deliveries are visible in the Resend dashboard
  (maintainer-observable). The public API response is always generic: a
  request for an undeliverable address returns an empty `200` body, revealing
  nothing about account existence or delivery outcome (see
  `docs/delivery/evidence/arj-20/`).
- Supabase Auth logs show send attempts and errors; identifiers only — no
  tokens or full email bodies.

## Preview and staging boundaries

- The staging Supabase project backs Railway staging and PR-preview
  environments. Preview-specific mail testing uses the same staging project;
  no per-preview email providers exist.
- Production is a separate future configuration. Nothing in this setup
  touches production settings, and no production domain or keys are
  referenced here.

## Rollback

- To disable Resend delivery, turn off the custom SMTP configuration in the
  Supabase dashboard (Auth → SMTP); Supabase falls back to its built-in
  sender. Re-enabling repeats the documented SMTP settings.
- Templates revert by pasting the previous template bodies in the dashboard;
  the branded bodies in this setup are plain HTML with inline styles and no
  external dependencies.
- Revoking the Resend SMTP credential stops delivery immediately; users see
  the generic recovery states. No stored state depends on Resend.
