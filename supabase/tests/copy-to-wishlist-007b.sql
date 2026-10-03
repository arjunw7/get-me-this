-- 007b: pgTAP suite for the copy-to-own-wishlist slice.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/007b-copy-to-own-wishlist.md:
-- column and partial-unique-index shape, the definer function's signature,
-- security mode, search_path, and exact grant inventory, positive copy
-- semantics with exactly the approved fields and defaults and the exact
-- 005d append algorithm (empty list, step, compaction fallback), idempotent
-- repeats, uniform denials, client write-grant enforcement on the
-- provenance column, and privacy (no group-facing projection exposes the
-- provenance; no audit entry is written by the copy path). The two-session
-- race interleavings are proven by scripts/test-copy-races-local.sh
-- (pnpm test:db:races:copy). The whole suite is wrapped in one transaction
-- that ends with rollback, so no synthetic row persists.
--
-- Role discipline: function calls run as `authenticated` with synthetic JWT
-- GUCs; direct fixture writes always `reset role` first. throws_ok
-- assertions check the SQLSTATE only, never message text.

begin;

select plan(43);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset

-- 1. Column and index shape ---------------------------------------------------------

select has_column(
  'public', 'wishlist_items', 'copied_from_item_id',
  'wishlist_items.copied_from_item_id exists'
);

select col_type_is(
  'public', 'wishlist_items', 'copied_from_item_id', 'uuid',
  'copied_from_item_id is uuid'
);

select col_is_null(
  'public', 'wishlist_items', 'copied_from_item_id',
  'copied_from_item_id is nullable'
);

-- The provenance FK targets wishlist_items itself with ON DELETE SET NULL.
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conrelid = 'public.wishlist_items'::regclass
      and contype = 'f'
      and exists (
        select 1 from unnest(conkey) as k(attnum)
        where k.attnum = (
          select attnum from pg_attribute
          where attrelid = 'public.wishlist_items'::regclass
            and attname = 'copied_from_item_id'
        )
      )
  ),
  'n',
  'the copied_from_item_id foreign key is ON DELETE SET NULL'
);

select has_index(
  'public', 'wishlist_items', 'wishlist_items_one_copy_per_source',
  'the one-copy-per-source partial unique index exists'
);

select is(
  (
    select i.indisunique::text || ':' || (i.indpred is not null)::text || ':' ||
      (
        select string_agg(a.attname, ',' order by a.attnum)
        from unnest(i.indkey) as k(attnum)
        join pg_attribute a
          on a.attrelid = 'public.wishlist_items'::regclass
          and a.attnum = k.attnum
      )
    from pg_class c
    join pg_index i on i.indexrelid = c.oid
    where c.relname = 'wishlist_items_one_copy_per_source'
  ),
  'true:true:owner_id,copied_from_item_id',
  'the index is unique and partial over exactly (owner_id, copied_from_item_id)'
);

-- 2. Function shape -----------------------------------------------------------------

select has_function('public', 'copy_group_item', 'copy_group_item exists');

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'copy_group_item'),
  1, 'copy_group_item has exactly one signature (no overloads)'
);

select is(
  (select prosecdef::text from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'copy_group_item'),
  'true',
  'copy_group_item is SECURITY DEFINER'
);

select is(
  (select coalesce(proconfig, '{}')::text from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'copy_group_item'),
  $${"search_path=\"\""}$$,
  'copy_group_item sets an empty search_path'
);

select is(
  (select has_function_privilege(
     'authenticated', 'public.copy_group_item(uuid, uuid)', 'EXECUTE')::text),
  'true',
  'authenticated may execute copy_group_item'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as x
   where n.nspname = 'public'
     and p.proname = 'copy_group_item'
     and x.grantee in (0,
       (select oid from pg_roles where rolname = 'anon'),
       (select oid from pg_roles where rolname = 'service_role'))),
  0,
  'no PUBLIC, anon, or service_role EXECUTE grant survives on copy_group_item'
);

-- 3. Provenance column grant discipline ----------------------------------------------

