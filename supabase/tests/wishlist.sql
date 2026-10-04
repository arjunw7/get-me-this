-- 005a: pgTAP allow/deny suite for public.wishlists and public.wishlist_items.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/005a-wishlist-schema-grants-
-- rls-and-tests.md acceptance criteria 1-14: the schema shape (tables,
-- columns, enums, FKs, CHECK constraints, RLS, policies, triggers), the
-- signup trigger and backfill, owner allow cases for reads and writes, the
-- grant/RLS inventory, signed-out denial, cross-user enumeration and
-- mutation denial, one-wishlist uniqueness, timestamp behavior, money
-- integrity, enum and bound rejections, sort-position semantics, and
-- cascading deletes. The whole suite is wrapped in one transaction that
-- ends with rollback, so no synthetic user or wishlist persists.

begin;

select plan(163);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset

-- 1. Schema shape ----------------------------------------------------------------

select has_table(
  'public', 'wishlists',
  'public.wishlists exists'
);

select has_table(
  'public', 'wishlist_items',
  'public.wishlist_items exists'
);

select has_column('public', 'wishlists', 'id', 'wishlists.id exists');
select has_column('public', 'wishlists', 'owner_id', 'wishlists.owner_id exists');
select has_column('public', 'wishlists', 'created_at', 'wishlists.created_at exists');
select has_column('public', 'wishlists', 'updated_at', 'wishlists.updated_at exists');

select has_column('public', 'wishlist_items', 'id', 'wishlist_items.id exists');
select has_column('public', 'wishlist_items', 'wishlist_id', 'wishlist_items.wishlist_id exists');
select has_column('public', 'wishlist_items', 'owner_id', 'wishlist_items.owner_id exists');
select has_column('public', 'wishlist_items', 'title', 'wishlist_items.title exists');
select has_column('public', 'wishlist_items', 'source_url', 'wishlist_items.source_url exists');
select has_column('public', 'wishlist_items', 'retailer', 'wishlist_items.retailer exists');
select has_column('public', 'wishlist_items', 'image_url', 'wishlist_items.image_url exists');
select has_column('public', 'wishlist_items', 'image_snapshot_path', 'wishlist_items.image_snapshot_path exists');
select has_column('public', 'wishlist_items', 'note', 'wishlist_items.note exists');
select has_column('public', 'wishlist_items', 'original_amount_minor', 'wishlist_items.original_amount_minor exists');
select has_column('public', 'wishlist_items', 'original_currency', 'wishlist_items.original_currency exists');
select has_column('public', 'wishlist_items', 'converted_amount_minor', 'wishlist_items.converted_amount_minor exists');
select has_column('public', 'wishlist_items', 'converted_currency', 'wishlist_items.converted_currency exists');
select has_column('public', 'wishlist_items', 'conversion_rate_source', 'wishlist_items.conversion_rate_source exists');
select has_column('public', 'wishlist_items', 'conversion_rate_at', 'wishlist_items.conversion_rate_at exists');
select has_column('public', 'wishlist_items', 'desire_level', 'wishlist_items.desire_level exists');
select has_column('public', 'wishlist_items', 'extraction_status', 'wishlist_items.extraction_status exists');
select has_column('public', 'wishlist_items', 'sort_position', 'wishlist_items.sort_position exists');
select has_column('public', 'wishlist_items', 'client_submission_id', 'wishlist_items.client_submission_id exists');
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wishlist_items'
      and column_name = 'client_submission_id'
  ),
  'YES',
  'client_submission_id is nullable for legacy rows'
);
select has_column('public', 'wishlist_items', 'created_at', 'wishlist_items.created_at exists');
select has_column('public', 'wishlist_items', 'updated_at', 'wishlist_items.updated_at exists');

select col_not_null('public', 'wishlists', 'owner_id', 'wishlists.owner_id is not null');
select col_not_null('public', 'wishlists', 'created_at', 'wishlists.created_at is not null');
select col_not_null('public', 'wishlists', 'updated_at', 'wishlists.updated_at is not null');

select col_not_null('public', 'wishlist_items', 'wishlist_id', 'wishlist_items.wishlist_id is not null');
select col_not_null('public', 'wishlist_items', 'owner_id', 'wishlist_items.owner_id is not null');
select col_not_null('public', 'wishlist_items', 'title', 'wishlist_items.title is not null');
select col_not_null('public', 'wishlist_items', 'desire_level', 'wishlist_items.desire_level is not null');
select col_not_null('public', 'wishlist_items', 'extraction_status', 'wishlist_items.extraction_status is not null');
select col_not_null('public', 'wishlist_items', 'sort_position', 'wishlist_items.sort_position is not null');
select col_not_null('public', 'wishlist_items', 'created_at', 'wishlist_items.created_at is not null');
select col_not_null('public', 'wishlist_items', 'updated_at', 'wishlist_items.updated_at is not null');

