-- Every fixture and write is rolled back. No persistent accounts or groups.
begin;
select plan(33);

select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as member_id \gset
select gen_random_uuid() as invited_id \gset
select gen_random_uuid() as removed_id \gset
select gen_random_uuid() as outsider_id \gset
select gen_random_uuid() as left_id \gset
select gen_random_uuid() as declined_id \gset
select gen_random_uuid() as cross_id \gset
select gen_random_uuid() as group_id \gset
select gen_random_uuid() as other_group_id \gset

select has_column('public', 'profiles', 'vibe', 'profiles has persisted Vibe');
select col_not_null('public', 'profiles', 'vibe', 'Vibe is never null');
select is(pg_get_function_result('public.group_member_vibes(uuid)'::regprocedure),
  'TABLE(member_user_id uuid, vibe text)', 'projection exposes exactly member id and Vibe');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='group_member_vibes'),1,'only one RPC overload exists');
select is((select p.prosecdef::text || ':' || p.provolatile::text || ':' || array_to_string(p.proconfig, ',') from pg_proc p where p.oid='public.group_member_vibes(uuid)'::regprocedure),
  'true:s:search_path=""', 'stable definer uses empty search path');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='public.group_member_vibes(uuid)'::regprocedure),'postgres','trusted non-client function owner');
select ok(has_function_privilege('authenticated','public.group_member_vibes(uuid)','EXECUTE') and not has_function_privilege('anon','public.group_member_vibes(uuid)','EXECUTE') and not has_function_privilege('service_role','public.group_member_vibes(uuid)','EXECUTE'),'only authenticated application role can execute');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.group_member_vibes(uuid)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute');
select ok(has_column_privilege('authenticated','public.profiles','vibe','UPDATE') and not has_column_privilege('anon','public.profiles','vibe','UPDATE'),'only authenticated profile editor receives new update grant');
select ok((select relrowsecurity from pg_class where oid='public.profiles'::regclass),'profile RLS remains enabled');
select ok(not has_table_privilege('authenticated','public.group_members','SELECT') and not has_table_privilege('authenticated','public."groups"','SELECT'),'no direct group/member read grants added');

insert into auth.users (id,aud,role,email,encrypted_password) values
  (:'owner_id','authenticated','authenticated','vibe-owner@example.invalid',''),
  (:'member_id','authenticated','authenticated','vibe-member@example.invalid',''),
  (:'invited_id','authenticated','authenticated','vibe-invited@example.invalid',''),
  (:'removed_id','authenticated','authenticated','vibe-removed@example.invalid',''),
  (:'outsider_id','authenticated','authenticated','vibe-outsider@example.invalid',''),
  (:'left_id','authenticated','authenticated','vibe-left@example.invalid',''),
  (:'declined_id','authenticated','authenticated','vibe-declined@example.invalid',''),
  (:'cross_id','authenticated','authenticated','vibe-cross@example.invalid','');
select is((select vibe from public.profiles where id=:'owner_id'),'marigold','signup retains the marigold default');

insert into public."groups" (id,name,occasion,occasion_at,time_zone,mode,organizer_id) values
  (:'group_id','Vibe fixture','Birthday','2026-11-07 18:00+00','UTC','wishlist_only',:'owner_id'),
  (:'other_group_id','Other fixture','Birthday','2026-11-07 18:00+00','UTC','secret_draw',:'cross_id');
insert into public.group_members (group_id,user_id,status,participating,membership_generation) values
  (:'group_id',:'owner_id','joined',true,1),
  (:'group_id',:'member_id','joined',true,1),
  (:'group_id',:'invited_id','invited',false,1),
  (:'group_id',:'removed_id','removed',false,1),
  (:'group_id',:'left_id','left',false,1),
  (:'group_id',:'declined_id','declined',false,1),
  (:'other_group_id',:'cross_id','joined',true,1);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'owner_id','role','authenticated')::text, true);
select lives_ok(format('update public.profiles set vibe = %L where id = %L::uuid','electric',:'owner_id'),'owner can save an allowed Vibe');
select is((select vibe from public.profiles where id=:'owner_id'),'electric','owner reads saved Vibe');
select lives_ok(format('update public.profiles set vibe = %L where id = %L::uuid','tomato',:'owner_id'),'tomato is allowed');
select lives_ok(format('update public.profiles set vibe = %L where id = %L::uuid','acid_lime',:'owner_id'),'acid lime is allowed');
select throws_ok(format('update public.profiles set vibe = %L where id = %L::uuid','purple',:'owner_id'),'23514',null,'unknown Vibe is rejected by the database');
select throws_ok(format('update public.profiles set vibe = null where id = %L::uuid',:'owner_id'),'23502',null,'null Vibe is rejected');
with changed as (update public.profiles set vibe='tomato' where id=:'member_id' returning id)
select is((select count(*)::int from changed),0,'owner cannot update another profile');
select is((select count(*)::int from public.profiles where id=:'member_id'),0,'joined membership does not allow direct foreign profile reads');
select is((select count(*)::int from public.group_member_vibes(:'group_id')),2,'joined organizer sees exactly the joined roster');
select is((select vibe from public.group_member_vibes(:'group_id') where member_user_id=:'member_id'),'marigold','foreign joined member Vibe is readable only through the narrow projection');
select is((select count(*)::int from public.group_member_vibes(:'group_id') where member_user_id in (:'invited_id',:'removed_id',:'left_id',:'declined_id')),0,'pending and former member Vibes are absent');
select is((select count(*)::int from public.group_member_vibes(:'other_group_id')),0,'cross-group target is denied');
select is((select count(*)::int from public.group_member_vibes(gen_random_uuid())),0,'unknown group is indistinguishable from denial');

select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'member_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),2,'ordinary joined member gets the same safe roster');

select set_config('request.jwt.claim.sub', :'outsider_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'outsider_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),0,'outsider cannot enumerate Vibes');
select set_config('request.jwt.claim.sub', :'invited_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'invited_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),0,'invited caller is denied');
select set_config('request.jwt.claim.sub', :'removed_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'removed_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),0,'removed caller is denied');
select set_config('request.jwt.claim.sub', :'left_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'left_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),0,'left caller is denied');
select set_config('request.jwt.claim.sub', :'declined_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'declined_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),0,'declined caller is denied');

reset role;
update public."groups" set status='archived' where id=:'group_id';
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', :'owner_id','role','authenticated')::text, true);
select is((select count(*)::int from public.group_member_vibes(:'group_id')),0,'archived group denies even its joined organizer');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(format('select * from public.group_member_vibes(%L::uuid)',:'group_id'),'42501',null,'anonymous caller cannot execute the projection');

reset role;
select * from finish();
rollback;
