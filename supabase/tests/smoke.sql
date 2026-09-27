-- Infrastructure smoke test for the 002d local Supabase foundation.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- This suite asserts foundation-level facts only. It deliberately makes no
-- claim about product schema, because no product schema exists yet. It is
-- expected to fail if the baseline migration was not applied or if application
-- tables or seeded rows appear without a reviewed migration.

begin;

select plan(6);

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

-- 4. No application schema was introduced by the baseline.
select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  0,
  'no application tables exist in the public schema'
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
