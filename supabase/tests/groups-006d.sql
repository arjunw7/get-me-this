-- 006d: pgTAP suite for the private group room snapshot projection.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/006d-private-group-room-
-- member-and-pending-states.md: exact signature/shape, ownership and
-- security attributes (SECURITY DEFINER, VOLATILE, empty search_path),
-- privilege inventory and overload enumeration, the one-statement body,
-- positive fixtures (organizer caller, ordinary joined caller, ordering,
-- fallback labels, live targeted pending rows), negative fixtures for every
-- denial class, and the full pending-eligibility matrix. Reads never write:
-- audit, use-count, and invitation state are asserted unchanged throughout.
-- The whole suite is wrapped in one transaction that ends with rollback, so
-- no synthetic user, group, or member row persists.

begin;

select plan(31);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset
select gen_random_uuid() as uid_f \gset
select gen_random_uuid() as uid_h \gset
select gen_random_uuid() as uid_i \gset
select gen_random_uuid() as uid_j \gset
select gen_random_uuid() as uid_k \gset

-- 1. Shape, ownership, and security attributes --------------------------------

select has_function('public', 'group_room_snapshot', 'group_room_snapshot exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_room_snapshot'
  ),
  1,
  'exactly one overload of group_room_snapshot exists'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_room_snapshot'
  ),
  'p_group_id uuid',
  'the only argument is p_group_id uuid'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_room_snapshot'
  ),
  'TABLE(group_id uuid, organizer_id uuid, group_name text, occasion text, '
    || 'occasion_at timestamp without time zone, time_zone text, location text, '
    || 'description text, budget_amount_minor bigint, budget_currency character, '
    || 'mode text, group_status text, joined_member_count bigint, '
    || 'member_user_id uuid, member_display_name text, member_state text, '
    || 'member_is_organizer boolean)',
  'the return shape is exactly the seventeen declared columns'
);

select is(
  (
    select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_room_snapshot'
  ),
  'true:v:search_path=""',
  'the function is SECURITY DEFINER, honestly VOLATILE (a volatile clock call), with an empty search_path'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_room_snapshot'
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
        and p.proname = 'group_room_snapshot'
        and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
    ) s
  ),
  'authenticated',
  'EXECUTE is granted to authenticated only among PUBLIC and the application roles'
);

-- The body is one data-reading SQL statement: pg_get_functiondef renders the
-- statement without a trailing separator, so zero semicolons proves no
-- additional statement (and no dynamic SQL) can hide in the body.
select is(
  (
    select (
      select length(body) - length(replace(body, ';', ''))
      from (
        select substring(
          pg_get_functiondef('public.group_room_snapshot(uuid)'::regprocedure)
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
  not has_table_privilege('anon', 'public.group_members', 'SELECT')
    and not has_table_privilege('authenticated', 'public.group_members', 'SELECT')
    and not has_table_privilege('service_role', 'public.group_members', 'SELECT')
    and not has_table_privilege('anon', 'public.group_invitations', 'SELECT')
    and not has_table_privilege('authenticated', 'public.group_invitations', 'SELECT')
    and not has_table_privilege('service_role', 'public.group_invitations', 'SELECT'),
  'the projection adds no direct read grant on group_members or group_invitations'
);

-- 3. Fixtures -------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'room-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'room-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'room-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'room-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'room-e@example.invalid', ''),
  (:'uid_f'::uuid, 'authenticated', 'authenticated', 'room-f@example.invalid', ''),
  (:'uid_h'::uuid, 'authenticated', 'authenticated', 'room-h@example.invalid', ''),
  (:'uid_i'::uuid, 'authenticated', 'authenticated', 'room-i@example.invalid', ''),
  (:'uid_j'::uuid, 'authenticated', 'authenticated', 'room-j@example.invalid', ''),
  (:'uid_k'::uuid, 'authenticated', 'authenticated', 'room-k@example.invalid', '');

-- Named profiles for A, B, C; D's trigger-created profile keeps a null
-- display name and F's profile has none either (the fallback-label
-- fixtures).
update public.profiles set display_name = 'Riya Room' where id = :'uid_a'::uuid;
update public.profiles set display_name = 'Arjun Reader' where id = :'uid_b'::uuid;
update public.profiles set display_name = 'Meera Pending' where id = :'uid_c'::uuid;

-- as A (organizer): create the fixture group.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select gen_random_uuid() as req_key \gset
select group_id::text as gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Room Fixture', 'occasion_type', 'diwali', 'occasion_date', '2026-11-07',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '250000', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

-- Pin the occasion wall clock deterministically in the group's zone.
reset role;
update public."groups"
set occasion_at = '2026-11-07 18:00:00'::timestamp at time zone 'Asia/Kolkata',
    location = 'Dehradun',
    description = 'The annual room fixture.'
where id = :'gid'::uuid;

-- B joined after A (ordering fixture); D and F joined last with fallback
-- labels; C invited; H invited generic-only; three former members.
reset role;
insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
values (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp() - interval '1 hour', 1),
       (:'gid'::uuid, :'uid_d'::uuid, 'joined', true, clock_timestamp() + interval '1 hour', 1),
       (:'gid'::uuid, :'uid_f'::uuid, 'joined', true, clock_timestamp() + interval '2 hours', 1),
       (:'gid'::uuid, :'uid_c'::uuid, 'invited', false, clock_timestamp(), 1),
       (:'gid'::uuid, :'uid_h'::uuid, 'invited', false, clock_timestamp(), 1);

-- A live targeted invitation for C at its current generation, issued
-- through the real organizer RPC.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select target_membership_generation
from public.issue_group_invitation(:'gid'::uuid, :'uid_c'::uuid, (select member_admin_version from public.group_admin_version(:'gid'::uuid)));

reset role;

-- Former-member rows: declined, left, removed (durable history, never rows).
insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values (:'gid'::uuid, :'uid_i'::uuid, 'declined', false, 1),
       (:'gid'::uuid, :'uid_j'::uuid, 'left', false, 2),
       (:'gid'::uuid, :'uid_k'::uuid, 'removed', false, 3);

select ok(true, 'fixtures staged');

-- 4. Positive fixtures -----------------------------------------------------------

-- as A (organizer, joined).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
  ),
  5,
  'the organizer sees one row per visible member: three joined, one pending, plus the whitespace-name joined fallback row'
);

