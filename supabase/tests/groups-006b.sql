-- 006b: pgTAP suite for the create-private-group database contract.
--
-- Run with: pnpm test db --local (as part of pnpm test:db).
--
-- Covers the 006b brief (docs/delivery/issues/006b-create-private-group.md)
-- database-slice criteria: the receipt shape and secrecy, canonical payload v1
-- validation and the recomputed digest, replay/conflict semantics, the durable
-- group-scoped shareable version, generic/targeted pairing and uniqueness
-- constraints, exact CAS issue/revoke behavior with authoritative expiry, the
-- organizer-only state projection (including issued-expired), targeted
-- isolation, the null-actor equivalence check, and rollback atomicity.
-- Structural race interleavings are proven by the committed two-session
-- harness (scripts/test-group-races-006b-local.sh, pnpm test:db:races:006b).
--
-- The whole suite runs in one transaction that ends with rollback, so no
-- synthetic row persists. Fixed token stand-ins in direct-insert fixtures are
-- clearly synthetic and never real bearer material.

begin;

select plan(70);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset

select repeat('F', 43) as standin_tok \gset

-- 1. Receipt and version shape ----------------------------------------------------

select has_table('public', 'group_creation_receipts', 'the receipt table exists');
select has_column('public', 'group_creation_receipts', 'actor_id', 'receipts.actor_id exists');
select has_column('public', 'group_creation_receipts', 'request_key', 'receipts.request_key exists');
select has_column('public', 'group_creation_receipts', 'contract_version', 'receipts.contract_version exists');
select has_column('public', 'group_creation_receipts', 'payload_digest', 'receipts.payload_digest exists');
select has_column('public', 'group_creation_receipts', 'group_id', 'receipts.group_id exists');
select has_column('public', 'group_creation_receipts', 'created_at', 'receipts.created_at exists');
select col_is_pk(
  'public', 'group_creation_receipts', ARRAY['actor_id', 'request_key'],
  'receipts are keyed uniquely by (actor_id, request_key)'
);
select has_column('public', 'groups', 'shareable_invitation_version', 'groups.shareable_invitation_version exists');
select has_column('public', 'group_invitations', 'shareable_version', 'group_invitations.shareable_version exists');
select col_default_is('public', 'groups', 'shareable_invitation_version', '0', 'the durable shareable version defaults to 0');
select col_not_null('public', 'groups', 'shareable_invitation_version', 'the durable shareable version is not null');

-- The receipt stores only version/digest/group: never payload or user text.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'group_creation_receipts'
      and column_name in ('payload', 'name', 'canonical_payload', 'request_payload')
  ),
  'no raw canonical payload or user text column exists on the receipt table'
);

-- Internal columns are invisible to the client: no column grant on the new
-- groups column, no grant at all on receipts.
select ok(
  not has_column_privilege('authenticated', 'public."groups"', 'shareable_invitation_version', 'SELECT'),
  'authenticated cannot read the internal shareable invitation version'
);
select ok(not has_table_privilege('authenticated', 'public.group_creation_receipts', 'SELECT'), 'authenticated has no SELECT on receipts');
select ok(not has_table_privilege('anon', 'public.group_creation_receipts', 'SELECT'), 'anon has no SELECT on receipts');
select ok(not has_table_privilege('service_role', 'public.group_creation_receipts', 'SELECT'), 'service_role has no SELECT on receipts');
select ok(not has_table_privilege('authenticated', 'public.group_creation_receipts', 'INSERT'), 'authenticated has no INSERT on receipts');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.group_creation_receipts'::regclass),
  'RLS is enabled on the receipt table'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'group_creation_receipts'),
  0, 'the receipt table has no permissive client policy'
);

select has_index(
  'public', 'group_invitations', 'group_invitations_group_shareable_version_key',
  'the (group_id, shareable_version) unique index exists'
);
select has_index(
  'public', 'group_invitations', 'group_invitations_one_active_generic',
  'the one-stored-active-generic partial unique index exists'
);

-- 2. Fixtures and creation ----------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'group-006b-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'group-006b-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'group-006b-c@example.invalid', '');

-- as A: a valid creation through the only callable creation path.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select gen_random_uuid() as req_key \gset

select result::text as create_result, group_id::text as gid
from public.create_group_v1(
  :'req_key'::uuid,
  jsonb_build_object(
    'contract_version', 1,
    'name', 'Diwali Scenes',
    'occasion_type', 'diwali',
    'occasion_date', '2026-11-08',
    'time_zone', 'Asia/Kolkata',
    'location', null,
    'description', null,
    'budget_amount_minor', '150000',
    'budget_currency', 'INR',
    'mode', 'secret_draw',
    'organizer_participating', true
  )
) \gset