select is(
  (select count(*)::int from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'wishlist_items'
     and column_name = 'copied_from_item_id'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE')),
  0,
  'copied_from_item_id appears in no client INSERT or UPDATE column grant'
);

select is(
  (select count(*)::int from information_schema.role_column_grants
   where table_schema = 'public' and table_name = 'wishlist_items'
     and column_name = 'copied_from_item_id'
     and grantee = 'authenticated'
     and privilege_type = 'SELECT'),
  1,
  'copied_from_item_id is readable in the authenticated owner-scoped SELECT grant'
);

-- 4. Fixtures (all synthetic; the transaction rolls back at the end) ------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'copy-fixture-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'copy-fixture-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'copy-fixture-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'copy-fixture-d@example.invalid', '');

select id as wl_a from public.wishlists where owner_id = :'uid_a'::uuid \gset
select id as wl_b from public.wishlists where owner_id = :'uid_b'::uuid \gset

-- Owner A's source items: one fully populated active item, one invisible
-- (extracting), one with a note, desire level, snapshot path, converted
-- tuple, and submission id that must NOT be copied.
insert into public.wishlist_items (
  id, wishlist_id, owner_id, title, source_url, retailer, image_url, note,
  original_amount_minor, original_currency, converted_amount_minor,
  converted_currency, conversion_rate_source, conversion_rate_at, desire_level,
  image_snapshot_path, extraction_status, sort_position, client_submission_id
) values (
  'c7000000-0000-4000-8000-000000000001', :'wl_a'::uuid, :'uid_a'::uuid,
  'Fixture Pour-over Kettle', 'https://shop.example.invalid/kettle',
  'Fixture Roasters', 'https://img.example.invalid/kettle.jpg',
  'The 1 litre one, not the gooseneck.', 249900, 'INR', 241234, 'INR',
  'fixture', clock_timestamp(), 'really_want', 'fixture-owner/kettle.png', 'manual', 1,
  'd7000000-0000-4000-8000-0000000000f1'
), (
  'c7000000-0000-4000-8000-000000000002', :'wl_a'::uuid, :'uid_a'::uuid,
  'Fixture Hidden Extracting Item', null, null, null, null, null, null,
  null, null, null, null, 'just_an_idea', null, 'extracting', 2, null
), (
  'c7000000-0000-4000-8000-000000000003', :'wl_a'::uuid, :'uid_a'::uuid,
  'Fixture Plain Mug', null, null, null, null, null, null,
  null, null, null, null, 'just_an_idea', null, 'manual', 3, null
), (
  'c7000000-0000-4000-8000-000000000004', :'wl_a'::uuid, :'uid_a'::uuid,
  'Fixture Second Visible', null, null, null, null, null, null,
  null, null, null, null, 'just_an_idea', null, 'manual', 4, null
);

-- Two active groups; A owns the items and is joined in group one only.
insert into public."groups"
  (id, name, occasion, occasion_at, time_zone, mode, status, organizer_id)
values
  ('c7000000-0000-4000-8000-0000000000a1', 'Fixture Copy Group', 'birthday',
   '2026-12-18 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'active', :'uid_a'::uuid),
  ('c7000000-0000-4000-8000-0000000000a2', 'Fixture Other Group', 'birthday',
   '2026-12-19 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'active', :'uid_d'::uuid),
  ('c7000000-0000-4000-8000-0000000000a3', 'Fixture Archived Group', 'birthday',
   '2026-12-20 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'archived', :'uid_a'::uuid);

insert into public.group_members
  (group_id, user_id, status, membership_generation, joined_at)
values
  ('c7000000-0000-4000-8000-0000000000a1', :'uid_a'::uuid, 'joined', 1, clock_timestamp()),
  ('c7000000-0000-4000-8000-0000000000a1', :'uid_b'::uuid, 'joined', 1, clock_timestamp()),
  ('c7000000-0000-4000-8000-0000000000a1', :'uid_c'::uuid, 'invited', 1, null),
  ('c7000000-0000-4000-8000-0000000000a2', :'uid_d'::uuid, 'joined', 1, clock_timestamp()),
  ('c7000000-0000-4000-8000-0000000000a3', :'uid_a'::uuid, 'joined', 1, clock_timestamp()),
  ('c7000000-0000-4000-8000-0000000000a3', :'uid_b'::uuid, 'joined', 1, clock_timestamp());

-- 5. Positive semantics ---------------------------------------------------------------

-- as B (a joined, non-owner member) with an empty wishlist.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid)::text
   is not null::text),
  'true',
  'a joined member copying a friend''s visible item succeeds'
);

reset role;

select is(
  (
    select owner_id::text || '|' || wishlist_id::text || '|' || title ||
      '|' || coalesce(source_url, '') || '|' || coalesce(retailer, '') ||
      '|' || coalesce(image_url, '') || '|' ||
      coalesce(original_amount_minor::text, '') || '|' || original_currency
    from public.wishlist_items
    where owner_id = :'uid_b'::uuid
  ),
  :'uid_b'::text || '|' || :'wl_b'::text || '|Fixture Pour-over Kettle|https://shop.example.invalid/kettle|Fixture Roasters|https://img.example.invalid/kettle.jpg|249900|INR',
  'the copy carries exactly the approved fields under the copier''s identity'
);

select is(
  (
    select (note is null)::text || '|' || desire_level::text || '|' ||
      extraction_status::text || '|' || (image_snapshot_path is null)::text || '|' ||
      (converted_amount_minor is null)::text || '|' || (converted_currency is null)::text || '|' ||
      (client_submission_id is null)::text
    from public.wishlist_items
    where owner_id = :'uid_b'::uuid
  ),
  'true|would_love|manual|true|true|true|true',
  'the copy carries exactly the approved defaults: null note, default desire, manual extraction, no snapshot path, no converted tuple, no submission id'
);

select is(
  (
    select (copied_from_item_id = 'c7000000-0000-4000-8000-000000000001'::uuid)::text ||
      '|' || sort_position::text
    from public.wishlist_items
    where owner_id = :'uid_b'::uuid
  ),
  'true|1',
  'the copy records its provenance and appends at 1 into the empty list'
);

-- Idempotent repeat: the same call returns the existing id, no new row.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) =
   (select id from public.wishlist_items where owner_id = :'uid_b'::uuid)),
  true,
  'a repeat call returns the existing copied item id'
);

