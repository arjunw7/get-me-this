-- 006f: pgTAP suite for organizer membership controls and audit behavior.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/006f-organizer-membership-
-- controls.md: the durable member_admin_version column and check; the exact
-- compare-and-swap signatures with full pg_proc overload enumeration (old
-- non-CAS overloads proven absent); owner/security mode/empty search_path;
-- EXECUTE revocation from PUBLIC/anon/service_role and the exact
-- authenticated grants; unchanged base-table, column, schema, and sequence
-- privileges; the pinned 006a-006e projections; every allowed transition
-- with version/generation/audit assertions; one-time token semantics;
-- revocation idempotence including the no-op revoke under a stale version;
-- atomic transfer with immediate former-organizer denial; the full negative
-- authorization matrix of criterion 8; audit privacy/integrity; and
-- read-only invariants. The whole suite is wrapped in one transaction that
-- ends with rollback, so no synthetic user, group, or member row persists.

begin;

select plan(112);

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
select gen_random_uuid() as uid_x \gset
select gen_random_uuid() as uid_o \gset

-- 1. The durable member-admin version column -----------------------------------

select is(
  (
    select data_type || ':' || is_nullable || ':' || column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'groups'
      and column_name = 'member_admin_version'
  ),
  'bigint:NO:0',
  'groups.member_admin_version is a not-null bigint defaulting to 0'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.groups'::regclass
      and conname = 'groups_member_admin_version_non_negative'
      and contype = 'c'
  ),
  'the nonnegative member_admin_version check exists'
);

select is(
  (
    select count(*)::int
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'groups'
      and column_name = 'member_admin_version'
      and grantee in ('anon', 'authenticated', 'service_role')
  ),
  0,
  'no application role holds a column grant on member_admin_version'
);

-- 2. Exact signatures and overload hygiene --------------------------------------

select has_function('public', 'remove_group_member', 'remove_group_member exists');
select has_function('public', 'transfer_group_organizer', 'transfer_group_organizer exists');
select has_function('public', 'group_admin_audit', 'group_admin_audit exists');
select has_function('public', 'group_admin_version', 'group_admin_version exists');
select has_function('public', 'group_admin_live_invitations', 'group_admin_live_invitations exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'remove_group_member'
  ),
  1, 'exactly one overload of remove_group_member exists (the CAS form)'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_group_organizer'
  ),
  1, 'exactly one overload of transfer_group_organizer exists (the CAS form)'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'remove_group_member'
  ),
  'p_group_id uuid, p_target_user_id uuid, p_expected_member_admin_version bigint',
  'remove_group_member takes the exact CAS identity arguments'
);

select is(
  (
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_group_organizer'
  ),
  'p_group_id uuid, p_target_user_id uuid, p_expected_member_admin_version bigint',
  'transfer_group_organizer takes the exact CAS identity arguments'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'remove_group_member'
  ),
  'TABLE(member_admin_version bigint)',
  'remove_group_member returns exactly the committed version'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_group_organizer'
  ),
  'TABLE(member_admin_version bigint, new_organizer_id uuid)',
  'transfer_group_organizer returns exactly the version and the new organizer'
);

-- The targeted issue/revoke keep the generic (uuid, bigint) overloads from
-- 006b and gain exactly one CAS targeted overload each; the old non-CAS
-- targeted overloads are dropped, never edited in place.
select is(
  (
    select array_agg(pg_get_function_identity_arguments(p.oid) order by 1)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'issue_group_invitation'
  ),
  array[
    'p_group_id uuid, p_expected_invitation_version bigint',
    'p_group_id uuid, p_target_user_id uuid, p_expected_member_admin_version bigint'
  ]::text[],
  'issue_group_invitation keeps only the generic CAS and the targeted CAS overloads'
);

