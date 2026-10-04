-- 007d: pgTAP suite for the activity summary projections.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/007d-activity-summaries.md:
-- exact signatures/shape, ownership and security attributes (SECURITY
-- DEFINER, STABLE, empty search_path), the one-statement bodies, privilege
-- inventory and overload enumeration, the unchanged policy inventories,
-- every cell of the per-viewer visibility matrix positive and negative
-- (most importantly the owner's total blind spot for their own items'
-- reservation entries while the withheld facts demonstrably exist), the
-- reserver-identity privacy rule, organizer non-omniscience, the excluded
-- invitation-mechanics kinds, member_activity's extra binding rule, every
-- denial class (signed-out, outsider, pending, declined, left, removed,
-- cross-group, stale target, unknown group, service_role), and the bounded
-- result shape: clamping, keyset ordering, cursor behavior, and the generic
-- display-name fallback. Reads never write: the fixture data is asserted
-- unchanged throughout. The whole suite is wrapped in one transaction that
-- ends with rollback, so no synthetic user, group, member, wishlist, item,
-- reservation, reaction, or audit event persists.

begin;

select plan(61);

-- a: organizer of the fixture group; b: owner whose items carry
-- reservations; c: reserver; d: other joined member (reserver of C's item);
-- e: pending; f: declined; g: left; h: removed; i: cross-group joined
-- member.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset
select gen_random_uuid() as uid_f \gset
select gen_random_uuid() as uid_g \gset
select gen_random_uuid() as uid_h \gset
select gen_random_uuid() as uid_i \gset
select gen_random_uuid() as gid \gset
select gen_random_uuid() as gid2 \gset

-- 1. Shape, ownership, and security attributes --------------------------------

select has_function('public', 'group_activity', 'group_activity exists');
select has_function('public', 'member_activity', 'member_activity exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_activity'
  ),
  1,
  'exactly one overload of group_activity exists'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_activity'
  ),
  1,
  'exactly one overload of member_activity exists'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_activity'
  ),
  'p_group_id uuid, p_before timestamp with time zone, p_limit integer',
  'group_activity takes exactly group, cursor, and limit arguments'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_activity'
  ),
  'p_group_id uuid, p_member_id uuid, p_before timestamp with time zone, p_limit integer',
  'member_activity takes exactly group, member, cursor, and limit arguments'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_activity'
  ),
  'TABLE(event_kind text, occurred_at timestamp with time zone, actor_display_name text, '
    || 'subject_display_name text, item_id uuid, item_title text, '
    || 'owner_display_name text, involves_viewer boolean)',
  'group_activity returns exactly the eight declared columns (no count, no aggregate, no reservation id, no reserver identity)'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_activity'
  ),
  'TABLE(event_kind text, occurred_at timestamp with time zone, actor_display_name text, '
    || 'subject_display_name text, item_id uuid, item_title text, '
    || 'owner_display_name text, involves_viewer boolean)',
  'member_activity returns exactly the eight declared columns'
);

select is(
  (
    select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_activity'
  ),
  'true:s:search_path=""',
  'group_activity is SECURITY DEFINER, honestly STABLE, with an empty search_path'
);

select is(
  (
    select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_activity'
  ),
  'true:s:search_path=""',
  'member_activity is SECURITY DEFINER, honestly STABLE, with an empty search_path'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_activity'
  ),
  'postgres',
  'group_activity is owned by the trusted non-client database role'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_activity'
  ),
  'postgres',
  'member_activity is owned by the trusted non-client database role'
);

-- EXECUTE: granted to authenticated only; revoked from PUBLIC, anon, and
-- service_role. Acceptance 7.
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
        and p.proname = 'group_activity'
        and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
    ) s
  ),
  'authenticated',
  'group_activity EXECUTE is granted to authenticated only among PUBLIC and the application roles'
);

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
        and p.proname = 'member_activity'
        and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
    ) s
  ),
  'authenticated',
  'member_activity EXECUTE is granted to authenticated only among PUBLIC and the application roles'
);

-- The body is one data-reading SQL statement per projection (acceptance 8,
-- the 006e proof): pg_get_functiondef renders the statement without a
-- trailing separator, so zero semicolons proves no additional statement and
-- no dynamic SQL can hide in the body — authorization, filtering, and
-- ordering are all CTEs of that one statement and share one snapshot.
select is(
  (
    select (
      select length(body) - length(replace(body, ';', ''))
      from (
        select substring(
          pg_get_functiondef('public.group_activity(uuid, timestamptz, integer)'::regprocedure)
          from '\$function\$(.*)\$function\$'
        ) as body
      ) b
    )
  ),
  0,
  'the group_activity body is one SQL statement (single snapshot, no application-side filtering possible)'
);

