# ARJ-21 (004a) evidence — profiles schema, grants, RLS, and tests

Implementation evidence for the binding repository brief
[004a-profiles-schema-grants-rls-and-tests.md](https://github.com/arjunw7/get-me-this/blob/24541c9/docs/delivery/issues/004a-profiles-schema-grants-rls-and-tests.md)
(planning commit `24541c9`). Branch `auth/arj-21-profiles-schema`, cut from
`main` at `24541c9`. Documentation-only in `docs/`: no product code, no UI
changes, no staging or production mutation.

## What was delivered

- `supabase/migrations/20260928090000_profiles.sql` — forward-only migration:
  `public.profiles` (PK on the auth-user id, `display_name`/`avatar_path`
  nullable, UTC timestamps), `SECURITY DEFINER` signup trigger
  `public.handle_new_user()` (empty `search_path`, fully qualified names),
  `BEFORE UPDATE` trigger `public.set_profiles_updated_at()` setting
  `updated_at = clock_timestamp()`, idempotent backfill for pre-existing
  users, explicit grants (anon: none; authenticated: SELECT plus
  column-limited UPDATE on `display_name`/`avatar_path`; no client
  INSERT/DELETE), EXECUTE revoked from `PUBLIC`, `anon`, and
  `authenticated` on both trigger functions (owner-reviewed correction,
  commit `d822a70`; trigger-function EXECUTE is checked at `CREATE TRIGGER`
  time, not at firing, so no client role needs it), RLS enabled with
  owner-only SELECT/UPDATE policies.
- `supabase/tests/profiles.sql` — 47-assertion pgTAP suite (schema shape,
  trigger creation, signup-failure safety, owner access, cross-user denial,
  enumeration denial, non-granted-column denial, anon denial, function
  privilege denials and owner retention for both trigger functions,
  clock-bounded `updated_at` behavior, backfill idempotency, 1:1
  invariant).
- `supabase/tests/smoke.sql` — assertion 4 amended as the brief requires:
  the "no application tables exist" assertion becomes "only the reviewed
  `public.profiles` exists in the public schema" (plan 6 → 7). Explicit
  weakening-with-scope, not a silent edit.

## Verification

Environment: local Supabase stack in Docker on this machine; the suites run
with `pnpm test:db` (`supabase test db --local`). CI runs `pnpm verify` only
and has no Docker database, so database proof is this local evidence.

### Fresh local reset and test pass — `arj21-reset-test.txt`

`pnpm db:reset` rebuilds the database from committed migrations alone
(baseline + `20260928090000_profiles.sql`), then `pnpm test:db` runs both
suites: 54 tests, 0 failures. Regenerated on the final head after the
owner-requested EXECUTE-revoke correction.

### Function-privilege regression demonstration — `arj21-privilege-regression.txt`

Grants EXECUTE back to `authenticated` on both trigger functions and
re-runs the suite: exactly the two new `has_function_privilege` assertions
fail (tests 30 and 33), proving the privilege checks catch the regression.
A fresh `pnpm db:reset` then restores the revoked state and the full suite
passes again (54 tests, `Result: PASS`).

### Deliberate negative-test failure demonstration — `arj21-negative.txt`

A temporary suite `_negative-demo.sql` asserted a deliberately wrong
expectation (profile count 99) and the run failed as expected; the temporary
file was then removed and the suite re-verified green. The suite detects
regressions rather than passing unconditionally.

### Grants and RLS inventory — `arj21-grants.txt`

Queried against the migrated local database:

- `anon`: no privileges of any kind.
- `authenticated`: table-wide SELECT; UPDATE on `display_name` and
  `avatar_path` only. No INSERT, DELETE, or timestamp/id privileges.
- `service_role` / `postgres`: privileged server-side roles only, as the
  stack defines them; no service-role credential is exposed to client code
  (`.env.example` keeps `SUPABASE_SERVICE_ROLE_KEY` server-only).
- RLS enabled; policies `profiles_select_own` and `profiles_update_own`
  (`auth.uid() = id`, UPDATE also `with check`).
- Trigger-function EXECUTE: only the function owner (`postgres`) and the
  privileged `service_role` hold EXECUTE on `handle_new_user` and
  `set_profiles_updated_at`; `PUBLIC`, `anon`, and `authenticated` hold
  none.
- Triggers: `on_auth_user_created` on `auth.users`,
  `profiles_set_updated_at` on `public.profiles`.

## Acceptance criteria cross-check

- Fresh `pnpm db:reset` rebuilds from committed migrations; `pnpm test:db`
  passes — see `arj21-reset-test.txt`.
- 1:1 invariant proven across PK + trigger + backfill, including
  backfill idempotency and orphan assertions in both directions —
  `profiles.sql` sections 2, 10, 11.
- Trigger hardening and failure-blocks-signup proven — `profiles.sql`
  sections 2 and 10 (`42P01` forced by renaming the table; no orphan
  `auth.users` row).
- Least privilege and negative authorization tests — `profiles.sql`
  sections 3–9; `arj21-grants.txt`.
- Trigger-function EXECUTE revoked from `PUBLIC`, `anon`, and
  `authenticated`, owner retains it — `profiles.sql` section 7;
  `arj21-grants.txt` (function EXECUTE privileges);
  `arj21-privilege-regression.txt`.
- `updated_at` database-managed via `clock_timestamp()`, bounded between
  in-transaction clock readings, later edit at or after the earlier one,
  client cannot set it — `profiles.sql` sections 4 and 5.
- Smoke-test change explicit and reviewed — this README and the diff.
- Deliberate negative-test failure demonstration — `arj21-negative.txt`.

## Migration deployment and forward-fix/rollback notes

- Migrations are forward-only (`supabase/README.md`); this migration is
  never edited after being applied anywhere. Schema corrections arrive as a
  new reviewed migration.
- Rollback means forward-fix, not down-migrations. If the profiles schema
  ever had to be withdrawn, that is a new reviewed migration, not a
  reversal of this file.
- **Staging rollout is intentionally not part of this issue.** Applying this
  migration to the staging Supabase project is the owner-owned staging gate
  defined in the brief; it must close (with evidence recorded on ARJ-21)
  before 004b exercises Supabase Auth against staging. 004a itself performs
  no remote mutation.

## Out of scope / non-goals honored

No avatar upload/selection UI, no wishlist/group tables, no application
Supabase client code (004c), no email delivery (004b), no staging or
production mutation, no new dependencies. `pnpm verify` passes
(format check, lint, typecheck, unit tests, production build).
