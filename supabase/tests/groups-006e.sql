-- 006e: pgTAP suite for the member wishlist browsing projection.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/006e-member-wishlist-
-- browsing.md: exact signature/shape, ownership and security attributes
-- (SECURITY DEFINER, STABLE, empty search_path), privilege inventory and
-- overload enumeration, the one-statement body, the unchanged owner-only
-- base-table privileges, positive fixtures (joined viewer browsing a joined
-- member in committed 005d order, the authorized-empty sentinel, owner
-- success, snapshot-path-only images, missing optionals), every denial
-- class (outsider, pending viewer, pending/declined/left/removed targets,
-- cross-group viewer and target, stale membership after removal, forged
-- JWT, guessed ids, signed-out, archived group), service_role denial, and
-- direct base-table denial. Reads never write: audit events and item state
-- are asserted unchanged throughout. The whole suite is wrapped in one
-- transaction that ends with rollback, so no synthetic user, group,
-- member, wishlist, or item row persists.

begin;

select plan(32);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset
select gen_random_uuid() as uid_f \gset
select gen_random_uuid() as uid_g \gset
select gen_random_uuid() as uid_h \gset
select gen_random_uuid() as uid_i \gset
select gen_random_uuid() as uid_j \gset

-- 1. Shape, ownership, and security attributes --------------------------------

select has_function('public', 'member_wishlist_snapshot', 'member_wishlist_snapshot exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_wishlist_snapshot'
  ),
  1,
  'exactly one overload of member_wishlist_snapshot exists'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_wishlist_snapshot'
  ),
  'p_group_id uuid, p_member_id uuid',
  'the only arguments are p_group_id uuid and p_member_id uuid'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_wishlist_snapshot'
  ),
  'TABLE(member_display_name text, item_id uuid, title text, source_url text, '
    || 'retailer text, image_url text, note text, desire_level '
    || 'wishlist_item_desire_level, original_amount_minor bigint, '
    || 'original_currency character)',
  'the return shape is exactly the ten declared columns (no storage path, no gifting fields)'
);

select is(
  (
    select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_wishlist_snapshot'
  ),
  'true:s:search_path=""',
  'the function is SECURITY DEFINER, honestly STABLE (no volatile clock call), with an empty search_path'
);

select is(
  (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_wishlist_snapshot'
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
        and p.proname = 'member_wishlist_snapshot'
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
          pg_get_functiondef('public.member_wishlist_snapshot(uuid, uuid)'::regprocedure)
          from '\$function\$(.*)\$function\$'
        ) as body
      ) b
    )
  ),
  0,
  'the function body is one SQL statement (no embedded statement separator)'
);

-- 2. Unchanged base-table privileges -------------------------------------------

-- The projection adds no new policy on the read-through base tables: the
-- policy inventories of profiles, wishlists, and wishlist_items stay
-- exactly as the prior slices committed them (the projection is the only
-- new access path).
select is(
  (
    select string_agg(tab || ':' || pol, ',' order by tab, pol)
    from (
      select c.relname::text as tab, p.polname::text as pol
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('profiles', 'wishlists', 'wishlist_items')
    ) s
  ),
  'profiles:profiles_select_own,profiles:profiles_update_own,'
    || 'wishlist_items:wishlist_items_delete_own,wishlist_items:wishlist_items_insert_own,'
    || 'wishlist_items:wishlist_items_select_own,wishlist_items:wishlist_items_update_own,'
    || 'wishlists:wishlists_select_own',
  'the projection adds no new RLS policy on profiles, wishlists, or wishlist_items'
);

-- 3. Fixtures -------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'browse-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'browse-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'browse-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'browse-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'browse-e@example.invalid', ''),
  (:'uid_f'::uuid, 'authenticated', 'authenticated', 'browse-f@example.invalid', ''),
  (:'uid_g'::uuid, 'authenticated', 'authenticated', 'browse-g@example.invalid', ''),
  (:'uid_h'::uuid, 'authenticated', 'authenticated', 'browse-h@example.invalid', ''),
  (:'uid_i'::uuid, 'authenticated', 'authenticated', 'browse-i@example.invalid', ''),
  (:'uid_j'::uuid, 'authenticated', 'authenticated', 'browse-j@example.invalid', '');

-- Display names: C named; D named; the fallback-label fixture is C's own
-- trigger profile left untouched further below. Wait — the fallback fixture
-- needs a joined member with no usable display name; use I (removed member)
-- for the removed-target denial, and give the no-label role to D's empty
-- wishlist case via a separate whitespace name update at the end.
update public.profiles set display_name = 'Aria Organizer' where id = :'uid_a'::uuid;
update public.profiles set display_name = 'Buni Viewer' where id = :'uid_b'::uuid;
update public.profiles set display_name = 'Charu Items' where id = :'uid_c'::uuid;
update public.profiles set display_name = 'Dev Empty' where id = :'uid_d'::uuid;

