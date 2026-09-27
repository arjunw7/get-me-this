# 002d — Initialize the local Supabase foundation

## Outcome

Make database changes reproducible and authorization-testable before any product schema is introduced.

## Scope

- Local Supabase configuration.
- Empty migration baseline and reproducible reset command.
- Synthetic seed command.
- pgTAP database-test command and one infrastructure smoke test.
- Environment-variable documentation separating public and privileged credentials.

## Non-goals

- No profiles, wishlists, groups, invitations, reactions, reservations, or assignments.
- No production Supabase project mutation.
- No browser use of service-role credentials.

## Acceptance criteria

- A developer can start local Supabase, reset from committed migrations, apply synthetic seeds, and run database tests using documented commands.
- The baseline is reproducible from an empty local database.
- Browser-exposed configuration contains only values intended for public clients.
- The test command fails when its smoke assertion is intentionally broken.
- `pnpm verify` remains usable when local Supabase is not running; database verification has an explicit command.

## Required proof

- Local start, reset, seed, and database-test output.
- Environment-variable inventory with public/server-only classification.
- Forward-fix guidance for future migrations.

## Dependencies

- `002a-scaffold-application-command-surface.md`.

## Analytics, security, and privacy

- Synthetic data only.
- Commit no credentials; document least-privilege and RLS expectations for later schemas.
