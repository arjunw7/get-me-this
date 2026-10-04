-- 007a: pgTAP allow/deny suite for reactions and read-only owner summaries.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/007a-reactions-owner-
-- summaries.md: shape and invariants, grants and deny-all RLS, positive
-- set/replace/remove semantics with authoritative counts, the friend-facing
-- and owner-facing snapshots, uniform denials, and privacy. The two-session
-- race interleavings are proven by scripts/test-reaction-races-local.sh
-- (pnpm test:db:races:reactions). The whole suite is wrapped in one
-- transaction that ends with rollback, so no synthetic row persists.
--
-- Role discipline: function calls run as `authenticated` with synthetic JWT
-- GUCs; direct fixture writes on no-grant tables always `reset role` first.
-- throws_ok assertions check the SQLSTATE only, never message text.

begin;

select plan(66);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset

-- 1. Shape and invariants ---------------------------------------------------------

select has_table('public', 'group_item_reactions', 'public.group_item_reactions exists');

select has_column('public', 'group_item_reactions', 'id', 'reactions.id exists');
select has_column('public', 'group_item_reactions', 'group_id', 'reactions.group_id exists');
select has_column('public', 'group_item_reactions', 'item_id', 'reactions.item_id exists');
select has_column('public', 'group_item_reactions', 'user_id', 'reactions.user_id exists');
select has_column('public', 'group_item_reactions', 'reaction', 'reactions.reaction exists');
select has_column('public', 'group_item_reactions', 'created_at', 'reactions.created_at exists');
select has_column('public', 'group_item_reactions', 'updated_at', 'reactions.updated_at exists');

select col_type_is('public', 'group_item_reactions', 'group_id', 'uuid', 'group_id is uuid');
select col_type_is('public', 'group_item_reactions', 'item_id', 'uuid', 'item_id is uuid');
select col_type_is('public', 'group_item_reactions', 'user_id', 'uuid', 'user_id is uuid');
select col_type_is('public', 'group_item_reactions', 'reaction', 'public.group_item_reaction_kind', 'reaction is the closed enum');
select col_not_null('public', 'group_item_reactions', 'reaction', 'reaction is not null');

select has_type('public', 'group_item_reaction_kind', 'the reaction kind enum exists');
select enum_has_labels(
  'public', 'group_item_reaction_kind',
  ARRAY['very_you', 'questionable', 'want_it_too'],
  'the reaction enum has exactly the approved labels in order'
);

-- The database-level one-reaction-per-user-per-context rule.
select col_is_unique(
  'public', 'group_item_reactions', ARRAY['group_id', 'item_id', 'user_id'],
  'group_item_reactions (group_id, item_id, user_id) is UNIQUE'
);

-- FK delete actions: item cascade, group/user restrict.
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
    where conrelid = 'public.group_item_reactions'::regclass and contype = 'f'
  ),
  'auth.users:r,public.groups:r,public.wishlist_items:c',
  'FK delete actions are exactly: item CASCADE, group RESTRICT, user RESTRICT'
);

select has_index(
  'public', 'group_item_reactions', 'group_item_reactions_item_id_idx',
  'the item_id summary index exists'
);

-- updated_at is database-managed by a trigger.
select has_trigger(
  'public', 'group_item_reactions', 'group_item_reactions_set_updated_at',
  'the updated_at trigger exists'
);

-- 2. Function signatures and no overloads ------------------------------------------

select has_function('public', 'set_group_item_reaction', 'the write function exists');
select has_function('public', 'group_item_reaction_snapshot', 'the friend-facing read exists');
select has_function('public', 'own_item_reaction_summary', 'the owner-facing read exists');

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_group_item_reaction'),
  1, 'set_group_item_reaction has exactly one signature (no overloads)'
);
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'group_item_reaction_snapshot'),
  1, 'group_item_reaction_snapshot has exactly one signature'
);
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'own_item_reaction_summary'),
  1, 'own_item_reaction_summary has exactly one signature'
);