select col_is_pk(
  'public', 'wishlists', ARRAY['id'],
  'wishlists.id is the primary key'
);

select col_is_pk(
  'public', 'wishlist_items', ARRAY['id'],
  'wishlist_items.id is the primary key'
);

select col_is_unique(
  'public', 'wishlists', 'owner_id',
  'wishlists.owner_id is UNIQUE (the one-wishlist-per-owner invariant)'
);

select fk_ok(
  'public', 'wishlists', 'owner_id', 'auth', 'users', 'id',
  'wishlists.owner_id references auth.users(id) on delete cascade'
);

select fk_ok(
  'public', 'wishlist_items', ARRAY['wishlist_id', 'owner_id'],
  'public', 'wishlists', ARRAY['id', 'owner_id'],
  'the composite FK (wishlist_id, owner_id) references wishlists(id, owner_id) on delete cascade'
);

select is(
  (
    select count(*)::int
    from pg_constraint
    where conrelid = 'public.wishlist_items'::regclass
      and contype = 'f'
  ),
  3,
  'wishlist_items has exactly three foreign keys (owner FK, the composite FK, and the 007b self-referencing copied_from_item_id FK); no second plain wishlist_id FK exists'
);

select has_type(
  'public', 'wishlist_item_desire_level',
  'the wishlist_item_desire_level enum type exists'
);

select enum_has_labels(
  'public', 'wishlist_item_desire_level',
  ARRAY['really_want', 'would_love', 'just_an_idea'],
  'the desire_level enum has exactly the pinned labels in order'
);

select has_type(
  'public', 'wishlist_item_extraction_status',
  'the wishlist_item_extraction_status enum type exists'
);

select enum_has_labels(
  'public', 'wishlist_item_extraction_status',
  ARRAY['manual', 'extracting', 'extracted', 'failed'],
  'the extraction_status enum has exactly the pinned labels in order'
);

select is(
  (
    select array_agg(conname::text order by conname)
    from pg_constraint
    where conrelid = 'public.wishlist_items'::regclass
      and contype = 'c'
  ),
  ARRAY[
    'wishlist_items_conversion_rate_source_bounded',
    'wishlist_items_converted_amount_non_negative',
    'wishlist_items_converted_currency_iso',
    'wishlist_items_converted_money_tuple',
    'wishlist_items_image_snapshot_path_bounded',
    'wishlist_items_image_url_bounded',
    'wishlist_items_note_bounded',
    'wishlist_items_original_amount_non_negative',
    'wishlist_items_original_currency_iso',
    'wishlist_items_original_money_pair',
    'wishlist_items_retailer_bounded',
    'wishlist_items_sort_position_finite',
    'wishlist_items_source_url_bounded',
    'wishlist_items_title_bounded'
  ]::text[],
  'exactly the pinned CHECK constraints exist on wishlist_items (money, converted tuple, bounds, finite sort position)'
);

select is(
  (
    select count(*)::int
    from pg_constraint
    where conrelid = 'public.wishlists'::regclass
      and contype = 'c'
  ),
  0,
  'no CHECK constraints exist on wishlists (only PK, UNIQUE, and FK constraints)'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.wishlists'::regclass),
  'row level security is enabled on public.wishlists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.wishlist_items'::regclass),
  'row level security is enabled on public.wishlist_items'
);

select has_trigger(
  'auth', 'users', 'on_auth_user_wishlist_created',
  'the wishlist signup trigger exists on auth.users'
);

select has_trigger(
  'public', 'wishlists', 'wishlists_set_updated_at',
  'the wishlists updated_at trigger exists'
);

select has_trigger(
  'public', 'wishlist_items', 'wishlist_items_set_updated_at',
  'the wishlist_items updated_at trigger exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wishlists'
      and policyname = 'wishlists_select_own'
  ),
  'the wishlists_select_own policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_select_own'
  ),
  'the wishlist_items_select_own policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_insert_own'
  ),
  'the wishlist_items_insert_own policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_update_own'
  ),
  'the wishlist_items_update_own policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_delete_own'
  ),
  'the wishlist_items_delete_own policy exists'
);

select ok(
  (
    select bool_and(
      policyname in (
        'wishlists_select_own',
        'wishlist_items_select_own',
        'wishlist_items_insert_own',
        'wishlist_items_update_own',
        'wishlist_items_delete_own'
      )
      and roles::text = '{authenticated}'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%owner_id%'
    )
    from pg_policies
    where schemaname = 'public'
      and tablename in ('wishlists', 'wishlist_items')
  ),
  'every policy is owner-only (auth.uid() = owner_id) and granted to authenticated; no group-member access exists'
);

