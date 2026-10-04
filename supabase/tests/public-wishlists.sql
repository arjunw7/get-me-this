-- Public-by-default extension. All synthetic data and writes roll back.
begin;
select no_plan();
select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as viewer_id \gset
select gen_random_uuid() as other_id \gset
select gen_random_uuid() as item_id \gset
select gen_random_uuid() as second_item_id \gset
select gen_random_uuid() as hidden_item_id \gset
select gen_random_uuid() as other_item_id \gset
select gen_random_uuid() as group_id \gset

select ok(not exists(select 1 from public.wishlists w left join private.wishlist_public_links l on l.wishlist_id=w.id where l.wishlist_id is null), 'migration backfills every existing wishlist');
select ok((select relrowsecurity from pg_class where oid='private.wishlist_public_links'::regclass), 'link secrets have RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.public_wishlist_item_reactions'::regclass), 'public reactions have RLS enabled');
select is((select count(*)::int from pg_policy where polrelid in ('private.wishlist_public_links'::regclass,'public.public_wishlist_item_reactions'::regclass)), 0, 'both new tables have deny-all policy sets');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) role_name cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege_name where has_table_privilege(role_name,'private.wishlist_public_links',privilege_name) or has_table_privilege(role_name,'public.public_wishlist_item_reactions',privilege_name)), 'no application role has any direct new-table read/write privilege');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('public.own_wishlist_share_state()'::regprocedure,'public.enable_wishlist_share(bigint)'::regprocedure,'public.revoke_wishlist_share(bigint)'::regprocedure,'public.public_wishlist_snapshot(text)'::regprocedure,'public.set_public_wishlist_reaction(text,uuid,public.group_item_reaction_kind)'::regprocedure,'public.own_public_wishlist_reaction_summary()'::regprocedure,'public.public_wishlist_image_source(text,uuid)'::regprocedure,'private.create_wishlist_public_link()'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'), 'no function is implicitly executable by PUBLIC');
select ok(not exists(select 1 from pg_proc p where p.oid in ('public.own_wishlist_share_state()'::regprocedure,'public.enable_wishlist_share(bigint)'::regprocedure,'public.revoke_wishlist_share(bigint)'::regprocedure,'public.public_wishlist_snapshot(text)'::regprocedure,'public.set_public_wishlist_reaction(text,uuid,public.group_item_reaction_kind)'::regprocedure,'public.own_public_wishlist_reaction_summary()'::regprocedure,'public.public_wishlist_image_source(text,uuid)'::regprocedure,'private.create_wishlist_public_link()'::regprocedure) and (not p.prosecdef or pg_get_userbyid(p.proowner)<>'postgres' or p.proconfig is distinct from array['search_path=""'])), 'all functions use trusted definer and empty search path');
select ok(has_function_privilege('anon','public.public_wishlist_snapshot(text)','EXECUTE') and has_function_privilege('authenticated','public.public_wishlist_snapshot(text)','EXECUTE') and not has_function_privilege('service_role','public.public_wishlist_snapshot(text)','EXECUTE'), 'only public reader roles execute the public projection');
select ok(has_function_privilege('service_role','public.public_wishlist_image_source(text,uuid)','EXECUTE') and not has_function_privilege('anon','public.public_wishlist_image_source(text,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.public_wishlist_image_source(text,uuid)','EXECUTE'), 'image source is server-only');
select ok(not exists(select 1 from unnest(array['public.own_wishlist_share_state()','public.enable_wishlist_share(bigint)','public.revoke_wishlist_share(bigint)','public.set_public_wishlist_reaction(text,uuid,public.group_item_reaction_kind)','public.own_public_wishlist_reaction_summary()']) rpc where not has_function_privilege('authenticated',rpc,'EXECUTE') or has_function_privilege('anon',rpc,'EXECUTE') or has_function_privilege('service_role',rpc,'EXECUTE')), 'only authenticated may mutate or read owner state');
select is(pg_get_function_result('public.public_wishlist_snapshot(text)'::regprocedure), 'TABLE(display_name text, taste_line text, vibe text, viewer_is_owner boolean, item_id uuid, title text, source_url text, retailer text, note text, desire_level wishlist_item_desire_level, original_amount_minor text, original_currency text, has_image boolean, very_you_count bigint, questionable_count bigint, want_it_too_count bigint, viewer_reaction group_item_reaction_kind)', 'public projection exposes exactly approved display and public reaction fields');
select is(pg_get_function_result('public.public_wishlist_image_source(text,uuid)'::regprocedure), 'TABLE(image_snapshot_path text, image_url text, owner_id uuid)', 'image source is narrow and separate');

insert into auth.users(id,aud,role,email,encrypted_password) values
  (:'owner_id','authenticated','authenticated','public-owner@example.invalid',''),
  (:'viewer_id','authenticated','authenticated','public-viewer@example.invalid',''),
  (:'other_id','authenticated','authenticated','public-other@example.invalid','');
select id as wishlist_id from public.wishlists where owner_id=:'owner_id' \gset
select id as other_wishlist_id from public.wishlists where owner_id=:'other_id' \gset
select share_token as owner_token from private.wishlist_public_links where wishlist_id=:'wishlist_id' \gset
select share_token as other_token from private.wishlist_public_links where wishlist_id=:'other_wishlist_id' \gset
select ok((select enabled and version=0 and length(share_token)=43 and octet_length(token_hash)=32 from private.wishlist_public_links where wishlist_id=:'wishlist_id'), 'signup automatically creates a strong-format enabled link at version zero');
select ok(:'owner_token' <> :'other_token', 'separate signups get independent random tokens');
update public.profiles set display_name='Shared Owner', taste_line='Small treasures', vibe='electric' where id=:'owner_id';
insert into public.wishlist_items(id,wishlist_id,owner_id,title,source_url,retailer,image_url,image_snapshot_path,note,original_amount_minor,original_currency,desire_level,sort_position,extraction_status) values
  (:'item_id',:'wishlist_id',:'owner_id','Saved lamp','https://example.invalid/lamp','Shop','https://example.invalid/lamp.webp', :'owner_id'||'/fixture.webp','Warm light',9007199254740993,'INR','really_want',2,'extracted'),
  (:'second_item_id',:'wishlist_id',:'owner_id','First item',null,null,null,null,null,null,null,'would_love',1,'manual'),
  (:'hidden_item_id',:'wishlist_id',:'owner_id','Still extracting',null,null,null,null,null,null,null,'would_love',3,'extracting'),
  (:'other_item_id',:'other_wishlist_id',:'other_id','Other wishlist',null,null,null,null,null,null,null,'would_love',1,'manual');
-- Seed a private reaction: it must never appear in public counts.
insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id) values
  (:'group_id','Private fixture','Birthday','2026-11-07 18:00+00','UTC','secret_draw',:'owner_id');
