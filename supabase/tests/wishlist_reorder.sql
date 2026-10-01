-- 005d: exact-sequence wishlist reorder, narrow grants, and atomic append.
-- This suite is intentionally separate from the 005a/005c schema suite so
-- the ordering contract remains readable as it grows.

begin;

select plan(33);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'reorder-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'reorder-b@example.invalid', '');

select id as wid_a from public.wishlists where owner_id = :'uid_a'::uuid \gset
select id as wid_b from public.wishlists where owner_id = :'uid_b'::uuid \gset

select '00000000-0000-4000-8000-000000000101'::uuid as item_a1 \gset
select '00000000-0000-4000-8000-000000000102'::uuid as item_a2 \gset
select '00000000-0000-4000-8000-000000000103'::uuid as item_a3 \gset
select '00000000-0000-4000-8000-000000000201'::uuid as item_b1 \gset

insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position)
values
  (:'item_a1'::uuid, :'wid_a'::uuid, :'uid_a'::uuid, 'A one', 1),
  (:'item_a2'::uuid, :'wid_a'::uuid, :'uid_a'::uuid, 'A two', 2),
  (:'item_a3'::uuid, :'wid_a'::uuid, :'uid_a'::uuid, 'A three', 3),
  (:'item_b1'::uuid, :'wid_b'::uuid, :'uid_b'::uuid, 'B one', 1);

select has_function(
  'public',
  'reorder_wishlist_item',
  array['uuid[]', 'uuid', 'integer'],
  'the exact-sequence reorder function exists'
);

select has_function(
  'public',
  'append_wishlist_item',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'bigint', 'text'],
  'the shared-lock append function exists'
);

select is(
  (select proconfig from pg_proc where oid = 'public.reorder_wishlist_item(uuid[],uuid,integer)'::regprocedure),
  array['search_path=""'],
  'reorder runs with an empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.reorder_wishlist_item(uuid[],uuid,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.reorder_wishlist_item(uuid[],uuid,integer)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.reorder_wishlist_item(uuid[],uuid,integer)', 'EXECUTE')
    and not has_function_privilege('public', 'public.reorder_wishlist_item(uuid[],uuid,integer)', 'EXECUTE'),
  'only authenticated may execute reorder'
);

select ok(
  has_function_privilege('authenticated', 'public.append_wishlist_item(uuid,text,text,text,text,text,bigint,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.append_wishlist_item(uuid,text,text,text,text,text,bigint,text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.append_wishlist_item(uuid,text,text,text,text,text,bigint,text)', 'EXECUTE')
    and not has_function_privilege('public', 'public.append_wishlist_item(uuid,text,text,text,text,text,bigint,text)', 'EXECUTE'),
  'only authenticated may execute atomic append'
);

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select throws_ok(
  format('update public.wishlist_items set sort_position = 99 where id = %L', :'item_a1'),
  '42501',
  NULL,
  'an owner cannot directly update sort_position'
);

select set_config('request.jwt.claim.sub', :'uid_b', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select throws_ok(
  format('update public.wishlist_items set sort_position = 99 where id = %L', :'item_a1'),
  '42501',
  NULL,
  'a foreign authenticated caller cannot directly update sort_position'
);
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

update public.wishlist_items set note = 'still editable' where id = :'item_a1'::uuid;
select is(
  (select note from public.wishlist_items where id = :'item_a1'::uuid),
  'still editable',
  'the existing editable UPDATE columns remain granted'
);

insert into public.wishlist_items (wishlist_id, owner_id, title, sort_position)
values (:'wid_a'::uuid, :'uid_a'::uuid, 'Direct insert retained', 4);
select is(
  (select count(*)::int from public.wishlist_items where title = 'Direct insert retained'),
  1,
  'direct INSERT retains sort_position privilege'
);

delete from public.wishlist_items where title = 'Direct insert retained';

reset role;
update public.wishlist_items set sort_position = case id
  when :'item_a1'::uuid then 1::float8
  when :'item_a2'::uuid then 1::float8
  else sort_position
end
where owner_id = :'uid_a'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 1)',
    :'item_a2', :'item_a1', :'item_a3', :'item_a2'
  ),
  $$values ('stale'::text)$$,
  'a tie-break order change is stale even when the set and sort keys match'
);
select is(
  (select array_agg(id order by sort_position, id) from public.wishlist_items where owner_id = :'uid_a'::uuid),
  array[:'item_a1'::uuid, :'item_a2'::uuid, :'item_a3'::uuid],
  'a stale tie sequence writes nothing'
);

reset role;
update public.wishlist_items set sort_position = case id
  when :'item_a1'::uuid then 1::float8
  when :'item_a2'::uuid then 2::float8
  else sort_position
end
where owner_id = :'uid_a'::uuid;
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position)
values ('00000000-0000-4000-8000-000000000104', :'wid_a'::uuid, :'uid_a'::uuid, 'Created first', 4);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 2)',
    :'item_a1', :'item_a2', :'item_a3', :'item_a1'
  ),
  $$values ('stale'::text)$$,
  'a create that commits before reorder makes the prior sequence stale'
);

reset role;
delete from public.wishlist_items where id = '00000000-0000-4000-8000-000000000104';
delete from public.wishlist_items where id = :'item_a3'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 1)',
    :'item_a1', :'item_a2', :'item_a3', :'item_a1'
  ),
  $$values ('stale'::text)$$,
  'a delete that commits before reorder makes the prior sequence stale'
);

