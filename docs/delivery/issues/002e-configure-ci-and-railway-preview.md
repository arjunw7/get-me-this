# 002e — Configure CI and Railway preview deployment

## Outcome

Turn every pull request into deterministic verification evidence and a reviewable deployment.

## Scope

- GitHub CI using the same committed commands as local development.
- Dependency caching without bypassing lockfile integrity.
- Railway preview configuration.
- A non-sensitive `/health` liveness endpoint.
- Documentation for required environment variables and preview verification.

## Non-goals

- No production release automation or custom domain.
- No dependency-health checks in `/health`.
- No secret values committed to GitHub or Railway configuration files.

## Acceptance criteria

- CI runs install plus `pnpm verify` from a clean environment.
- A failing verification command blocks CI.
- A pull request receives a Railway preview that serves the deterministic route.
- `/health` returns a successful liveness response without querying external services or exposing configuration.
- Preview verification steps can be completed without repository write access.

## Required proof

- Green CI link and one intentionally observed failing check or equivalent test evidence.
- Railway preview URL, `/health` response, and mobile/desktop fixture screenshots.
- Environment and deployment notes in the pull request.

## Dependencies

- `002a-scaffold-application-command-surface.md`.
- Integrates the verification commands delivered by 002c and 002d when those children are merged.

## Analytics, security, and privacy

- Emit no product events.
- Preview logs and health responses must contain no secrets or personal data.