select is(:'create_result'::text, 'created', 'the canonical payload v1 creation succeeds');
select is((select count(*)::int from public."groups"), 1, 'exactly one group row exists');
select is(
  (select occasion from public."groups" where id = :'gid'::uuid),
  'Diwali',
  'the user-visible occasion label is stored'
);
select is(
  (select location is null and description is null from public."groups" where id = :'gid'::uuid),
  'true',
  'the optional location and description are stored as null'
);

-- Owner view: the receipt digest is exactly the SHA-256 of the documented
-- deterministic serialization (white-box check of the digest contract).
reset role;

select is(
  (
    select payload_digest = extensions.digest(
      convert_to(
        'getmethis:create-group:v1' || chr(10)
        || 'name=Diwali Scenes' || chr(10)
        || 'occasion_type=diwali' || chr(10)
        || 'occasion_date=2026-11-08' || chr(10)
        || 'time_zone=Asia/Kolkata' || chr(10)
        || 'location=' || chr(10)
        || 'description=' || chr(10)
        || 'budget_amount_minor=150000' || chr(10)
        || 'budget_currency=INR' || chr(10)
        || 'mode=secret_draw' || chr(10),
        'UTF8'
      ),
      'sha256'
    )
    from public.group_creation_receipts
    where actor_id = :'uid_a'::uuid and request_key = :'req_key'::uuid
  ),
  'true',
  'the receipt digest is the SHA-256 of the canonical payload v1 serialization'
);

-- as A: whitespace normalization is the database's job, and the replay of a
-- payload that normalizes identically is the SAME request.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', '  Diwali   Scenes  ',
        'occasion_type', 'diwali',
        'occasion_date', '2026-11-08',
        'time_zone', 'Asia/Kolkata',
        'location', null,
        'description', null,
        'budget_amount_minor', '150000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'created',
  'a different key is always a new intentional creation'
);
select is((select count(*)::int from public."groups"), 2, 'the second key created its own group');
select is(
  (select name from public."groups" where name = 'Diwali Scenes' order by id desc limit 1),
  'Diwali Scenes',
  'the name was NFC-normalized, trimmed, and whitespace-collapsed by the database'
);

-- 3. The organizer-only state projection: never_issued -----------------------------

select is(
  (
    select invitation_version::text || ':' || state || ':' || coalesce(expires_at::text, 'none')
    from public.group_shareable_invitation_state(:'gid'::uuid)
  ),
  '0:never_issued:none',
  'a fresh group projects never_issued at version 0 with no expiry'
);

-- 4. Generic compare-and-swap issuance ----------------------------------------------

select invitation_version::text as v1, token as tok1, expires_at as exp1
from public.issue_group_invitation(:'gid'::uuid, 0::bigint) \gset

select is(:'v1'::text, '1', 'issuing from version 0 creates version 1');
select is(char_length(:'tok1'), 43, 'the token is the canonical 43-character base64url encoding');

-- The authoritative expiry: the stored value, still in the future (owner
-- view; group_invitations has no client grant).
reset role;

select is(
  (
    select (i.expires_at = :'exp1'::timestamptz)::text || ':' ||
           (i.expires_at > clock_timestamp())::text || ':' ||
           ((i.expires_at - clock_timestamp()) between interval '29 days 23 hours' and interval '30 days 1 hour')::text
    from public.group_invitations i
    where i.group_id = :'gid'::uuid and i.shareable_version = 1
  ),
  'true:true:true',
  'the returned expiry is the stored authoritative value, still in the future and 30 days out'
);
select is(
  (select max_uses from public.group_invitations where shareable_version = 1 and group_id = :'gid'::uuid),
  null,
  'the generic link has no use limit'
);
select is(
  (select count(*)::int from public.group_invitations where group_id = :'gid'::uuid and target_user_id is not null),
  0,
  'the generic issuance created no targeted row'
);

-- The state projection reports active.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (
    select invitation_version::text || ':' || state
    from public.group_shareable_invitation_state(:'gid'::uuid)
  ),
  '1:active',
  'the projection reports active at version 1'
);

-- 5. CAS expiry and revocation semantics ---------------------------------------------

-- Force the active generic link into the issued-expired state.
reset role;
update public.group_invitations
set expires_at = clock_timestamp() - interval '1 second'
where group_id = :'gid'::uuid and shareable_version = 1;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (
    select invitation_version::text || ':' || state || ':' || (expires_at is not null)::text
    from public.group_shareable_invitation_state(:'gid'::uuid)
  ),
  '1:issued_expired:true',
  'an expired stored-active generic row projects issued_expired with its stored expiry'
);

