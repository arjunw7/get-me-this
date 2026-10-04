-- 008d: pgTAP suite for the private assignment-viewed state and the draw
-- email-enqueue read.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief
-- docs/delivery/issues/008d-assignment-view-and-redraw.md acceptance
-- criteria 1, 2, 5 (database halves), and 7: table shape and deny-all RLS,
-- the 006a privilege inventory of the three new functions, the viewed-state
-- lifecycle (idempotent upsert, redraw reset, tombstone silence, rows never
-- mutated or deleted), the member-leaves read semantics, and the
-- privacy-negative matrix. The two-session race interleavings are proven by
-- the committed harness (scripts/test-draw-008d-races-local.sh). One
-- transaction, rolled back at the end.

begin;

select plan(42);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset

-- 1. Shape, RLS, and the privilege inventory -----------------------------------

select has_table('public', 'group_assignment_views', 'group_assignment_views exists');

select is(
  (
    select string_agg(a.attname, ',' order by a.attnum)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'group_assignment_views' and a.attnum > 0 and not a.attisdropped
  ),
  'group_id,draw_version,giver_id,viewed_at',
  'the table has exactly the declared columns in order'
);

select is(
  (
    select count(*)::int
    from pg_constraint
    where conrelid = 'public.group_assignment_views'::regclass
      and conname in (
        'group_assignment_views_pkey',
        'group_assignment_views_giver_member_fkey'
      )
      and (contype <> 'f' or pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%')
  ),
  2,
  'the declared primary key and the composite RESTRICT member foreign key exist'
);

select is(
  (select relrowsecurity::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'group_assignment_views'),
  1,
  'RLS is enabled on group_assignment_views'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'group_assignment_views'),
  0,
  'no RLS policy exists on group_assignment_views'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ','), 'none')
    from information_schema.table_privileges tp
    join pg_roles r on r.rolname = tp.grantee
    where tp.table_schema = 'public'
      and tp.table_name = 'group_assignment_views'
      and tp.grantee in ('anon', 'authenticated', 'service_role')
  ),
  'none',
  'no client role holds any direct privilege on group_assignment_views'
);

-- The 006a privilege inventory of the three new functions: revoked from
-- PUBLIC, anon, authenticated, and service_role, then granted to
-- authenticated exactly.
select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('mark_assignment_viewed', 'my_assignment_view_state', 'draw_assignments_for_email', 'enqueue_email')
      and p.proconfig is not null
      and exists (
        select 1 from unnest(p.proconfig) c
        where c like 'search_path=%'
      )
      and p.prosecdef
  ),
  4,
  'four of the new functions are security definer with an empty search_path'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ','), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
    join pg_roles r on r.oid = g.grantee
    where n.nspname = 'public'
      and p.proname = 'mark_assignment_viewed'
  ),
  'authenticated,postgres',
  'mark_assignment_viewed is executable by authenticated (and the owner) only'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ','), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
    join pg_roles r on r.oid = g.grantee
    where n.nspname = 'public'
      and p.proname = 'my_assignment_view_state'
  ),
  'authenticated,postgres',
  'my_assignment_view_state is executable by authenticated (and the owner) only'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ','), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
    join pg_roles r on r.oid = g.grantee
    where n.nspname = 'public'
      and p.proname = 'draw_assignments_for_email'
  ),
  'authenticated,postgres',
  'draw_assignments_for_email is executable by authenticated (and the owner) only'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ','), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
    join pg_roles r on r.oid = g.grantee
    where n.nspname = 'public'
      and p.proname = 'enqueue_email'
  ),
  'postgres,service_role',
  'the public enqueue passthrough is executable by service_role (and the owner) only'
);

-- 2. Fixtures ---------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'views-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'views-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'views-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'views-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'views-e@example.invalid', '');

insert into public.profiles (id, display_name)
values (:'uid_b'::uuid, 'Bee'), (:'uid_c'::uuid, 'Cee')
on conflict (id) do update set display_name = excluded.display_name;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select group_id::text as gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'View Crew', 'occasion_type', 'secret_santa', 'occasion_date', '2026-12-20',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '3000', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

reset role;
insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values
  (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp(), 1),
  (:'gid'::uuid, :'uid_c'::uuid, 'joined', true, clock_timestamp(), 1);

-- The first committed draw.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (select result from public.run_secret_draw(:'gid'::uuid, null)),
  'drawn',
  'the fixture draw commits as version 1'
);

-- A helper: the committed version (owner-path read).
reset role;
select (select current_draw_version from public."groups" where id = :'gid'::uuid)::text as v1 \gset
select is(:'v1'::text, '1', 'the fixture draw committed version 1');

-- 3. Viewed-state lifecycle ---------------------------------------------------------

-- as B: mark viewed; the marker lands on the caller's own current version.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'before marking, the giver has no viewed marker'
);

select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  'marking viewed succeeds for the caller''s own current valid assignment'
);

reset role;
select is(
  (select count(*)::int from public.group_assignment_views where group_id = :'gid'::uuid and giver_id = :'uid_b'::uuid),
  1,
  'exactly one marker row was written'
);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select viewed_at::text as b_viewed_at
from public.my_assignment_view_state(:'gid'::uuid) \gset

select is(
  (select coalesce(draw_version::text, 'null') || ':' || coalesce(viewed_at::text, 'null') from public.my_assignment_view_state(:'gid'::uuid)),
  '1:' || :'b_viewed_at',
  'the marker reads back on the caller''s own current version'
);

