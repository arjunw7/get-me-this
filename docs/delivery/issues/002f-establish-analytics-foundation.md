# 002f — Establish the analytics foundation

## Outcome

Create a typed, privacy-safe analytics boundary so later features cannot emit arbitrary or sensitive PostHog payloads.

## Scope

- Typed event catalog and analytics adapter.
- No-network development and test sink.
- PostHog production adapter boundary behind environment configuration.
- Consent and privacy defaults.
- Tests for event names, required properties, and prohibited properties.

## Non-goals

- No production product events.
- No session replay until staging masking is explicitly verified.
- No user-generated content, email address, invitation token, product URL, or wishlist text in analytics.

## Acceptance criteria

- Unknown event names and unsupported properties fail TypeScript compilation.
- Tests can observe emitted events without a network request.
- Analytics is inert when required public configuration is absent.
- Server-only secrets cannot be referenced by client analytics code.
- Privacy exclusions from `docs/analytics/tracking-plan.md` are represented in types or tests where practical.
- `pnpm verify` passes.

## Required proof

- Type-level and runtime adapter tests.
- Demonstration that development/test execution makes no PostHog request.
- Documented boundary for enabling PostHog in staging and production.

## Dependencies

- `002a-scaffold-application-command-surface.md`.

## Design, security, and privacy

- No visible UI is required.
- Data minimization is mandatory; analytics is not an authorization or application-state system.
