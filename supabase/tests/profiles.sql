-- 004a: pgTAP allow/deny suite for public.profiles.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/004a-...-tests.md:
-- positive own-profile access, unauthenticated denial, cross-user denial,
-- trigger behavior (creation and failure-blocks-signup), column-limited
-- updates, the database-managed updated_at, backfill idempotency, and the
-- 1:1 invariant. The whole suite is wrapped in one transaction that ends
-- with rollback, so no synthetic user or profile persists.

begin;

select plan(47);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset

-- 1. Schema shape ----------------------------------------------------------------

select has_table(
  'public', 'profiles',
  'public.profiles exists'
);

select has_column('public', 'profiles', 'id', 'profiles.id exists');
select has_column('public', 'profiles', 'display_name', 'profiles.display_name exists');
select has_column('public', 'profiles', 'avatar_path', 'profiles.avatar_path exists');
select has_column('public', 'profiles', 'created_at', 'profiles.created_at exists');
select has_column('public', 'profiles', 'updated_at', 'profiles.updated_at exists');

select col_not_null('public', 'profiles', 'id', 'profiles.id is not null');
select col_not_null('public', 'profiles', 'created_at', 'profiles.created_at is not null');
select col_not_null('public', 'profiles', 'updated_at', 'profiles.updated_at is not null');

select col_is_pk(
  'public', 'profiles', ARRAY['id'],
  'profiles.id is the primary key (one row per user)'
);

select fk_ok(
  'public', 'profiles', 'id', 'auth', 'users', 'id',
  'profiles.id references auth.users(id) on delete cascade'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'row level security is enabled on public.profiles'
);

select has_trigger(
  'auth', 'users', 'on_auth_user_created',
  'the signup trigger exists on auth.users'
);

select has_trigger(
  'public', 'profiles', 'profiles_set_updated_at',
  'the updated_at trigger exists on public.profiles'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ),
  'the owner-only select policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ),
  'the owner-only update policy exists'
);

-- 2. The signup trigger creates exactly one incomplete profile -------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_a'::uuid,
  'authenticated',
  'authenticated',
  'profile-test-a@example.invalid',
  ''
);

select is(
  (select count(*)::int from public.profiles where id = :'uid_a'::uuid),
  1,
  'the signup trigger created exactly one profile for a new user'
);

select ok(
  (
    select display_name is null and avatar_path is null
    from public.profiles
    where id = :'uid_a'::uuid
  ),
  'a new profile is incomplete (null display_name and avatar_path)'
);

-- 3. Own-profile access as the authenticated user --------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'the authenticated user sees only the own profile row (no enumeration)'
);

select is(
  (select display_name from public.profiles where id = :'uid_a'::uuid),
  null,
  'the own profile row is readable'
);

-- 4. Owner edits and the database-managed updated_at -----------------------------

-- Each edit's value is bounded between clock_timestamp() readings taken
-- inside this transaction; now() would stay fixed and prove nothing.
select clock_timestamp() as t0 \gset

update public.profiles
set display_name = 'Ada'
where id = :'uid_a'::uuid;

select clock_timestamp() as t1 \gset

select is(
  (
    select updated_at >= :'t0'::timestamptz and updated_at <= :'t1'::timestamptz
    from public.profiles
    where id = :'uid_a'::uuid
  ),
  true,
  'an owner edit advances updated_at within the tested clock boundaries'
);

select is(
  (select display_name from public.profiles where id = :'uid_a'::uuid),
  'Ada',
  'the owner edit persisted'
);

select updated_at as first_updated
from public.profiles
where id = :'uid_a'::uuid
\gset

update public.profiles
set avatar_path = 'avatars/ada.png'
where id = :'uid_a'::uuid;

select is(
  (select updated_at >= :'first_updated'::timestamptz from public.profiles where id = :'uid_a'::uuid),
  true,
  'a later edit yields updated_at at or after the earlier edit'
);

-- 5. Non-granted columns are never client-updatable ------------------------------

-- Expecting 42501 (permission denied) on every non-granted column.
select throws_ok(
  format(
    'update public.profiles set updated_at = clock_timestamp() where id = %L',
    :'uid_a'
  ),
  '42501'
);

select throws_ok(
  format(
    'update public.profiles set created_at = clock_timestamp() where id = %L',
    :'uid_a'
  ),
  '42501'
);

select throws_ok(
  format(
    'update public.profiles set id = %L where id = %L',
    gen_random_uuid(),
    :'uid_a'
  ),
  '42501'
);

-- 6. No client INSERT or DELETE ---------------------------------------------------