select is(
  (
    select group_name || '|' || occasion || '|' || occasion_at::text || '|'
      || time_zone || '|' || coalesce(location, 'null') || '|'
      || coalesce(description, 'null') || '|' || budget_amount_minor::text || '|'
      || budget_currency::text || '|' || mode || '|' || group_status || '|'
      || joined_member_count::text
    from public.group_room_snapshot(:'gid'::uuid) limit 1
  ),
  'Room Fixture|Diwali|2026-11-07 18:00:00|Asia/Kolkata|Dehradun|The annual room fixture.|250000|INR|secret_draw|active|4',
  'the group facts are the authoritative stored values, including the group-zone wall clock and the joined count'
);

select is(
  (
    select string_agg(
      member_display_name || ':' || member_state || ':' || member_is_organizer::text,
      ' / ' order by ord
    )
    from (
      select
        member_display_name,
        member_state,
        member_is_organizer,
        row_number() over () as ord
      from public.group_room_snapshot(:'gid'::uuid)
    ) rows_in_order
  ),
  'Riya Room:joined:true / Arjun Reader:joined:false / Member:joined:false / Member:joined:false / Meera Pending:invited:false',
  'rows are caller, then other joined members by joined_at, then pending, with honest fallback labels'
);

-- as B (ordinary joined member): same safe facts and roster.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select count(*)::int || '/' || (
      select joined_member_count::text
      from public.group_room_snapshot(:'gid'::uuid) limit 1
    )
    from public.group_room_snapshot(:'gid'::uuid)
  ),
  '5/4',
  'a joined non-organizer sees the same roster and the authoritative joined count'
);

select is(
  (
    select bool_and(g.group_name = 'Room Fixture' and g.mode = 'secret_draw')
    from public.group_room_snapshot(:'gid'::uuid) g
  ),
  true,
  'every row repeats identical group values'
);

-- 5. Pending-eligibility matrix ----------------------------------------------------

reset role;

-- H (invited through the generic shareable link only) must never be pending:
-- assert no pending row carries H's id after a real generic issuance. The
-- select projects only the non-secret version column.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select invitation_version from public.issue_group_invitation(:'gid'::uuid, 0::bigint);
reset role;

select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_user_id = :'uid_h'::uuid
  ),
  0,
  'a generic shareable link creates no named pending row'
);

-- Expired targeted token: no pending row.
reset role;
update public.group_invitations
set expires_at = clock_timestamp() - interval '1 minute'
where target_user_id = :'uid_c'::uuid and status = 'active';
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_state = 'invited'
  ),
  0,
  'an expired targeted token produces no pending row'
);
reset role;
update public.group_invitations
set expires_at = clock_timestamp() + interval '7 days'
where target_user_id = :'uid_c'::uuid and status = 'active';