reset role;
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position)
values (:'item_a3'::uuid, :'wid_a'::uuid, :'uid_a'::uuid, 'A three', 3);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 2)',
    :'item_a1', :'item_a2', :'item_a3', :'item_a1'
  ),
  $$values ('moved'::text)$$,
  'an exact prior sequence commits a nonadjacent move'
);

select is(
  (select array_agg(id order by sort_position, id) from public.wishlist_items where owner_id = :'uid_a'::uuid),
  array[:'item_a2'::uuid, :'item_a3'::uuid, :'item_a1'::uuid],
  'the canonical order matches the requested move'
);

select is(
  (select sort_position from public.wishlist_items where id = :'item_a2'::uuid),
  2::float8,
  'a representable move leaves an unmoved neighbor sort key unchanged'
);

reset role;
delete from public.wishlist_items where id = :'item_a3'::uuid;
select is(
  (select array_agg(id order by sort_position, id) from public.wishlist_items where owner_id = :'uid_a'::uuid),
  array[:'item_a2'::uuid, :'item_a1'::uuid],
  'a delete committed after reorder removes its row without resurrecting it'
);
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position)
values (:'item_a3'::uuid, :'wid_a'::uuid, :'uid_a'::uuid, 'A three', 3);
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 0)',
    :'item_a1', :'item_a2', :'item_a3', :'item_a1'
  ),
  $$values ('stale'::text)$$,
  'a changed exact sequence returns stale'
);

select is(
  (select array_agg(id order by sort_position, id) from public.wishlist_items where owner_id = :'uid_a'::uuid),
  array[:'item_a2'::uuid, :'item_a3'::uuid, :'item_a1'::uuid],
  'a stale move writes nothing'
);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 0)',
    :'item_a2', :'item_a2', :'item_a1', :'item_a2'
  ),
  $$values ('unavailable'::text)$$,
  'a duplicate expected sequence is unavailable'
);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 0)',
    :'item_a2', :'item_a3', :'item_a1', :'item_b1'
  ),
  $$values ('unavailable'::text)$$,
  'a foreign moved item is unavailable without foreign details'
);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 1)',
    :'item_a2', :'item_a3', :'item_a1', :'item_a3'
  ),
  $$values ('unchanged'::text)$$,
  'a same-index move is a freshness-checked no-op'
);

reset role;
update public.wishlist_items set sort_position = case id
  when :'item_a2'::uuid then 1::float8
  when :'item_a3'::uuid then 2::float8
  else 1.7976931348623157e308::float8
end
where owner_id = :'uid_a'::uuid;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 2)',
    :'item_a2', :'item_a3', :'item_a1', :'item_a2'
  ),
  $$values ('moved'::text)$$,
  'boundary overflow rebalances instead of claiming an unrepresentable key'
);
select is(
  (select array_agg(sort_position order by sort_position, id) from public.wishlist_items where owner_id = :'uid_a'::uuid),
  array[1::float8, 2::float8, 3::float8],
  'boundary overflow produces dense finite owner-only keys'
);

reset role;
update public.wishlist_items set sort_position = case id
  when :'item_a2'::uuid then 1::float8
  when :'item_a3'::uuid then 1.0000000000000002::float8
  else 2::float8
end
where owner_id = :'uid_a'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L,%L,%L]::uuid[], %L, 1)',
    :'item_a2', :'item_a3', :'item_a1', :'item_a1'
  ),
  $$values ('moved'::text)$$,
  'an exhausted float interval succeeds through owner-only rebalance'
);

select is(
  (select array_agg(sort_position order by sort_position, id) from public.wishlist_items where owner_id = :'uid_a'::uuid),
  array[1::float8, 2::float8, 3::float8],
  'precision exhaustion rebalances the owner rows to dense finite keys'
);

select gen_random_uuid() as submission_id \gset
select results_eq(
  format(
    'select result from public.append_wishlist_item(%L, ''Atomic append'', null, null, null, ''would_love'', null, null)',
    :'submission_id'
  ),
  $$values ('saved'::text)$$,
  'the app append function saves under the owner wishlist lock'
);

select is(
  (select title from public.wishlist_items where owner_id = :'uid_a'::uuid order by sort_position desc, id desc limit 1),
  'Atomic append',
  'atomic create appends after the newly ordered tail'
);

select results_eq(
  format(
    'select result from public.append_wishlist_item(%L, ''Atomic append'', null, null, null, ''would_love'', null, null)',
    :'submission_id'
  ),
  $$values ('replayed'::text)$$,
  'an identical submission key replay remains idempotent'
);

select results_eq(
  format(
    'select result from public.append_wishlist_item(%L, ''Changed append'', null, null, null, ''would_love'', null, null)',
    :'submission_id'
  ),
  $$values ('submission-conflict'::text)$$,
  'a changed submission-key replay remains a conflict'
);

reset role;
set local role anon;
select throws_ok(
  format(
    'select * from public.reorder_wishlist_item(array[%L]::uuid[], %L, 0)',
    :'item_a1', :'item_a1'
  ),
  '42501',
  NULL,
  'signed-out callers cannot execute reorder'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select results_eq(
  format(
    'select result from public.reorder_wishlist_item(array[%L]::uuid[], %L, 0)',
    :'item_b1', :'item_a1'
  ),
  $$values ('unavailable'::text)$$,
  'an authenticated user cannot move a foreign item'
);

select is(
  (select array_agg(id order by sort_position, id) from public.wishlist_items),
  array[:'item_b1'::uuid],
  'the foreign caller sees only their own unchanged canonical sequence'
);

select * from finish();
rollback;
