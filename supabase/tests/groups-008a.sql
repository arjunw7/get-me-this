-- 008a: pgTAP suite for the group_gifting_surface projection (share-wishlists-only mode).
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/008a-share-wishlists-only-mode.md:
-- exact signature/shape, ownership and security attributes, privilege
-- inventory and overload enumeration, one-statement positive fixtures for
-- every role and mode, negative fixtures for every denial class, the
-- draw-version invariant, and the mode-transition fixture. The whole suite
-- is wrapped in one transaction that ends with rollback, so no synthetic
-- user, group, or member row persists.

begin;

select plan(26);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset

-- 1. Shape, ownership, and privileges ---------------------------------------

select has_function('public', 'group_gifting_surface', 'group_gifting_surface exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_gifting_surface'
  ),
  1,
  'exactly one overload of group_gifting_surface exists'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_gifting_surface'
  ),
  'p_group_id uuid',
  'the only argument is p_group_id uuid'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_gifting_surface'
  ),
  'TABLE(mode group_mode, group_status group_status, has_draw_version boolean, caller_is_participating boolean, participating_member_count bigint)',
  'the return shape is exactly the five declared columns'
);

select is(
  (
    select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_gifting_surface'
  ),
  'true:s:search_path=""',
  'the function is SECURITY DEFINER, STABLE, with an empty search_path'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_gifting_surface'
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
        and p.proname = 'group_gifting_surface'
        and r.rolname in ('anon', 'authenticated', 'service_role')
    ) s
  ),
  'authenticated',
  'EXECUTE is granted to authenticated only among application roles'
);

select is(
  (
    select case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
        join pg_roles r on r.oid = g.grantee
        where n.nspname = 'public'
          and p.proname = 'group_gifting_surface'
          and r.rolname in ('anon', 'service_role')
      ) then 'granted'
      else 'none'
    end
  ),
  'none',
  'anon and service_role have no EXECUTE privilege'
);

-- 2. Fixtures ----------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'gifting-surface-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'gifting-surface-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'gifting-surface-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'gifting-surface-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'gifting-surface-e@example.invalid', '');

-- as A (organizer)
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select gen_random_uuid() as req_key \gset

-- wishlist_only fixture group: A organizer, B and C joined, D invited, E outsider.
select group_id::text as gid_wo
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Only Wishlists', 'occasion_type', 'birthday', 'occasion_date', '2026-12-18',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '1000', 'budget_currency', 'INR',
    'mode', 'wishlist_only', 'organizer_participating', true
  )
) \gset

-- gift_everyone fixture group: A organizer (second group for cross-group tests).
select group_id::text as gid_ge
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Everyone Gifts', 'occasion_type', 'diwali', 'occasion_date', '2026-11-08',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '2500', 'budget_currency', 'INR',
    'mode', 'gift_everyone', 'organizer_participating', true
  )
) \gset

reset role;

-- B joins the wishlist_only group through a targeted invitation.
insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
values (:'gid_wo'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp(), 1);

-- C is invited (pending).
insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values (:'gid_wo'::uuid, :'uid_c'::uuid, 'invited', false, 1);

-- D declined in the gift_everyone group.
insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values (:'gid_ge'::uuid, :'uid_d'::uuid, 'declined', false, 1);

select ok(true, 'fixtures staged');

-- 3. Positive fixtures --------------------------------------------------------

-- as A (organizer, joined, participating) on the wishlist_only group.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select mode::text || ':' || group_status::text || ':' || has_draw_version::text
           || ':' || caller_is_participating::text || ':' || participating_member_count::text
    from public.group_gifting_surface(:'gid_wo'::uuid)
  ),
  'wishlist_only:active:false:true:2',
  'the organizer sees the authoritative wishlist_only mode, active status, no draw version, participation, and a count of 2'
);

-- as B (ordinary joined participating member).
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select mode::text || ':' || caller_is_participating::text || ':' || participating_member_count::text
    from public.group_gifting_surface(:'gid_wo'::uuid)
  ),
  'wishlist_only:true:2',
  'a joined participating member sees the same authoritative projection'
);

-- 4. Draw-version invariant (value never leaves the database) -------------------

