begin;
select no_plan();
select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as member_id \gset
select gen_random_uuid() as outsider_id \gset
select gen_random_uuid() as group_id \gset
select gen_random_uuid() as other_group_id \gset

select ok(has_function_privilege('authenticated','public.delete_group(uuid,bigint)','EXECUTE'), 'authenticated can call deletion');
select ok(not has_function_privilege('anon','public.delete_group(uuid,bigint)','EXECUTE') and not has_function_privilege('service_role','public.delete_group(uuid,bigint)','EXECUTE'), 'anon and service_role cannot call deletion');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.delete_group(uuid,bigint)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC cannot call deletion');
select ok((select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=""'] from pg_proc p where p.oid='public.delete_group(uuid,bigint)'::regprocedure), 'trusted definer with empty search path');
select ok(not has_table_privilege('authenticated','public.groups','DELETE'), 'no direct group deletion grant');

insert into auth.users(id,aud,role,email,encrypted_password) values
(:'owner_id','authenticated','authenticated','delete-owner@example.invalid',''),
(:'member_id','authenticated','authenticated','delete-member@example.invalid',''),
(:'outsider_id','authenticated','authenticated','delete-outsider@example.invalid','');
insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id) values
(:'group_id','Delete fixture','Birthday','2026-11-07 18:00+00','UTC','secret_draw',:'owner_id'),
(:'other_group_id','Keep fixture','Birthday','2026-11-07 18:00+00','UTC','wishlist_only',:'owner_id');
insert into public.group_members(group_id,user_id,status,participating,membership_generation) values
(:'group_id',:'owner_id','joined',true,1),(:'group_id',:'member_id','joined',true,1),
(:'other_group_id',:'owner_id','joined',true,1);
insert into public.wishlist_items(wishlist_id,owner_id,title,sort_position)
select id,owner_id,'Saved personal item',0 from public.wishlists where owner_id in (:'owner_id',:'member_id');
insert into public.group_item_reservations(group_id,item_id,reserver_id,item_title_snapshot)
select :'group_id',id,:'owner_id',title from public.wishlist_items where owner_id=:'member_id';
update public.groups set current_draw_version=1 where id=:'group_id';
insert into public.group_assignments(group_id,draw_version,giver_id,recipient_id,giver_membership_generation,recipient_membership_generation)
values (:'group_id',1,:'owner_id',:'member_id',1,1),(:'group_id',1,:'member_id',:'owner_id',1,1);
insert into private.email_outbox(template_key,idempotency_key,recipient_user_id,payload)
values ('reminder','delete-test-reminder',:'owner_id',jsonb_build_object('group_id',:'group_id','group_name','Delete fixture','occasion_date','2026-11-07','reminder_offset_days','7'));

set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select token as invite_token from public.get_group_invite_link(:'group_id') \gset
reset role;
select member_admin_version as version from public.groups where id=:'group_id' \gset
select count(*)::int as wishlist_count from public.wishlists where owner_id in (:'owner_id',:'member_id') \gset
select count(*)::int as audit_count from public.audit_events where group_id=:'group_id' \gset
set local role authenticated;
select set_config('request.jwt.claim.sub',:'member_id',true);
select is(public.delete_group(:'group_id',:'version'),false,'ordinary joined member denied');
select is(public.delete_group(:'group_id',999),false,'non-organizer stale version reveals nothing');
select set_config('request.jwt.claim.sub',:'outsider_id',true);
select is(public.delete_group(:'group_id',:'version'),false,'outsider denied');
select is(public.delete_group(gen_random_uuid(),0),false,'unknown group same denial');
select is(public.delete_group(null,0),false,'null group denied');
select set_config('request.jwt.claim.sub','',true);
select is(public.delete_group(:'group_id',0),false,'null actor denied');
set local role anon;
select throws_ok(format('select public.delete_group(%L,0)',:'group_id'),'42501',null,'anonymous RPC blocked');
set local role service_role;
select throws_ok(format('select public.delete_group(%L,0)',:'group_id'),'42501',null,'service role RPC blocked');
reset role;
select is((select status::text from public.groups where id=:'group_id'),'active','denials leave group active');
select is((select count(*)::int from public.audit_events where group_id=:'group_id'),:'audit_count'::int,'denials do not write audit');

-- No authority from a stale browser after a real organizer transfer.
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select member_admin_version as transferred_version from public.transfer_group_organizer(:'group_id',:'member_id',:'version') \gset
select is(public.delete_group(:'group_id',:'version'),false,'former organizer denied even with stale version');
select set_config('request.jwt.claim.sub',:'member_id',true);
select throws_ok(format('select public.delete_group(%L,%s)',:'group_id',:'version'),'PT409',null,'current organizer must confirm latest member state');
select is(public.delete_group(:'group_id',null),false,'missing expected version denied');
select is(public.delete_group(:'group_id',-1),false,'negative version denied');
reset role;
update public.group_members set status='left' where group_id=:'group_id' and user_id=:'member_id';
set local role authenticated;
select is(public.delete_group(:'group_id',:'transferred_version'),false,'organizer must still be joined');
reset role;
update public.group_members set status='joined' where group_id=:'group_id' and user_id=:'member_id';

-- Force a failure late in the transaction and prove atomic rollback.
create function pg_temp.reject_delete_audit() returns trigger language plpgsql as $$
begin
  if new.event_type='group_deleted' then raise exception 'fixture rejection'; end if;
  return new;
end $$;
create trigger fixture_reject_delete before insert on public.audit_events for each row execute function pg_temp.reject_delete_audit();
set local role authenticated;
select throws_ok(format('select public.delete_group(%L,%s)',:'group_id',:'transferred_version'),'P0001','fixture rejection','late error rolls back all changes');
reset role;
drop trigger fixture_reject_delete on public.audit_events;
select is((select status::text from public.groups where id=:'group_id'),'active','failed transaction preserves active group');
select is((select count(*)::int from public.group_members where group_id=:'group_id' and status='joined'),2,'failed transaction preserves memberships');
select is((select count(*)::int from public.group_invitations where group_id=:'group_id' and status='active'),1,'failed transaction preserves invitation');

set local role authenticated;
select is(public.delete_group(:'group_id',:'transferred_version'),true,'current joined organizer deletes successfully');
select is(public.delete_group(:'group_id',:'transferred_version'),false,'repeat call cannot delete or audit twice');
select is((select count(*)::int from public.group_room_snapshot(:'group_id')),0,'organizer cannot access deleted room');
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'cannot recover or create deleted group invite');
select is((select count(*)::int from public.group_admin_version(:'group_id')),0,'deleted group has no admin projection');
select is((select count(*)::int from public.groups where id=:'group_id'),0,'RLS hides deleted group row');
select set_config('request.jwt.claim.sub',:'owner_id',true);
select is((select count(*)::int from public.group_room_snapshot(:'group_id')),0,'other member cannot access deleted room');
select is((select count(*)::int from public.my_group_reservations(:'group_id')),0,'no deleted-group reservations exposed');
select is((select count(*)::int from public.my_assignment(:'group_id')),0,'no deleted-group assignment exposed');
select is((select count(*)::int from public.group_room_snapshot(:'other_group_id')),1,'unrelated group remains accessible');
select set_config('request.jwt.claim.sub',:'outsider_id',true);
select is((select count(*)::int from public.preview_group_invitation(:'invite_token')),0,'old invitation preview unavailable');
reset role;
select is((select result from public.accept_group_invitation(:'invite_token')),'unavailable','old invitation cannot recreate membership');
select is((select status::text from public.groups where id=:'group_id'),'deleted','distinct terminal deletion state stored');
select is((select count(*)::int from public.group_members where group_id=:'group_id' and status in ('joined','invited')),0,'all live memberships ended');
select is((select count(*)::int from public.group_invitations where group_id=:'group_id' and status='active'),0,'all invitations revoked');
select is((select count(*)::int from private.group_shareable_invitation_tokens t join public.group_invitations i on i.id=t.invitation_id where i.group_id=:'group_id'),0,'recoverable bearer material removed');
select is((select count(*)::int from public.audit_events where group_id=:'group_id' and event_type='group_deleted'),1,'one deletion audit retained');
select is((select count(*)::int from public.group_item_reservations where group_id=:'group_id' and status='active'),0,'departure trigger releases reservations');
select is((select count(*)::int from public.group_assignments where group_id=:'group_id'),2,'inaccessible assignment history retained');
select is((select count(*)::int from public.wishlists where owner_id in (:'owner_id',:'member_id')),:'wishlist_count'::int,'personal wishlists preserved');
select is((select count(*)::int from public.wishlist_items where owner_id in (:'owner_id',:'member_id') and title='Saved personal item'),2,'personal wishlist items preserved');
select is((select status::text from private.email_outbox where idempotency_key='delete-test-reminder'),'failed_permanent','pending group email retired');
select * from finish();
rollback;