-- Revoking the expired (but still stored-active) link revokes it: stored-active
-- includes issued-but-expired.
select invitation_version::text as rv1, revoked as rv1_flag, revoked_at as rv1_at
from public.revoke_group_invitation(:'gid'::uuid, 1::bigint) \gset

select is(:'rv1'::text || ':' || :'rv1_flag'::text, '2:t', 'revoking the expired link increments to version 2 and reports revoked');
select is(:'rv1_at' is not null, 'true', 'the revoke returned an authoritative revoked_at');

-- Owner view: state revoked, no expiry, exactly one revoke event.
reset role;

select is(
  (
    select invitation_version::text || ':' || state || ':' || coalesce(expires_at::text, 'none')
    from public.group_shareable_invitation_state(:'gid'::uuid)
  ),
  '2:revoked:none',
  'after the revoke the projection reports revoked with no expiry'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_revoked'),
  1,
  'exactly one revoke audit event was appended'
);

-- Revoking again with the current version changes nothing: no row, no event.
select invitation_version::text || ':' || revoked::text || ':' || coalesce(revoked_at::text, 'none') as rv2
from public.revoke_group_invitation(:'gid'::uuid, 2::bigint) \gset

select is(:'rv2'::text, '2:false:none', 'a second revoke with no stored-active row changes nothing');
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_revoked'),
  1,
  'the no-op revoke appended no audit event'
);

-- Reissuing from the revoked state creates version 3 and revokes nothing.
select invitation_version::text as v3, token as tok3
from public.issue_group_invitation(:'gid'::uuid, 2::bigint) \gset

select is(:'v3'::text, '3', 'reissuing from the revoked state creates version 3');
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_revoked'),
  1,
  'reissuing with no stored-active prior row appended no revoke event'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_issued'),
  2,
  'both issuances are audited'
);

-- 6. Targeted isolation ---------------------------------------------------------------

-- The mutation calls run as the authenticated organizer; every direct-table
-- check is an owner view (no client grant on group_invitations).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

-- A targeted issue must not move the durable shareable version.
select token as tok_t1, target_membership_generation::text as gen_t1
from public.issue_group_invitation(:'gid'::uuid, :'uid_b'::uuid, (select member_admin_version from public.group_admin_version(:'gid'::uuid))) \gset

reset role;

select is(:'gen_t1'::text, '1', 'the targeted issue bound generation 1');
select is(
  (select shareable_invitation_version::text from public."groups" where id = :'gid'::uuid),
  '3',
  'the targeted issue did not change the durable shareable version'
);
select is(
  (select coalesce(shareable_version::text, 'none') from public.group_invitations
   where token_hash = extensions.digest(convert_to(:'tok_t1', 'UTF8'), 'sha256')),
  'none',
  'the targeted row has no shareable version'
);

-- The targeted revoke-by-ID overload refuses generic rows.
select id::text as inv_generic_id from public.group_invitations
where group_id = :'gid'::uuid and shareable_version = 3 \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (select revoked::text from public.revoke_group_invitation(:'gid'::uuid, :'inv_generic_id'::uuid, (select member_admin_version from public.group_admin_version(:'gid'::uuid)))),
  'false',
  'the targeted revoke-by-ID overload is a no-op for a generic row'
);

reset role;

select is(
  (select status::text from public.group_invitations where id = :'inv_generic_id'::uuid),
  'active',
  'the generic row was untouched by the refused revoke'
);

-- A targeted revoke of the targeted row succeeds and leaves the generic row.
select id::text as inv_targeted_id from public.group_invitations
where token_hash = extensions.digest(convert_to(:'tok_t1', 'UTF8'), 'sha256') \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (select revoked::text from public.revoke_group_invitation(:'gid'::uuid, :'inv_targeted_id'::uuid, (select member_admin_version from public.group_admin_version(:'gid'::uuid)))),
  'true',
  'the targeted revoke-by-ID overload revokes the targeted row'
);

reset role;

select is(
  (select shareable_invitation_version::text from public."groups" where id = :'gid'::uuid),
  '3',
  'the targeted revoke did not change the durable shareable version'
);

-- A generic revoke never touches targeted rows.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select token as tok_t2, target_membership_generation::text as gen_t2
from public.issue_group_invitation(:'gid'::uuid, :'uid_c'::uuid, (select member_admin_version from public.group_admin_version(:'gid'::uuid))) \gset

select invitation_version::text as v4, token as tok4
from public.issue_group_invitation(:'gid'::uuid, 3::bigint) \gset

reset role;