insert into public.group_members(group_id,user_id,status,participating,membership_generation) values
  (:'group_id',:'owner_id','joined',true,1),(:'group_id',:'other_id','joined',true,1);
insert into public.group_item_reactions(group_id,item_id,user_id,reaction) values(:'group_id',:'item_id',:'other_id','very_you');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::int from public.public_wishlist_snapshot(:'owner_token')),2,'signed-out visitors see exactly the visible items');
select is((select array_agg(title) from public.public_wishlist_snapshot(:'owner_token')),array['First item','Saved lamp'],'public items preserve committed wishlist order');
select is((select display_name||':'||taste_line||':'||vibe from public.public_wishlist_snapshot(:'owner_token') limit 1),'Shared Owner:Small treasures:electric','only intentionally shared profile fields are projected');
select is((select original_amount_minor from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),'9007199254740993','original price is lossless text');
select ok((select has_image and not viewer_is_owner and viewer_reaction is null from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),'public image flag reveals no storage source and anonymous caller has no reaction');
select is((select very_you_count from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),0::bigint,'private group reactions never enter public totals');
select is((select count(*)::int from public.public_wishlist_snapshot(null)),0,'null token is a uniform empty denial');
select is((select count(*)::int from public.public_wishlist_snapshot('bad-token')),0,'malformed token is a uniform empty denial');
select is((select count(*)::int from public.public_wishlist_snapshot(repeat('A',43))),0,'unknown well-formed token is a uniform empty denial');
select throws_ok('select * from public.wishlist_items','42501',null,'anonymous visitors gain no base item access');
select throws_ok('select * from public.profiles','42501',null,'anonymous visitors gain no base profile access');
select throws_ok('select * from public.public_wishlist_item_reactions','42501',null,'anonymous visitors cannot enumerate reaction authors');
select throws_ok('select * from public.own_wishlist_share_state()','42501',null,'anonymous visitors cannot obtain owner link state');
select throws_ok('select * from public.enable_wishlist_share(0)','42501',null,'anonymous visitors cannot enable links');
select throws_ok('select * from public.revoke_wishlist_share(0)','42501',null,'anonymous visitors cannot revoke links');
select throws_ok(format('select * from public.set_public_wishlist_reaction(%L,%L::uuid,%L)',:'owner_token',:'item_id','very_you'),'42501',null,'anonymous visitors cannot react');
select throws_ok(format('select * from public.public_wishlist_image_source(%L,%L::uuid)',:'owner_token',:'item_id'),'42501',null,'anonymous visitors cannot obtain storage sources');

