-- Home: pgTAP suite for the authenticated home's my-groups snapshot.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the fast-lane brief "real authenticated home": exact signature and
-- shape, ownership and security attributes (SECURITY DEFINER, honestly
-- STABLE, empty search_path), the one-statement body, the privilege
-- inventory, positive fixtures (an organizer of two groups with deterministic
-- ordering, a joined non-organizer, the group-zone wall clock), negative
-- fixtures for every denial class (invited, removed, outsider, forged JWT
-- actor, anonymous role), and the authorized-empty sentinel for a signed-in
-- user with no groups. Reads never write; the whole suite is wrapped in one
-- transaction that ends with rollback, so no synthetic user, group, or
-- member row persists.

begin;

select plan(22);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset
select gen_random_uuid() as uid_f \gset

-- 1. Shape, ownership, and security attributes --------------------------------

select has_function('public', 'my_groups_snapshot', 'my_groups_snapshot exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_groups_snapshot'
  ),
  1,
  'exactly one overload of my_groups_snapshot exists'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_groups_snapshot'
  ),
  '',
  'the function takes no arguments'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_groups_snapshot'
  ),
  'TABLE(group_id uuid, group_name text, occasion text, '
    || 'occasion_at timestamp without time zone, time_zone text, location text, '
    || 'mode text, joined_member_count bigint, caller_is_organizer boolean)',
  'the return shape is exactly the nine declared columns'
);

select is(
  (
    select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_groups_snapshot'
  ),
  'true:s:search_path=""',
  'the function is SECURITY DEFINER, honestly STABLE (no volatile clock call), with an empty search_path'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_groups_snapshot'
  ),
  'postgres',
  'the function is owned by the trusted non-client database role'
);

-- EXECUTE: granted to authenticated only; revoked from PUBLIC, anon, and
-- service_role.
select is(
  (
    select coalesce(string_agg(rolname, ',' order by rolname), 'none')
    from (
      select r.rolname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
      join pg_roles r on r.oid = g.grantee
      where n.nspname = 'public'
        and p.proname = 'my_groups_snapshot'
        and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
    ) s
  ),
  'authenticated',
  'EXECUTE is granted to authenticated only among PUBLIC and the application roles'
);

-- The body is one data-reading SQL statement: zero embedded separators means
-- no additional statement (and no dynamic SQL) can hide in the body.
select is(
  (
    select (
      select length(body) - length(replace(body, ';', ''))
      from (
        select substring(
          pg_get_functiondef('public.my_groups_snapshot()'::regprocedure)
          from '\$function\$(.*)\$function\$'
        ) as body
      ) b
    )
  ),
  0,
  'the function body is one SQL statement (no embedded statement separator)'
);

-- 2. Unchanged base-table privileges -------------------------------------------

select ok(
  not has_table_privilege('anon', 'public."groups"', 'SELECT')
    and not has_table_privilege('authenticated', 'public."groups"', 'SELECT')
    and not has_table_privilege('service_role', 'public."groups"', 'SELECT')
    and not has_table_privilege('anon', 'public.group_members', 'SELECT')
    and not has_table_privilege('authenticated', 'public.group_members', 'SELECT')
    and not has_table_privilege('service_role', 'public.group_members', 'SELECT'),
  'the projection adds no direct read grant on groups or group_members'
);

-- 3. Fixtures -------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'home-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'home-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'home-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'home-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'home-e@example.invalid', ''),
  (:'uid_f'::uuid, 'authenticated', 'authenticated', 'home-f@example.invalid', '');

-- A named profile for B; the other trigger-created profiles keep their
-- defaults (the home snapshot projects no profile labels).
update public.profiles set display_name = 'Bea Home' where id = :'uid_b'::uuid;

-- as A (organizer): create two fixture groups, oldest first.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select group_id::text as gid1
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Home Fixture One', 'occasion_type', 'diwali', 'occasion_date', '2026-11-07',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '250000', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

select group_id::text as gid2
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Home Fixture Two', 'occasion_type', 'diwali', 'occasion_date', '2026-12-25',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '250000', 'budget_currency', 'INR',
    'mode', 'gift_everyone', 'organizer_participating', true
  )
) \gset

-- Pin the occasion wall clock deterministically in the group's zone and set
-- g1's location.
reset role;
update public."groups"
set occasion_at = '2026-11-07 18:00:00'::timestamp at time zone 'Asia/Kolkata',
    location = 'Dehradun'
where id = :'gid1'::uuid;