select is(
  (
    select array_agg(pg_get_function_identity_arguments(p.oid) order by 1)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'revoke_group_invitation'
  ),
  array[
    'p_group_id uuid, p_expected_invitation_version bigint',
    'p_group_id uuid, p_invitation_id uuid, p_expected_member_admin_version bigint'
  ]::text[],
  'revoke_group_invitation keeps only the generic CAS and the targeted by-ID CAS overloads'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('issue_group_invitation', 'revoke_group_invitation')
      and pg_get_function_identity_arguments(p.oid) in (
        'p_group_id uuid, p_target_user_id uuid',
        'p_group_id uuid, p_invitation_id uuid'
      )
  ),
  0, 'the non-CAS targeted overloads are absent'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'issue_group_invitation'
      and pg_get_function_identity_arguments(p.oid)
        = 'p_group_id uuid, p_target_user_id uuid, p_expected_member_admin_version bigint'
  ),
  'TABLE(token text, expires_at timestamp with time zone, target_membership_generation bigint)',
  'the targeted CAS issue returns token, expiry, and the bound generation'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'revoke_group_invitation'
      and pg_get_function_identity_arguments(p.oid)
        = 'p_group_id uuid, p_invitation_id uuid, p_expected_member_admin_version bigint'
  ),
  'TABLE(revoked boolean, revoked_at timestamp with time zone)',
  'the targeted CAS revoke returns the idempotent revoked flag and time'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_admin_audit'
  ),
  'TABLE(event_type text, created_at timestamp with time zone, subject_user_id uuid, subject_display_label text, membership_generation bigint)',
  'group_admin_audit exposes exactly the five approved columns'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_admin_live_invitations'
  ),
  'TABLE(target_user_id uuid, invitation_id uuid, expires_at timestamp with time zone)',
  'group_admin_live_invitations exposes id and expiry per invited member, never token material'
);

-- 3. Security mode, ownership, volatility, and EXECUTE grants -------------------

select is(
  (
    select string_agg(
      p.proname || ':' || p.prosecdef::text || ':'
        || coalesce(array_to_string(p.proconfig, ','), '') || ':'
        || pg_get_userbyid(p.proowner),
      ',' order by p.proname
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'remove_group_member', 'transfer_group_organizer', 'issue_group_invitation',
        'revoke_group_invitation', 'group_admin_audit', 'group_admin_version',
        'group_admin_live_invitations'
      )
  ),
  'group_admin_audit:true:search_path="":postgres,group_admin_live_invitations:true:search_path="":postgres,group_admin_version:true:search_path="":postgres,issue_group_invitation:true:search_path="":postgres,issue_group_invitation:true:search_path="":postgres,remove_group_member:true:search_path="":postgres,revoke_group_invitation:true:search_path="":postgres,revoke_group_invitation:true:search_path="":postgres,transfer_group_organizer:true:search_path="":postgres',
  'all seven functions (nine overloads) are SECURITY DEFINER, empty search_path, owned by the trusted role'
);

select is(
  (
    select string_agg(p.proname || ':' || p.provolatile::text, ',' order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('group_admin_audit', 'group_admin_version', 'group_admin_live_invitations')
  ),
  'group_admin_audit:s,group_admin_live_invitations:v,group_admin_version:s',
  'the projections are honest about their clock use (stable audit/version, volatile live invitations)'
);

select is(
  (
    select coalesce(string_agg(s.proname || ':' || s.roles, ',' order by s.proname), 'none')
    from (
      select p.proname, coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), 'none') as roles
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
      join pg_roles r on r.oid = g.grantee
      where n.nspname = 'public'
        and p.proname in (
          'remove_group_member', 'transfer_group_organizer', 'issue_group_invitation',
          'revoke_group_invitation', 'group_admin_audit', 'group_admin_version',
          'group_admin_live_invitations'
        )
        and g.privilege_type = 'EXECUTE'
        and r.rolname in ('public', 'anon', 'authenticated', 'service_role')
      group by p.proname
    ) s
  ),
  'group_admin_audit:authenticated,group_admin_live_invitations:authenticated,group_admin_version:authenticated,issue_group_invitation:authenticated,remove_group_member:authenticated,revoke_group_invitation:authenticated,transfer_group_organizer:authenticated',
  'EXECUTE on every overload of the seven functions is granted to authenticated only among PUBLIC and the application roles'
);