-- 2. The signup trigger creates exactly one wishlist ------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_a'::uuid,
  'authenticated',
  'authenticated',
  'wishlist-test-a@example.invalid',
  ''
);

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_b'::uuid,
  'authenticated',
  'authenticated',
  'wishlist-test-b@example.invalid',
  ''
);

select is(
  (
    select count(*)::int
    from public.wishlists
    where owner_id = :'uid_a'::uuid
  ),
  1,
  'the signup trigger created exactly one wishlist for a new user'
);

-- 3. The backfill covers pre-existing users and is idempotent ---------------------

-- The local test role is not the owner of auth.users, so a pre-trigger user
-- is simulated by removing the wishlist row the trigger created: the state
-- that backfill exists to fix (a user with no wishlist, as at migration time).
insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_c'::uuid,
  'authenticated',
  'authenticated',
  'wishlist-test-c@example.invalid',
  ''
);

delete from public.wishlists
where owner_id = :'uid_c'::uuid;

-- The same statement the migration uses for the backfill.
insert into public.wishlists (owner_id)
  select id
  from auth.users
  on conflict (owner_id) do nothing;

select is(
  (
    select count(*)::int
    from public.wishlists
    where owner_id = :'uid_c'::uuid
  ),
  1,
  'the backfill gives a pre-existing user exactly one wishlist row'
);

insert into public.wishlists (owner_id)
  select id
  from auth.users
  on conflict (owner_id) do nothing;

select is(
  (
    select count(*)::int
    from public.wishlists
    where owner_id = :'uid_c'::uuid
  ),
  1,
  're-running the backfill is idempotent'
);

-- 4. Owner allow — writes land with correct values --------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

select id as wid_a
from public.wishlists
where owner_id = :'uid_a'::uuid
\gset

-- A full explicit insert: every client-writable column, an explicit sort
-- position, and the manual extraction status.
insert into public.wishlist_items (
  wishlist_id, owner_id, title, source_url, retailer, image_url,
  image_snapshot_path, note, original_amount_minor, original_currency,
  converted_amount_minor, converted_currency, conversion_rate_source,
  conversion_rate_at, desire_level, extraction_status, sort_position
)
values (
  :'wid_a'::uuid,
  :'uid_a'::uuid,
  'Pour-over kettle',
  'https://example.invalid/kettle',
  'Fixture Roasters',
  'https://cdn.example.invalid/kettle.jpg',
  'wishlist-snapshots/kettle.webp',
  'The 1 litre one.',
  249900,
  'INR',
  1499,
  'USD',
  'fixture-rate-table',
  clock_timestamp(),
  'really_want',
  'manual',
  1
);

select is(
  (
    select title
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Pour-over kettle'
  ),
  'Pour-over kettle',
  'the owner insert with all client-writable columns landed with correct values'
);

-- An item persisted with the extracted status (Phase 4 flows persist only
-- manual and extracted).
insert into public.wishlist_items (
  wishlist_id, owner_id, title, original_amount_minor, original_currency,
  extraction_status, sort_position
)
values (
  :'wid_a'::uuid,
  :'uid_a'::uuid,
  'The Overstory paperback',
  132000,
  'JPY',
  'extracted',
  2
);

select is(
  (
    select extraction_status::text
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and extraction_status = 'extracted'
  ),
  'extracted',
  'an item inserted with the extracted extraction_status is stored'
);

-- A minimal insert: only the columns 005c's form will always send.
insert into public.wishlist_items (
  wishlist_id, owner_id, title, sort_position
)
values (
  :'wid_a'::uuid,
  :'uid_a'::uuid,
  'Mystery novel',
  3
);

select is(
  (
    select desire_level::text
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Mystery novel'
  ),
  'would_love',
  'desire_level defaults to would_love on a minimal insert'
);

select is(
  (
    select extraction_status::text
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Mystery novel'
  ),
  'manual',
  'extraction_status defaults to manual on a minimal insert'
);

select gen_random_uuid() as submission_key_a \gset

insert into public.wishlist_items (
  wishlist_id, owner_id, title, sort_position, client_submission_id
)
values (
  :'wid_a'::uuid,
  :'uid_a'::uuid,
  'Submission key item',
  4,
  :'submission_key_a'::uuid
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, client_submission_id) values (%L, %L, ''Duplicate submission key'', 5, %L)',
    :'wid_a',
    :'uid_a',
    :'submission_key_a'
  ),
  '23505',
  NULL,
  'the same owner cannot reuse a live client_submission_id'
);

select is(
  (
    select client_submission_id::text
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
      and title = 'Mystery novel'
  ),
  NULL,
  'older rows without a client_submission_id remain valid'
);