select is(
  (
    select (
      select length(body) - length(replace(body, ';', ''))
      from (
        select substring(
          pg_get_functiondef('public.member_activity(uuid, uuid, timestamptz, integer)'::regprocedure)
          from '\$function\$(.*)\$function\$'
        ) as body
      ) b
    )
  ),
  0,
  'the member_activity body is one SQL statement (single snapshot)'
);

-- 2. Unchanged base-table policy inventories -----------------------------------

-- The projections add no new table, privilege, or policy anywhere: the
-- policy inventories of the read-through base tables stay exactly as the
-- prior slices committed them (acceptance 7).
select is(
  (
    select string_agg(tab || ':' || pol, ',' order by tab, pol)
    from (
      select c.relname::text as tab, p.polname::text as pol
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'profiles', 'wishlists', 'wishlist_items', 'audit_events',
          'group_item_reservations', 'group_item_reactions', 'groups', 'group_members'
        )
    ) s
  ),
  'groups:groups_select_joined,profiles:profiles_select_own,profiles:profiles_update_own,'
    || 'wishlist_items:wishlist_items_delete_own,wishlist_items:wishlist_items_insert_own,'
    || 'wishlist_items:wishlist_items_select_own,wishlist_items:wishlist_items_update_own,'
    || 'wishlists:wishlists_select_own',
  'no new RLS policy exists on any read-through base table (reservations, reactions, and audit events stay deny-all)'
);

-- 3. Fixtures -------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'activity-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'activity-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'activity-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'activity-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'activity-e@example.invalid', ''),
  (:'uid_f'::uuid, 'authenticated', 'authenticated', 'activity-f@example.invalid', ''),
  (:'uid_g'::uuid, 'authenticated', 'authenticated', 'activity-g@example.invalid', ''),
  (:'uid_h'::uuid, 'authenticated', 'authenticated', 'activity-h@example.invalid', ''),
  (:'uid_i'::uuid, 'authenticated', 'authenticated', 'activity-i@example.invalid', '');

update public.profiles set display_name = 'Ona Organizer' where id = :'uid_a'::uuid;
update public.profiles set display_name = 'Buni Owner' where id = :'uid_b'::uuid;
update public.profiles set display_name = 'Charu Reserves' where id = :'uid_c'::uuid;
update public.profiles set display_name = 'Dev Member' where id = :'uid_d'::uuid;
update public.profiles set display_name = 'Former Fae' where id = :'uid_h'::uuid;
-- uid_i's profile row is removed entirely so the generic fallback is
-- exercised through a genuinely missing profile.
delete from public.profiles where id = :'uid_i'::uuid;

-- The fixture group with the full roster state matrix.
insert into public."groups" (
  id, name, occasion, occasion_at, time_zone, mode, status, organizer_id
)
values (
  :'gid'::uuid, 'Activity Fixture', 'Diwali', '2026-11-08 18:00+05:30',
  'Asia/Kolkata', 'wishlist_only', 'active', :'uid_a'::uuid
);

insert into public.group_members (
  group_id, user_id, status, participating, joined_at, membership_generation
)
values
  (:'gid'::uuid, :'uid_a'::uuid, 'joined', true, clock_timestamp() - interval '5 hours', 1),
  (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp() - interval '4 hours', 1),
  (:'gid'::uuid, :'uid_c'::uuid, 'joined', true, clock_timestamp() - interval '3 hours', 1),
  (:'gid'::uuid, :'uid_d'::uuid, 'joined', true, clock_timestamp() - interval '2 hours', 1),
  (:'gid'::uuid, :'uid_e'::uuid, 'invited', false, clock_timestamp(), 1),
  (:'gid'::uuid, :'uid_f'::uuid, 'declined', false, clock_timestamp(), 1),
  (:'gid'::uuid, :'uid_g'::uuid, 'left', false, clock_timestamp() - interval '1 day', 2),
  (:'gid'::uuid, :'uid_h'::uuid, 'removed', false, clock_timestamp() - interval '2 days', 3);

