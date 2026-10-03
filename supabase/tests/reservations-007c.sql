-- 007c: pgTAP allow/deny suite for atomic private reservations.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/007c-atomic-private-
-- reservations.md: shape and invariants, the single-winner model,
-- eligibility, atomic claim and friendly conflict, lifecycle, owner-deletion
-- safety, departure release, owner-blind privacy, identity privacy,
-- grants/inventory, audit correctness. The two-session race interleavings
-- are proven by scripts/test-reservation-races-local.sh (pnpm
-- test:db:races:reservations). The whole suite is wrapped in one transaction
-- that ends with rollback.
--
-- Role discipline: function calls run as `authenticated` with synthetic JWT
-- GUCs; direct fixture writes on no-grant tables always `reset role` first.

begin;

select plan(87);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset

-- 1. Shape and invariants ---------------------------------------------------------

select has_table('public', 'group_item_reservations', 'public.group_item_reservations exists');

select has_column('public', 'group_item_reservations', 'id', 'reservations.id exists');
select has_column('public', 'group_item_reservations', 'group_id', 'reservations.group_id exists');
select has_column('public', 'group_item_reservations', 'item_id', 'reservations.item_id exists');
select has_column('public', 'group_item_reservations', 'reserver_id', 'reservations.reserver_id exists');
select has_column('public', 'group_item_reservations', 'status', 'reservations.status exists');
select has_column('public', 'group_item_reservations', 'item_title_snapshot', 'reservations.item_title_snapshot exists');
select has_column('public', 'group_item_reservations', 'reserved_at', 'reservations.reserved_at exists');
select has_column('public', 'group_item_reservations', 'released_at', 'reservations.released_at exists');
select has_column('public', 'group_item_reservations', 'released_reason', 'reservations.released_reason exists');
select has_column('public', 'group_item_reservations', 'created_at', 'reservations.created_at exists');
select has_column('public', 'group_item_reservations', 'updated_at', 'reservations.updated_at exists');

select col_is_pk(
  'public', 'group_item_reservations', 'id',
  'group_item_reservations id is the primary key'
);

select has_index(
  'public', 'group_item_reservations', 'group_item_reservations_one_active',
  'the partial unique one-active-reservation index exists'
);

select is(
  (
    select count(*)::int from pg_indexes
    where schemaname = 'public'
      and indexname = 'group_item_reservations_one_active'
      and indexdef like '%CREATE UNIQUE%'
      and indexdef like '%WHERE (status%'
  ),
  1,
  'group_item_reservations_one_active is a UNIQUE partial index on status = active'
);

select has_type('public', 'group_reservation_status', 'the reservation status enum exists');
select enum_has_labels(
  'public', 'group_reservation_status',
  ARRAY['active', 'released'],
  'the reservation status enum has exactly the approved labels in order'
);
select has_type('public', 'group_reservation_release_reason', 'the release reason enum exists');
select enum_has_labels(
  'public', 'group_reservation_release_reason',
  ARRAY['by_reserver', 'item_deleted', 'reserver_departed'],
  'the release reason enum has exactly the approved labels in order'
);

-- Enum values for the 006a amendment (additive, permanent). Deliberate,
-- reviewed amendment for the post-008c union schema: the two reservation
-- values precede the two 008c draw values (migration order 20261010000001
-- before 20261012020000).
select enum_has_labels(
  'public', 'group_audit_event_type',
  ARRAY[
    'group_created',
    'organizer_transferred',
    'invitation_issued',
    'invitation_revoked',
    'invitation_accepted',
    'member_left',
    'invitation_declined',
    'member_removed',
    'member_reinvited',
    'item_reserved',
    'reservation_released',
    'draw_created',
    'draw_redrawn'
  ],
  'the audit event enum carries the two reservation values after the shared ones and before the 008c draw values'
);

-- FK delete actions: group RESTRICT, item SET NULL, user RESTRICT.
select is(
  (
    select string_agg(
      (select nspname || '.' || relname
       from pg_class c2
       join pg_namespace n2 on n2.oid = c2.relnamespace
       where c2.oid = confrelid)
      || ':' || confdeltype::text,
      ',' order by confrelid::regclass::text
    )
    from pg_constraint
    where conrelid = 'public.group_item_reservations'::regclass and contype = 'f'
  ),
  'auth.users:r,public.groups:r,public.wishlist_items:n',
  'FK delete actions are exactly: group RESTRICT, user RESTRICT, item SET NULL'
);

