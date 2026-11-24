begin;
select plan(12);
-- Simulate phase 2 only within this test transaction.
drop trigger on_auth_user_created on auth.users;
drop trigger on_auth_user_wishlist_created on auth.users;
insert into auth.users(id, email, email_confirmed_at) values
 ('b1240000-0000-4000-8000-000000000001', 'first-visit@example.test', now()),
 ('b1240000-0000-4000-8000-000000000002', 'other-app@example.test', now()),
 ('b1240000-0000-4000-8000-000000000003', 'unverified@example.test', null);
select is((select count(*) from public.profiles where id::text like 'b1240000-%'), 0::bigint, 'shared Auth signup creates no app profiles');
select is((select count(*) from public.wishlists where owner_id::text like 'b1240000-%'), 0::bigint, 'shared Auth signup creates no app wishlists');
select ok(not has_function_privilege('anon', 'public.ensure_get_me_this_account()', 'execute'), 'anonymous callers cannot provision');
select ok(not has_function_privilege('service_role', 'public.ensure_get_me_this_account()', 'execute'), 'no service-key provisioning path');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1240000-0000-4000-8000-000000000001', true);
select lives_ok('select public.ensure_get_me_this_account()', 'verified caller provisions on first visit');
select lives_ok('select public.ensure_get_me_this_account()', 'repeated visit is idempotent');
reset role;
select is((select count(*) from public.profiles where id = 'b1240000-0000-4000-8000-000000000001'), 1::bigint, 'one caller profile');
select is((select count(*) from public.wishlists where owner_id = 'b1240000-0000-4000-8000-000000000001'), 1::bigint, 'one caller wishlist');
select is((select count(*) from public.profiles where id = 'b1240000-0000-4000-8000-000000000002'), 0::bigint, 'other app account stays unprovisioned');
select is((select count(*) from public.wishlists where owner_id = 'b1240000-0000-4000-8000-000000000002'), 0::bigint, 'other app account gets no wishlist');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1240000-0000-4000-8000-000000000003', true);
select throws_ok('select public.ensure_get_me_this_account()', '42501', 'A verified account is required', 'unverified caller denied');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok('select public.ensure_get_me_this_account()', '42501', 'A verified account is required', 'missing identity denied');
reset role;
select * from finish();
rollback;