-- The second group: I is joined there and nowhere else (cross-group viewer;
-- A is an outsider there).
insert into public."groups" (
  id, name, occasion, occasion_at, time_zone, mode, status, organizer_id
)
values (
  :'gid2'::uuid, 'Other Group', 'Eid', '2026-12-01 18:00+00:00',
  'UTC', 'wishlist_only', 'active', :'uid_i'::uuid
);
insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values (:'gid2'::uuid, :'uid_i'::uuid, 'joined', true, 1);

-- B's wishlist: the items the reservation fixtures act on.
insert into public.wishlist_items (
  wishlist_id, owner_id, title, extraction_status, sort_position
)
values
  ((select id from public.wishlists where owner_id = :'uid_b'::uuid), :'uid_b'::uuid, 'Pour-over kettle', 'manual', 1),
  ((select id from public.wishlists where owner_id = :'uid_b'::uuid), :'uid_b'::uuid, 'Ceramic mug', 'manual', 2),
  ((select id from public.wishlists where owner_id = :'uid_b'::uuid), :'uid_b'::uuid, 'Desk mat', 'manual', 3);

select gen_random_uuid() as item_kettle \gset
select gen_random_uuid() as item_mug \gset
select gen_random_uuid() as item_mat \gset
update public.wishlist_items set id = :'item_kettle'::uuid
  where owner_id = :'uid_b'::uuid and title = 'Pour-over kettle';
update public.wishlist_items set id = :'item_mug'::uuid
  where owner_id = :'uid_b'::uuid and title = 'Ceramic mug';
update public.wishlist_items set id = :'item_mat'::uuid
  where owner_id = :'uid_b'::uuid and title = 'Desk mat';

-- C's wishlist: one item D reserves (the owner-blind fixture from the
-- reserver's side, and C's own item reservation event for member_activity).
insert into public.wishlist_items (
  wishlist_id, owner_id, title, extraction_status, sort_position
)
values
  ((select id from public.wishlists where owner_id = :'uid_c'::uuid), :'uid_c'::uuid, 'Scented candle', 'manual', 1);
select gen_random_uuid() as item_candle \gset
update public.wishlist_items set id = :'item_candle'::uuid
  where owner_id = :'uid_c'::uuid and title = 'Scented candle';

-- D's wishlist: one item B and C react to, so the reaction matrix rows are
-- exercised from both sides.
insert into public.wishlist_items (
  wishlist_id, owner_id, title, extraction_status, sort_position
)
values
  ((select id from public.wishlists where owner_id = :'uid_d'::uuid), :'uid_d'::uuid, 'Board game', 'manual', 1);
select gen_random_uuid() as item_game \gset
update public.wishlist_items set id = :'item_game'::uuid
  where owner_id = :'uid_d'::uuid and title = 'Board game';

-- Reservations (durable private history; the owner-blind facts that the
-- denied viewers must demonstrably NOT see):
--   r1: C actively reserves B's kettle (item_reserved only).
--   r2: C reserved B's mug and released it by_reserver (both kinds).
--   r3: D reserved B's mat, active (a non-reserver, non-owner joined
--       member's state-only view; owner blind for B).
--   r4: D reserved C's candle, active (the owner-blind fixture for C).
--   r5: C's released reservation whose item row is gone (the deleted-item
--       snapshot-title fixture; one active per (group, item) is not
--       violated — the item is deleted).
select gen_random_uuid() as r1 \gset
select gen_random_uuid() as r2 \gset
select gen_random_uuid() as r3 \gset
select gen_random_uuid() as r4 \gset
select gen_random_uuid() as r5 \gset

insert into public.group_item_reservations (
  id, group_id, item_id, reserver_id, status, item_title_snapshot,
  reserved_at, released_at, released_reason
)
values
  (:'r1'::uuid, :'gid'::uuid, :'item_kettle'::uuid, :'uid_c'::uuid, 'active',
   'Pour-over kettle', clock_timestamp() - interval '40 minutes', null, null),
  (:'r2'::uuid, :'gid'::uuid, :'item_mug'::uuid, :'uid_c'::uuid, 'released',
   'Ceramic mug', clock_timestamp() - interval '50 minutes',
   clock_timestamp() - interval '20 minutes', 'by_reserver'),
  (:'r3'::uuid, :'gid'::uuid, :'item_mat'::uuid, :'uid_d'::uuid, 'active',
   'Desk mat', clock_timestamp() - interval '30 minutes', null, null),
  (:'r4'::uuid, :'gid'::uuid, :'item_candle'::uuid, :'uid_d'::uuid, 'active',
   'Scented candle', clock_timestamp() - interval '25 minutes', null, null),
  (:'r5'::uuid, :'gid'::uuid, null, :'uid_c'::uuid, 'released',
   'Gone fountain pen', clock_timestamp() - interval '60 minutes',
   clock_timestamp() - interval '35 minutes', 'item_deleted');