set local role authenticated;
select set_config('request.jwt.claim.sub',:'viewer_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'viewer_id','role','authenticated')::text,true);
select is((select count(*)::int from public.wishlist_items where owner_id=:'owner_id'),0,'signed-in public visitor still cannot directly read foreign items');
select is((select count(*)::int from public.profiles where id=:'owner_id'),0,'signed-in public visitor still cannot directly read foreign profile');
select throws_ok('select * from private.wishlist_public_links','42501',null,'signed-in visitor cannot enumerate secret links');
select throws_ok('select * from public.public_wishlist_item_reactions','42501',null,'signed-in visitor cannot enumerate public reactors');
select ok((select share_token <> :'owner_token' and enabled from public.own_wishlist_share_state()),'owner-state RPC never returns another owner token');
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',:'item_id','very_you')),1,'signed-in non-group member can react');
select is((select very_you_count from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),1::bigint,'public total includes public reaction only');
select is((select viewer_reaction::text from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),'very_you','viewer reads only their own selected reaction');
select is((select questionable_count from public.set_public_wishlist_reaction(:'owner_token',:'item_id','questionable')),1::bigint,'reaction replacement returns authoritative new total');
select is((select very_you_count from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),0::bigint,'replacing removes previous kind instead of duplicating');
select is((select questionable_count from public.set_public_wishlist_reaction(:'owner_token',:'item_id',null)),0::bigint,'null removes the caller reaction');
select ok((select viewer_reaction is null from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),'removed reaction is no longer selected');
select is((select want_it_too_count from public.set_public_wishlist_reaction(:'owner_token',:'item_id','want_it_too')),1::bigint,'third reaction kind is supported');
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',:'other_item_id','very_you')),0,'token cannot authorize another wishlist item');
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',:'hidden_item_id','very_you')),0,'extracting item cannot be reacted to');
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',gen_random_uuid(),'very_you')),0,'unknown item is a uniform denial');
select is((select count(*)::int from public.set_public_wishlist_reaction('bad',:'item_id','very_you')),0,'malformed token cannot mutate');
select throws_ok(format('select * from public.set_public_wishlist_reaction(%L,%L::uuid,%L)',:'owner_token',:'item_id','invalid'),'22P02',null,'reaction vocabulary is closed');
select throws_ok(format('select * from public.public_wishlist_image_source(%L,%L::uuid)',:'owner_token',:'item_id'),'42501',null,'signed-in visitor cannot obtain storage sources');
-- This new user's own wishlist is empty; its public sentinel is distinguishable only with its token.
select share_token as empty_token from public.own_wishlist_share_state() \gset
select ok((select item_id is null and title is null and has_image is null and very_you_count is null and viewer_is_owner from public.public_wishlist_snapshot(:'empty_token')),'authorized empty wishlist returns one safe header sentinel');
select is((select count(*)::int from public.own_public_wishlist_reaction_summary()),0,'public visitor gets no foreign owner aggregate');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',:'item_id','very_you')),0,'authenticated role without verified actor cannot react');
select is((select count(*)::int from public.own_wishlist_share_state()),0,'null actor cannot obtain link state');
select is((select count(*)::int from public.revoke_wishlist_share(0)),0,'null actor cannot revoke');

select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
select ok((select viewer_is_owner and viewer_reaction is null from public.public_wishlist_snapshot(:'owner_token') where item_id=:'item_id'),'owner sees read-only reaction state');
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',:'item_id','very_you')),0,'owner cannot react to own public item');
select is((select want_it_too_count from public.own_public_wishlist_reaction_summary() where item_id=:'item_id'),1::bigint,'owner sees public-only aggregate');
select is((select very_you_count from public.own_public_wishlist_reaction_summary() where item_id=:'item_id'),0::bigint,'owner public aggregate does not leak private group counts');
select ok((select enabled and version=0 and share_token=:'owner_token' from public.enable_wishlist_share(0)),'enable is stable/idempotent for the current active link');
select is((select count(*)::int from public.revoke_wishlist_share(99)),0,'stale version cannot revoke');
select is((select count(*)::int from public.revoke_wishlist_share(null)),0,'missing version cannot revoke');
select ok((select not enabled and version=1 and share_token is null from public.revoke_wishlist_share(0)),'owner revocation increments version and hides token');
select is((select count(*)::int from public.public_wishlist_snapshot(:'owner_token')),0,'revoked link denies owner as well as public visitors');
select ok((select not enabled and version=1 and share_token is null from public.own_wishlist_share_state()),'revoked state contains no bearer token');
select is((select count(*)::int from public.enable_wishlist_share(0)),0,'stale enable cannot resurrect revoked capability');
select ok((select not enabled and version=1 from public.revoke_wishlist_share(1)),'repeat revoke is idempotent at matching version');
select is((select want_it_too_count from public.own_public_wishlist_reaction_summary() where item_id=:'item_id'),1::bigint,'revocation does not delete owner reaction history');
set local role authenticated;
select set_config('request.jwt.claim.sub',:'viewer_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'viewer_id','role','authenticated')::text,true);
select is((select count(*)::int from public.set_public_wishlist_reaction(:'owner_token',:'item_id',null)),0,'revocation rejects subsequent reaction mutations including removal');
set local role service_role;
select is((select count(*)::int from public.public_wishlist_image_source(:'owner_token',:'item_id')),0,'revocation rejects subsequent image source lookup');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::int from public.public_wishlist_snapshot(:'owner_token')),0,'signed-out visitors cannot read revoked link');

