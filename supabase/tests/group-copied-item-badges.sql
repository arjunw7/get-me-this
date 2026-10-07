begin;
set local search_path = public, extensions;
select plan(11);
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


set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_b', 'role', 'authenticated')::text, true);
select item_id::text as source_id from public.member_wishlist_snapshot(:'gid', :'uid_c') where item_id is not null limit 1 \gset
select public.copy_group_item(:'gid', :'source_id')::text as copied_id \gset
select results_eq(format('select item_id::text from public.group_copied_item_ids(%L,%L)', :'gid', :'uid_b'), format('values (%L::text)', :'copied_id'), 'only destination gets a badge');
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_c')), 0, 'source stays unmarked');
select is(pg_get_function_result('public.group_copied_item_ids(uuid,uuid)'::regprocedure), 'TABLE(item_id uuid)', 'no source provenance is returned');
select ok(not has_function_privilege('anon','public.group_copied_item_ids(uuid,uuid)','execute'), 'anon cannot read');
select ok(not has_function_privilege('service_role','public.group_copied_item_ids(uuid,uuid)','execute'), 'no service grant');
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_e', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_b')), 0, 'non-joined viewer e denied');
set local "request.jwt.claim.sub" = :'uid_f';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_f', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_b')), 0, 'non-joined viewer f denied');
set local "request.jwt.claim.sub" = :'uid_g';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_g', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_b')), 0, 'non-joined viewer g denied');
set local "request.jwt.claim.sub" = :'uid_h';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_h', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_b')), 0, 'non-joined viewer h denied');
set local "request.jwt.claim.sub" = :'uid_i';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_i', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_b')), 0, 'non-joined viewer i denied');
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', jsonb_build_object('sub', :'uid_b', 'role', 'authenticated')::text, true);
reset role;
update public.group_members set status = 'removed', participating = false where group_id = :'gid' and user_id = :'uid_b';
set local role authenticated;
select is((select count(*)::int from public.group_copied_item_ids(:'gid', :'uid_b')), 0, 'stale membership denied');
reset role;
select * from finish();
rollback;
