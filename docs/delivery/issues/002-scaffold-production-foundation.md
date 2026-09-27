# 002 — Scaffold the production foundation

## Outcome

Create the smallest production-grade Next.js foundation that builds, tests, and deploys predictably without implementing product features.

## Scope

- Next.js App Router, strict TypeScript, pnpm, linting, formatting, and production build.
- Semantic design-token shell and accessible base layout.
- Vitest, React Testing Library, Playwright, accessibility checks, and one deterministic visual fixture.
- Local Supabase configuration, empty migration baseline, seed command, and database-test command.
- GitHub CI, Railway configuration, and a non-sensitive `/health` endpoint.
- Typed analytics adapter with a no-network development/test sink and PostHog production adapter boundary.

## Non-goals

- No real authentication, database product schema, or email delivery.
- No production landing page implementation.
- No PostHog replay until staging masking is verified.

## Acceptance criteria

- `pnpm verify` performs format check, lint, typecheck, unit tests, and production build.
- Playwright can render one deterministic reference route at mobile and desktop viewports.
- `/health` returns liveness without exposing secrets or querying dependencies.
- Environment variables are documented in `.env.example`; no secret is committed or exposed to the browser.
- Analytics calls are typed, prohibited free-form properties cannot compile, and tests observe events without a network request.
- CI runs the same verification commands used locally.
- A Railway preview deploys successfully from the issue branch.

## Required proof

- Passing local and CI verification output.
- Railway preview URL and health check.
- Mobile and desktop fixture screenshots.
- Dependency rationale in the pull request.
- PostHog adapter tests showing allowed properties only.

## Design reference

Use `DESIGN.md`; this issue establishes tokens and primitives, not final screen fidelity.

## Analytics

Infrastructure only; no product event is emitted.