-- Exact result shapes.
create temp table shape_set as
  select * from public.set_group_item_reaction(null::uuid, null::uuid, null::public.group_item_reaction_kind);
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_set'::regclass and attnum > 0
  ),
  'very_you_count,questionable_count,want_it_too_count,viewer_reaction',
  'set_group_item_reaction returns exactly the four approved fields'
);

create temp table shape_friend as
  select * from public.group_item_reaction_snapshot(null::uuid, null::uuid);
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_friend'::regclass and attnum > 0
  ),
  'item_id,very_you_count,questionable_count,want_it_too_count,viewer_reaction',
  'group_item_reaction_snapshot returns exactly the five approved fields'
);

create temp table shape_owner as
  select * from public.own_item_reaction_summary();
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_owner'::regclass and attnum > 0
  ),
  'item_id,very_you_count,questionable_count,want_it_too_count',
  'own_item_reaction_summary returns exactly the four approved fields'
);

-- 3. Grants and deny-all RLS ---------------------------------------------------------

select table_privs_are(
  'public', 'group_item_reactions', 'anon', '{}'::text[],
  'anon has zero table privileges on group_item_reactions'
);
select table_privs_are(
  'public', 'group_item_reactions', 'authenticated', '{}'::text[],
  'authenticated has zero table privileges on group_item_reactions'
);
select table_privs_are(
  'public', 'group_item_reactions', 'service_role', '{}'::text[],
  'service_role has zero table privileges on group_item_reactions'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'group_item_reactions'),
  0,
  'group_item_reactions has zero permissive policies (deny-all)'
);

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'group_item_reactions'
     and grantee in ('anon', 'authenticated', 'service_role', 'public')),
  0,
  'no client role holds any table grant on group_item_reactions'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as x
   where n.nspname = 'public'
     and p.proname in ('set_group_item_reaction', 'group_item_reaction_snapshot', 'own_item_reaction_summary')
     and x.grantee = (select oid from pg_roles where rolname = 'authenticated')),
  3,
  'each of the three functions is executable by authenticated'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as x
   where n.nspname = 'public'
     and p.proname in ('set_group_item_reaction', 'group_item_reaction_snapshot', 'own_item_reaction_summary')
     and x.grantee in (0,
       (select oid from pg_roles where rolname = 'anon'),
       (select oid from pg_roles where rolname = 'service_role'))),
  0,
  'no PUBLIC, anon, or service_role EXECUTE grant survives on the three functions'
);

-- 4. Fixtures (all synthetic; the transaction rolls back at the end) ------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'reaction-fixture-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'reaction-fixture-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'reaction-fixture-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'reaction-fixture-d@example.invalid', '');

-- Owner A's wishlist (trigger-created) with two items; second group context
-- gets one more item.
select id as wl_a
  from public.wishlists where owner_id = :'uid_a'::uuid \gset

insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)
values
  ('b7000000-0000-4000-8000-000000000001', :'wl_a'::uuid, :'uid_a'::uuid, 'Fixture Ceramic Mug', 1, 'manual'),
  ('b7000000-0000-4000-8000-000000000002', :'wl_a'::uuid, :'uid_a'::uuid, 'Fixture Desk Lamp', 2, 'manual'),
  ('b7000000-0000-4000-8000-000000000003', :'wl_a'::uuid, :'uid_a'::uuid, 'Fixture Hidden Item', 3, 'extracting');