select has_trigger(
  'public', 'group_item_reservations', 'group_item_reservations_set_updated_at',
  'the reservations updated_at trigger exists'
);
select has_trigger(
  'public', 'wishlist_items', 'wishlist_items_release_reservations_before_delete',
  'the owner-deletion release trigger exists'
);
select has_trigger(
  'public', 'group_members', 'group_members_release_reservations_on_departure',
  'the departure release trigger exists'
);

-- 2. Function signatures and no overloads ------------------------------------------

select has_function('public', 'reserve_group_item', 'reserve_group_item exists');
select has_function('public', 'release_group_reservation', 'release_group_reservation exists');
select has_function('public', 'my_group_reservations', 'my_group_reservations exists');
select has_function('public', 'member_wishlist_gifting_snapshot', 'member_wishlist_gifting_snapshot exists');

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_group_item'),
  1, 'reserve_group_item has exactly one signature'
);
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'release_group_reservation'),
  1, 'release_group_reservation has exactly one signature'
);
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'my_group_reservations'),
  1, 'my_group_reservations has exactly one signature'
);
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'member_wishlist_gifting_snapshot'),
  1, 'member_wishlist_gifting_snapshot has exactly one signature'
);

-- The 006a amendment: the metadata allowlist gains exactly the two keys.
select is(
  (
    select count(*)::int
    from (select 'invitation_id' k union all select 'membership_generation'
          union all select 'target_user_id' union all select 'previous_organizer_id'
          union all select 'new_organizer_id' union all select 'migration_version'
          union all select 'reason' union all select 'item_id'
          union all select 'reservation_id') allowed
    where not private.audit_metadata_is_safe(jsonb_build_object(allowed.k, 'x'))
  ),
  0,
  'every allowlisted key passes audit_metadata_is_safe'
);
select is(
  (select private.audit_metadata_is_safe(jsonb_build_object('reserver_name', 'x'))),
  false,
  'audit_metadata_is_safe still rejects unknown keys'
);
select is(
  (select private.audit_metadata_is_safe('{"item_id":"x","reservation_id":"y"}'::jsonb)),
  true,
  'item_id and reservation_id are admitted by audit_metadata_is_safe'
);
select is(
  (select private.audit_metadata_is_safe('{"migration_version":"007c","reason":"r"}'::jsonb)),
  true,
  'the 006b system keys are still admitted by audit_metadata_is_safe'
);

-- 3. Grants and deny-all RLS ---------------------------------------------------------

select table_privs_are(
  'public', 'group_item_reservations', 'anon', '{}'::text[],
  'anon has zero table privileges on group_item_reservations'
);
select table_privs_are(
  'public', 'group_item_reservations', 'authenticated', '{}'::text[],
  'authenticated has zero table privileges on group_item_reservations'
);
select table_privs_are(
  'public', 'group_item_reservations', 'service_role', '{}'::text[],
  'service_role has zero table privileges on group_item_reservations'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'group_item_reservations'),
  0,
  'group_item_reservations has zero permissive policies (deny-all)'
);

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'group_item_reservations'
     and grantee in ('anon', 'authenticated', 'service_role', 'public')),
  0,
  'no client role holds any table grant on group_item_reservations'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as x
   where n.nspname = 'public'
     and p.proname in ('reserve_group_item', 'release_group_reservation', 'my_group_reservations', 'member_wishlist_gifting_snapshot')
     and x.grantee = (select oid from pg_roles where rolname = 'authenticated')),
  4,
  'each of the four functions is executable by authenticated'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as x
   where n.nspname = 'public'
     and p.proname in ('reserve_group_item', 'release_group_reservation', 'my_group_reservations', 'member_wishlist_gifting_snapshot')
     and x.grantee in (0,
       (select oid from pg_roles where rolname = 'anon'),
       (select oid from pg_roles where rolname = 'service_role'))),
  0,
  'no PUBLIC, anon, or service_role EXECUTE grant survives on the four functions'
);

-- 4. Fixtures (all synthetic; the transaction rolls back at the end) ------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'reservation-fixture-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'reservation-fixture-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'reservation-fixture-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'reservation-fixture-d@example.invalid', '');

select id as wl_a
  from public.wishlists where owner_id = :'uid_a'::uuid \gset

insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)
values
  ('b8000000-0000-4000-8000-000000000001', :'wl_a'::uuid, :'uid_a'::uuid, 'Fixture Mechanical Keyboard', 1, 'manual'),
  ('b8000000-0000-4000-8000-000000000002', :'wl_a'::uuid, :'uid_a'::uuid, 'Fixture Invisible Item', 2, 'extracting');