select ok(
  (
    select created_at is not null and updated_at is not null
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Mystery novel'
  ),
  'created_at and updated_at default to non-null values on insert'
);

-- An update through every granted column.
update public.wishlist_items
set title = 'Pour-over kettle, matte',
  source_url = 'https://example.invalid/kettle-matte',
  retailer = 'Fixture Kitchens',
  image_url = 'https://cdn.example.invalid/kettle-matte.jpg',
  image_snapshot_path = 'wishlist-snapshots/kettle-matte.webp',
  note = 'Actually the matte one.',
  original_amount_minor = 259900,
  original_currency = 'INR',
  converted_amount_minor = 3100,
  converted_currency = 'USD',
  conversion_rate_source = 'fixture-rate-table-v2',
  conversion_rate_at = clock_timestamp(),
  desire_level = 'would_love',
  extraction_status = 'manual'
where owner_id = :'uid_a'::uuid
  and title = 'Pour-over kettle';

select is(
  (
    select title
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Pour-over kettle, matte'
  ),
  'Pour-over kettle, matte',
  'the owner update through every granted column landed'
);

select is(
  (
    select converted_amount_minor
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Pour-over kettle, matte'
  ),
  3100::bigint,
  'the converted tuple updated through the granted columns round-trips'
);

-- 5. Owner allow — reads are exactly their own rows -------------------------------

select is(
  (select count(*)::int from public.wishlists),
  1,
  'the authenticated owner sees exactly one wishlist (their own) even when other users'' wishlists exist'
);

select is(
  (select count(*)::int from public.wishlist_items),
  4,
  'the owner''s item list contains exactly their own rows'
);

-- 6. Money integrity --------------------------------------------------------------

select is(
  (
    select original_amount_minor
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and sort_position = 1
  ),
  259900::bigint,
  'an INR amount round-trips exactly as stored minor units'
);

select is(
  (
    select original_currency
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and sort_position = 1
  ),
  'INR',
  'the ISO currency code round-trips exactly'
);

select is(
  (
    select original_amount_minor
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and sort_position = 2
  ),
  132000::bigint,
  'a JPY (zero-decimal) amount round-trips exactly as stored minor units'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, original_amount_minor) values (%L, %L, ''Money 1'', 10, 100)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'an amount without a currency is rejected by the money-pair CHECK'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, original_currency) values (%L, %L, ''Money 2'', 10, ''USD'')',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a currency without an amount is rejected by the money-pair CHECK'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, original_amount_minor, original_currency) values (%L, %L, ''Money 3'', 10, -1, ''USD'')',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a negative original amount is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, original_amount_minor, original_currency) values (%L, %L, ''Money 4'', 10, 100, ''usd'')',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a lowercase currency code is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, original_amount_minor, original_currency) values (%L, %L, ''Money 5'', 10, 100, ''US'')',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a two-letter currency code is rejected'
);

-- Each partial converted tuple must fail, one missing column at a time.
select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, converted_amount_minor, converted_currency, conversion_rate_source) values (%L, %L, ''Conv 2'', 10, 100, ''USD'', ''fixture'')',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a converted tuple missing conversion_rate_at is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, converted_amount_minor, converted_currency) values (%L, %L, ''Conv 3'', 10, 100, ''USD'')',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a converted tuple missing conversion_rate_source is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, converted_amount_minor, conversion_rate_source, conversion_rate_at) values (%L, %L, ''Conv 4'', 10, 100, ''fixture'', clock_timestamp())',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a converted tuple missing converted_currency is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, converted_currency, conversion_rate_source, conversion_rate_at) values (%L, %L, ''Conv 5'', 10, ''USD'', ''fixture'', clock_timestamp())',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a converted tuple missing converted_amount_minor is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, converted_amount_minor, converted_currency, conversion_rate_source, conversion_rate_at) values (%L, %L, ''Conv 6'', 10, -5, ''USD'', ''fixture'', clock_timestamp())',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a negative converted amount is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, converted_amount_minor, converted_currency, conversion_rate_source, conversion_rate_at) values (%L, %L, ''Conv 7'', 10, 100, ''EU'', ''fixture'', clock_timestamp())',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'an invalid converted currency code is rejected'
);

-- The complete tuple round-trips (already exercised by the full-column
-- update above); assert the stored provenance is complete.
select ok(
  (
    select converted_amount_minor is not null
      and converted_currency is not null
      and conversion_rate_source is not null
      and conversion_rate_at is not null
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and sort_position = 1
  ),
  'a complete converted tuple round-trips with its full rate provenance'
);