reset role;
update public."groups"
set current_draw_version = 4
where id = :'gid_wo'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (select has_draw_version from public.group_gifting_surface(:'gid_wo'::uuid)),
  true,
  'a staged draw version surfaces the boolean flag'
);

select is(
  (
    select (
      mode::text || group_status::text || caller_is_participating::text
      || participating_member_count::text
    ) not like '%4%'
    from public.group_gifting_surface(:'gid_wo'::uuid)
  ),
  true,
  'the draw version value itself never appears in any returned field'
);

reset role;
update public."groups" set current_draw_version = null where id = :'gid_wo'::uuid;

-- 5. Negative fixtures ---------------------------------------------------------

-- as C (invited).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_gifting_surface(:'gid_wo'::uuid)), 0, 'an invited member receives zero rows');

-- as D (declined, other group).
set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_gifting_surface(:'gid_wo'::uuid)), 0, 'a declined member of another group receives zero rows');

-- as E (pure outsider).
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_gifting_surface(:'gid_wo'::uuid)), 0, 'an outsider receives zero rows');

-- Cross-group: B is joined in gid_wo but requests the gift_everyone group.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_gifting_surface(:'gid_ge'::uuid)), 0, 'a member of one group receives zero rows for another group');

-- Forged JWT actor fields (sub without a membership anywhere new). Both JWT
-- GUCs are set so neither a stale claim.sub nor a stale claims document
-- leaks an identity.
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-00000000dead';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated"}', true);
select is((select count(*)::int from public.group_gifting_surface(:'gid_wo'::uuid)), 0, 'a forged JWT actor receives zero rows');

-- Guessed UUID.
select is(
  (select count(*)::int from public.group_gifting_surface(gen_random_uuid())),
  0,
  'a guessed UUID receives zero rows'
);

-- Signed-out (null auth): both JWT identity GUCs are cleared.
reset role;
set local "request.jwt.claim.sub" = '';
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.group_gifting_surface(:'gid_wo'::uuid)),
  0,
  'a signed-out caller receives zero rows'
);

-- Direct base-table reads stay denied for a client role.
set local role authenticated;
select throws_ok(
  format('select count(*) from public.group_members where group_id = %L::uuid', :'gid_wo'),
  '42501',
  null,
  'a direct group_members read by a client role is permission-denied (no grant)'
);

-- 6. Non-participating caller ---------------------------------------------------

reset role;
update public.group_members
set participating = false
where group_id = :'gid_wo'::uuid and user_id = :'uid_b'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select caller_is_participating::text || ':' || participating_member_count::text
    from public.group_gifting_surface(:'gid_wo'::uuid)
  ),
  'false:1',
  'a joined non-participating caller sees their own flag and the reduced count'
);

reset role;
update public.group_members
set participating = true
where group_id = :'gid_wo'::uuid and user_id = :'uid_b'::uuid;

-- 7. Inactive (archived) group ---------------------------------------------------

reset role;
update public."groups" set status = 'archived' where id = :'gid_ge'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.group_gifting_surface(:'gid_ge'::uuid)),
  0,
  'an archived group reads zero rows even for its joined organizer'
);

reset role;
update public."groups" set status = 'active' where id = :'gid_ge'::uuid;

-- 8. Mode-transition fixture -------------------------------------------------------

-- The gift_everyone group (A organizer) is switched to wishlist_only through
-- update_group_settings; the projection reflects the new mode in the same
-- session and no gifting state is created or destroyed.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select result
    from public.update_group_settings(
      :'gid_ge'::uuid, 'Everyone Gifts', 'Diwali', '2026-11-08 00:00:00+05:30'::timestamptz,
      'Asia/Kolkata', null, null, 2500::bigint, 'INR', 'wishlist_only'
    )
  ),
  'updated',
  'the organizer can switch the stored mode through update_group_settings'
);

select is(
  (
    select mode::text
    from public.group_gifting_surface(:'gid_ge'::uuid)
  ),
  'wishlist_only',
  'the projection reflects the new stored mode on the next read'
);

reset role;
select is(
  (
    select count(*)::int
    from public.audit_events
    where group_id = :'gid_ge'::uuid and event_type not in (
      'group_created'::public.group_audit_event_type
    )
  ),
  0,
  'a mode read/transition appends no unexpected audit event'
);

select * from finish();
rollback;
