begin;
select no_plan();
select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as group_id \gset

select is(pg_get_function_result('public.group_invitation_share_preview(text)'::regprocedure), 'TABLE(host_display_name text, group_name text, occasion_at timestamp without time zone)', 'exact three-field social projection');
select ok(has_function_privilege('anon','public.group_invitation_share_preview(text)','EXECUTE'), 'anonymous chat crawlers can request a preview');
select ok(not has_function_privilege('service_role','public.group_invitation_share_preview(text)','EXECUTE'), 'no service credential required or granted');

insert into auth.users(id,aud,role,email,encrypted_password) values (:'owner_id','authenticated','authenticated','share-preview@example.invalid','');
update public.profiles set display_name='Preview Organizer' where id=:'owner_id';
insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id)
values (:'group_id','Preview group','Diwali','2026-11-06 23:30+00','Asia/Kolkata','wishlist_only',:'owner_id');
insert into public.group_members(group_id,user_id,status,participating,membership_generation) values (:'group_id',:'owner_id','joined',true,1);
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
set local role authenticated;
select token as invite_token from public.issue_group_invitation(:'group_id',0) \gset
reset role;
select encode(extensions.digest(convert_to(:'invite_token','UTF8'),'sha256'),'hex') as preview_digest \gset
select count(*) as before_members from public.group_members where group_id=:'group_id' \gset
select use_count as before_uses from public.group_invitations where group_id=:'group_id' \gset

set local role anon;
select is((select group_name from public.group_invitation_share_preview(:'preview_digest')),'Preview group','valid digest reveals group name');
select is((select host_display_name from public.group_invitation_share_preview(:'preview_digest')),'Preview Organizer','preview resolves current organizer name');
select is((select occasion_at from public.group_invitation_share_preview(:'preview_digest')),'2026-11-07 05:00'::timestamp,'date follows the group zone, including crossing midnight');
select is((select count(*)::integer from public.group_invitation_share_preview(:'invite_token')),0,'join bearer is not accepted as a preview digest');
select is((select count(*)::integer from public.preview_group_invitation(:'preview_digest')),0,'preview digest cannot act as a join bearer');
select is((select count(*)::integer from public.group_invitation_share_preview(repeat('a',64))),0,'unknown digest reveals nothing');
select is((select count(*)::integer from public.group_invitation_share_preview('invalid')),0,'malformed digest reveals nothing');
select is((select count(*)::integer from public.group_invitation_share_preview(null)),0,'null digest reveals nothing');
select throws_ok('select * from public.groups','42501',null,'projection does not grant base table access');
reset role;
select is((select count(*) from public.group_members where group_id=:'group_id'),:'before_members'::bigint,'crawler reads create no membership');
select is((select use_count from public.group_invitations where group_id=:'group_id'),:'before_uses'::integer,'crawler reads consume no invitation use');
update public.group_invitations set status='revoked' where group_id=:'group_id';
set local role anon;
select is((select count(*)::integer from public.group_invitation_share_preview(:'preview_digest')),0,'revoked link reveals nothing');
reset role;
update public.group_invitations set status='active', expires_at=clock_timestamp()-interval '1 second' where group_id=:'group_id';
set local role anon;
select is((select count(*)::integer from public.group_invitation_share_preview(:'preview_digest')),0,'expired link reveals nothing');
reset role;
update public.group_invitations set expires_at=clock_timestamp()+interval '1 day', max_uses=1, use_count=1 where group_id=:'group_id';
set local role anon;
select is((select count(*)::integer from public.group_invitation_share_preview(:'preview_digest')),0,'exhausted link reveals nothing');
reset role;
update public.group_invitations set max_uses=null where group_id=:'group_id';
update public.groups set status='archived' where id=:'group_id';
set local role anon;
select is((select count(*)::integer from public.group_invitation_share_preview(:'preview_digest')),0,'non-active group reveals nothing');
reset role;
update public.groups set status='active' where id=:'group_id';
update public.group_invitations set shareable_version=null, target_user_id=:'owner_id', target_membership_generation=1 where group_id=:'group_id';
set local role anon;
select is((select count(*)::integer from public.group_invitation_share_preview(:'preview_digest')),0,'targeted invitation is not a share banner capability');
reset role;
select * from finish();
rollback;