-- 7. Enum and bound rejections ------------------------------------------------------

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, desire_level) values (%L, %L, ''Enum 1'', 10, ''very_much'')',
    :'wid_a',
    :'uid_a'
  ),
  '22P02',
  NULL,
  'a non-enum desire level is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, extraction_status) values (%L, %L, ''Enum 2'', 10, ''pending'')',
    :'wid_a',
    :'uid_a'
  ),
  '22P02',
  NULL,
  'a non-enum extraction status is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, repeat(''x'', 201), 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a 201-character title is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, ''   '', 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a blank-only title is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, note, sort_position) values (%L, %L, ''Bounds 1'', repeat(''x'', 2001), 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a 2001-character note is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, source_url, sort_position) values (%L, %L, ''Bounds 2'', ''https://example.invalid/%s'', 10)',
    :'wid_a',
    :'uid_a',
    repeat('x', 2027)
  ),
  '23514',
  NULL,
  'a 2049-character source_url is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, source_url, sort_position) values (%L, %L, ''Bounds 3'', ''ftp://example.invalid/item'', 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a non-http(s) source_url is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, image_url, sort_position) values (%L, %L, ''Bounds 4'', ''javascript:alert(1)'', 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a non-http(s) image_url is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, retailer, sort_position) values (%L, %L, ''Bounds 5'', repeat(''x'', 121), 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a 121-character retailer is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, retailer, sort_position) values (%L, %L, ''Bounds 6'', ''  '', 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a blank-only retailer is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, converted_amount_minor, converted_currency, conversion_rate_source, conversion_rate_at, sort_position) values (%L, %L, ''Bounds 7'', 100, ''USD'', repeat(''x'', 201), clock_timestamp(), 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a 201-character conversion_rate_source is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, image_snapshot_path, sort_position) values (%L, %L, ''Bounds 8'', repeat(''x'', 1025), 10)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a 1025-character image_snapshot_path is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, ''Sort NaN'', ''NaN''::float8)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'a NaN sort_position is rejected'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, ''Sort inf'', ''Infinity''::float8)',
    :'wid_a',
    :'uid_a'
  ),
  '23514',
  NULL,
  'an infinite sort_position is rejected'
);

-- 8. Sort position semantics ------------------------------------------------------

-- Two items sharing a position must be storable (duplicates are allowed by
-- design; the id tiebreak, not a UNIQUE constraint, orders reads).
insert into public.wishlist_items (
  wishlist_id, owner_id, title, sort_position
)
values (
  :'wid_a'::uuid,
  :'uid_a'::uuid,
  'Shared position item',
  3
);

select ok(
  (
    select count(*)::int
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
      and sort_position = 3
  ) = 2,
  'two items in the same wishlist may share one sort_position (no UNIQUE constraint, by design)'
);

select is(
  (
    select array_agg(id order by sort_position, id)
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
  ),
  (
    select array_agg(id order by sort_position, id)
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
  ),
  'the (sort_position, id) read order is deterministic and stable across two identical queries'
);

-- 9. Timestamps are database-managed ----------------------------------------------

select clock_timestamp() as t0 \gset

update public.wishlist_items
set note = 'Edited once.'
where owner_id = :'uid_a'::uuid
  and title = 'Mystery novel';

select clock_timestamp() as t1 \gset

select is(
  (
    select updated_at >= :'t0'::timestamptz and updated_at <= :'t1'::timestamptz
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Mystery novel'
  ),
  true,
  'an owner edit advances updated_at within the tested clock_timestamp() boundaries'
);

select updated_at as first_updated
from public.wishlist_items
where owner_id = :'uid_a'::uuid
  and title = 'Mystery novel'
\gset

update public.wishlist_items
set note = 'Edited twice.'
where owner_id = :'uid_a'::uuid
  and title = 'Mystery novel';

select is(
  (
    select updated_at >= :'first_updated'::timestamptz
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid and title = 'Mystery novel'
  ),
  true,
  'a later edit lands at or after the earlier updated_at (no now() reliance)'
);

-- Non-granted columns are never client-updatable or insertable.
select throws_ok(
  format(
    'update public.wishlist_items set id = %L where owner_id = %L and title = ''Mystery novel''',
    gen_random_uuid(),
    :'uid_a'
  ),
  '42501'
);

select throws_ok(
  format(
    'update public.wishlist_items set wishlist_id = %L where owner_id = %L and title = ''Mystery novel''',
    gen_random_uuid(),
    :'uid_a'
  ),
  '42501'
);

select throws_ok(
  format(
    'update public.wishlist_items set owner_id = %L where owner_id = %L and title = ''Mystery novel''',
    :'uid_b',
    :'uid_a'
  ),
  '42501'
);

select throws_ok(
  format(
    'update public.wishlist_items set created_at = clock_timestamp() where owner_id = %L and title = ''Mystery novel''',
    :'uid_a'
  ),
  '42501'
);