-- B joined g1; C is invited to g1; D removed from g1; E never joins; F has
-- no memberships at all (the authorized-empty sentinel).
insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
values (:'gid1'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp(), 1),
       (:'gid1'::uuid, :'uid_c'::uuid, 'invited', false, clock_timestamp(), 1),
       (:'gid1'::uuid, :'uid_d'::uuid, 'removed', false, clock_timestamp(), 1);

-- A helper to switch the session identity to a fixture user.
create or replace function pg_temp.as_user(p_sub uuid) returns void
language plpgsql as $fn$
begin
  execute format('set local "request.jwt.claim.sub" = %L', p_sub::text);
  perform set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_sub::text),
    true
  );
end
$fn$;

-- 4. Positive fixtures -----------------------------------------------------------

set local role authenticated;
select pg_temp.as_user(:'uid_a'::uuid);

-- The organizer sees both of their groups, oldest created first.
select is(
  (
    select array_agg(group_name)
    from public.my_groups_snapshot()
  ),
  array['Home Fixture One','Home Fixture Two'],
  'the organizer sees both groups in deterministic created order'
);

select is(
  (
    select count(*)::int
    from public.my_groups_snapshot()
    where group_id = :'gid1'::uuid
      and caller_is_organizer
      and mode = 'secret_draw'
      and occasion = 'Diwali'
      and location = 'Dehradun'
      and time_zone = 'Asia/Kolkata'
      and joined_member_count = 2
  ),
  1,
  'the organizer''s row for g1 carries the organizer flag, mode, occasion, location, zone, and joined count'
);

select is(
  (
    select count(*)::int
    from public.my_groups_snapshot()
    where group_id = :'gid2'::uuid
      and caller_is_organizer
      and mode = 'gift_everyone'
  ),
  1,
  'the organizer''s row for g2 carries the organizer flag and mode'
);

-- The stored instant is rendered as the group-zone wall clock.
select is(
  (
    select occasion_at::text
    from public.my_groups_snapshot()
    where group_id = :'gid1'::uuid
  ),
  '2026-11-07 18:00:00',
  'occasion_at is the group-zone wall clock'
);

-- A joined non-organizer sees exactly their one group, honestly labelled.
select pg_temp.as_user(:'uid_b'::uuid);
select is(
  (
    select count(*)::int
    from public.my_groups_snapshot()
    where group_id = :'gid1'::uuid
      and group_name = 'Home Fixture One'
      and not caller_is_organizer
      and joined_member_count = 2
  ),
  1,
  'the joined non-organizer sees their one group with the member flag and joined count'
);

select is(
  (
    select count(*)::int
    from public.my_groups_snapshot()
  ),
  1,
  'the joined non-organizer sees exactly one row'
);

-- 5. Denial classes ---------------------------------------------------------------

select pg_temp.as_user(:'uid_c'::uuid);
select is(
  (select count(*)::int from public.my_groups_snapshot()),
  0,
  'an invited member receives zero rows'
);

select pg_temp.as_user(:'uid_d'::uuid);
select is(
  (select count(*)::int from public.my_groups_snapshot()),
  0,
  'a removed member receives zero rows'
);

select pg_temp.as_user(:'uid_e'::uuid);
select is(
  (select count(*)::int from public.my_groups_snapshot()),
  0,
  'an outsider receives zero rows'
);

select pg_temp.as_user('00000000-0000-4000-8000-00000000dead'::uuid);
select is(
  (select count(*)::int from public.my_groups_snapshot()),
  0,
  'a forged JWT actor receives zero rows'
);

-- The anonymous role has no EXECUTE privilege at all; the authenticated
-- role does. (A live role switch to anon would strand the pgTAP assertion
-- helpers themselves, so the denial is proven through the privilege
-- inventory, which is the only gate the runtime error would read.)
select ok(
  not has_function_privilege('anon', 'public.my_groups_snapshot()', 'EXECUTE'),
  'the anonymous role cannot execute the snapshot'
);
select ok(
  has_function_privilege('authenticated', 'public.my_groups_snapshot()', 'EXECUTE'),
  'the authenticated role can execute the snapshot'
);

-- 6. The authorized-empty sentinel --------------------------------------------------

-- A signed-in user with a complete profile and no memberships gets an empty
-- result, never an error.
set local role authenticated;
select pg_temp.as_user(:'uid_f'::uuid);
select is(
  (select count(*)::int from public.my_groups_snapshot()),
  0,
  'a signed-in user with no groups receives the empty sentinel, not an error'
);

select *
from finish();

rollback;
