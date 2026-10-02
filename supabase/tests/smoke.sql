-- Infrastructure smoke test for the 002d local Supabase foundation,
-- amended by the reviewed 004a profiles migration, the reviewed 005a
-- wishlist migration, and the reviewed 006a group security model.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- This suite asserts foundation-level facts only. It makes three explicit,
-- reviewed concessions to the product schema: public.profiles is expected
-- to exist (004a; see docs/delivery/issues/004a-profiles-schema-grants-rls-
-- and-tests.md), public.wishlists and public.wishlist_items are
-- expected to exist alongside it (005a; see docs/delivery/issues/005a-
-- wishlist-schema-grants-rls-and-tests.md), and public."groups",
-- public.group_members, public.group_invitations,
-- public.group_invitation_uses, and public.audit_events are expected to
-- exist alongside those (006a; see docs/delivery/issues/006a-group-security-
-- model.md), together with exactly the one synthetic fixture user seeded by
-- supabase/seed.sql, its trigger-created profile and wishlist, and its
-- three fixture items. It still fails if the baseline migrations were not
-- applied or if any other application table or seeded row appears without a
-- reviewed migration.

begin;

select plan(18);

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

-- 4. Exactly the nine reviewed application tables exist in public:
--    profiles (004a) plus wishlists and wishlist_items (005a) plus the five
--    006a group tables plus the 006b group_creation_receipts table. Any
--    other public table means an unreviewed schema change. (Deliberate,
--    reviewed amendment of the 002d assertion "no application tables exist"
--    and of the 004a/005a/006a counts; see those briefs and 006b.)
select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  9,
  'only the reviewed public tables (profiles, wishlists, wishlist_items, groups, group_members, group_invitations, group_invitation_uses, audit_events, group_creation_receipts) exist in the public schema'
);

select has_table(
  'public',
  'profiles',
  'public.profiles is the reviewed identity table'
);

select has_table(
  'public',
  'wishlists',
  'public.wishlists is the reviewed 005a wishlist table'
);

select has_table(
  'public',
  'wishlist_items',
  'public.wishlist_items is the reviewed 005a wishlist_items table'
);

select has_table(
  'public',
  'groups',
  'public.groups is the reviewed 006a group table'
);

select has_table(
  'public',
  'group_members',
  'public.group_members is the reviewed 006a membership history table'
);

select has_table(
  'public',
  'group_invitations',
  'public.group_invitations is the reviewed 006a invitation table'
);

select has_table(
  'public',
  'group_invitation_uses',
  'public.group_invitation_uses is the reviewed 006a invitation-use table'
);

select has_table(
  'public',
  'audit_events',
  'public.audit_events is the reviewed 006a append-only audit table'
);

-- 5. Local authentication infrastructure is present in the stack.
select ok(
  to_regclass('auth.users') is not null,
  'auth.users exists in the local stack'
);

-- 6. Exactly the one synthetic fixture user from supabase/seed.sql was
--    seeded, with its trigger-created profile and wishlist and its fixture
--    items — and nothing else. (Deliberate, reviewed amendment of the 002d
--    assertion "no user rows were seeded"; see the 005a brief.)
select is(
  (select count(*)::int from auth.users),
  1,
  'exactly one user row was seeded'
);

select is(
  (select email from auth.users),
  'wishlist-fixture@example.invalid',
  'the seeded user is the synthetic .invalid fixture'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'
  ),
  1,
  'the fixture user''s trigger-created profile exists'
);

select is(
  (
    select count(*)::int
    from public.wishlists
    where owner_id = '00000000-0000-4000-8000-000000000001'
  ),
  1,
  'the fixture user''s trigger-created wishlist exists'
);

select is(
  (
    select count(*)::int
    from public.wishlist_items
    where owner_id = '00000000-0000-4000-8000-000000000001'
  ),
  3,
  'exactly the three fixture wishlist items were seeded'
);

select *
from finish();

rollback;