insert into public."groups" (id, name, occasion, occasion_at, time_zone, mode, status, organizer_id)
values
  ('b8000000-0000-4000-8000-0000000000a1', 'Reservation Fixture Group', 'birthday', '2026-12-18 10:00:00+00', 'Asia/Kolkata', 'gift_everyone', 'active', :'uid_a'::uuid),
  ('b8000000-0000-4000-8000-0000000000a2', 'Second Fixture Group', 'birthday', '2026-12-19 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'active', :'uid_a'::uuid);

insert into public.group_members (group_id, user_id, status, membership_generation, joined_at)
values
  ('b8000000-0000-4000-8000-0000000000a1', :'uid_a'::uuid, 'joined', 1, clock_timestamp()),
  ('b8000000-0000-4000-8000-0000000000a1', :'uid_b'::uuid, 'joined', 1, clock_timestamp()),
  ('b8000000-0000-4000-8000-0000000000a1', :'uid_c'::uuid, 'joined', 1, clock_timestamp()),
  ('b8000000-0000-4000-8000-0000000000a1', :'uid_d'::uuid, 'invited', 1, null),
  ('b8000000-0000-4000-8000-0000000000a2', :'uid_a'::uuid, 'joined', 1, clock_timestamp()),
  ('b8000000-0000-4000-8000-0000000000a2', :'uid_c'::uuid, 'joined', 1, clock_timestamp());

-- 5. Atomic claim, conflict, lifecycle --------------------------------------------------

-- as B: first claim succeeds.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select result::text as claim_result, coalesce(reservation_id::text, 'null') as claim_id
  from public.reserve_group_item(
    'b8000000-0000-4000-8000-0000000000a1'::uuid,
    'b8000000-0000-4000-8000-000000000001'::uuid
  ) \gset

select is(:'claim_result'::text, 'reserved', 'B''s first claim returns the reserved result with a reservation id');
select is(length(:'claim_id'::text), 36, 'the reserved result carries the new reservation id');

reset role;
select is(
  (select count(*)::int from public.group_item_reservations
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
     and status = 'active'),
  1,
  'exactly one active reservation row exists after the claim'
);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

reset role;
select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'item_reserved'),
  1,
  'exactly one item_reserved audit event was appended in the same transaction'
);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

reset role;
reset role;
select is(
  (
    select (metadata->>'item_id') || '|' || (metadata->>'reservation_id') || '|' ||
           (select count(*)::text from jsonb_object_keys(metadata))
    from public.audit_events
    where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
      and event_type = 'item_reserved'
  ),
  'b8000000-0000-4000-8000-000000000001|' || (
    select id::text from public.group_item_reservations
    where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
      and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
      and status = 'active'
  ) || '|2',
  'the claim audit metadata carries exactly the bounded item and reservation identifiers'
);

reset role;
select is(
  (
    select (select owner_id from public.wishlist_items
            where id = (metadata->>'item_id')::uuid)::text
    from public.audit_events
    where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
      and event_type = 'item_reserved'
  ),
  :'uid_a'::text,
  'the claim audit event names the item''s owner as the subject'
);

-- Idempotent replay: same caller claims again.
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'already_yours',
  'the same caller''s second claim is the idempotent already_yours replay'
);

select is(
  (select count(*)::int from public.group_item_reservations
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid),
  1,
  'the idempotent replay wrote no second row'
);

select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'item_reserved'),
  1,
  'the idempotent replay appended no second audit event'
);

-- Friendly conflict: another member claims the same item.
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (
    select result::text || ':' || coalesce(reservation_id::text, 'null')
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'conflict:null',
  'another member''s claim on the claimed item is the friendly conflict with no reservation id'
);

select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'item_reserved'),
  1,
  'the conflicting claim appended no audit event'
);

-- Release: reserver-only, durable history, idempotent.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select result::text
    from public.release_group_reservation(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      (select id from public.group_item_reservations
       where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
         and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
         and status = 'active')
    )
  ),
  'released',
  'the reserver''s explicit release returns the released result'
);

select is(
  (
    select status::text || ':' || coalesce(released_reason::text, 'null')
    from public.group_item_reservations
    where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
      and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
  ),
  'released:by_reserver',
  'the released row is durable history with the by_reserver reason'
);

select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'reservation_released'),
  1,
  'exactly one reservation_released audit event exists for the release'
);