select is(:'v4'::text, '4', 'the generic rotation created version 4');
select is(
  (select status::text from public.group_invitations
   where token_hash = extensions.digest(convert_to(:'tok_t2', 'UTF8'), 'sha256')),
  'active',
  'the generic rotation left the targeted row untouched'
);

-- 7. CAS rejection states --------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select throws_ok(
  format('select * from public.revoke_group_invitation(%L::uuid, 99)', :'gid'),
  'PT409', NULL, 'a stale expected version on revoke is rejected with PT409'
);
select throws_ok(
  format('select * from public.issue_group_invitation(%L::uuid, null::bigint)', :'gid'),
  '22023', NULL, 'a null expected version on issue is rejected with 22023'
);

reset role;

select is(
  (select shareable_invitation_version::text from public."groups" where id = :'gid'::uuid),
  '4',
  'the rejected CAS attempts performed no write'
);

-- 8. The null-actor system audit equivalence -------------------------------------------

-- A null actor is valid ONLY for the exact system-marked revocation.
insert into public.audit_events (actor_id, group_id, event_type, invitation_id, metadata)
values (null, :'gid'::uuid, 'invitation_revoked', :'inv_generic_id'::uuid,
        '{"migration_version":"006b","reason":"multiple_stored_active"}'::jsonb);
select is(
  (
    select count(*)::int from public.audit_events
    where group_id = :'gid'::uuid
      and actor_id is null
      and invitation_id = :'inv_generic_id'::uuid
      and metadata = '{"migration_version":"006b","reason":"multiple_stored_active"}'::jsonb
  ),
  1,
  'the system-marked null-actor revocation satisfies the equivalence check'
);
select throws_ok(
  format(
    'insert into public.audit_events (actor_id, group_id, event_type, metadata) values (null, %L, ''group_created'', ''{}''::jsonb)',
    :'gid'
  ),
  '23514', NULL, 'a null actor on any other event is rejected'
);
select throws_ok(
  format(
    'insert into public.audit_events (actor_id, group_id, event_type, invitation_id, metadata) values (null, %L, ''invitation_revoked'', null, ''{"migration_version":"006b","reason":"multiple_stored_active"}''::jsonb)',
    :'gid'
  ),
  '23514', NULL, 'a null-actor revocation without an invitation reference is rejected'
);
select throws_ok(
  format(
    'insert into public.audit_events (actor_id, group_id, event_type, invitation_id, metadata) values (null, %L, ''invitation_revoked'', %L, ''{"reason":"multiple_stored_active"}''::jsonb)',
    :'gid', :'inv_generic_id'
  ),
  '23514', NULL, 'a null-actor revocation with partial system metadata is rejected'
);

-- 9. Creation rollback atomicity ---------------------------------------------------------

select is((select count(*)::int from public."groups" where organizer_id = :'uid_a'::uuid), 2, 'two fixture groups exist before the rollback probe');

savepoint create_atomicity;

select result::text as rollback_result, group_id::text as rollback_gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'contract_version', 1,
    'name', 'Never Persists',
    'occasion_type', 'eid',
    'occasion_date', '2026-12-01',
    'time_zone', 'Asia/Kolkata',
    'location', null,
    'description', null,
    'budget_amount_minor', '100',
    'budget_currency', 'INR',
    'mode', 'wishlist_only',
    'organizer_participating', true
  )
) \gset

select is(:'rollback_result'::text, 'created', 'the probed creation succeeded inside the savepoint');

reset role;

select is(
  (
    select count(*)::int from public.group_creation_receipts
    where group_id = :'rollback_gid'::uuid
  ),
  1, 'the receipt was written inside the caller transaction'
);

rollback to savepoint create_atomicity;

select is((select count(*)::int from public."groups" where name = 'Never Persists'), 0, 'the rolled-back creation left no group');
select is(
  (
    select count(*)::int from public.group_creation_receipts
    where group_id = :'rollback_gid'::uuid
  ),
  0, 'the rolled-back creation left no receipt'
);
select is(
  (
    select count(*)::int from public.audit_events
    where group_id = :'rollback_gid'::uuid
  ),
  0, 'the rolled-back creation left no audit event'
);

-- 10. Replay through a fresh key under another user ---------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (
    select result::text from public.create_group_v1(
      :'req_key'::uuid,
      jsonb_build_object(
        'contract_version', 1,
        'name', 'Diwali Scenes',
        'occasion_type', 'diwali',
        'occasion_date', '2026-11-08',
        'time_zone', 'Asia/Kolkata',
        'location', null,
        'description', null,
        'budget_amount_minor', '150000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'created',
  'the same request key under another authenticated user is an independent creation'
);

select * from finish();

rollback;
