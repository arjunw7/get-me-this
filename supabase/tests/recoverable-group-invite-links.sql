begin;
select no_plan();
select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as member_id \gset
select gen_random_uuid() as outsider_id \gset
select gen_random_uuid() as group_id \gset
select gen_random_uuid() as legacy_group_id \gset
select gen_random_uuid() as expired_group_id \gset

select ok((select relrowsecurity from pg_class where oid='private.group_shareable_invitation_tokens'::regclass),'recoverable tokens have RLS');
select is((select count(*)::int from pg_policy where polrelid='private.group_shareable_invitation_tokens'::regclass),0,'recoverable tokens have no permissive policy');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) p where has_table_privilege(r,'private.group_shareable_invitation_tokens',p)),'all application roles denied direct token access');
select ok(not has_function_privilege('anon','public.get_group_invite_link(uuid)','EXECUTE') and not has_function_privilege('service_role','public.get_group_invite_link(uuid)','EXECUTE') and has_function_privilege('authenticated','public.get_group_invite_link(uuid)','EXECUTE'),'only authenticated caller may request recovery');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r where has_function_privilege(r,'private.issue_group_invitation_digest_core(uuid,bigint)','EXECUTE')),'old issuance core is not an API bypass');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('public.get_group_invite_link(uuid)'::regprocedure,'public.issue_group_invitation(uuid,bigint)'::regprocedure,'private.issue_group_invitation_digest_core(uuid,bigint)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC cannot execute recovery or issuance internals');
select ok(not exists(select 1 from pg_proc p where p.oid in ('public.get_group_invite_link(uuid)'::regprocedure,'public.issue_group_invitation(uuid,bigint)'::regprocedure,'private.issue_group_invitation_digest_core(uuid,bigint)'::regprocedure) and (not p.prosecdef or pg_get_userbyid(p.proowner)<>'postgres' or p.proconfig is distinct from array['search_path=""'])),'trusted definer and empty search path everywhere');
select is(pg_get_function_result('public.get_group_invite_link(uuid)'::regprocedure),'TABLE(result text, invitation_version bigint, token text, expires_at timestamp with time zone)','recovery returns exactly state, version, bearer and expiry');
select is(pg_get_function_result('public.issue_group_invitation(uuid,bigint)'::regprocedure),'TABLE(invitation_version bigint, token text, expires_at timestamp with time zone)','explicit issuance preserves existing RPC shape');

insert into auth.users(id,aud,role,email,encrypted_password) values
  (:'owner_id','authenticated','authenticated','recover-owner@example.invalid',''),
  (:'member_id','authenticated','authenticated','recover-member@example.invalid',''),
  (:'outsider_id','authenticated','authenticated','recover-outsider@example.invalid','');
insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id) values
  (:'group_id','Recoverable fixture','Birthday','2026-11-07 18:00+00','UTC','wishlist_only',:'owner_id'),
  (:'legacy_group_id','Legacy fixture','Birthday','2026-11-07 18:00+00','UTC','secret_draw',:'owner_id'),
  (:'expired_group_id','Expired legacy fixture','Birthday','2026-11-07 18:00+00','UTC','gift_everyone',:'owner_id');
insert into public.group_members(group_id,user_id,status,participating,membership_generation) values
  (:'group_id',:'owner_id','joined',true,1),(:'group_id',:'member_id','joined',true,1),
  (:'legacy_group_id',:'owner_id','joined',true,1),(:'expired_group_id',:'owner_id','joined',true,1);
-- Simulate pre-migration hash-only links through the preserved digest core.
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
select token as legacy_token from private.issue_group_invitation_digest_core(:'legacy_group_id',0) \gset
select token as expired_token from private.issue_group_invitation_digest_core(:'expired_group_id',0) \gset
update public.group_invitations set expires_at=clock_timestamp()-interval '1 day' where group_id=:'expired_group_id';