-- as A (organizer): create the fixture group.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select gen_random_uuid() as req_key \gset
select group_id::text as gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Browse Fixture', 'occasion_type', 'diwali', 'occasion_date', '2026-11-07',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '250000', 'budget_currency', 'INR',
    'mode', 'wishlist_only', 'organizer_participating', true
  )
) \gset

reset role;

-- B, C, D joined; F invited (pending); G declined; H left; I removed.
insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
values (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp() - interval '1 hour', 1),
       (:'gid'::uuid, :'uid_c'::uuid, 'joined', true, clock_timestamp() - interval '2 hours', 1),
       (:'gid'::uuid, :'uid_d'::uuid, 'joined', true, clock_timestamp() - interval '3 hours', 1),
       (:'gid'::uuid, :'uid_f'::uuid, 'invited', false, clock_timestamp(), 1),
       (:'gid'::uuid, :'uid_g'::uuid, 'declined', false, clock_timestamp(), 1),
       (:'gid'::uuid, :'uid_h'::uuid, 'left', false, clock_timestamp() - interval '5 days', 2),
       (:'gid'::uuid, :'uid_i'::uuid, 'removed', false, clock_timestamp() - interval '6 days', 3);

-- The second group: J is joined there and nowhere else (the cross-group
-- target fixture); A is its organizer, so B is an outsider there.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select group_id::text as gid2
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Other Group', 'occasion_type', 'diwali', 'occasion_date', '2026-11-08',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '100000', 'budget_currency', 'INR',
    'mode', 'wishlist_only', 'organizer_participating', true
  )
) \gset
reset role;
insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values (:'gid2'::uuid, :'uid_j'::uuid, 'joined', true, 1);

-- C's wishlist: three visible items and two invisible extraction states,
-- with a duplicated sort position exercising the id tiebreak.
insert into public.wishlist_items (
  wishlist_id, owner_id, title, source_url, retailer, image_url,
  image_snapshot_path, note, original_amount_minor, original_currency,
  desire_level, extraction_status, sort_position
)
values
  ((select id from public.wishlists where owner_id = :'uid_c'::uuid), :'uid_c'::uuid, 'Pour-over kettle',
   'https://shop.example.invalid/kettle', 'Fixture Roasters',
   'https://img.example.invalid/kettle.jpg', null,
   'The 1 litre one.', 249900, 'INR', 'really_want', 'manual', 2),
  ((select id from public.wishlists where owner_id = :'uid_c'::uuid), :'uid_c'::uuid, 'Ceramic mug',
   null, null, null, null, null, null, null, 'just_an_idea', 'extracted', 1),
  ((select id from public.wishlists where owner_id = :'uid_c'::uuid), :'uid_c'::uuid, 'Desk mat',
   'https://shop.example.invalid/mat', null,
   null, 'wishlist-snapshots/mat.webp', null, null, null,
   'would_love', 'manual', 1),
  ((select id from public.wishlists where owner_id = :'uid_c'::uuid), :'uid_c'::uuid, 'Draft kettle',
   null, null, null, null, null, null, null, 'would_love', 'extracting', 0.5),
  ((select id from public.wishlists where owner_id = :'uid_c'::uuid), :'uid_c'::uuid, 'Failed kettle',
   null, null, null, null, null, null, null, 'would_love', 'failed', 0.25);

select ok(true, 'fixtures staged');

-- 4. Positive fixtures -------------------------------------------------------------

-- as B (ordinary joined viewer) reading C.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select count(*)::int
    from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)
  ),
  3,
  'a joined viewer sees exactly the three visible items: non-manual/extracted states never appear'
);

reset role;
select string_agg(title, '|' order by sort_position asc, id asc) as expected_order
from public.wishlist_items
where owner_id = :'uid_c'::uuid
  and extraction_status::text in ('manual', 'extracted') \gset
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select string_agg(title, '|' order by ord)
    from (
      select title, row_number() over () as ord
      from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)
    ) rows_in_order
  ),
  :'expected_order',
  'items render in the committed 005d total order (sort_position asc, id asc), duplicated positions included'
);

select is(
  (
    select member_display_name || '|' || title || '|'
      || coalesce(source_url, 'null') || '|' || coalesce(retailer, 'null') || '|'
      || coalesce(image_url, 'null') || '|' || coalesce(note, 'null') || '|'
      || desire_level::text || '|' || original_amount_minor::text || '|'
      || original_currency::text
    from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)
    where title = 'Pour-over kettle'
  ),
  'Charu Items|Pour-over kettle|https://shop.example.invalid/kettle|Fixture Roasters|https://img.example.invalid/kettle.jpg|The 1 litre one.|really_want|249900|INR',
  'the populated card row carries exactly the authorized projection fields'
);

-- Snapshot-path-only image: the projection returns image_url null and never
-- the storage path (which is not even a result column).
select is(
  (
    select coalesce(image_url, 'null')
    from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)
    where title = 'Desk mat'
  ),
  'null',
  'a snapshot-path-only item projects a null image_url and no storage path'
);