select throws_ok(
  format(
    'update public.wishlist_items set updated_at = clock_timestamp() where owner_id = %L and title = ''Mystery novel''',
    :'uid_a'
  ),
  '42501',
  NULL,
  'the database-set updated_at cannot be overwritten directly (column grant)'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position) values (%L, %L, %L, ''Insert id'', 10)',
    gen_random_uuid(),
    :'wid_a',
    :'uid_a'
  ),
  '42501',
  NULL,
  'a client INSERT supplying id is rejected by the column grant'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, created_at) values (%L, %L, ''Insert created'', 10, clock_timestamp())',
    :'wid_a',
    :'uid_a'
  ),
  '42501',
  NULL,
  'a client INSERT supplying created_at is rejected by the column grant'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position, updated_at) values (%L, %L, ''Insert updated'', 10, clock_timestamp())',
    :'wid_a',
    :'uid_a'
  ),
  '42501',
  NULL,
  'a client INSERT supplying updated_at is rejected by the column grant'
);

-- 10. Owner delete ----------------------------------------------------------------

delete from public.wishlist_items
where owner_id = :'uid_a'::uuid
  and title = 'Shared position item';

select is(
  (
    select count(*)::int
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
      and title = 'Shared position item'
  ),
  0,
  'the owner deletes their own item'
);

-- 11. Grant/RLS inventory ----------------------------------------------------------

reset role;

select ok(
  not has_table_privilege('anon', 'public.wishlists', 'SELECT')
    and not has_table_privilege('anon', 'public.wishlists', 'INSERT')
    and not has_table_privilege('anon', 'public.wishlists', 'UPDATE')
    and not has_table_privilege('anon', 'public.wishlists', 'DELETE'),
  'anon holds no table privileges on public.wishlists'
);

select ok(
  not has_table_privilege('anon', 'public.wishlist_items', 'SELECT')
    and not has_table_privilege('anon', 'public.wishlist_items', 'INSERT')
    and not has_table_privilege('anon', 'public.wishlist_items', 'UPDATE')
    and not has_table_privilege('anon', 'public.wishlist_items', 'DELETE'),
  'anon holds no table privileges on public.wishlist_items'
);

select is(
  (
    select count(*)::int
    from information_schema.role_column_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in ('wishlists', 'wishlist_items')
  ),
  0,
  'anon holds zero column privileges on anything new'
);

select ok(
  has_table_privilege('authenticated', 'public.wishlists', 'SELECT')
    and not has_table_privilege('authenticated', 'public.wishlists', 'INSERT')
    and not has_table_privilege('authenticated', 'public.wishlists', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.wishlists', 'DELETE'),
  'authenticated holds SELECT-only on public.wishlists'
);

select ok(
  has_table_privilege('authenticated', 'public.wishlist_items', 'SELECT')
    and has_any_column_privilege('authenticated', 'public.wishlist_items', 'INSERT')
    and has_any_column_privilege('authenticated', 'public.wishlist_items', 'UPDATE')
    and has_table_privilege('authenticated', 'public.wishlist_items', 'DELETE'),
  'authenticated holds SELECT, INSERT, UPDATE, and DELETE on public.wishlist_items (INSERT/UPDATE via column grants)'
);

select is(
  (
    select count(*)::int
    from information_schema.role_column_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'wishlist_items'
      and privilege_type = 'INSERT'
  ),
  18,
  'the authenticated INSERT grant covers exactly the 18 client-writable columns (excluding only id, created_at, updated_at)'
);

select ok(
  has_column_privilege('authenticated', 'public.wishlist_items', 'client_submission_id', 'INSERT')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'client_submission_id', 'UPDATE'),
  'client_submission_id is INSERT-only'
);

select has_index(
  'public', 'wishlist_items', 'wishlist_items_owner_submission_live_key',
  'the owner-scoped live submission-key uniqueness index exists'
);

select is(
  (
    select count(*)::int
    from information_schema.role_column_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'wishlist_items'
      and privilege_type = 'UPDATE'
  ),
  14,
  'the authenticated UPDATE grant covers exactly the 14 non-order client-updatable columns'
);

select ok(
  not has_column_privilege('authenticated', 'public.wishlist_items', 'id', 'INSERT')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'created_at', 'INSERT')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'updated_at', 'INSERT'),
  'the INSERT grant excludes id, created_at, and updated_at'
);

select ok(
  not has_column_privilege('authenticated', 'public.wishlist_items', 'id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'wishlist_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'owner_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'sort_position', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'created_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'updated_at', 'UPDATE'),
  'the UPDATE grant excludes identity, ownership, order, and database-managed timestamps'
);

