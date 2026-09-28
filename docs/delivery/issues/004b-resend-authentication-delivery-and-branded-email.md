# 004b — Resend authentication delivery and branded email

## Outcome

Make the email-only Supabase Auth entry flow deliver a trustworthy branded
message to a real test inbox from isolated staging, carrying both a six-digit
code and a magic link where the supported template permits, without exposing
credentials or token material and without claiming completed authentication.

## Scope

- **Delivery path:** Resend SMTP as the proposed delivery mechanism for
  Supabase Auth on the **staging project only**, following the Supabase Resend
  SMTP guide. The combined code-plus-link email is treated as feasible and
  testable, because Supabase message templates expose both `{{ .Token }}` (the
  six-digit code) and `{{ .TokenHash }}` (for the magic link) in the same
  template; implementation must verify this against the actual staging
  template and record the result.
- **Owner actions (required up front):** create/own the Resend account, verify
  the sender domain and publish its DNS records (SPF/DKIM as applicable), and
  place the SMTP credentials into the staging project's secure configuration.
  The brief separates these owner actions from agent-executable steps.
- **Agent-executable steps (each owner-approved, staging only):** configure
  Resend SMTP in staging Supabase Auth settings; review and customize the
  branded auth template to carry both token and link; configure the site URL
  and callback redirect allowlist pointing at the staging `/auth/confirm`
  route per `docs/flows/authentication.md`.
- Secrets live only in secure configuration: never in the repository, CI
  artifacts, logs, Railway PR previews, or pull-request bodies.
- Documentation deliverable: sender identity, DNS records, SMTP configuration
  procedure, rate/quotas, bounce and delivery-failure observability,
  preview/staging boundaries, and rollback procedure. Production settings are
  not changed by this task.

## Staging gate dependency

004b may configure and test delivery only after the **004a staging gate is
closed**: the reviewed profiles migration applied to staging with the owner
approval and evidence recorded on ARJ-21. 004b's tests create real staging
auth users, and those users must receive profile rows from the deployed 004a
trigger before any Supabase Auth behavior is exercised.

## Proof boundary — delivery, not authentication

- A real test inbox receives the branded staging email from the expected
  sender.
- The six-digit code is present, and the magic link resolves to the staging
  `/auth/confirm` route; both are inspected in the test inbox without
  publishing the code, link, or token anywhere.
- Failed delivery is observable to maintainers while the public request
  response stays generic and reveals no account-existence information.
- **Not required or claimed:** completing a sign-in via code or link. The
  magic-link callback is not real until 004d. End-to-end OTP verification is
  reserved for 004c and magic-link sign-in for 004d.
- Code, link, and token material are excluded from URLs beyond the exchange,
  logs, analytics, and pull-request evidence.

## Non-goals

- No verification UI, onboarding, completed sign-in, production sender
  rollout, bulk/transactional mail, or production auth configuration changes.

## Required proof

- Test-inbox evidence of the branded staging email (sender, code presence,
  link destination) with token material redacted.
- Staging template verification result for the combined token-plus-link
  content.
- Delivery-failure observability demonstration (maintainer-visible,
  public-safe).
- The delivery/rollback documentation deliverable.
- Confirmation that the 004a staging gate closed before staging auth testing
  began (link to the ARJ-21 approval comment).

## Dependencies

- ARJ-17 pilot approval (recorded on ARJ-7); this brief approved and linked at
  its exact commit on ARJ-20.
- **004a staging gate closed** (owner-approved profiles migration deployment
  to staging, recorded on ARJ-21). 004c follows 004a, 004b, and the closed
  gate.

## Analytics, security, and privacy

None. No PostHog events; no credentials, addresses, codes, or tokens committed
or logged.