set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
select enabled, version, share_token as fresh_token from public.enable_wishlist_share(1) \gset
select ok(:'enabled'::boolean and :'version'::bigint=2 and :'fresh_token'<>:'owner_token','re-enable generates a new capability rather than reviving old token');
select is((select count(*)::int from public.public_wishlist_snapshot(:'owner_token')),0,'old token remains revoked after re-enable');
select is((select count(*)::int from public.public_wishlist_snapshot(:'fresh_token')),2,'new token authorizes current visible list');
select is((select count(*)::int from public.revoke_wishlist_share(1)),0,'late stale revocation cannot disable the new link');
set local role service_role;
select ok((select image_snapshot_path=:'owner_id'||'/fixture.webp' and image_url='https://example.invalid/lamp.webp' and owner_id=:'owner_id'::uuid from public.public_wishlist_image_source(:'fresh_token',:'item_id')),'server obtains exact authorized image source plus path-owner binding');
select is((select count(*)::int from public.public_wishlist_image_source(:'fresh_token',:'other_item_id')),0,'image lookup rejects cross-wishlist item');
select is((select count(*)::int from public.public_wishlist_image_source(:'fresh_token',:'hidden_item_id')),0,'image lookup rejects extracting item');
select is((select count(*)::int from public.public_wishlist_image_source('bad',:'item_id')),0,'image lookup rejects malformed token');

reset role;
select is((select count(*)::int from public.public_wishlist_item_reactions where item_id=:'item_id'),1,'replacement/removal preserves unique item-user context');
update public.wishlist_items set extraction_status='failed' where id=:'item_id';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::int from public.public_wishlist_snapshot(:'fresh_token') where item_id=:'item_id'),0,'later failed extraction hides previously shared item');
reset role;
update public.wishlist_items set extraction_status='extracted' where id=:'item_id';
delete from public.wishlist_items where id=:'item_id';
select is((select count(*)::int from public.public_wishlist_item_reactions where item_id=:'item_id'),0,'deleted item cascades public reactions');
set local role service_role;
select is((select count(*)::int from public.public_wishlist_image_source(:'fresh_token',:'item_id')),0,'deleted item has no image source');
reset role;
select * from finish();
rollback;