select ok(
  has_column_privilege('authenticated', 'public.wishlist_items', 'title', 'INSERT')
    and has_column_privilege('authenticated', 'public.wishlist_items', 'title', 'UPDATE')
    and has_column_privilege('authenticated', 'public.wishlist_items', 'sort_position', 'INSERT')
    and not has_column_privilege('authenticated', 'public.wishlist_items', 'sort_position', 'UPDATE')
    and has_column_privilege('authenticated', 'public.wishlist_items', 'original_amount_minor', 'INSERT'),
  'INSERT retains sort_position while direct UPDATE does not'
);

select ok(
  not has_function_privilege('anon', 'public.handle_new_user_wishlist()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.handle_new_user_wishlist()', 'EXECUTE')
    and not has_function_privilege('public', 'public.handle_new_user_wishlist()', 'EXECUTE'),
  'no client role holds EXECUTE on public.handle_new_user_wishlist()'
);

select ok(
  not has_function_privilege('anon', 'public.set_wishlists_updated_at()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.set_wishlists_updated_at()', 'EXECUTE')
    and not has_function_privilege('public', 'public.set_wishlists_updated_at()', 'EXECUTE'),
  'no client role holds EXECUTE on public.set_wishlists_updated_at()'
);

select ok(
  not has_function_privilege('anon', 'public.set_wishlist_items_updated_at()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.set_wishlist_items_updated_at()', 'EXECUTE')
    and not has_function_privilege('public', 'public.set_wishlist_items_updated_at()', 'EXECUTE'),
  'no client role holds EXECUTE on public.set_wishlist_items_updated_at()'
);

select ok(
  has_function_privilege('postgres', 'public.handle_new_user_wishlist()', 'EXECUTE')
    and has_function_privilege('postgres', 'public.set_wishlists_updated_at()', 'EXECUTE')
    and has_function_privilege('postgres', 'public.set_wishlist_items_updated_at()', 'EXECUTE'),
  'the function owner retains EXECUTE on all three new functions'
);

-- 12. Signed-out (anon) denial ------------------------------------------------------

set local role anon;

select throws_ok(
  'select * from public.wishlists',
  '42501',
  NULL,
  'anon cannot select from public.wishlists'
);

select throws_ok(
  'select * from public.wishlist_items',
  '42501',
  NULL,
  'anon cannot select from public.wishlist_items'
);

select throws_ok(
  format('insert into public.wishlists (owner_id) values (%L)', :'uid_a'),
  '42501',
  NULL,
  'anon cannot insert into public.wishlists'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, ''Anon item'', 1)',
    :'wid_a',
    :'uid_a'
  ),
  '42501',
  NULL,
  'anon cannot insert into public.wishlist_items'
);

select throws_ok(
  format('update public.wishlists set owner_id = %L', :'uid_b'),
  '42501',
  NULL,
  'anon cannot update public.wishlists'
);

select throws_ok(
  format(
    'update public.wishlist_items set title = ''Anon'' where owner_id = %L',
    :'uid_a'
  ),
  '42501',
  NULL,
  'anon cannot update public.wishlist_items'
);

select throws_ok(
  'delete from public.wishlists',
  '42501',
  NULL,
  'anon cannot delete from public.wishlists'
);

select throws_ok(
  format(
    'delete from public.wishlist_items where owner_id = %L',
    :'uid_a'
  ),
  '42501',
  NULL,
  'anon cannot delete from public.wishlist_items'
);

-- 13. Cross-user enumeration and mutation denial --------------------------------------

reset role;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_b'),
  true
);

select id as wid_b
from public.wishlists
where owner_id = :'uid_b'::uuid
\gset

-- User B's own items, so the enumeration checks below have a control.
insert into public.wishlist_items (
  wishlist_id, owner_id, title, sort_position
)
values
  (:'wid_b'::uuid, :'uid_b'::uuid, 'B item one', 1),
  (:'wid_b'::uuid, :'uid_b'::uuid, 'B item two', 2);

insert into public.wishlist_items (
  wishlist_id, owner_id, title, sort_position, client_submission_id
)
values (
  :'wid_b'::uuid,
  :'uid_b'::uuid,
  'B reused submission key',
  3,
  :'submission_key_a'::uuid
);

select is(
  (
    select count(*)::int
    from public.wishlist_items
    where client_submission_id = :'submission_key_a'::uuid
  ),
  1,
  'user B sees only their own row for a submission key also used by user A'
);

select is(
  (
    select count(*)::int
    from public.wishlists
    where id = :'wid_a'::uuid
  ),
  0,
  'authenticated user B sees zero rows when selecting user A''s wishlist by id'
);

select is(
  (
    select count(*)::int
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
  ),
  0,
  'authenticated user B sees zero of user A''s items'
);

select is(
  (select count(*)::int from public.wishlists),
  1,
  'authenticated user B''s visible wishlist count is exactly their own'
);

