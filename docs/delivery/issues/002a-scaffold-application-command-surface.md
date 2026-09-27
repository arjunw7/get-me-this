# 002a — Scaffold the application and command surface

## Outcome

Create the smallest deployable Next.js application with one deterministic command surface that every later issue can rely on.

## Scope

- Next.js App Router with strict TypeScript and pnpm.
- Repository scripts for formatting, linting, type-checking, unit tests, and production build.
- A `pnpm verify` command that runs the deterministic checks available in this slice.
- A minimal root layout and non-product reference route.
- Environment-variable documentation with no secrets.

## Non-goals

- No production landing page, authentication, database schema, email, analytics provider, or final design primitives.
- No dependency added only for a later phase.
- No Magic Patterns source copied into the production application.

## Acceptance criteria

- A clean checkout installs with pnpm and starts the application using documented commands.
- Strict TypeScript, formatting, linting, unit tests, and the production build all run through `pnpm verify`.
- The reference route renders without relying on network data, clock time, randomness, or private environment variables.
- Missing optional service configuration does not prevent local development or the production build.
- `.env.example` documents names and purpose without containing credentials.

## Required proof

- Passing `pnpm verify` output from a clean installation.
- Production build output and a screenshot of the deterministic route.
- Dependency rationale in the pull request.

## Dependencies

- Frozen V18 baseline on `main`.

## Design, analytics, security, and privacy

- Use semantic placeholders only; final fidelity is outside this issue.
- Emit no product analytics.
- Expose no secrets or privileged credentials to browser code.