reset role;
select is(
  (select count(*)::int from public.wishlist_items where owner_id = :'uid_b'::uuid),
  1,
  'the repeat call wrote nothing new'
);

-- Append step: seed B with items at 2 and 3; the next copy of a second
-- source appends at max_key + greatest(abs(max_key), 1) = 3 + 3 = 6.
reset role;
insert into public.wishlist_items
  (wishlist_id, owner_id, title, desire_level, extraction_status, sort_position)
values
  (:'wl_b'::uuid, :'uid_b'::uuid, 'B Own Item One', 'would_love', 'manual', 2),
  (:'wl_b'::uuid, :'uid_b'::uuid, 'B Own Item Two', 'would_love', 'manual', 3);

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000003'::uuid) is not null::text),
  'true',
  'a second copy of a different source succeeds'
);

select is(
  (select sort_position::text from public.wishlist_items
   where owner_id = :'uid_b'::uuid
     and copied_from_item_id = 'c7000000-0000-4000-8000-000000000003'::uuid),
  '6',
  'a second copy appends at max_key + greatest(abs(max_key), 1)'
);

-- Compaction fallback: push B's max key to the finite bound; the copy must
-- compact B's items by rank and append at existing_count + 1.
reset role;
update public.wishlist_items
set sort_position = 1.7976931348623157e308
where owner_id = :'uid_b'::uuid and title = 'B Own Item Two';

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000004'::uuid) is not null::text),
  'true',
  'a copy whose append key overflows the finite bound still succeeds'
);

reset role;
select is(
  (
    select count(*)::int
    from public.wishlist_items
    where owner_id = :'uid_b'::uuid
      and sort_position = 5::double precision
      and copied_from_item_id = 'c7000000-0000-4000-8000-000000000004'::uuid
  ),
  1,
  'the overflowing copy compacts by rank and appends at existing_count + 1'
);

select is(
  (
    select count(*)::int
    from (
      select sort_position, row_number() over (order by sort_position, id) as rank
      from public.wishlist_items
      where owner_id = :'uid_b'::uuid
    ) ranked
    where ranked.sort_position = ranked.rank::double precision
  ),
  5,
  'after compaction the copier''s five items occupy exactly the ranks 1..5 in total order'
);