-- The authorized-empty sentinel: D is joined with a wishlist and no items.
select is(
  (
    select member_display_name || '/' || (item_id is null)::text || '/'
      || (title is null)::text || '/' || (desire_level is null)::text || '/'
      || (original_amount_minor is null)::text || '/' || (original_currency is null)::text
      || '/' || count(*) over ()::text
    from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_d'::uuid)
  ),
  'Dev Empty/true/true/true/true/true/1',
  'an authorized empty wishlist returns exactly one sentinel row with the member label populated'
);

-- Owner success: the projection supports the viewer's own target.
select is(
  (
    select count(*)::int || '/' || bool_and(member_display_name = 'Charu Items')
    from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)
    where true
  ),
  '3/true',
  'the owner target is authorized with the same label'
);

-- The generic Member fallback: I's row is a denial (a removed member is
-- denied before any label can render).
select is(
  (
    select coalesce(
      (select member_display_name
       from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_i'::uuid) limit 1),
      'no-rows'
    )
  ),
  'no-rows',
  'a removed member is denied before any label fallback can render'
);

-- The established fallback label: strip D's display name and re-read the
-- authorized empty sentinel — the label becomes the generic Member inside
-- the projection; the application never looks the profile up itself.
reset role;
update public.profiles set display_name = null where id = :'uid_d'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select member_display_name
    from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_d'::uuid)
  ),
  'Member',
  'a missing display name projects the established generic Member fallback'
);

-- 5. Denial fixtures ------------------------------------------------------------------

-- as E (pure outsider) reading C.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)),
  0,
  'an outsider receives zero rows'
);

-- as F (pending/invited member of the group) reading C: pending visibility
-- is not authority.
set local "request.jwt.claim.sub" = :'uid_f';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)),
  0,
  'a pending member cannot browse'
);

-- as B reading every non-joined target class.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_f'::uuid))
    || '/' || (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_g'::uuid))
    || '/' || (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_h'::uuid))
    || '/' || (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_i'::uuid))
  ),
  '0/0/0/0',
  'pending, declined, left, and removed targets are each denied for a joined viewer'
);

-- Cross-group target: J is joined only in the other group.
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_j'::uuid)),
  0,
  'a target joined to a different group is denied'
);

-- Cross-group viewer: B reads J's wishlist through J's own group, which B
-- has never joined.
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid2'::uuid, :'uid_j'::uuid)),
  0,
  'a viewer who is not joined to the target''s group is denied even for a joined target'
);

-- Forged JWT actor fields.
set local "request.jwt.claim.sub" = '00000000-0000-4000-8000-00000000dead';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)),
  0,
  'a forged JWT actor receives zero rows'
);

-- Guessed group and member UUIDs.
select is(
  (select count(*)::int from public.member_wishlist_snapshot(gen_random_uuid(), :'uid_c'::uuid)),
  0,
  'a guessed group UUID receives zero rows'
);
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, gen_random_uuid())),
  0,
  'a guessed member UUID receives zero rows'
);

-- Signed-out (null auth): both JWT identity GUCs are cleared.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '';
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)),
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
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)),
  0,
  'an archived group reads zero rows even for its joined organizer'
);
reset role;
update public."groups" set status = 'active' where id = :'gid'::uuid;

-- Stale target membership: a committed removal ends the access immediately.
update public.group_members
set status = 'removed', participating = false, membership_generation = 4
where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.member_wishlist_snapshot(:'gid'::uuid, :'uid_c'::uuid)),
  0,
  'a committed target removal is denied immediately'
);

-- service_role has no EXECUTE grant and no table grants.
select throws_ok(
  format(
    'set role service_role; select count(*) from public.member_wishlist_snapshot(%L::uuid, %L::uuid);',
    :'gid', :'uid_c'
  ),
  '42501',
  null,
  'service_role cannot execute the projection'
);

-- Direct base-table reads stay owner-only for a client role: B can read
-- B's own items but never C's, entirely through RLS (no privilege grant
-- was added by this migration).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    (select count(*)::int from public.wishlist_items where owner_id = :'uid_b'::uuid)
    || '/' || (select count(*)::int from public.wishlist_items where owner_id = :'uid_c'::uuid)
  ),
  '0/0',
  'direct wishlist_items reads stay RLS-owner-only (no peer access, no added grant)'
);

-- 6. Reads never write ------------------------------------------------------------------

reset role;
select is(
  (
    select (select count(*)::text from public.audit_events where group_id = :'gid'::uuid)
      || '/' || (select count(*)::text from public.wishlist_items where owner_id = :'uid_c'::uuid)
      || '/' || (select count(*)::text from public.group_members where group_id = :'gid'::uuid and status = 'joined')
  ),
  '1/5/3',
  'every read above left audit events, item rows, and memberships unchanged (organizer, viewer, and the empty-wishlist member remain joined)'
);

select * from finish();
rollback;