set local role authenticated;
select result as first_result, invitation_version as first_version, token as first_token, expires_at as first_expiry from public.get_group_invite_link(:'group_id') \gset
select is(:'first_result'::text,'ready'::text,'opening a never-issued group creates a usable link');
select is(:'first_version'::text,'1'::text,'first modal issuance increments version once');
select ok(length(:'first_token')=43,'new recoverable link has canonical-length bearer');
select ok((select result='ready' and token=:'first_token' and invitation_version=1 and expires_at=:'first_expiry'::timestamptz from public.get_group_invite_link(:'group_id')),'reopening returns identical bearer, expiry and version');
select throws_ok('select * from private.group_shareable_invitation_tokens','42501',null,'organizer cannot bypass projection to enumerate raw token table');
select throws_ok(format('select * from private.issue_group_invitation_digest_core(%L,1)',:'group_id'),'42501',null,'organizer cannot call digest core directly');
select ok((select result='replacement_required' and invitation_version=1 and token is null from public.get_group_invite_link(:'legacy_group_id')),'live legacy hash-only link requires explicit confirmation');
select ok((select result='replacement_required' and invitation_version=1 and token is null from public.get_group_invite_link(:'legacy_group_id')),'reopening legacy modal still never rotates link');
select token as replaced_token from public.issue_group_invitation(:'legacy_group_id',1) \gset
select ok((select result='ready' and token=:'replaced_token' and invitation_version=2 from public.get_group_invite_link(:'legacy_group_id')),'explicit confirmed legacy replacement is recoverable');
select throws_ok(format('select * from public.issue_group_invitation(%L,1)',:'legacy_group_id'),'PT409','stale_invitation_version','stale explicit replacement cannot rotate newer link');
select ok((select result='ready' and invitation_version=2 and token<>:'expired_token' from public.get_group_invite_link(:'expired_group_id')),'expired legacy link gets a fresh recoverable link without a replacement prompt');
select token as explicit_token, invitation_version as explicit_version from public.issue_group_invitation(:'group_id',1) \gset
select ok(:'explicit_token'<>:'first_token' and :'explicit_version'='2','explicit issuance replaces only by confirmed CAS');
select ok((select token=:'explicit_token' and invitation_version=2 from public.get_group_invite_link(:'group_id')),'link issued from existing created-page action is recoverable');
select is((select invitation_version from public.revoke_group_invitation(:'group_id',2)),3::bigint,'existing revoke still advances its version');
select token as after_revoke_token from public.get_group_invite_link(:'group_id') \gset
select ok(:'after_revoke_token'<>:'explicit_token','opening after revocation creates a new token');
select ok((select token=:'after_revoke_token' and invitation_version=4 from public.get_group_invite_link(:'group_id')),'reopen after revoked-link recovery stays stable');

select set_config('request.jwt.claim.sub',:'member_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'member_id','role','authenticated')::text,true);
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'joined non-organizer cannot recover or mint link');
select is((select count(*)::int from public.issue_group_invitation(:'group_id',4)),0,'joined non-organizer cannot explicitly replace link');
select set_config('request.jwt.claim.sub',:'outsider_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'outsider_id','role','authenticated')::text,true);
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'outsider cannot recover or mint link');
select is((select count(*)::int from public.get_group_invite_link(gen_random_uuid())),0,'unknown group has same denial shape');
select is((select count(*)::int from public.get_group_invite_link(null)),0,'missing group has same denial shape');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'null actor cannot recover or mint link');
set local role anon;
select throws_ok(format('select * from public.get_group_invite_link(%L)',:'group_id'),'42501',null,'anonymous visitors cannot execute organizer recovery');
set local role service_role;
select throws_ok(format('select * from public.get_group_invite_link(%L)',:'group_id'),'42501',null,'service credential is not a recovery caller');
reset role;
select is((select count(*)::int from private.group_shareable_invitation_tokens s join public.group_invitations i on i.id=s.invitation_id where i.group_id=:'group_id'),1,'replacement purges obsolete bearer material but keeps current one');
select is((select count(*)::int from public.group_invitations where group_id=:'legacy_group_id'),2,'only explicit replacement created a second legacy-group invitation');
select is((select count(*)::int from public.audit_events where group_id=:'legacy_group_id' and event_type='invitation_issued'),2,'legacy modal reads append no issuance audit event');
select ok((select status='revoked' from public.group_invitations where token_hash=extensions.digest(convert_to(:'legacy_token','UTF8'),'sha256')),'explicit replacement revokes the old legacy capability');
-- A stored secret must match the authority row digest; corruption fails closed.
update private.group_shareable_invitation_tokens s set token=repeat('B',42)||'A' from public.group_invitations i where i.id=s.invitation_id and i.group_id=:'group_id';
set local role authenticated;
select set_config('request.jwt.claim.sub',:'owner_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','role','authenticated')::text,true);
select ok((select result='replacement_required' and token is null and invitation_version=4 from public.get_group_invite_link(:'group_id')),'mismatched stored token is never disclosed or silently rotated');
reset role;
update public.groups set organizer_id=:'member_id' where id=:'group_id';
set local role authenticated;
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'former organizer cannot recover after transfer');
select set_config('request.jwt.claim.sub',:'member_id',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',:'member_id','role','authenticated')::text,true);
select ok((select result='replacement_required' from public.get_group_invite_link(:'group_id')),'current organizer inherits safe lifecycle state');
reset role;
update public.group_members set status='removed' where group_id=:'group_id' and user_id=:'member_id';
set local role authenticated;
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'organizer must still be joined');
reset role;
update public.group_members set status='joined' where group_id=:'group_id' and user_id=:'member_id';
update public.groups set status='archived' where id=:'group_id';
set local role authenticated;
select is((select count(*)::int from public.get_group_invite_link(:'group_id')),0,'archived group cannot reveal or create invite link');
select is((select count(*)::int from public.issue_group_invitation(:'group_id',4)),0,'archived group cannot explicitly replace invite link');
reset role;
select * from finish();
rollback;