-- Idempotent second release.
select is(
  (
    select result::text
    from public.release_group_reservation(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      (select id from public.group_item_reservations
       where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
         and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid)
    )
  ),
  'released',
  'releasing the already-released own reservation is an idempotent success'
);

select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'reservation_released'),
  1,
  'the idempotent replay appended no second release audit event'
);

-- A member cannot release another member's reservation.
-- C claims, then B attempts to release C's reservation.
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select reserve_group_item(
  'b8000000-0000-4000-8000-0000000000a1'::uuid,
  'b8000000-0000-4000-8000-000000000001'::uuid
);
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select result::text
    from public.release_group_reservation(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      (select id from public.group_item_reservations
       where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
         and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
         and status = 'active')
    )
  ),
  'unavailable',
  'a non-reserver member cannot release another member''s reservation'
);

-- 6. Uniform denials ---------------------------------------------------------------------

-- Signed out: authenticated with no claims, so auth.uid() is null.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'unavailable',
  'a signed-out claim is the generic unavailable denial'
);
select is(
  (select count(*)::int from public.my_group_reservations('b8000000-0000-4000-8000-0000000000a1'::uuid)),
  0, 'a signed-out my_group_reservations returns zero rows'
);
select is(
  (select count(*)::int from public.member_wishlist_gifting_snapshot('b8000000-0000-4000-8000-0000000000a1'::uuid, :'uid_a'::uuid)),
  0, 'a signed-out gifting snapshot returns zero rows'
);

-- Pending (invited) member attempt.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'unavailable',
  'a pending (invited) member''s claim is the generic unavailable denial'
);

-- Unknown item / group / invisible item / own item.
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (
    select result::text
    from public.reserve_group_item('b8000000-0000-4000-8000-0000000000a1'::uuid, gen_random_uuid())
  ),
  'unavailable',
  'an unknown item claim is the generic unavailable denial'
);
select is(
  (
    select result::text
    from public.reserve_group_item(gen_random_uuid(), 'b8000000-0000-4000-8000-000000000001'::uuid)
  ),
  'unavailable',
  'an unknown group claim is the generic unavailable denial'
);
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000002'::uuid
    )
  ),
  'unavailable',
  'an invisible (extracting) item claim is the generic unavailable denial'
);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a2'::uuid,
      'b8000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'reserved',
  'a joined non-owner member''s claim in the second group succeeds (uniform eligibility)'
);
reset role;
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)
values ('b8000000-0000-4000-8000-000000000003', :'wl_a'::uuid, :'uid_a'::uuid, 'Fixture Third Item', 3, 'manual');
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000003'::uuid
    )
  ),
  'unavailable',
  'the owner''s own-item claim is the generic unavailable denial'
);

-- 7. Owner-blind privacy -------------------------------------------------------------------

-- as A (the owner): the gifting snapshot for their own items always shows
-- both flags false, with reservations demonstrably present.
-- C's active reservation from the non-reserver-release setup is demonstrably
-- present for the owner-blind assertions below.

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (
    select string_agg(viewer_reserved::text || reserved_by_other::text, ',' order by item_id::text)
    from public.member_wishlist_gifting_snapshot(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
  ),
  'falsefalse,falsefalse',
  'the owner''s own gifting snapshot shows both flags false on every item while a reservation exists'
);

-- Equivalence: the owner's output is byte-identical with many reservations.
reset role;
insert into public.group_item_reservations (
  id, group_id, item_id, reserver_id, status, item_title_snapshot
)
values
  ('b8000000-0000-4000-8000-0000000000b2',
   'b8000000-0000-4000-8000-0000000000a1',
   'b8000000-0000-4000-8000-000000000001',
   :'uid_c'::uuid, 'released', 'Fixture Mechanical Keyboard');

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select string_agg(viewer_reserved::text || reserved_by_other::text, ',' order by item_id::text)
    from public.member_wishlist_gifting_snapshot(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
  ),
  'falsefalse,falsefalse',
  'the owner''s own gifting snapshot is byte-identical with more reservations present'
);

-- Identity privacy: another eligible member sees reserved_by_other without
-- any reserver identity, id, or timestamp.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select viewer_reserved::text || reserved_by_other::text
    from public.member_wishlist_gifting_snapshot(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
    where item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
  ),
  'falsetrue',
  'an eligible member observes reserved_by_other for another member''s active reservation'
);