-- The audit events. Membership events through the kinds in the inventory;
-- the excluded invitation-mechanics kinds are present too and must never
-- surface (acceptance 6). Reservation events carry exactly the 007c
-- metadata contract. Timestamps are spaced for deterministic ordering.
insert into public.audit_events (
  id, actor_id, group_id, event_type, invitation_id, subject_user_id,
  metadata, occurred_at
)
values
  (gen_random_uuid(), :'uid_a'::uuid, :'gid'::uuid, 'group_created', null, null, '{}',
   clock_timestamp() - interval '5 hours'),
  (gen_random_uuid(), :'uid_c'::uuid, :'gid'::uuid, 'invitation_accepted', null, :'uid_c'::uuid,
   '{"membership_generation":1}', clock_timestamp() - interval '3 hours'),
  (gen_random_uuid(), :'uid_g'::uuid, :'gid'::uuid, 'member_left', null, :'uid_g'::uuid, '{}',
   clock_timestamp() - interval '1 day'),
  (gen_random_uuid(), :'uid_a'::uuid, :'gid'::uuid, 'member_removed', null, :'uid_h'::uuid,
   '{"membership_generation":3}', clock_timestamp() - interval '2 days'),
  -- Excluded kinds, present in the trail and never in any summary.
  (gen_random_uuid(), :'uid_a'::uuid, :'gid'::uuid, 'invitation_issued', null, null,
   '{"invitation_id":"00000000-0000-4000-8000-00000000a001"}', clock_timestamp() - interval '4 hours'),
  (gen_random_uuid(), :'uid_a'::uuid, :'gid'::uuid, 'invitation_revoked', null, null,
   '{"invitation_id":"00000000-0000-4000-8000-00000000a002"}', clock_timestamp() - interval '90 minutes'),
  (gen_random_uuid(), :'uid_f'::uuid, :'gid'::uuid, 'invitation_declined', null, :'uid_f'::uuid,
   '{"membership_generation":1}', clock_timestamp() - interval '80 minutes'),
  (gen_random_uuid(), :'uid_a'::uuid, :'gid'::uuid, 'member_reinvited', null, :'uid_g'::uuid,
   '{"membership_generation":2}', clock_timestamp() - interval '30 hours'),
  -- Reservation events: item_reserved (actor reserver, subject owner),
  -- reservation_released (actor reserver, no subject).
  (gen_random_uuid(), :'uid_c'::uuid, :'gid'::uuid, 'item_reserved', null, :'uid_b'::uuid,
   jsonb_build_object('item_id', :'item_kettle'::text, 'reservation_id', :'r1'::text),
   clock_timestamp() - interval '40 minutes'),
  (gen_random_uuid(), :'uid_c'::uuid, :'gid'::uuid, 'item_reserved', null, :'uid_b'::uuid,
   jsonb_build_object('item_id', :'item_mug'::text, 'reservation_id', :'r2'::text),
   clock_timestamp() - interval '50 minutes'),
  (gen_random_uuid(), :'uid_c'::uuid, :'gid'::uuid, 'reservation_released', null, null,
   jsonb_build_object('reservation_id', :'r2'::text),
   clock_timestamp() - interval '20 minutes'),
  (gen_random_uuid(), :'uid_d'::uuid, :'gid'::uuid, 'item_reserved', null, :'uid_b'::uuid,
   jsonb_build_object('item_id', :'item_mat'::text, 'reservation_id', :'r3'::text),
   clock_timestamp() - interval '30 minutes'),
  (gen_random_uuid(), :'uid_d'::uuid, :'gid'::uuid, 'item_reserved', null, :'uid_c'::uuid,
   jsonb_build_object('item_id', :'item_candle'::text, 'reservation_id', :'r4'::text),
   clock_timestamp() - interval '25 minutes'),
  (gen_random_uuid(), :'uid_c'::uuid, :'gid'::uuid, 'item_reserved', null, null,
   jsonb_build_object('reservation_id', :'r5'::text),
   clock_timestamp() - interval '60 minutes'),
  (gen_random_uuid(), :'uid_c'::uuid, :'gid'::uuid, 'reservation_released', null, null,
   jsonb_build_object('reservation_id', :'r5'::text),
   clock_timestamp() - interval '35 minutes');