-- No audit or activity entry about the copy (no notification either).
select is(
  (select count(*)::int from public.audit_events
   where actor_id = :'uid_b'::uuid),
  0,
  'the copy path writes no audit entry'
);

-- 6. Uniform denials -------------------------------------------------------------------
-- Every denial below must return null, and between them no row is ever
-- written (asserted once at the end of the section).

-- Signed-out.
set local role authenticated;
reset "request.jwt.claim.sub";
reset "request.jwt.claim.role";
select set_config('request.jwt.claims', '', true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'a signed-out caller is denied uniformly'
);

-- Outsider (never a member of the group).
set local "request.jwt.claim.sub" = :'uid_d';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'an outsider is denied uniformly'
);

-- Pending (invited, not joined).
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'a pending member is denied uniformly'
);

-- Declined, left, and removed members.
reset role;
insert into public.group_members
  (group_id, user_id, status, membership_generation, joined_at)
values
  ('c7000000-0000-4000-8000-0000000000a1', :'uid_d'::uuid, 'declined', 1, null);
update public.group_members
set status = 'left', membership_generation = 2
where group_id = 'c7000000-0000-4000-8000-0000000000a1'::uuid and user_id = :'uid_d'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'a declined-then-left member is denied uniformly'
);

reset role;
update public.group_members
set status = 'removed', membership_generation = 3
where group_id = 'c7000000-0000-4000-8000-0000000000a1'::uuid and user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'a removed member is denied uniformly'
);

-- Cross-group: B is joined to the archived group three, but the source
-- owner is not joined there; and the archived group itself is not active.
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a3'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'a cross-group or non-active-group attempt is denied uniformly'
);

-- Unknown group and unknown item.
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000f1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'an unknown group is denied uniformly'
);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-0000000000f1'::uuid) is null::text),
  'true',
  'an unknown item is denied uniformly'
);

-- Invisible extraction state.
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000002'::uuid) is null::text),
  'true',
  'an invisible (extracting) item is denied uniformly'
);

-- Own item: A cannot copy their own item.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (select public.copy_group_item(
     'c7000000-0000-4000-8000-0000000000a1'::uuid,
     'c7000000-0000-4000-8000-000000000001'::uuid) is null::text),
  'true',
  'copying your own item is a uniform denial, not a feature'
);

reset role;
select is(
  (select count(*)::int from public.wishlist_items where owner_id = :'uid_b'::uuid),
  5,
  'every denial above wrote nothing'
);

-- 7. Client write-grant enforcement on the provenance column ---------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select throws_ok(
  'insert into public.wishlist_items (wishlist_id, owner_id, title, desire_level, extraction_status, sort_position, copied_from_item_id)
   values ((select id from public.wishlists where owner_id = auth.uid()), auth.uid(), ''Grant Probe'', ''would_love'', ''manual'', 1, ''c7000000-0000-4000-8000-000000000001''::uuid)',
  42501
);

select throws_ok(
  'update public.wishlist_items set copied_from_item_id = ''c7000000-0000-4000-8000-000000000001''::uuid where owner_id = auth.uid()',
  42501
);


reset role;

-- 8. Privacy ---------------------------------------------------------------------------

select is(
  (select pg_get_function_result('public.member_wishlist_snapshot(uuid, uuid)'::regprocedure)
   not like '%copied_from%')::text,
  'true',
  'the 006e member wishlist projection exposes no provenance column'
);

select is(
  (select pg_get_function_result('public.group_room_snapshot(uuid)'::regprocedure)
   not like '%copied_from%')::text,
  'true',
  'the 006d room snapshot exposes no provenance column'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'wishlist_items'
     and (policyname like '%copied%' or qual like '%copied_from%' or with_check like '%copied_from%')),
  0,
  'no RLS policy grew a copy-aware predicate: the owner-only five stand unchanged'
);

select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and pg_get_function_result(p.oid) like '%copied_from%'
     and p.proname <> 'copy_group_item'),
  0,
  'no public function result exposes copy provenance'
);

select *
from finish();

rollback;