-- Two active groups; A is organizer/owner of the items in both.
insert into public."groups" (id, name, occasion, occasion_at, time_zone, mode, status, organizer_id)
values
  ('b7000000-0000-4000-8000-0000000000a1', 'Fixture Group One', 'birthday', '2026-12-18 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'active', :'uid_a'::uuid),
  ('b7000000-0000-4000-8000-0000000000a2', 'Fixture Group Two', 'birthday', '2026-12-19 10:00:00+00', 'Asia/Kolkata', 'gift_everyone', 'active', :'uid_a'::uuid);

insert into public.group_members (group_id, user_id, status, membership_generation, joined_at)
values
  ('b7000000-0000-4000-8000-0000000000a1', :'uid_a'::uuid, 'joined', 1, clock_timestamp()),
  ('b7000000-0000-4000-8000-0000000000a1', :'uid_b'::uuid, 'joined', 1, clock_timestamp()),
  ('b7000000-0000-4000-8000-0000000000a1', :'uid_c'::uuid, 'invited', 1, null),
  ('b7000000-0000-4000-8000-0000000000a1', :'uid_d'::uuid, 'invited', 1, null),
  ('b7000000-0000-4000-8000-0000000000a2', :'uid_a'::uuid, 'joined', 1, clock_timestamp()),
  ('b7000000-0000-4000-8000-0000000000a2', :'uid_b'::uuid, 'joined', 1, clock_timestamp());

-- 5. Positive semantics ---------------------------------------------------------------

-- as B (a joined, non-owner member): first reaction on item 1.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (
    select very_you_count::text || ':' || questionable_count::text || ':' || want_it_too_count::text
    from public.set_group_item_reaction(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      'b7000000-0000-4000-8000-000000000001'::uuid,
      'very_you'
    )
  ),
  '1:0:0',
  'B''s first reaction returns the authoritative post-write counts with very_you 1'
);

-- Replace: switching kinds is the single row update.
select is(
  (
    select questionable_count::text || ':' || viewer_reaction::text
    from public.set_group_item_reaction(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      'b7000000-0000-4000-8000-000000000001'::uuid,
      'questionable'
    )
  ),
  '1:questionable',
  'replacing the reaction updates the counts and reports the viewer reaction'
);

reset role;
select is(
  (select count(*)::int from public.group_item_reactions
   where group_id = 'b7000000-0000-4000-8000-0000000000a1'::uuid
     and item_id = 'b7000000-0000-4000-8000-000000000001'::uuid
     and user_id = :'uid_b'::uuid),
  1,
  'exactly one reaction row exists for the context after a replace'
);
set local role authenticated;

-- Remove: selecting the active reaction removes it.
select is(
  (
    select very_you_count::text || ':' || coalesce(viewer_reaction::text, 'null')
    from public.set_group_item_reaction(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      'b7000000-0000-4000-8000-000000000001'::uuid,
      null
    )
  ),
  '0:null',
  'removing the reaction returns zero counts and a null viewer reaction'
);

reset role;
select is(
  (select count(*)::int from public.group_item_reactions
   where group_id = 'b7000000-0000-4000-8000-0000000000a1'::uuid
     and item_id = 'b7000000-0000-4000-8000-000000000001'::uuid
     and user_id = :'uid_b'::uuid),
  0,
  'the removal deleted the row'
);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
-- C is only invited in group one; make C joined for the aggregation test.
reset role;
update public.group_members set status = 'joined'
where group_id = 'b7000000-0000-4000-8000-0000000000a1'::uuid and user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (
    select want_it_too_count::text
    from public.set_group_item_reaction(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      'b7000000-0000-4000-8000-000000000001'::uuid,
      'want_it_too'
    )
  ),
  '1',
  'C''s want_it_too reaction reports count 1'
);

-- as B: the friend-facing snapshot for A's items in group one.
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select string_agg(item_id::text || '=' || very_you_count::text || ',' || questionable_count::text || ',' || want_it_too_count::text, ' | ' order by item_id::text)
    from public.group_item_reaction_snapshot(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
  ),
  'b7000000-0000-4000-8000-000000000001=0,0,1 | b7000000-0000-4000-8000-000000000002=0,0,0',
  'the friend snapshot shows item rows in 005d order including the zero-count row, and excludes the extracting item'
);

