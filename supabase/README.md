# Local Supabase

This directory holds the local Supabase project: `config.toml`, committed
migrations, the synthetic seed, local email templates, and pgTAP database
tests. Everything here is **local only**. No command in this repository links
to, deploys to, or mutates a hosted Supabase project.

## Local email templates

`supabase/templates/` holds the local mirrors of the staging project's
branded sign-in messages (004b) in their 004c form, wired through
`[auth.email.template.*]` in `config.toml`. The local stack's default
template carries a link but no code, so the Mailpit-based local e2e suite
(`pnpm test:e2e:auth`) could not read the six-digit code without them. The
local templates carry `{{ .Token }}` and a link built from the trusted
destination plus `{{ .TokenHash }}`, pointing at this app's non-consuming
`/auth/confirm` route — never Supabase's verification endpoint. Staging
renders the same message shape through the dashboard-hosted templates.
Keep template files world-readable (644): the local mail server reads them
across a container mount.

## Commands

| Command          | Purpose                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm db:start`  | Start the local Supabase stack in Docker.                                                                                      |
| `pnpm db:status` | Show local service URLs and ports. Output contains local API credentials; never paste it into an issue, PR, or committed file. |
| `pnpm db:stop`   | Stop the local stack. Data is retained so the next start is fast.                                                              |
| `pnpm db:reset`  | Rebuild the local database from committed migrations, then run `supabase/seed.sql`. Destructive to local data only.            |
| `pnpm db:seed`   | Apply `supabase/seed.sql` to an already-running local stack without resetting.                                                 |
| `pnpm test:db`   | Run the pgTAP suites in `supabase/tests/` against the local database.                                                          |

`pnpm db:reset` executes the seed automatically (`[db.seed] sql_paths` in
`config.toml`), so reset and seed do not need to be run in sequence. Use
`pnpm db:seed` only when the stack is already running and the database should
not be rebuilt. Use `supabase db reset --local --no-seed` if a seed-free rebuild
is ever needed.

The Supabase CLI is pinned as a dev dependency (`supabase` in `package.json`), so
`pnpm install` gives every developer and CI runner the same version and scripts
never depend on a globally installed binary.

## When Docker or the local stack is unavailable

`pnpm test:db`, `pnpm db:start`, `pnpm db:reset`, and `pnpm db:seed` all require
Docker. Without a Docker daemon they exit non-zero with an explanatory message
and perform no work. This is expected behaviour, not a broken checkout.

`pnpm verify` never touches Supabase: it runs formatting, lint, type-check, unit
tests, and the production build only, and stays usable on a machine with no
Docker, no Supabase stack, and no environment variables. Database verification
happens through the explicit `pnpm test:db` command.

## Migrations are forward-only

- Migrations live in `supabase/migrations/` and are applied in filename order.
- **Never edit a migration that has been applied anywhere.** Applied history is
  immutable; changing it makes local, staging, and production schema diverge
  silently.
- To fix a mistake, add a new migration that moves the schema forward. Rollback
  in this project means forward-fix, not down-migrations. A destructive change
  is expressed as a new reviewed migration, not as a reversal of an old one.
- Committed migrations are the only way schema changes reach any environment.
  No hand-edited schema, no dashboard SQL, no `supabase db push` to a remote
  project from local development.
- Every migration that introduces an exposed table ships with its grants, RLS
  policies, and pgTAP allow/deny tests in the same pull request
  (see `docs/architecture/permissions-matrix.md` and
  `docs/delivery/definition-of-done.md`).
- Every migration pull request states its deployment and rollback/forward-fix
  note.

The current baseline, `migrations/20260927000000_baseline.sql`, is intentionally
comment-only: it records the starting point before any product schema exists.

## Database tests

pgTAP suites live in `supabase/tests/` and run with `pnpm test:db`
(`supabase test db --local`). Each suite wraps its assertions in a transaction
that ends with `rollback`, so tests never persist data.

`supabase/tests/smoke.sql` is the infrastructure smoke test. It asserts that
pgTAP is available, that the migration ledger exists, that the baseline version
was applied, and that no application tables or seeded rows were introduced. It
fails if the foundation regresses.

## Seed data

`supabase/seed.sql` holds synthetic data only and is currently a non-persistent
placeholder. Deterministic fixtures (synthetic users, groups) are added by the
product slice that owns their tables. Never commit real user data, credentials,
tokens, or personal information here.

`pnpm db:seed` refuses to run unless exactly one running container matches this
project, identified by the Docker label
`com.supabase.cli.project=<project_id>` **and** the exact container name
`supabase_db_<project_id>`. It never falls back to an arbitrary `supabase_db_`
container. `scripts/db-seed-selection-test.sh` exercises that selection with a
stubbed `docker`, so it needs no Docker or stack, and it runs on the Bash 3.2
that macOS ships.

## Environment variables

Local stack URLs and keys are produced by `pnpm db:start` and
`pnpm db:status`. Treat them as local development values:

- **Browser-exposed** (`NEXT_PUBLIC_*`): the local API URL and publishable key.
  These are the only Supabase values allowed in client code, and they stay empty
  in `.env.example`.
- **Server-only**: the service-role/secret key, Resend keys, and any other
  privileged credential. Server-only values must never appear in client bundles,
  fixtures, commits, screenshots, logs, or pull-request bodies.

`.env.example` documents the names and classification; it never contains
values. `.env.local` is git-ignored.