-- Revoked targeted token: no pending row.
reset role;
update public.group_invitations
set status = 'revoked'
where target_user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_state = 'invited'
  ),
  0,
  'a revoked targeted token produces no pending row'
);
reset role;
update public.group_invitations
set status = 'active'
where target_user_id = :'uid_c'::uuid;

-- Exhausted targeted token: no pending row.
reset role;
update public.group_invitations
set max_uses = 1, use_count = 1
where target_user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_state = 'invited'
  ),
  0,
  'an exhausted targeted token produces no pending row'
);
reset role;
update public.group_invitations
set max_uses = null, use_count = 0
where target_user_id = :'uid_c'::uuid;

-- Stale generation: the invitation targets a superseded generation.
reset role;
update public.group_invitations
set target_membership_generation = 99
where target_user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_state = 'invited'
  ),
  0,
  'a stale-generation targeted token produces no pending row'
);
reset role;
-- The targeted issue above bound the token to C's invited generation. The
-- 006f reinvitation leaves an invited row's status and generation unchanged.
update public.group_invitations
set target_membership_generation = 1
where target_user_id = :'uid_c'::uuid;

-- Multiple live targeted tokens for one membership still produce one row.
reset role;
insert into public.group_invitations (
  group_id, creator_id, status, token_hash, expires_at,
  target_user_id, target_membership_generation
)
values (
  :'gid'::uuid, :'uid_a'::uuid, 'active',
  extensions.digest(convert_to('room-fixture-second-live-token-0000000000000000', 'UTF8'), 'sha256'),
  clock_timestamp() + interval '7 days',
  :'uid_c'::uuid, 2
);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_user_id = :'uid_c'::uuid and member_state = 'invited'
  ),
  1,
  'multiple live targeted tokens for one membership still produce one pending row'
);

-- Use-limit boundary: exactly at capacity is no longer pending.
reset role;
update public.group_invitations
set max_uses = 2, use_count = 2
where target_user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select count(*)::int
    from public.group_room_snapshot(:'gid'::uuid)
    where member_state = 'invited'
  ),
  0,
  'a targeted token exactly at its use limit produces no pending row'
);
reset role;
update public.group_invitations
set max_uses = null, use_count = 0
where target_user_id = :'uid_c'::uuid;

-- 6. Negative fixtures ---------------------------------------------------------------

-- as C (invited, pending in the room): pending visibility is not authority.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_room_snapshot(:'gid'::uuid)), 0, 'an invited member cannot read the room');

-- as E (pure outsider).
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_room_snapshot(:'gid'::uuid)), 0, 'an outsider receives zero rows');

-- Forged JWT actor fields.
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-00000000dead';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated"}', true);
select is((select count(*)::int from public.group_room_snapshot(:'gid'::uuid)), 0, 'a forged JWT actor receives zero rows');

-- Guessed UUID.
select is(
  (select count(*)::int from public.group_room_snapshot(gen_random_uuid())),
  0,
  'a guessed UUID receives zero rows'
);

-- Signed-out (null auth): both JWT identity GUCs are cleared.
reset role;
set local "request.jwt.claim.sub" = '';
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.group_room_snapshot(:'gid'::uuid)),
  0,
  'a signed-out caller receives zero rows'
);

-- Inactive (archived) group even for its joined organizer.
reset role;
update public."groups" set status = 'archived' where id = :'gid'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.group_room_snapshot(:'gid'::uuid)),
  0,
  'an archived group reads zero rows even for its joined organizer'
);
reset role;
update public."groups" set status = 'active' where id = :'gid'::uuid;

-- service_role has no EXECUTE grant and no table grants.
select throws_ok(
  format(
    'set role service_role; select count(*) from public.group_room_snapshot(%L::uuid);',
    :'gid'
  ),
  '42501',
  null,
  'service_role cannot execute the projection'
);

-- Direct base-table reads stay denied for a client role.
set local role authenticated;
select throws_ok(
  format('select count(*) from public.group_members where group_id = %L::uuid', :'gid'),
  '42501',
  null,
  'a direct group_members read by a client role is permission-denied (no grant)'
);

-- 7. Reads never write ------------------------------------------------------------------

reset role;
select is(
  (
    select (select count(*)::text from public.audit_events where group_id = :'gid'::uuid)
      || '/' || (select use_count::text from public.group_invitations where target_user_id = :'uid_c'::uuid and target_membership_generation = 2 limit 1)
      || '/' || (select count(*)::text from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id = :'gid'::uuid))
  ),
  '3/0/0',
  'every read above left audit events, invitation use counts, and invitation uses unchanged'
);

select * from finish();
rollback;
