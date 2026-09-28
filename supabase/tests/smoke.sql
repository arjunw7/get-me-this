-- Infrastructure smoke test for the 002d local Supabase foundation,
-- amended by the reviewed 004a profiles migration.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- This suite asserts foundation-level facts only. It makes one explicit,
-- reviewed concession to the 004a product schema: public.profiles is now
-- expected to exist (see docs/delivery/issues/004a-profiles-schema-
-- grants-rls-and-tests.md). It still fails if the baseline migration was
-- not applied or if any other application table or seeded row appears
-- without a reviewed migration.

begin;

select plan(7);

-- 1. pgTAP is available in this database, whichever schema it is installed in.
select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'has_table'
  ),
  'pgTAP is available'
);

-- 2. The migration ledger itself exists.
select has_table(
  'supabase_migrations',
  'schema_migrations',
  'migration ledger supabase_migrations.schema_migrations exists'
);

-- 3. The comment-only baseline was applied from committed migrations.
select ok(
  exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260927000000'
  ),
  'baseline migration 20260927000000 is recorded as applied'
);

-- 4. The only application table is public.profiles, introduced by the
--    reviewed 004a migration. Any other public table means an unreviewed
--    schema change. (Deliberate, reviewed amendment of the 002d assertion
--    "no application tables exist"; see the 004a brief.)
select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  1,
  'only the reviewed public.profiles exists in the public schema'
);

select has_table(
  'public',
  'profiles',
  'public.profiles is the reviewed first application table'
);

-- 5. Local authentication infrastructure is present in the stack.
select ok(
  to_regclass('auth.users') is not null,
  'auth.users exists in the local stack'
);

-- 6. The seed wrote no rows, so no synthetic or real user data is persisted.
select is(
  (select count(*)::int from auth.users),
  0,
  'no user rows were seeded'
);

select *
from finish();

rollback;
