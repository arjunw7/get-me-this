# 002g — Analytics consent and production enablement

Linear issue: ARJ-15.

## Outcome

Complete the analytics consent and enablement boundary started in 002f so
PostHog capture and session replay can be turned on in staging, verified for
privacy with synthetic data, and enabled in production only after every gate
passes.

## Scope

- Consent UI: request analytics consent, persist the choice, and honor
  withdrawal (`setAnalyticsConsent` boundary from 002f).
- Persisted consent choice with a defined storage lifetime.
- Staging replay-mask verification with synthetic email, OTP, invitation,
  wishlist, extraction, assignment, and reservation values (the blocking
  gate in `docs/analytics/enabling-posthog.md`).
- Recording sampling, retention, and eligibility configuration.
- Final production enablement decision and rollback plan.

## Non-goals

- No new business events beyond the existing catalog in
  `docs/analytics/tracking-plan.md`.
- No feature flags through PostHog in this issue.
- No weakening of any privacy default from 002f.

## Acceptance criteria

- Production capture cannot begin until consent is granted through shipped UI.
- Consent can be granted, denied, and withdrawn; withdrawal stops capture
  and replay immediately.
- Staging verification evidence shows no prohibited data class in any
  captured payload and correct masking in recorded sessions.
- Sampling, retention, and eligibility are documented and configured.
- `pnpm verify` passes.

## Required proof

- Consent flow tests (grant, deny, withdraw, persistence, logout).
- Staging verification transcript with synthetic values only.
- Review sign-off recording the production enablement decision.

## Dependencies

- `002f-establish-analytics-foundation.md`.

## Design, security, and privacy

- No visible UI is required beyond the consent surface.
- Data minimization is mandatory; analytics is not an authorization or
  application-state system.