-- B's own viewer_reaction appears; A (owner target) always gets null.
select is(
  (
    select coalesce(viewer_reaction::text, 'null')
    from public.group_item_reaction_snapshot(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
    where item_id = 'b7000000-0000-4000-8000-000000000001'::uuid
  ),
  'null',
  'the snapshot viewer_reaction is null after the caller''s removal'
);

select is(
  (
    select coalesce(viewer_reaction::text, 'null')
    from public.group_item_reaction_snapshot(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
    where item_id = 'b7000000-0000-4000-8000-000000000002'::uuid
  ),
  'null',
  'the snapshot viewer_reaction is null for the caller with no reaction row'
);

-- as A (the owner): own-item snapshot call is sanctioned; viewer_reaction always null.
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select string_agg(very_you_count::text || ',' || questionable_count::text || ',' || want_it_too_count::text, ' | ' order by item_id::text)
    from public.group_item_reaction_snapshot(
      'b7000000-0000-4000-8000-0000000000a1'::uuid,
      :'uid_a'::uuid
    )
  ),
  '0,0,1 | 0,0,0',
  'the owner''s own snapshot call exposes counts with null viewer reactions'
);

-- Owner summary aggregates across two group contexts and excludes leavers.
-- as C: reacts to item 2 in group one.
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select set_group_item_reaction(
  'b7000000-0000-4000-8000-0000000000a1'::uuid,
  'b7000000-0000-4000-8000-000000000002'::uuid,
  'very_you'
);
-- B reacts to item 1 in group two as well.
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select set_group_item_reaction(
  'b7000000-0000-4000-8000-0000000000a2'::uuid,
  'b7000000-0000-4000-8000-000000000001'::uuid,
  'questionable'
);

select is(
  (
    select coalesce(viewer_reaction::text, 'null')
    from public.group_item_reaction_snapshot(
      'b7000000-0000-4000-8000-0000000000a2'::uuid,
      :'uid_a'::uuid
    )
    where item_id = 'b7000000-0000-4000-8000-000000000001'::uuid
  ),
  'questionable',
  'the snapshot returns the caller''s own viewer reaction on a friend''s item'
);

-- C leaves group one; C's reaction must drop out of every count.
reset role;
update public.group_members set status = 'left'
where group_id = 'b7000000-0000-4000-8000-0000000000a1'::uuid and user_id = :'uid_c'::uuid;

-- as A: owner summary.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select very_you_count::text || ',' || questionable_count::text || ',' || want_it_too_count::text
    from public.own_item_reaction_summary()
    where item_id = 'b7000000-0000-4000-8000-000000000001'::uuid
  ),
  '0,1,0',
  'the owner summary aggregates across groups (B''s group-two questionable) and excludes the leaver''s reaction'
);

select is(
  (
    select very_you_count::text
    from public.own_item_reaction_summary()
    where item_id = 'b7000000-0000-4000-8000-000000000002'::uuid
  ),
  '0',
  'the leaver''s very_you no longer counts anywhere'
);

-- Durable history: the leaver's rows still exist.
reset role;
select is(
  (select count(*)::int from public.group_item_reactions where user_id = :'uid_c'::uuid),
  2,
  'leaver reaction rows are kept as durable history'
);

-- 6. Uniform denials (writes leave no row; reads return zero rows) ---------------------

-- Signed-out caller: authenticated with no JWT claims, so auth.uid() is null.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a1'::uuid,
    'b7000000-0000-4000-8000-000000000001'::uuid,
    'very_you'
  )),
  0, 'a signed-out caller''s write is denied with an empty result'
);
select is(
  (select count(*)::int from public.group_item_reaction_snapshot('b7000000-0000-4000-8000-0000000000a1'::uuid, :'uid_a'::uuid)),
  0, 'a signed-out caller''s read returns zero rows'
);
select is(
  (select count(*)::int from public.own_item_reaction_summary()),
  0, 'a signed-out owner summary returns zero rows'
);

-- Pending (invited) member attempt: D is invited in group one.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);
select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a1'::uuid,
    'b7000000-0000-4000-8000-000000000001'::uuid,
    'very_you'
  )),
  0, 'a pending (invited) member''s write is denied with an empty result'
);