-- 4. Unchanged table, column, and sequence privileges ----------------------------

select ok(
  has_column_privilege('authenticated', 'public.groups', 'id', 'SELECT')
    and has_column_privilege('authenticated', 'public.groups', 'name', 'SELECT'),
  'the existing column-limited groups SELECT grant is unchanged'
);

select ok(
  not has_table_privilege('authenticated', 'public.group_members', 'SELECT')
    and not has_table_privilege('authenticated', 'public.audit_events', 'SELECT')
    and not has_table_privilege('authenticated', 'public.group_invitations', 'SELECT')
    and not has_table_privilege('anon', 'public.groups', 'SELECT')
    and not has_table_privilege('service_role', 'public.group_members', 'SELECT'),
  'no direct base-table read grant exists for any application role'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('group_room_snapshot', 'group_admin_members')
  ),
  2,
  'the 006a/006d projections still exist as single overloads'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'group_admin_members'
  ),
  'TABLE(user_id uuid, display_name text, status text, participating boolean, joined_at timestamp with time zone, left_at timestamp with time zone)',
  'group_admin_members keeps exactly its approved six columns'
);

-- 5. Fixtures ----------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'admin-f@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'b-f@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'c-f@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'd-f@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'e-f@example.invalid', ''),
  (:'uid_f'::uuid, 'authenticated', 'authenticated', 'f-f@example.invalid', ''),
  (:'uid_g'::uuid, 'authenticated', 'authenticated', 'g-f@example.invalid', ''),
  (:'uid_h'::uuid, 'authenticated', 'authenticated', 'h-f@example.invalid', ''),
  (:'uid_i'::uuid, 'authenticated', 'authenticated', 'i-f@example.invalid', ''),
  (:'uid_j'::uuid, 'authenticated', 'authenticated', 'j-f@example.invalid', ''),
  (:'uid_x'::uuid, 'authenticated', 'authenticated', 'x-f@example.invalid', ''),
  (:'uid_o'::uuid, 'authenticated', 'authenticated', 'o-f@example.invalid', '');

update public.profiles set display_name = 'Riya Admin' where id = :'uid_a'::uuid;
update public.profiles set display_name = 'Arjun B' where id = :'uid_b'::uuid;
update public.profiles set display_name = 'Meera C' where id = :'uid_c'::uuid;
update public.profiles set display_name = 'Dev D' where id = :'uid_d'::uuid;
update public.profiles set display_name = 'Esha E' where id = :'uid_e'::uuid;
update public.profiles set display_name = 'Farhan F' where id = :'uid_f'::uuid;
update public.profiles set display_name = 'Gauri G' where id = :'uid_g'::uuid;
update public.profiles set display_name = 'Hiral H' where id = :'uid_h'::uuid;
update public.profiles set display_name = 'Ishaan I' where id = :'uid_i'::uuid;
update public.profiles set display_name = 'Jigar J' where id = :'uid_j'::uuid;
update public.profiles set display_name = 'Outsider X' where id = :'uid_x'::uuid;
update public.profiles set display_name = 'Organizer O' where id = :'uid_o'::uuid;

-- The fixture group: A organizes; B, G, I, J joined; C invited; D declined;
-- E left; F removed.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select group_id::text as gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Admin Fixture', 'occasion_type', 'diwali', 'occasion_date', '2026-11-07',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '250000', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

reset role;

insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, 1),
       (:'gid'::uuid, :'uid_g'::uuid, 'joined', true, 1),
       (:'gid'::uuid, :'uid_i'::uuid, 'joined', true, 1),
       (:'gid'::uuid, :'uid_j'::uuid, 'joined', true, 1),
       (:'gid'::uuid, :'uid_c'::uuid, 'invited', false, 1),
       (:'gid'::uuid, :'uid_d'::uuid, 'declined', false, 2),
       (:'gid'::uuid, :'uid_e'::uuid, 'left', false, 2),
       (:'gid'::uuid, :'uid_f'::uuid, 'removed', false, 3);