-- my_group_reservations returns only the reserver's own rows.
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (select count(*)::int from public.my_group_reservations('b8000000-0000-4000-8000-0000000000a1'::uuid)),
  1,
  'the reserver sees their own active reservation'
);
select is(
  (
    select item_title_snapshot || ':' || owner_display_name
    from public.my_group_reservations('b8000000-0000-4000-8000-0000000000a1'::uuid)
  ),
  'Fixture Mechanical Keyboard:Member',
  'my_group_reservations returns the snapshot title and the generic Member owner fallback'
);

set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select count(*)::int from public.my_group_reservations('b8000000-0000-4000-8000-0000000000a1'::uuid)),
  0,
  'a member with no active reservation in the group sees an empty result'
);

-- No projection returns a reserver identity.
select is(
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_wishlist_gifting_snapshot'
      and column_name not in (
        'item_id', 'title', 'image_url', 'note', 'desire_level',
        'original_amount_minor', 'original_currency',
        'converted_amount_minor', 'converted_currency', 'sort_position',
        'viewer_reserved', 'reserved_by_other'
      )
  ),
  0,
  'the gifting projection exposes exactly the item columns and the two flags'
);

-- 8. Departure release and owner-deletion safety --------------------------------------------

-- Departure: C leaves; their active reservation auto-releases in the same
-- transaction with the reserver_departed reason and one audit event.
reset role;
update public.group_members
set status = 'left'
where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid and user_id = :'uid_c'::uuid;

select is(
  (
    select status::text || ':' || coalesce(released_reason::text, 'null')
    from public.group_item_reservations
    where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
      and reserver_id = :'uid_c'::uuid
      and item_id = 'b8000000-0000-4000-8000-000000000001'::uuid
      and released_reason = 'reserver_departed'
  ),
  'released:reserver_departed',
  'the departing reserver''s active reservation auto-released with the reserver_departed reason'
);

select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'reservation_released'
     and metadata->>'reservation_id' = (
       select id::text from public.group_item_reservations
       where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
         and reserver_id = :'uid_c'::uuid
         and released_reason = 'reserver_departed'
     )),
  1,
  'the departure-triggered release appended exactly one audit event'
);

select is(
  (select count(*)::int from public.group_item_reservations
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and reserver_id = :'uid_c'::uuid
     and released_reason = 'reserver_departed'),
  1,
  'the released row remains durable history'
);

-- Freed item is claimable again through the normal atomic path.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select result::text
    from public.reserve_group_item(
      'b8000000-0000-4000-8000-0000000000a1'::uuid,
      'b8000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'reserved',
  'the freed item is claimable through the normal atomic path after the departure'
);

-- Owner deletion: releases the active reservation with item_deleted, nulls
-- item_id, keeps the row, and produces no audit event.
reset role;
delete from public.wishlist_items where id = 'b8000000-0000-4000-8000-000000000001'::uuid;

select is(
  (
    select status::text || ':' || coalesce(released_reason::text, 'null') || ':' || (item_id is null)::text
    from public.group_item_reservations
    where reserver_id = :'uid_b'::uuid
      and status = 'released'
      and released_reason = 'item_deleted'
  ),
  'released:item_deleted:true',
  'the owner''s item deletion released the active reservation with the item_deleted reason and nulled item_id'
);

select is(
  (select count(*)::int from public.group_item_reservations
   where item_id = 'b8000000-0000-4000-8000-000000000001'::uuid),
  0,
  'no reservation row retains the deleted item id as active history pointer'
);

select is(
  (select count(*)::int from public.audit_events
   where group_id = 'b8000000-0000-4000-8000-0000000000a1'::uuid
     and event_type = 'reservation_released'),
  2,
  'the item-deletion release appended no audit event (only the two deliberate releases)'
);

-- 9. Direct table access is denied -----------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select throws_ok(
  'select * from public.group_item_reservations',
  '42501',
  NULL,
  'authenticated direct SELECT on group_item_reservations is denied'
);
select throws_ok(
  'insert into public.group_item_reservations (group_id, item_id, reserver_id, status, item_title_snapshot) values (null, null, null, ''active'', ''x'')',
  '42501',
  NULL,
  'authenticated direct INSERT on group_item_reservations is denied'
);
select throws_ok(
  'update public.group_item_reservations set status = ''released''',
  '42501',
  NULL,
  'authenticated direct UPDATE on group_item_reservations is denied'
);
select throws_ok(
  'delete from public.group_item_reservations',
  '42501',
  NULL,
  'authenticated direct DELETE on group_item_reservations is denied'
);

select finish();
rollback;