-- C (left in group one) attempts to write there.
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a1'::uuid,
    'b7000000-0000-4000-8000-000000000001'::uuid,
    'very_you'
  )),
  0, 'a left member''s write is denied with an empty result'
);

-- Unknown item.
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a1'::uuid,
    gen_random_uuid(),
    'very_you'
  )),
  0, 'an unknown item write is denied with an empty result'
);

-- Unknown group.
select is(
  (select count(*)::int from public.set_group_item_reaction(
    gen_random_uuid(),
    'b7000000-0000-4000-8000-000000000001'::uuid,
    'very_you'
  )),
  0, 'an unknown group write is denied with an empty result'
);

-- Invisible item (extraction_status = extracting).
select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a1'::uuid,
    'b7000000-0000-4000-8000-000000000003'::uuid,
    'very_you'
  )),
  0, 'an invisible (extracting) item write is denied with an empty result'
);

-- Own-item attempt: B is the owner of B's own wishlist; create a B-owned item.
reset role;
select id as wl_b
  from public.wishlists where owner_id = :'uid_b'::uuid \gset
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)
values ('b7000000-0000-4000-8000-000000000004', :'wl_b'::uuid, :'uid_b'::uuid, 'Fixture Own Item', 1, 'manual');

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a1'::uuid,
    'b7000000-0000-4000-8000-000000000004'::uuid,
    'very_you'
  )),
  0, 'an own-item write is denied with an empty result'
);

-- Cross-group attempt: item 1 belongs to A who is joined in group two, but the
-- caller B attempts to react in group two on a different context? Both are
-- joined there, so use C (not a member of group two).
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (select count(*)::int from public.set_group_item_reaction(
    'b7000000-0000-4000-8000-0000000000a2'::uuid,
    'b7000000-0000-4000-8000-000000000001'::uuid,
    'very_you'
  )),
  0, 'a non-member caller''s cross-group write is denied with an empty result'
);

-- 7. Direct table access is denied at grant and policy layers ---------------------------

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select throws_ok(
  'select * from public.group_item_reactions',
  '42501',
  NULL,
  'authenticated direct SELECT on group_item_reactions is denied'
);
select throws_ok(
  'insert into public.group_item_reactions (group_id, item_id, user_id, reaction) values (null, null, null, ''very_you'')',
  '42501',
  NULL,
  'authenticated direct INSERT on group_item_reactions is denied'
);

select throws_ok(
  'update public.group_item_reactions set reaction = ''very_you''',
  '42501',
  NULL,
  'authenticated direct UPDATE on group_item_reactions is denied'
);

select throws_ok(
  'delete from public.group_item_reactions',
  '42501',
  NULL,
  'authenticated direct DELETE on group_item_reactions is denied'
);

-- 8. Privacy ------------------------------------------------------------------------------

-- No function's declared return columns carry identities or gifting-private
-- fields; asserted against information_schema.
select is(
  (
    select count(*)::int
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name in ('set_group_item_reaction', 'group_item_reaction_snapshot', 'own_item_reaction_summary')
      and parameter_name is not distinct from 'user_id'
  ),
  0,
  'no public reaction function declares a user_id result or parameter'
);

-- Item cascade: deleting an item deletes its reactions (durable for groups and
-- users, cascade for items per the brief).
reset role;
insert into public.group_item_reactions (group_id, item_id, user_id, reaction)
values ('b7000000-0000-4000-8000-0000000000a1'::uuid, 'b7000000-0000-4000-8000-000000000002'::uuid, :'uid_b'::uuid, 'very_you');
select is(
  (select count(*)::int from public.group_item_reactions
   where item_id = 'b7000000-0000-4000-8000-000000000002'::uuid),
  2, 'the direct fixture reaction rows exist before the cascade test'
);
delete from public.wishlist_items where id = 'b7000000-0000-4000-8000-000000000002'::uuid;
select is(
  (select count(*)::int from public.group_item_reactions
   where item_id = 'b7000000-0000-4000-8000-000000000002'::uuid),
  0, 'deleting the item cascades its reaction rows away'
);

select finish();
rollback;