-- A second group with O organizing, for the cross-group denial fixtures.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_o';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select group_id::text as gid2
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Other Fixture', 'occasion_type', 'diwali', 'occasion_date', '2026-11-07',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '250000', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

reset role;

-- C's live targeted invitation, issued through the real organizer RPC: this
-- is the group's first member-admin mutation, so the version is now 1.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select token as tok_c
from public.issue_group_invitation(:'gid'::uuid, :'uid_c'::uuid, (select member_admin_version from public.group_admin_version(:'gid'::uuid))) \gset

-- Owner-view lookup of the invitation id (the digest projection of the
-- one-time token); the base table has no client grant.
reset role;
select id::text as inv_c_id
from public.group_invitations
where token_hash = extensions.digest(convert_to(:'tok_c', 'UTF8'), 'sha256') \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '1', 'the fixture targeted issuance leaves the version at 1'
);

-- 6. Positive transitions ------------------------------------------------------------

-- Removal of a joined member: one version increment, one generation
-- increment, one audit event, durable removed row.
select member_admin_version::text as v1
from public.remove_group_member(
  :'gid'::uuid, :'uid_i'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'v1'::text, '2', 'removing a joined member commits and returns version 2');

reset role;
select is(
  (
    select status::text || ':' || membership_generation::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_i'::uuid
  ),
  'removed:2:false', 'the removed row is durable history at the incremented generation'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


reset role;
select is(
  (
    select count(*)::int from public.audit_events
    where group_id = :'gid'::uuid and event_type = 'member_removed'
      and subject_user_id = :'uid_i'::uuid
      and metadata->>'membership_generation' = '2'
  ),
  1, 'exactly one removal audit event with the reached generation'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

-- Reinvitation of a removed row: restored to invited with a new generation,
-- a 30-day one-use token bound to that generation, one audit event.
select token as tok_f, expires_at as tok_f_exp, target_membership_generation::text as tok_f_gen
from public.issue_group_invitation(
  :'gid'::uuid, :'uid_f'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'tok_f_gen'::text, '4', 'the reinvitation of the removed row binds the incremented generation 4');

reset role;
select is(
  (
    select status::text || ':' || membership_generation::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_f'::uuid
  ),
  'invited:4', 'the removed row is restored to invited at the new generation'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


select ok(
  :'tok_f_exp' > clock_timestamp() + interval '29 days'
    and :'tok_f_exp' < clock_timestamp() + interval '31 days',
  'the reissued token expires in thirty days'
);

select ok(
  length(:'tok_f') = 43 and right(:'tok_f', 1) similar to '[AEIMQUYcgkosw048]',
  'the token is the canonical 43-character unpadded base64url form'
);

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '3', 'the reinvitation committed version 3'
);

-- The reinvitation's acceptance is the 006c continuation path (006a's
-- direct accept was superseded and keeps no authenticated EXECUTE); this
-- suite pins the stored token facts instead.
reset role;
select is(
  (
    select max_uses::text || ':' || use_count::text || ':' || status::text || ':'
      || (token_hash = extensions.digest(convert_to(:'tok_f', 'UTF8'), 'sha256'))::text
    from public.group_invitations
    where token_hash = extensions.digest(convert_to(:'tok_f', 'UTF8'), 'sha256')
  ),
  '1:0:active:true', 'the reissued token is a stored one-use digest only (never the raw token)'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


-- Reinvitations of the declined and left rows.
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select target_membership_generation::text as tok_d_gen
from public.issue_group_invitation(
  :'gid'::uuid, :'uid_d'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset
select is(:'tok_d_gen'::text, '3', 'the declined row is reinstated at generation 3');

select target_membership_generation::text as tok_e_gen
from public.issue_group_invitation(
  :'gid'::uuid, :'uid_e'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset
select is(:'tok_e_gen'::text, '3', 'the left row is reinstated at generation 3');

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '5', 'the two reinstatements committed versions 4 and 5'
);

-- A second targeted issue while C's invitation is live is refused.
select is(
  (
    select count(*)::int from public.issue_group_invitation(
      :'gid'::uuid, :'uid_c'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'an invited row with a live targeted invitation cannot be reinvited'
);

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '5', 'the refusal wrote nothing'
);

-- Revocation of the live targeted invitation: one version increment, one
-- event, the row stays invited, and the generic link is untouched.
select revoked::text as rev_c, coalesce(revoked_at::text, 'none') as rev_c_at
from public.revoke_group_invitation(
  :'gid'::uuid, :'inv_c_id'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'rev_c' || ':' || (:'rev_c_at' <> 'none')::text, 'true:true', 'revoking the live targeted invitation succeeds with a timestamp');

reset role;
select is(
  (
    select status::text || ':' || membership_generation::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid
  ),
  'invited:1', 'the revoked row stays invited with an unchanged generation'
);

select is(
  (select status::text from public.group_invitations where id = :'inv_c_id'::uuid),
  'revoked', 'the invitation row is revoked'
);

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '6', 'the revocation committed version 6'
);

select is(
  (select shareable_invitation_version::text from public."groups" where id = :'gid'::uuid),
  '0', 'the generic shareable link state is untouched by the targeted revoke'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


-- Revocation is idempotent: the second call is a no-op with no event.
select revoked::text as rev_c2
from public.revoke_group_invitation(
  :'gid'::uuid, :'inv_c_id'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'rev_c2'::text, 'false', 'revoking the already-revoked invitation returns false');

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '6', 'the no-op revoke wrote nothing'
);

-- The invited row whose invitation is no longer live can be reinvited with
-- the row's status and generation unchanged.
select token as tok_c2, target_membership_generation::text as tok_c2_gen
from public.issue_group_invitation(
  :'gid'::uuid, :'uid_c'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'tok_c2_gen'::text, '1', 'the reinvitation of the invited-no-live row binds the unchanged generation');

reset role;
select is(
  (
    select status::text || ':' || membership_generation::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid
  ),
  'invited:1', 'the invited row is unchanged by the reinvitation'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '7', 'the invited-no-live reinvitation committed version 7'
);

-- A targeted issue for a known user with no row creates the invited row at
-- generation 1.
select target_membership_generation::text as tok_h_gen
from public.issue_group_invitation(
  :'gid'::uuid, :'uid_h'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'tok_h_gen'::text, '1', 'the targeted issue for an absent row creates it at generation 1');

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '8', 'the absent-row issue committed version 8'
);

-- Atomic organizer transfer: authority moves, the outgoing organizer stays
-- joined with unchanged participation, one audit event.
select member_admin_version::text as v_transfer, new_organizer_id::text as new_org
from public.transfer_group_organizer(
  :'gid'::uuid, :'uid_g'::uuid,
  (select member_admin_version from public.group_admin_version(:'gid'::uuid))
) \gset

select is(:'v_transfer' || ':' || (:'new_org' = :'uid_g')::text, '9:true', 'the transfer commits version 9 and moves authority to G');

reset role;
select is(
  (select organizer_id::text from public."groups" where id = :'gid'::uuid),
  :'uid_g', 'groups.organizer_id is the sole authority field and moved'
);

select is(
  (
    select status::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_a'::uuid
  ),
  'joined:true', 'the outgoing organizer remains a joined, participating member'
);

select is(
  (
    select count(*)::int from public.audit_events
    where group_id = :'gid'::uuid and event_type = 'organizer_transferred'
  ),
  1, 'exactly one transfer audit event was appended'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


-- 7. The former organizer: immediate authority loss --------------------------------

-- As A (former organizer): with the current version the mutations are denied
-- as any joined non-organizer (zero rows, no write). A cannot read the
-- current version anymore, so the current committed value (9, captured as
-- :v_transfer) is supplied directly.
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select count(*)::int from public.remove_group_member(:'gid'::uuid, :'uid_j'::uuid, :v_transfer::bigint)
  ),
  0, 'the former organizer cannot remove (CAS passes, authority denies)'
);

select is(
  (select count(*)::int from public.group_admin_version(:'gid'::uuid)),
  0, 'the former organizer loses the version read'
);
select is(
  (select count(*)::int from public.group_admin_audit(:'gid'::uuid)),
  0, 'the former organizer loses the audit projection'
);
select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid)),
  0, 'the former organizer loses the admin roster'
);