-- gid2's own group_created event (actor I, no profile row: the fallback
-- fixture).
insert into public.audit_events (
  id, actor_id, group_id, event_type, invitation_id, subject_user_id,
  metadata, occurred_at
)
values
  (gen_random_uuid(), :'uid_i'::uuid, :'gid2'::uuid, 'group_created', null, null, '{}',
   clock_timestamp() - interval '6 hours');

-- Reactions per 007a: D reacts to B's kettle; B and C react to D's game. A
-- left member's reaction on B's kettle is present in the table and must
-- never surface (007a's joined-author predicate).
insert into public.group_item_reactions (group_id, item_id, user_id, reaction, created_at)
values
  (:'gid'::uuid, :'item_kettle'::uuid, :'uid_d'::uuid, 'very_you', clock_timestamp() - interval '15 minutes'),
  (:'gid'::uuid, :'item_game'::uuid, :'uid_b'::uuid, 'want_it_too', clock_timestamp() - interval '12 minutes'),
  (:'gid'::uuid, :'item_game'::uuid, :'uid_c'::uuid, 'questionable', clock_timestamp() - interval '10 minutes'),
  (:'gid'::uuid, :'item_kettle'::uuid, :'uid_g'::uuid, 'questionable', clock_timestamp() - interval '14 minutes');

select ok(true, 'fixtures staged');

-- 4. The visibility matrix: B, the item owner -------------------------------------
-- Acceptance 1: the owner observes ZERO reservation entries, zero
-- reservation-related fields, and zero withheld-entry markers for their own
-- items, while the reservation rows demonstrably exist above.

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'::text), true);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
  ),
  3,
  'owner sees only the three non-owner reservation entries (candle reserved, deleted-item reserved and released)'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where item_id in (:'item_kettle'::uuid, :'item_mug'::uuid, :'item_mat'::uuid)
      and event_kind in ('item_reserved', 'reservation_released')
  ),
  0,
  'owner blind spot: no reservation entry references any of B''s items'
);

-- B still sees membership events and reaction entries (the matrix's Yes
-- cells).
select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('group_created', 'invitation_accepted', 'member_left', 'member_removed')
  ),
  4,
  'owner sees the full membership-event class'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind = 'item_reacted'
  ),
  3,
  'owner sees exactly the three joined-author reaction entries (the left member''s reaction never surfaces)'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('invitation_issued', 'invitation_revoked', 'invitation_declined', 'member_reinvited')
  ),
  0,
  'owner sees zero excluded invitation-mechanics kinds (acceptance 6)'
);

-- The organizer is not omniscient (acceptance 2): A's view is exactly the
-- joined-member view — the same kind set any other joined member reads, and
-- reservation entries appear state-only with no organizer exemption.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'::text), true);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
      and (actor_display_name is not null or subject_display_name is not null)
  ),
  0,
  'organizer''s reservation entries are state-only: null actor and subject, populated item title and owner label'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
  ),
  7,
  'non-owner joined members see all seven reservation events (released and deleted-item paths included)'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('invitation_issued', 'invitation_revoked', 'invitation_declined', 'member_reinvited')
  ),
  0,
  'organizer sees zero excluded kinds either: no omniscient organizer view exists'
);

-- Reserver identity privacy (acceptance 3): no reservation entry carries
-- the reserver's name to any non-reserver viewer.
select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
      and actor_display_name is not null
  ),
  0,
  'reserver identity privacy: no reservation entry carries an actor name for any non-reserver viewer'
);

-- C, the reserver: self-labelled entries instead of an actor name.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'::text), true);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
      and involves_viewer
      and actor_display_name is null
  ),
  5,
  'reserver sees their own five reservation events self-labelled (involves_viewer true, no actor name)'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
      and not involves_viewer
  ),
  1,
  'reserver sees D''s reservation entry state-only'
);

-- C owns the candle that D reserved: the owner blind spot applies to C as
-- the owner, even though C is also a reserver elsewhere.
select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where item_id = :'item_candle'::uuid
  ),
  0,
  'owner blind spot applies to C for the candle: C (owner) sees nothing, no organizer or reserver status exempts'
);

