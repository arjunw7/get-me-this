# 004a — Profiles schema, grants, RLS, and tests

## Outcome

Give each authenticated user a durable profile without exposing another user's
data, reproducible from an empty local database, with the 1:1
profile-per-user invariant enforced by the schema and proven by tests.

## Scope

- One forward-only migration creating `public.profiles` per
  `docs/architecture/data-model.md`: `id uuid PRIMARY KEY REFERENCES
  auth.users(id) ON DELETE CASCADE`, `display_name text` (nullable: null means
  an incomplete profile until onboarding sets it), `avatar_path text` nullable,
  `created_at`/`updated_at timestamptz` UTC. `created_at` is set at insertion;
  **`updated_at` is database-managed**: a `BEFORE UPDATE` trigger on
  `public.profiles` sets `updated_at = now()` on every row update, because a
  column default fires only on insert and never on later profile edits. The
  trigger function follows the same hardening rules (empty `search_path`,
  fully qualified names). No client role receives any privilege on either
  timestamp column.
- Profile creation for new users via a `SECURITY DEFINER` trigger function on
  `auth.users` insert, following the Supabase-recommended pattern. The trigger
  function must set an empty `search_path` and use fully qualified table names
  (`auth.users`, `public.profiles`).
- **Pre-existing users:** the migration backfills `INSERT INTO public.profiles
  (id) SELECT id FROM auth.users ON CONFLICT DO NOTHING` after trigger
  creation, so users that already exist when the migration runs also get a
  row. Staging is expected to have no existing users at gate time; if any
  exist, the backfill result count is recorded in the gate evidence.
- **The 1:1 invariant is not claimed from the trigger alone.** It rests on
  three mechanisms together: the primary key on `profiles.id` (the auth-user
  id) guarantees at most one row per user; the trigger guarantees a row for
  every new user; the backfill guarantees a row for every user that predates
  the migration. Tests assert the invariant end-to-end, including migration
  order (backfill present in the same migration as trigger creation).
- Least-privilege grants and RLS: `anon` receives no privileges;
  `authenticated` receives SELECT and a **column-limited UPDATE on
  `display_name` and `avatar_path` only** (`id`, `created_at`, `updated_at`
  are never client-updatable); no INSERT or DELETE grant for client roles; RLS
  enabled with owner-only SELECT and UPDATE policies (`auth.uid() = id`);
  service-role credentials remain server-only. Cross-user reads, cross-user
  updates, and enumeration must fail (per
  `docs/architecture/permissions-matrix.md`). Member-visible profile access is
  deferred to the Phase 5 groups slice and noted here, not implemented.
- pgTAP suite `supabase/tests/profiles.sql` (transaction-wrapped, ends with
  rollback): own-profile read and update pass; unauthenticated/anon SELECT and
  UPDATE denied; cross-user read and update denied; trigger creates exactly
  one row per new `auth.users` insert; **trigger failure blocks the signup
  transaction** (a forced trigger failure leaves no orphaned `auth.users` row,
  per the Supabase signup-failure warning); update attempts on non-granted
  columns fail; **`updated_at` is database-managed** (an owner edit through
  the granted columns advances `updated_at`, while a client attempt to set
  `updated_at` directly fails and cannot overwrite the database-set value);
  **backfill behavior** (a simulated pre-trigger user receives
  exactly one profile row, and re-running the backfill is idempotent); and an
  invariant assertion that no `auth.users` row lacks a profile and no
  `profiles` row lacks a user.
- Deliberate, reviewed update of `supabase/tests/smoke.sql` assertion 4:
  `public.profiles` becomes the first application table in `public`, so the
  assertion changes from "no application tables exist" to "only `profiles`
  exists and no unexpected public tables appeared." This is an explicit
  weakening-with-scope, recorded in the pull request — not a silent edit.

## Non-goals

- No avatar upload/selection UI, wishlist/group tables, or real email
  delivery.
- No application Supabase client code (that is 004c).
- No staging or production mutation from this issue. Staging deployment is the
  separate owner gate below; 004a itself is local-only.

## Staging gate — deployment of this migration is not part of 004a

Applying the reviewed profiles migration to the **staging** Supabase project
is an explicit gate that must close **before 004b exercises Supabase Auth
against staging**. 004c must not carry it, because 004c depends on 004b.

- **Owner:** the product owner (Arjun Wadhwa) approves and triggers the
  deployment. It is a single owner-approved operation applying the committed
  migration to the staging project only (never production) — no dashboard SQL,
  no hand-edited schema.
- **Evidence that the gate passed:**
  1. The staging migration ledger records the 004a migration version as
     applied.
  2. Verification query output against staging showing `public.profiles`
     exists with RLS enabled, the expected grants and trigger are present, and
     every existing staging auth user (if any) has a profile row.
  3. An owner approval comment on ARJ-21 linking the exact migration commit
     and this evidence.
- The gate is closed only when that approval comment exists. 004b's staging
  auth testing may not begin before then.

## Acceptance criteria

- Fresh `pnpm db:reset` rebuilds the schema from committed migrations alone;
  `pnpm test:db` passes.
- Every new and pre-existing `auth.users` row has exactly one `profiles` row,
  proven by tests across PK + trigger + backfill, not asserted from the
  trigger alone.
- The trigger function is `SECURITY DEFINER` with empty `search_path` and
  fully qualified names; trigger failure blocks signup.
- `anon` has no access; `authenticated` can select and update only its own row
  and only the granted columns; cross-user access and enumeration fail; no
  client INSERT/DELETE; no service-role key in client code.
- `updated_at` advances on every owner edit through a database-managed
  mechanism; a client cannot set it directly, proven by test.
- The smoke-test change is explicit and reviewed.

## Required proof

- Local `pnpm db:reset` and `pnpm test:db` transcripts, including the
  deliberate negative-test failure demonstration (CI runs `pnpm verify` only
  and has no Docker database, so DB proof is local evidence attached to the
  pull request).
- Grants and RLS inventory for `profiles`.
- Migration deployment and forward-fix/rollback notes in the pull request.

## Dependencies

- ARJ-17 pilot approval (recorded on ARJ-7) and this brief approved and linked
  at its exact commit on ARJ-21.
- May be specified in parallel with 004b. The staging gate above gates 004b's
  staging auth testing; 004c depends on 004a, 004b, and a closed gate.

## Analytics, security, and privacy

None. Synthetic data only; no credentials, tokens, or personal data committed.