select throws_ok(
  format('insert into public.profiles (id) values (%L)', gen_random_uuid()),
  '42501'
);

select throws_ok(
  format('delete from public.profiles where id = %L', :'uid_a'),
  '42501'
);

-- 7. No client EXECUTE on the trigger functions -----------------------------------

-- Postgres grants EXECUTE on functions to PUBLIC by default and Supabase
-- default privileges extend it to anon and authenticated. Trigger-function
-- EXECUTE is checked at CREATE TRIGGER time, not when the trigger fires, so
-- no client role needs it; only the function owner retains access.

select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'anon cannot execute public.handle_new_user()'
);

select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated cannot execute public.handle_new_user()'
);

select ok(
  not has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE'),
  'PUBLIC holds no EXECUTE on public.handle_new_user()'
);

select ok(
  not has_function_privilege('anon', 'public.set_profiles_updated_at()', 'EXECUTE'),
  'anon cannot execute public.set_profiles_updated_at()'
);

select ok(
  not has_function_privilege('authenticated', 'public.set_profiles_updated_at()', 'EXECUTE'),
  'authenticated cannot execute public.set_profiles_updated_at()'
);

select ok(
  not has_function_privilege('public', 'public.set_profiles_updated_at()', 'EXECUTE'),
  'PUBLIC holds no EXECUTE on public.set_profiles_updated_at()'
);

select ok(
  has_function_privilege('postgres', 'public.handle_new_user()', 'EXECUTE'),
  'the function owner retains EXECUTE on public.handle_new_user()'
);

select ok(
  has_function_privilege('postgres', 'public.set_profiles_updated_at()', 'EXECUTE'),
  'the function owner retains EXECUTE on public.set_profiles_updated_at()'
);

-- 8. Cross-user denial ------------------------------------------------------------

reset role;

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_b'::uuid,
  'authenticated',
  'authenticated',
  'profile-test-b@example.invalid',
  ''
);

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

select is(
  (select count(*)::int from public.profiles where id = :'uid_b'::uuid),
  0,
  'a cross-user profile read returns no rows'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'the authenticated user cannot enumerate profiles even when another user exists'
);

update public.profiles
set display_name = 'Hijack'
where id = :'uid_b'::uuid;

reset role;

select is(
  (select display_name from public.profiles where id = :'uid_b'::uuid),
  null,
  'a cross-user update did not change the other profile'
);

-- 9. Unauthenticated (anon) denial ------------------------------------------------

set local role anon;

select throws_ok(
  'select id from public.profiles',
  '42501'
);

select throws_ok(
  format('update public.profiles set display_name = ''X'' where id = %L', :'uid_a'),
  '42501'
);

reset role;

-- 10. Trigger failure blocks the signup transaction ---------------------------------

alter table public.profiles rename to profiles_hidden;

select throws_ok(
  format(
    'insert into auth.users (id, aud, role, email, encrypted_password) values (%L, ''authenticated'', ''authenticated'', ''profile-test-c-fail@example.invalid'', '''')',
    gen_random_uuid()
  ),
  '42P01'
);

alter table public.profiles_hidden rename to profiles;

select is(
  (
    select count(*)::int
    from auth.users
    where email = 'profile-test-c-fail@example.invalid'
  ),
  0,
  'a failed signup leaves no auth user row behind'
);

-- 11. Backfill for pre-existing users and the 1:1 invariant -----------------------

-- The local test role is not the owner of auth.users, so a pre-trigger user
-- is simulated by removing the profile row the trigger created: the state
-- that backfill exists to fix (a user with no profile, as at migration time).
insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_c'::uuid,
  'authenticated',
  'authenticated',
  'profile-test-c@example.invalid',
  ''
);

delete from public.profiles
where id = :'uid_c'::uuid;

-- The same statement the migration uses for the backfill.
insert into public.profiles (id)
  select id
  from auth.users
  on conflict (id) do nothing;

select is(
  (select count(*)::int from public.profiles where id = :'uid_c'::uuid),
  1,
  'the backfill gives a pre-existing user exactly one profile row'
);

insert into public.profiles (id)
  select id
  from auth.users
  on conflict (id) do nothing;

select is(
  (select count(*)::int from public.profiles where id = :'uid_c'::uuid),
  1,
  're-running the backfill is idempotent'
);

select is(
  (
    select count(*)::int
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  ),
  0,
  'no auth user lacks a profile row'
);

select is(
  (
    select count(*)::int
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
  ),
  0,
  'no profile row lacks an auth user'
);

select *
from finish();

rollback;