-- D reserved C's candle: D sees it self-labelled.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'::text), true);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where item_id = :'item_candle'::uuid
      and involves_viewer
      and event_kind = 'item_reserved'
  ),
  1,
  'D''s own reservation on C''s candle is self-labelled for D'
);

-- Reaction entries carry the actor for every joined viewer, and the
-- viewer's own reactions are flagged.
select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind = 'item_reacted' and involves_viewer and item_id = :'item_kettle'::uuid
  ),
  1,
  'D sees their own reaction entry self-flagged on the kettle'
);

-- The deleted-item reservation entry resolves its title through the
-- reservation snapshot (never a direct wishlist_items join), with no item
-- id and no owner label.
select is(
  (
    select item_title
    from public.group_activity(:'gid'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
      and item_id is null
    limit 1
  ),
  'Gone fountain pen',
  'the deleted-item reservation entry resolves its title through item_title_snapshot'
);

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where item_id is null
      and event_kind in ('item_reserved', 'reservation_released')
      and owner_display_name is not null
  ),
  0,
  'the deleted-item entry carries no owner label (unattributable after deletion)'
);

-- 5. member_activity: the extra binding rule -------------------------------------
-- Another member's reservation entries never appear in their per-member
-- activity; the viewer's own reservation entries do, self-labelled.

-- C reading C: five self-labelled reservation events plus membership and
-- reaction entries.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'::text), true);
select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_c'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
      and involves_viewer
  ),
  5,
  'member_activity: the reserver''s own activity includes their five reservation events, self-labelled'
);

-- D reading C (D's frame): C's reservation entries never appear;
-- C's membership and reaction entries do.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'::text), true);
select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_c'::uuid)
    where event_kind in ('item_reserved', 'reservation_released')
  ),
  0,
  'member_activity: another member''s (C''s) reservation entries never appear to a non-reserver viewer'
);

select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_c'::uuid)
    where event_kind = 'invitation_accepted'
  ),
  1,
  'member_activity: C''s membership entry appears to another member (D), whose involves_viewer is false'
);

select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_c'::uuid)
    where event_kind = 'item_reacted'
  ),
  1,
  'member_activity: the target''s reaction entries appear (C''s questionable on the game)'
);

-- H (removed) as target: the stale-target denial — zero rows even though H
-- is a subject in the trail.
select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_h'::uuid)
  ),
  0,
  'member_activity: stale target membership (removed) returns zero rows'
);

select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_g'::uuid)
  ),
  0,
  'member_activity: stale target membership (left) returns zero rows'
);

-- The removed member is still a visible membership subject for joined
-- viewers (member_removed is in the inventory), with a generic label.
select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
    where event_kind = 'member_removed' and subject_display_name = 'Former Fae'
  ),
  1,
  'sanity: the removed-member subject entry is a visible membership event for joined viewers, labelled by profile'
);

-- 6. Denial classes -------------------------------------------------------------
-- Acceptance 4: every denied class receives the identical empty result and
-- learns nothing about events, kinds, counts, or volume.

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;

select is(
  (
    select count(*)::int
    from public.group_activity(:'gid'::uuid)
  ),
  0,
  'signed-out caller receives zero rows'
);

select is(
  (
    select count(*)::int
    from public.member_activity(:'gid'::uuid, :'uid_b'::uuid)
  ),
  0,
  'signed-out caller of member_activity receives zero rows'
);

select is(
  (
    select count(*)::int
    from public.group_activity(gen_random_uuid())
  ),
  0,
  'unknown group receives zero rows indistinguishable from any denial'
);

-- Outsider (I, joined only in group 2).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_i';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_i'::text), true);
select is(
  (
    select count(*)::int from public.group_activity(:'gid'::uuid)
  ),
  0,
  'outsider receives zero rows'
);
select is(
  (
    select count(*)::int from public.member_activity(:'gid'::uuid, :'uid_b'::uuid)
  ),
  0,
  'outsider of member_activity receives zero rows'
);
reset role;

-- Pending (E).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_e'::text), true);
select is((select count(*)::int from public.group_activity(:'gid'::uuid)), 0, 'pending viewer receives zero rows');
reset role;