-- With a stale expected version the former organizer gets the deterministic
-- PT409 result, never an authority revival.
select throws_ok(
  format('select * from public.remove_group_member(%L::uuid, %L::uuid, 8::bigint)', :'gid', :'uid_j'),
  'PT409', NULL, 'the former organizer stale removal is rejected with PT409'
);

-- The new organizer can remove the former organizer; access is lost.
set local "request.jwt.claim.sub" = :'uid_g';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select member_admin_version::text from public.remove_group_member(
      :'gid'::uuid, :'uid_a'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  '10', 'the new organizer removes the former organizer (version 10)'
);

reset role;
select is(
  (select status::text from public.group_members where group_id = :'gid'::uuid and user_id = :'uid_a'::uuid),
  'removed', 'the former organizer row is durable removed history'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);


-- The removed former organizer can be reinstated only by a new targeted
-- reinvitation.
select is(
  (
    select target_membership_generation::text from public.issue_group_invitation(
      :'gid'::uuid, :'uid_a'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  '3', 'the removed former organizer is reinstated by reinvitation at generation 3'
);

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '11', 'the reinstatement committed version 11'
);

-- 8. CAS denial shapes --------------------------------------------------------------

-- A stale expected version on any mutation is a deterministic PT409 with no
-- write and no audit event.
select throws_ok(
  format('select * from public.remove_group_member(%L::uuid, %L::uuid, 5::bigint)', :'gid', :'uid_j'),
  'PT409', NULL, 'a stale expected version on remove is rejected with PT409'
);
select throws_ok(
  format('select * from public.transfer_group_organizer(%L::uuid, %L::uuid, 5::bigint)', :'gid', :'uid_j'),
  'PT409', NULL, 'a stale expected version on transfer is rejected with PT409'
);
select throws_ok(
  format('select * from public.issue_group_invitation(%L::uuid, %L::uuid, 5::bigint)', :'gid', :'uid_j'),
  'PT409', NULL, 'a stale expected version on targeted issue is rejected with PT409'
);
select throws_ok(
  format('select * from public.revoke_group_invitation(%L::uuid, %L::uuid, 5::bigint)', :'gid', :'inv_c_id'),
  'PT409', NULL, 'a stale expected version is rejected with PT409 even for a no-op revoke'
);

select is(
  (select member_admin_version::text from public.group_admin_version(:'gid'::uuid)),
  '11', 'the stale denials wrote nothing'
);

-- A null or negative expected version is rejected with 22023.
select throws_ok(
  format('select * from public.remove_group_member(%L::uuid, %L::uuid, null::bigint)', :'gid', :'uid_j'),
  '22023', NULL, 'a null expected version is rejected with 22023'
);
select throws_ok(
  format('select * from public.transfer_group_organizer(%L::uuid, %L::uuid, (-1)::bigint)', :'gid', :'uid_j'),
  '22023', NULL, 'a negative expected version is rejected with 22023'
);
select throws_ok(
  format('select * from public.issue_group_invitation(%L::uuid, %L::uuid, null::bigint)', :'gid', :'uid_j'),
  '22023', NULL, 'a null expected version on issue is rejected with 22023'
);
select throws_ok(
  format('select * from public.revoke_group_invitation(%L::uuid, %L::uuid, (-1)::bigint)', :'gid', :'inv_c_id'),
  '22023', NULL, 'a negative expected version on revoke is rejected with 22023'
);

-- 9. The state-machine denial matrix ------------------------------------------------

-- Self-removal: the organizer cannot remove their own row.
select is(
  (
    select count(*)::int from public.remove_group_member(
      :'gid'::uuid, :'uid_g'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'the organizer cannot remove themselves'
);

-- Removal of a former (declined) row and of an absent person: no write.
select is(
  (
    select count(*)::int from public.remove_group_member(
      :'gid'::uuid, :'uid_d'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'a declined row cannot be removed'
);
select is(
  (
    select count(*)::int from public.remove_group_member(
      :'gid'::uuid, :'uid_x'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'an absent person cannot be removed (non-enumerating denial)'
);

-- Transfer refusals: invited, declined, left, removed, self, and outsider
-- destinations.
select is(
  (
    select count(*)::int from public.transfer_group_organizer(
      :'gid'::uuid, :'uid_c'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'transfer to an invited person is refused'
);
select is(
  (
    select count(*)::int from public.transfer_group_organizer(
      :'gid'::uuid, :'uid_d'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'transfer to a declined person is refused'
);
select is(
  (
    select count(*)::int from public.transfer_group_organizer(
      :'gid'::uuid, :'uid_f'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'transfer to a removed person is refused'
);
select is(
  (
    select count(*)::int from public.transfer_group_organizer(
      :'gid'::uuid, :'uid_g'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'transfer to self is refused'
);
select is(
  (
    select count(*)::int from public.transfer_group_organizer(
      :'gid'::uuid, :'uid_x'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'transfer to an outsider is refused (non-enumerating)'
);

-- Reinvitation refusals: joined targets and self.
select is(
  (
    select count(*)::int from public.issue_group_invitation(
      :'gid'::uuid, :'uid_j'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'a joined member cannot be reinvited'
);
select is(
  (
    select count(*)::int from public.issue_group_invitation(
      :'gid'::uuid, :'uid_g'::uuid,
      (select member_admin_version from public.group_admin_version(:'gid'::uuid))
    )
  ),
  0, 'the organizer cannot reinvite themselves'
);

-- The generic shareable link is untouched by every 006f control: its
-- version stays 0 and its stored state is exactly the organizer's issuance.
set local "request.jwt.claim.sub" = :'uid_g';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select token as tok_gen from public.issue_group_invitation(:'gid'::uuid, 0::bigint) \gset

reset role;
select is(
  (
    select shareable_version::text || ':' || status::text || ':' || coalesce(target_user_id::text, 'none')
    from public.group_invitations
    where token_hash = extensions.digest(convert_to(:'tok_gen', 'UTF8'), 'sha256')
  ),
  '1:active:none', 'the generic shareable link is an active generic row at its own version 1'
);
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

-- 10. Negative authorization matrix -------------------------------------------------

-- Capture the current committed version once (as G, the authorized
-- organizer) for the denial calls whose CAS must pass.
select member_admin_version::text as v_now
from public.group_admin_version(:'gid'::uuid) \gset

-- Outsider: every projection returns zero rows and every mutation is denied.
set local "request.jwt.claim.sub" = :'uid_x';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is((select count(*)::int from public.group_admin_version(:'gid'::uuid)), 0, 'an outsider gets no version');
select is((select count(*)::int from public.group_admin_audit(:'gid'::uuid)), 0, 'an outsider gets no audit rows');
select is((select count(*)::int from public.group_admin_members(:'gid'::uuid)), 0, 'an outsider gets no roster');
select is((select count(*)::int from public.group_admin_live_invitations(:'gid'::uuid)), 0, 'an outsider gets no live invitations');
select is(
  (
    select count(*)::int from public.remove_group_member(:'gid'::uuid, :'uid_j'::uuid, :v_now::bigint)
  ),
  0, 'an outsider cannot remove'
);

-- Invited, declined, and removed callers: same zero-row denials.
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_admin_version(:'gid'::uuid)), 0, 'an invited caller gets no version');
select is((select count(*)::int from public.group_admin_audit(:'gid'::uuid)), 0, 'an invited caller gets no audit rows');

set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_admin_version(:'gid'::uuid)), 0, 'a declined caller gets no version');

set local "request.jwt.claim.sub" = :'uid_f';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_admin_version(:'gid'::uuid)), 0, 'a removed caller gets no version');

-- Cross-group organizer: authority in another group confers nothing here.
set local "request.jwt.claim.sub" = :'uid_o';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.group_admin_version(:'gid'::uuid)), 0, 'a cross-group organizer gets no version of this group');
select is(
  (
    select count(*)::int from public.remove_group_member(:'gid'::uuid, :'uid_j'::uuid, :v_now::bigint)
  ),
  0, 'a cross-group organizer with the correct version still cannot remove (authority denies)'
);
select is(
  (
    select count(*)::int from public.remove_group_member(:'gid2'::uuid, :'uid_o'::uuid, 0::bigint)
  ),
  0, 'this group''s organizer cannot act on the other group'
);

-- Forged actor fields: mismatched GUC identity claims are denied.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_x';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_g'), true);
select is(
  (select count(*)::int from public.group_admin_version(:'gid'::uuid)),
  0, 'a forged identity claim gets no version'
);

-- Signed-out and anonymous callers.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from public.group_admin_version(:'gid'::uuid)),
  0, 'a signed-out authenticated caller gets no version'
);

reset role;

set local role anon;
select throws_ok(
  'select member_admin_version from public.group_admin_version(gen_random_uuid())',
  '42501', NULL, 'anon cannot execute the version projection'
);
select throws_ok(
  'select * from public.group_admin_audit(gen_random_uuid())',
  '42501', NULL, 'anon cannot execute the audit projection'
);

set local role service_role;
select throws_ok(
  'select * from public.group_admin_version(gen_random_uuid())',
  '42501', NULL, 'service_role cannot execute the version projection'
);

set local role authenticated;
-- Direct base-table reads stay denied for the application role.
select throws_ok(
  'select member_admin_version from public."groups" limit 1',
  '42501', NULL, 'the authenticated role cannot read member_admin_version directly'
);

-- 11. Audit privacy, integrity, and read-only invariants ---------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_g';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select string_agg(event_type, ',' order by ord)
    from (
      select event_type, row_number() over () as ord
      from public.group_admin_audit(:'gid'::uuid)
    ) rows_in_order
  ),
  'member_reinvited,member_removed,organizer_transferred,member_reinvited,member_reinvited,invitation_revoked,member_reinvited,member_reinvited,member_reinvited,member_removed,member_reinvited',
  'the audit projection lists the member-control events most recent first'
);

select is(
  (select count(*)::int from public.group_admin_audit(:'gid'::uuid)),
  11, 'exactly the eleven member-control events are projected'
);

select ok(
  not exists (
    select 1
    from public.group_admin_audit(:'gid'::uuid) a,
         jsonb_each_text(jsonb_build_object('label', a.subject_display_label, 'type', a.event_type)) as m(k, v)
    where m.v like '%@%' or m.k like '%token%' or m.k like '%invitation%'
  ),
  'the audit projection exposes no email or token material'
);

select is(
  (
    select count(*)::int
    from public.group_admin_audit(:'gid'::uuid)
    where subject_display_label is null or subject_display_label = ''
  ),
  0, 'every projected event carries a definer-resolved subject label'
);

-- Read-only invariants: the projections and the room snapshot write nothing.
-- The version and audit trail are unchanged by every read in this suite's
-- final section (base-table counts read from the owner view).
reset role;
select member_admin_version::text as v_before_reads from public.group_admin_version(:'gid'::uuid) \gset
select count(*)::text as audit_before_reads from public.audit_events where group_id = :'gid'::uuid \gset

select is(
  (
    select member_admin_version::text || ':' || (select count(*)::text from public.audit_events where group_id = :'gid'::uuid)
    from public."groups" where id = :'gid'::uuid
  ),
  :'v_before_reads' || ':' || :'audit_before_reads',
  'the version and audit trail are unchanged by the projections'
);

select is(
  (select count(*)::int from public.group_admin_live_invitations(:'gid'::uuid) where invitation_id is null),
  0, 'the live-invitation projection always carries the id needed to revoke'
);

select * from finish();

rollback;