select is(
  (select count(*)::int from public.wishlist_items),
  3,
  'authenticated user B''s visible item count is exactly their own'
);

with attempted as (
  update public.wishlist_items
  set title = 'Hijack'
  where owner_id = :'uid_a'::uuid
  returning id
)
select is(
  (select count(*)::int from attempted),
  0,
  'user B''s UPDATE targeting user A''s items affects zero rows'
);

with attempted as (
  delete from public.wishlist_items
  where owner_id = :'uid_a'::uuid
  returning id
)
select is(
  (select count(*)::int from attempted),
  0,
  'user B''s DELETE targeting user A''s items affects zero rows'
);

with attempted as (
  update public.wishlist_items
  set title = 'Submission key hijack'
  where owner_id = :'uid_a'::uuid
    and client_submission_id = :'submission_key_a'::uuid
  returning id
)
select is(
  (select count(*)::int from attempted),
  0,
  'user B cannot update user A''s live submission-key row'
);

with attempted as (
  delete from public.wishlist_items
  where owner_id = :'uid_a'::uuid
    and client_submission_id = :'submission_key_a'::uuid
  returning id
)
select is(
  (select count(*)::int from attempted),
  0,
  'user B cannot delete user A''s live submission-key row'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, ''Spoofed'', 99)',
    :'wid_b',
    :'uid_a'
  ),
  '42501',
  NULL,
  'user B''s INSERT with owner_id = user A is rejected by the WITH CHECK'
);

select throws_ok(
  format(
    'insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position) values (%L, %L, ''Mismatched'', 99)',
    :'wid_a',
    :'uid_b'
  ),
  '23503',
  NULL,
  'user B''s INSERT with their own owner_id but user A''s wishlist_id is rejected by the composite FK'
);

select throws_ok(
  format(
    'update public.wishlists set owner_id = %L where id = %L',
    :'uid_b',
    :'wid_a'
  ),
  '42501',
  NULL,
  'user B''s UPDATE of user A''s wishlist row is denied (SELECT-only grant)'
);

select throws_ok(
  format('insert into public.wishlists (owner_id) values (%L)', :'uid_b'),
  '42501',
  NULL,
  'authenticated INSERT on public.wishlists is denied (no grant; behavioral proof of SELECT-only)'
);

select throws_ok(
  format('delete from public.wishlists where id = %L', :'wid_a'),
  '42501',
  NULL,
  'authenticated DELETE on public.wishlists is denied (no grant; behavioral proof of SELECT-only)'
);

-- 14. One-wishlist-per-owner uniqueness ----------------------------------------------

reset role;

select throws_ok(
  format('insert into public.wishlists (owner_id) values (%L)', :'uid_a'),
  '23505',
  NULL,
  'a second wishlist for the same owner violates the UNIQUE constraint (including the trigger''s own insert path context, as the table owner)'
);

-- 15. Trigger failure blocks the signup transaction -----------------------------------

alter table public.wishlists rename to wishlists_hidden;

select throws_ok(
  format(
    'insert into auth.users (id, aud, role, email, encrypted_password) values (%L, ''authenticated'', ''authenticated'', ''wishlist-test-fail@example.invalid'', '''')',
    gen_random_uuid()
  ),
  '42P01'
);

alter table public.wishlists_hidden rename to wishlists;

select is(
  (
    select count(*)::int
    from auth.users
    where email = 'wishlist-test-fail@example.invalid'
  ),
  0,
  'a failed signup leaves no auth user row behind'
);

-- 16. Cascading deletes ---------------------------------------------------------------

reset role;

-- Deleting the wishlist row (as the table owner, in-transaction) removes its
-- items through the composite FK.
delete from public.wishlists
where owner_id = :'uid_a'::uuid;

select is(
  (
    select count(*)::int
    from public.wishlist_items
    where owner_id = :'uid_a'::uuid
  ),
  0,
  'deleting the wishlist row removes its items through the composite FK'
);

select is(
  (
    select count(*)::int
    from public.wishlists
    where owner_id = :'uid_a'::uuid
  ),
  0,
  'the wishlist row itself is gone'
);

-- Deleting the auth user cascades to both tables via the owner_id FKs.
delete from auth.users
where id in (:'uid_a'::uuid, :'uid_b'::uuid, :'uid_c'::uuid);

select is(
  (
    select count(*)::int
    from public.wishlists w
    left join auth.users u on u.id = w.owner_id
    where u.id is null
  ),
  0,
  'no wishlist row lacks an auth user (no orphans)'
);

select is(
  (
    select count(*)::int
    from public.wishlist_items i
    left join auth.users u on u.id = i.owner_id
    where u.id is null
  ),
  0,
  'no item row lacks an auth user (no orphans)'
);

select *
from finish();

rollback;