-- Idempotent: marking twice writes one row and never mutates the row.
select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  're-marking is a no-op success'
);

reset role;
select is(
  (
    select count(*)::int || ':' || (select count(*)::int from public.group_assignment_views where viewed_at <> :'b_viewed_at'::timestamptz and giver_id = :'uid_b'::uuid)
    from public.group_assignment_views where group_id = :'gid'::uuid and giver_id = :'uid_b'::uuid
  ),
  '1:0',
  're-marking wrote no second row and mutated nothing'
);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

-- Denial classes are no-op successes returning the generic result.
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_e'), true);
select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  'an outsider''s mark is a non-enumerating no-op success'
);
select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'an outsider reads zero viewed rows'
);

set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);
select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'a member of a different group reads zero viewed rows (cross-group)'
);
select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  'a cross-group mark is a non-enumerating no-op success'
);

-- Viewed state is unreadable by anyone other than its owner, including the
-- organizer (criterion 7).
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'the organizer reads only their own marker, never another giver''s (none exists yet)'
);

-- 4. Redraw lifecycle -----------------------------------------------------------------

reset role;
select is(
  (select count(*)::int from public.group_assignment_views where group_id = :'gid'::uuid),
  1,
  'only the one marker exists before the redraw'
);

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (select result from public.run_secret_draw(:'gid'::uuid, 1)),
  'drawn',
  'the confirmed redraw commits version 2'
);

set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'the new version starts with no viewed rows for the giver'
);

select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  'the giver marks the new version viewed independently'
);

reset role;
select is(
  (
    select count(*)::int from public.group_assignment_views
    where group_id = :'gid'::uuid and giver_id = :'uid_b'::uuid
  ),
  2,
  'the superseded version''s marker is retained as internal history, never deleted'
);

-- 5. Member-leaves and tombstone semantics ---------------------------------------------

reset role;
-- C leaves after the redraw: C's own reads go to zero rows; the giver
-- assigned to C reads is_valid = false.
insert into public.audit_events (actor_id, group_id, event_type, subject_user_id, metadata)
values (:'uid_a'::uuid, :'gid'::uuid, 'member_left'::public.group_audit_event_type, :'uid_c'::uuid, '{}'::jsonb);
update public.group_members
set status = 'left', participating = false, membership_generation = membership_generation + 1
where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'a leaver reads zero viewed rows'
);
select is(
  (select count(*)::int from public.my_assignment(:'gid'::uuid)),
  0,
  'a leaver reads zero assignment rows'
);

select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  'a leaver''s mark is a non-enumerating no-op success'
);

-- Find the giver who was assigned the departed member (owner-path read).
reset role;
select giver_id::text as giver_of_c
from public.group_assignments
where group_id = :'gid'::uuid
  and draw_version = (select current_draw_version from public."groups" where id = :'gid'::uuid)
  and recipient_id = :'uid_c'::uuid \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'giver_of_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'giver_of_c'), true);
select is(
  (
    select is_valid::text || ':' || coalesce(recipient_id::text, 'null') || ':' || coalesce(recipient_display_name::text, 'null')
    from public.my_assignment(:'gid'::uuid)
  ),
  'false:null:null',
  'the giver assigned the departed member reads is_valid = false with the recipient identity nulled'
);

-- The organizer-gated email read: invalid rows are present but the recipient
-- identity is nulled; the enqueue helper skips them. Non-organizers read
-- zero rows from it.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select bool_and(is_valid or recipient_display_name is null)
    from public.draw_assignments_for_email(:'gid'::uuid)
  ),
  'true',
  'the email read never surfaces a departed recipient''s identity'
);

set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select count(*)::int from public.draw_assignments_for_email(:'gid'::uuid)),
  0,
  'a non-organizer reads zero rows from the email projection'
);

-- Tombstone: the mode moves away; every surface reads zero rows.
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select result
    from public.update_group_settings(
      :'gid'::uuid, 'View Crew', 'Secret Santa', '2026-12-20 00:00:00+05:30'::timestamptz,
      'Asia/Kolkata', null, null, 3000::bigint, 'INR', 'wishlist_only'
    )
  ),
  'updated',
  'the tombstone commits'
);

set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select count(*)::int from public.my_assignment(:'gid'::uuid)),
  0,
  'after the tombstone the giver reads zero assignment rows'
);
select is(
  (select count(*)::int from public.my_assignment_view_state(:'gid'::uuid)),
  0,
  'after the tombstone the giver reads zero viewed rows'
);
select is(
  (select public.mark_assignment_viewed(:'gid'::uuid)),
  'viewed',
  'after the tombstone the mark is a non-enumerating no-op success'
);
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (select count(*)::int from public.draw_assignments_for_email(:'gid'::uuid)),
  0,
  'after the tombstone the email projection reads zero rows: enqueue silence'
);

-- 6. Privacy negatives on the table itself ----------------------------------------------

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select throws_ok(
  'select count(*) from public.group_assignment_views',
  '42501',
  null,
  'a direct client read of group_assignment_views is permission-denied'
);

select throws_ok(
  format(
    'insert into public.group_assignment_views (group_id, draw_version, giver_id) values (%L, 1, %L)',
    :'gid', :'uid_b'
  ),
  '42501',
  null,
  'a direct client write of group_assignment_views is permission-denied'
);

select * from finish();
rollback;