-- Declined (F).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_f';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_f'::text), true);
select is((select count(*)::int from public.group_activity(:'gid'::uuid)), 0, 'declined viewer receives zero rows');
reset role;

-- Left (G).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_g';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_g'::text), true);
select is((select count(*)::int from public.group_activity(:'gid'::uuid)), 0, 'left viewer receives zero rows');
reset role;

-- Removed (H).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_h';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_h'::text), true);
select is((select count(*)::int from public.group_activity(:'gid'::uuid)), 0, 'removed viewer receives zero rows');
reset role;

-- service_role and anon: no EXECUTE privilege at all.
select is(
  (
    select has_function_privilege('service_role', 'public.group_activity(uuid, timestamptz, integer)', 'EXECUTE')
      or has_function_privilege('service_role', 'public.member_activity(uuid, uuid, timestamptz, integer)', 'EXECUTE')
  ),
  false,
  'service_role has no EXECUTE on either activity projection'
);
select is(
  (
    select has_function_privilege('anon', 'public.group_activity(uuid, timestamptz, integer)', 'EXECUTE')
      or has_function_privilege('anon', 'public.member_activity(uuid, uuid, timestamptz, integer)', 'EXECUTE')
  ),
  false,
  'anon has no EXECUTE on either activity projection (zero anon-callable surface added)'
);

-- 7. Bounded result shape -------------------------------------------------------
-- Acceptance 5: clamping, keyset ordering, cursor behavior, bounded text,
-- and the generic display-name fallback.

-- D's full view for the ordering work.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'::text), true);

-- p_limit clamping: 0 and negative clamp to 1; above 50 clamps to 50; null
-- falls back to the default of 20.
select is(
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, 0)),
  1,
  'p_limit 0 clamps to 1'
);
select is(
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, -5)),
  1,
  'negative p_limit clamps to 1'
);
select is(
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, 9999)),
  (
    select count(*)::int from public.group_activity(:'gid'::uuid, null, 50)
  ),
  'p_limit above 50 clamps to 50 (the fixture''s visible entries all fit)'
);
select is(
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, null)),
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, 50)),
  'null p_limit falls back to the default of 20 (all 14 visible entries fit)'
);
select is(
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, 21)),
  (select count(*)::int from public.group_activity(:'gid'::uuid, null, 50)),
  'the default clamping keeps every visible entry when the page allows it'
);

-- Keyset ordering: occurred_at desc with the id desc tiebreak.
select is(
  (
    select bool_and(
      a.occurred_at > b.occurred_at
      or (a.occurred_at = b.occurred_at and a.kind >= b.kind)
    )
    from (
      select occurred_at, event_kind as kind, row_number() over () as rn
      from public.group_activity(:'gid'::uuid, null, 50)
    ) a
    join (
      select occurred_at, event_kind as kind, row_number() over () as rn
      from public.group_activity(:'gid'::uuid, null, 50)
    ) b on b.rn = a.rn + 1
  ),
  true,
  'ordering is occurred_at desc across the full result'
);

-- Cursor behavior: p_before strictly bounds the page.
select is(
  (
    select bool_and(o.occurred_at < (
      select min(occurred_at) from public.group_activity(:'gid'::uuid, null, 3)
    ))
    from (
      select occurred_at from public.group_activity(
        :'gid'::uuid,
        (select min(occurred_at) from public.group_activity(:'gid'::uuid, null, 3)),
        50
      )
    ) o
  ),
  true,
  'p_before is a strict upper bound: the next page contains only earlier entries'
);

-- The generic fallback: I's whitespace profile label resolves to Member (in
-- group 2, where I is a plain member, reading the group activity).
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_i';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_i'::text), true);
select is(
  (
    select count(*)::int
    from public.group_activity(:'gid2'::uuid)
    where event_kind = 'group_created' and actor_display_name = 'Organizer'
  ),
  1,
  'the missing profile falls back generically to Organizer (the established fallback)'
);

-- Reads never write: the fixture counts are unchanged after every read.
reset role;
select is(
  (
    select (select count(*)::int from public.audit_events where group_id = :'gid'::uuid)
      || ':' || (select count(*)::int from public.group_item_reservations where group_id = :'gid'::uuid)
      || ':' || (select count(*)::int from public.group_item_reactions where group_id = :'gid'::uuid)
  ),
  '15:5:4',
  'all reads were side-effect free: audit, reservation, and reaction counts unchanged'
);

select* from finish();

rollback;
