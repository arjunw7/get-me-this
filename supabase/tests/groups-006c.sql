-- 006c: pgTAP suite for the invitation preview and acceptance continuation
-- contract.
--
-- Run with: pnpm test db --local (as part of pnpm test:db).
--
-- Covers the binding brief
-- docs/delivery/issues/006c-invitation-preview-and-acceptance.md database
-- criteria: the private continuation/coordinator/pending-start shape and
-- secrecy, the exact function inventory and grants (including the
-- revocation of every direct raw-token acceptance surface), the
-- continuation lifecycle (begin both forms, seven-field preview, requested-
-- email binding, session-derived verification and reconciliation, state
-- projection, continuation-bound acceptance, replay, already_joined, the
-- eight-envelope cap, discard, authoritative-inventory logout
-- invalidation), and the auth-mutation lease/epoch operations. Structural
-- race interleavings are proven by the committed two-session harness
-- (scripts/test-group-races-006c-local.sh, pnpm test:db:races:006c).
--
-- The whole suite runs in one transaction that ends with rollback, so no
-- synthetic row persists. Fixed 43-character stand-ins are clearly
-- synthetic and never real bearer material.

begin;

select plan(120);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset

-- Canonical 43-character base64url stand-ins: the final character carries
-- the two zero bits, so it must be from the canonical alphabet.
select repeat('c', 43) as tok_live \gset

-- Browser-secret and coordinator stand-ins (same canonical shape).
select repeat('B', 41) || 'AE' as coord_secret \gset
select repeat('D', 41) || 'AE' as secret_one \gset

-- 1. Shape -------------------------------------------------------------------

select has_table('private', 'invitation_continuations', 'the continuation table exists');
select has_table('private', 'invitation_coordinators', 'the coordinator table exists');
select has_table('private', 'invitation_pending_starts', 'the pending-start table exists');

select has_column('private', 'invitation_continuations', 'flow_id', 'continuations.flow_id exists');
select has_column('private', 'invitation_continuations', 'invitation_id', 'continuations.invitation_id exists');
select has_column('private', 'invitation_continuations', 'coordinator_id', 'continuations.coordinator_id exists');
select has_column('private', 'invitation_continuations', 'browser_secret_digest', 'continuations.browser_secret_digest exists');
select has_column('private', 'invitation_continuations', 'email_binding_digest', 'continuations.email_binding_digest exists');
select has_column('private', 'invitation_continuations', 'verified_user_id', 'continuations.verified_user_id exists');
select has_column('private', 'invitation_continuations', 'began_authenticated', 'continuations.began_authenticated exists');
select has_column('private', 'invitation_continuations', 'revision', 'continuations.revision exists');
select has_column('private', 'invitation_continuations', 'expires_at', 'continuations.expires_at exists');
select has_column('private', 'invitation_continuations', 'accepted_at', 'continuations.accepted_at exists');
select has_column('private', 'invitation_continuations', 'invalidated_at', 'continuations.invalidated_at exists');
select has_column('private', 'invitation_continuations', 'envelope_released_at', 'continuations.envelope_released_at exists');
select col_is_pk('private', 'invitation_continuations', 'flow_id', 'flow_id is the continuation primary key');

select has_column('private', 'invitation_coordinators', 'coordinator_digest', 'coordinators.coordinator_digest exists');
select has_column('private', 'invitation_coordinators', 'session_epoch', 'coordinators.session_epoch exists');
select has_column('private', 'invitation_coordinators', 'bootstrap_lease_digest', 'coordinators.bootstrap_lease_digest exists');
select has_column('private', 'invitation_coordinators', 'auth_mutation_state', 'coordinators.auth_mutation_state exists');
select has_column('private', 'invitation_coordinators', 'delivery_nonce_digest', 'coordinators.delivery_nonce_digest exists');
select has_column('private', 'invitation_coordinators', 'expected_provider_user_id', 'coordinators.expected_provider_user_id exists');
select col_is_unique('private', 'invitation_coordinators', 'coordinator_digest', 'the coordinator digest is unique');

select has_column('private', 'invitation_pending_starts', 'nonce_digest', 'pending_starts.nonce_digest exists');
select has_column('private', 'invitation_pending_starts', 'consumed_at', 'pending_starts.consumed_at exists');

-- No raw material anywhere: no plaintext column exists on any 006c table.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name in (
        'invitation_continuations', 'invitation_coordinators', 'invitation_pending_starts'
      )
      and column_name in (
        'token', 'token_hash', 'browser_secret', 'coordinator_secret',
        'email', 'requested_email', 'session_token', 'provider_session'
      )
  ),
  'no plaintext token, secret, or email column exists on any 006c table'
);

-- No client table privilege of any kind on the private tables.
select ok(
  not has_table_privilege('anon', 'private.invitation_continuations', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'private.invitation_continuations', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('service_role', 'private.invitation_continuations', 'SELECT, INSERT, UPDATE, DELETE'),
  'no client role holds any privilege on the continuation table'
);
select ok(
  not has_table_privilege('anon', 'private.invitation_coordinators', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'private.invitation_coordinators', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('service_role', 'private.invitation_coordinators', 'SELECT, INSERT, UPDATE, DELETE'),
  'no client role holds any privilege on the coordinator table'
);
select ok(
  not has_table_privilege('anon', 'private.invitation_pending_starts', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('authenticated', 'private.invitation_pending_starts', 'SELECT, INSERT, UPDATE, DELETE')
    and not has_table_privilege('service_role', 'private.invitation_pending_starts', 'SELECT, INSERT, UPDATE, DELETE'),
  'no client role holds any privilege on the pending-start table'
);

-- 2. Function inventory and grants -------------------------------------------

select ok(has_function_privilege('anon', 'public.begin_group_invitation_flow(text, text, text)', 'EXECUTE'),
  'anon can execute the raw-token begin');
select ok(has_function_privilege('anon', 'public.begin_group_invitation_flow_from_start(uuid, text, text, text)', 'EXECUTE'),
  'anon can execute the pending-start begin');
select ok(has_function_privilege('anon', 'public.preview_group_invitation_flow(uuid, text)', 'EXECUTE'),
  'anon can execute the flow preview');
select ok(has_function_privilege('anon', 'public.bind_group_invitation_flow_email(uuid, text, text)', 'EXECUTE'),
  'anon can execute the requested-email binding');
select ok(has_function_privilege('anon', 'public.discard_group_invitation_flow(uuid, text, text)', 'EXECUTE'),
  'anon can execute the explicit discard');
select ok(has_function_privilege('anon', 'public.establish_group_invitation_coordinator(text, text)', 'EXECUTE'),
  'anon can execute the coordinator bootstrap');
select ok(has_function_privilege('anon', 'public.consume_group_invitation_bootstrap_lease(text, text)', 'EXECUTE'),
  'anon can execute the bootstrap lease consumption');

select ok(has_function_privilege('authenticated', 'public.verify_group_invitation_flow(uuid, text)', 'EXECUTE'),
  'authenticated can execute the session-derived verification');
select ok(has_function_privilege('authenticated', 'public.group_invitation_flow_state(uuid, text)', 'EXECUTE'),
  'authenticated can execute the state projection');
select ok(has_function_privilege('authenticated', 'public.accept_group_invitation_flow(uuid, text)', 'EXECUTE'),
  'authenticated can execute the continuation-bound acceptance');
select ok(has_function_privilege('authenticated', 'public.invalidate_group_invitation_flows_for_logout(uuid[], text[], text)', 'EXECUTE'),
  'authenticated can execute the logout invalidation');
select ok(has_function_privilege('authenticated', 'public.acquire_group_invitation_auth_lease(text, bigint, text)', 'EXECUTE')
    and has_function_privilege('anon', 'public.acquire_group_invitation_auth_lease(text, bigint, text)', 'EXECUTE'),
  'both client roles can execute the auth-mutation lease acquisition (the verify mutation runs signed-out)');
select ok(has_function_privilege('authenticated', 'public.acknowledge_group_invitation_delivery(text, text, uuid)', 'EXECUTE')
    and has_function_privilege('anon', 'public.acknowledge_group_invitation_delivery(text, text, uuid)', 'EXECUTE'),
  'both client roles can execute the delivery acknowledgement');
select ok(has_function_privilege('authenticated', 'public.recover_group_invitation_auth_lease(text, text)', 'EXECUTE')
    and has_function_privilege('anon', 'public.recover_group_invitation_auth_lease(text, text)', 'EXECUTE'),
  'both client roles can execute the lease recovery');
select ok(has_function_privilege('authenticated', 'public.mark_group_invitation_delivery_pending(text, bigint, text, uuid)', 'EXECUTE')
    and has_function_privilege('anon', 'public.mark_group_invitation_delivery_pending(text, bigint, text, uuid)', 'EXECUTE'),
  'both client roles can execute the delivery-pending transition');

-- Every direct raw-token acceptance surface is revoked from every
-- application role: the continuation-bound function is the only client
-- acceptance path.
select ok(
  not has_function_privilege('anon', 'public.accept_group_invitation(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.accept_group_invitation(text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.accept_group_invitation(text)', 'EXECUTE')
    and not has_function_privilege('public', 'public.accept_group_invitation(text)', 'EXECUTE'),
  'the direct raw-token acceptance is not executable by any application role (006c revocation)'
);
select ok(
  not has_function_privilege('anon', 'public.accept_group_invitation_flow(uuid, text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.accept_group_invitation_flow(uuid, text)', 'EXECUTE'),
  'anon and service_role cannot execute the continuation-bound acceptance'
);
select ok(
  not has_function_privilege('anon', 'public.verify_group_invitation_flow(uuid, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.accept_group_invitation_flow(uuid, text)', 'EXECUTE'),
  'anon cannot verify or accept a continuation'
);
select ok(
  not has_function_privilege('anon', 'public.invalidate_group_invitation_flows_for_logout(uuid[], text[], text)', 'EXECUTE'),
  'anon cannot execute the logout invalidation'
);

-- Exactly one overload of every new function name.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'begin_group_invitation_flow'),
  1, 'begin_group_invitation_flow has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'accept_group_invitation_flow'),
  1, 'accept_group_invitation_flow has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'preview_group_invitation_flow'),
  1, 'preview_group_invitation_flow has exactly one overload'
);

-- The private core and helpers are never client-executable.
select ok(
  not has_function_privilege('authenticated', 'private.accept_invitation_core(uuid, uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.accept_invitation_core(uuid, uuid)', 'EXECUTE'),
  'the private acceptance core is not client-executable'
);
select ok(
  not has_function_privilege('authenticated', 'private.invitation_begin_validated(uuid, private.invitation_coordinators, text)', 'EXECUTE'),
  'the shared begin helper is not client-executable'
);

-- Every 006c public function is SECURITY DEFINER with an empty search_path.
select ok(
  (
    select bool_and(
      p.prosecdef
      -- The stored form of an empty search_path varies by generation
      -- ('search_path=""', 'search_path=-', or bare 'search_path='); a
      -- non-empty value never matches.
      and coalesce(array_to_string(p.proconfig, ','), '')
        ~ '(^|,)search_path=(""|-|,|$)'
    )
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'begin_group_invitation_flow', 'begin_group_invitation_flow_from_start',
        'preview_group_invitation_flow', 'bind_group_invitation_flow_email',
        'verify_group_invitation_flow', 'group_invitation_flow_state',
        'accept_group_invitation_flow', 'discard_group_invitation_flow',
        'invalidate_group_invitation_flows_for_logout',
        'acquire_group_invitation_auth_lease', 'acknowledge_group_invitation_delivery',
        'recover_group_invitation_auth_lease'
      )
  ),
  'every 006c public function is security definer with an empty search path'
);

-- 3. Fixtures ------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'group-fixture-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'group-fixture-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'group-fixture-c@example.invalid', '');

update public.profiles
set display_name = 'Fixture Organizer'
where id = :'uid_a'::uuid;

-- The acceptance path rechecks profile completeness inside the transaction,
-- so the verified fixtures need complete profiles (the real signup trigger
-- creates these rows when the fixture users are inserted).
update public.profiles
set display_name = 'Bound Bobby'
where id = :'uid_b'::uuid;
update public.profiles
set display_name = 'Comparer Cara'
where id = :'uid_c'::uuid;

-- The fixture group and its generic shareable invitation, inserted directly
-- (owner path) with clearly synthetic tokens.
insert into public."groups" (
  id, name, occasion, occasion_at, time_zone, budget_amount_minor,
  budget_currency, mode, organizer_id, shareable_invitation_version
)
values (
  '00000000-0000-4000-8000-000000006c01', 'Continuation Fixture', 'Diwali',
  (current_date + 30)::timestamp at time zone 'Asia/Kolkata', 'Asia/Kolkata',
  50000, 'INR', 'wishlist_only', :'uid_a'::uuid, 1
);

insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
values ('00000000-0000-4000-8000-000000006c01', :'uid_a'::uuid, 'joined', true, clock_timestamp(), 1);

insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation, shareable_version
)
values (
  '00000000-0000-4000-8000-000000006c02', '00000000-0000-4000-8000-000000006c01',
  :'uid_a'::uuid, 'active',
  extensions.digest(convert_to(:'tok_live', 'UTF8'), 'sha256'),
  clock_timestamp() + interval '30 days', null, 0,
  null, null, 1
);

-- The "second independent flow" reuses the SAME live invitation through a
-- different browser secret (exactly what a second browser opening the same
-- link is); only one active generic per group can exist.

-- Anonymous caller context (no GUCs).
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

-- 4. Coordinator bootstrap and continuation begin -------------------------------

select is(
  (select result::text from public.establish_group_invitation_coordinator(:'coord_secret', repeat('L', 41) || 'AE')),
  'established', 'the coordinator bootstrap establishes the browser coordinator'
);

-- A repeat bootstrap with the same secret still proves the coordinator.
select is(
  (select result::text from public.establish_group_invitation_coordinator(:'coord_secret', repeat('M', 41) || 'AE')),
  'established', 'a repeat bootstrap with the same secret proves the coordinator'
);

-- A non-canonical coordinator secret establishes nothing.
select is(
  (select result::text from public.establish_group_invitation_coordinator(repeat('x', 43), repeat('L', 41) || 'AE')),
  'unavailable', 'a non-canonical coordinator secret establishes nothing'
);

-- The pending-start form: create one start row directly (owner path), then
-- begin through it once.
select gen_random_uuid() as start_id \gset
insert into private.invitation_pending_starts (start_id, invitation_id, nonce_digest, expires_at)
values (
  :'start_id'::uuid, '00000000-0000-4000-8000-000000006c02'::uuid,
  private.invitation_digest(repeat('N', 41) || 'AE'), clock_timestamp() + interval '30 seconds'
);

select is(
  (
    select count(*)::int
    from public.begin_group_invitation_flow_from_start(
      :'start_id'::uuid, :'secret_one', repeat('N', 41) || 'AE', :'coord_secret'
    )
  ),
  1, 'the pending-start begin creates exactly one continuation'
);
select is(
  (select count(*)::int from private.invitation_pending_starts
   where start_id = :'start_id'::uuid and consumed_at is not null),
  1, 'the pending start is consumed exactly once'
);
select is(
  (
    select count(*)::int
    from public.begin_group_invitation_flow_from_start(
      :'start_id'::uuid, :'secret_one', repeat('N', 41) || 'AE', :'coord_secret'
    )
  ),
  0, 'a replayed pending start begins nothing'
);

-- The raw-token begin with a wrong coordinator secret creates no row.
select is(
  (
    select count(*)::int
    from public.begin_group_invitation_flow(:'tok_live', repeat('E', 41) || 'AE', repeat('Z', 41) || 'AE')
  ),
  0, 'a wrong coordinator secret begins nothing'
);

-- A non-canonical token begins nothing.
select is(
  (
    select count(*)::int
    from public.begin_group_invitation_flow(repeat('F', 43), repeat('E', 41) || 'AE', :'coord_secret')
  ),
  0, 'a non-canonical token begins nothing'
);

-- A valid raw-token begin (anonymous).
select flow_id::text as flow_anon, expires_at as flow_anon_expiry
from public.begin_group_invitation_flow(:'tok_live', :'secret_one', :'coord_secret') \gset
select is(:'flow_anon_expiry' is not null, true, 'a valid begin returns an expiry');

-- The flow cookie's browser secret is proven by the preview.
select is(
  (select count(*)::int from public.preview_group_invitation_flow(:'flow_anon'::uuid, :'secret_one')),
  1, 'the flow preview is readable with the matching browser secret'
);
select is(
  (select count(*)::int from public.preview_group_invitation_flow(:'flow_anon'::uuid, repeat('X', 41) || 'AE')),
  0, 'a wrong browser secret reads no preview'
);
select is(
  (select count(*)::int from public.preview_group_invitation_flow(gen_random_uuid(), :'secret_one')),
  0, 'an unknown flow id reads no preview'
);

-- The preview returns exactly the seven approved fields with the fixture
-- values.
select is(
  (
    select host_display_name || '|' || group_name || '|' || budget_amount_minor::text
      || '|' || budget_currency::text || '|' || mode || '|' || joined_member_count::text
    from public.preview_group_invitation_flow(:'flow_anon'::uuid, :'secret_one')
  ),
  'Fixture Organizer|Continuation Fixture|50000|INR|wishlist_only|1',
  'the flow preview returns the seven approved projection values'
);

-- The preview never consumes a use or writes membership.
select is(
  (select use_count from public.group_invitations where id = '00000000-0000-4000-8000-000000006c02'),
  0, 'the preview performs no use write'
);
select is(
  (select count(*)::int from public.group_members
   where group_id = '00000000-0000-4000-8000-000000006c01' and user_id <> :'uid_a'::uuid),
  0, 'the preview creates no membership'
);

-- 5. Requested-email binding ---------------------------------------------------

select is(
  (select result::text from public.bind_group_invitation_flow_email(:'flow_anon'::uuid, :'secret_one', 'Group-Fixture-B@Example.invalid')),
  'bound', 'the first valid email binding succeeds'
);
select is(
  (select result::text from public.bind_group_invitation_flow_email(:'flow_anon'::uuid, :'secret_one', 'group-fixture-b@example.invalid')),
  'bound', 'the same normalized email binding replays idempotently'
);
select is(
  (select result::text from public.bind_group_invitation_flow_email(:'flow_anon'::uuid, :'secret_one', 'someone-else@example.invalid')),
  'restart', 'a different email cannot overwrite the binding'
);
select is(
  (select result::text from public.bind_group_invitation_flow_email(:'flow_anon'::uuid, :'secret_one', 'not-an-email')),
  'unavailable', 'a malformed email is unavailable'
);
select is(
  (select email_binding_digest
   from private.invitation_continuations where flow_id = :'flow_anon'::uuid),
  private.invitation_email_binding('group-fixture-b@example.invalid', :'secret_one'),
  'the stored binding is the HMAC of the normalized email under the browser secret'
);
select is(
  (select octet_length(email_binding_digest) from private.invitation_continuations where flow_id = :'flow_anon'::uuid),
  32, 'the email binding digest is 32 bytes'
);

-- 6. Session-derived verification ---------------------------------------------

-- Anonymous (null session): restart.
select is(
  (select result::text from public.verify_group_invitation_flow(:'flow_anon'::uuid, :'secret_one')),
  'restart', 'a null session cannot verify a flow'
);

-- A different user (different email) cannot adopt the binding.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (select result::text from public.verify_group_invitation_flow(:'flow_anon'::uuid, :'secret_one')),
  'restart', 'another user cannot verify another email binding'
);

-- The bound user verifies once, then replays safely.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select result::text from public.verify_group_invitation_flow(:'flow_anon'::uuid, :'secret_one')),
  'verified', 'the bound user verifies the flow from the provider-derived session'
);
select is(
  (select result::text from public.verify_group_invitation_flow(:'flow_anon'::uuid, :'secret_one')),
  'verified', 'the same user replays verification idempotently'
);

-- Back to the superuser view: the remaining definer calls take their session
-- identity from the GUCs above, while the direct inventory reads (private
-- tables, audit_events, invitations) are revoked from client roles.
reset role;

-- 7. The state projection ------------------------------------------------------

select is(
  (select state::text || '|' || coalesce(group_id::text, 'null')
   from public.group_invitation_flow_state(:'flow_anon'::uuid, :'secret_one')),
  'verified|null', 'a verified unaccepted flow projects verified with no group id'
);

-- 8. Continuation-bound acceptance ---------------------------------------------

select result::text as accept1_result, group_id::text as accept1_group, accepted_now as accept1_now
from public.accept_group_invitation_flow(:'flow_anon'::uuid, :'secret_one') \gset

select is(:'accept1_result'::text, 'joined', 'a new member accepting through the continuation is joined');
select is(:'accept1_group'::text, '00000000-0000-4000-8000-000000006c01', 'acceptance returns the group id');
select is(:'accept1_now'::boolean, true, 'only the transaction winner returns accepted_now');

select is(
  (select count(*)::int from public.audit_events
   where group_id = '00000000-0000-4000-8000-000000006c01' and event_type = 'invitation_accepted'),
  1, 'one acceptance audit event is appended'
);
select is(
  (select use_count from public.group_invitations where id = '00000000-0000-4000-8000-000000006c02'),
  1, 'the use count incremented exactly once'
);

-- The accepted flow projects accepted with the group id.
select is(
  (select state::text || '|' || group_id::text
   from public.group_invitation_flow_state(:'flow_anon'::uuid, :'secret_one')),
  'accepted|00000000-0000-4000-8000-000000006c01',
  'the accepted continuation projects accepted with the group id'
);

-- Repeating acceptance through the same accepted continuation is fully
-- write-free.
select result::text as replay_result, accepted_now as replay_now
from public.accept_group_invitation_flow(:'flow_anon'::uuid, :'secret_one') \gset
select is(:'replay_result'::text, 'replayed', 'a repeat acceptance through the accepted flow replays');
select is(:'replay_now'::boolean, false, 'a replay never claims a new acceptance');
select is(
  (select use_count from public.group_invitations where id = '00000000-0000-4000-8000-000000006c02'),
  1, 'the replay consumes no second use'
);
select is(
  (select count(*)::int from public.audit_events
   where group_id = '00000000-0000-4000-8000-000000006c01' and event_type = 'invitation_accepted'),
  1, 'the replay appends no second audit event'
);

-- A second independent flow for the same user marks only itself.
select flow_id::text as flow_two
from public.begin_group_invitation_flow(:'tok_live', repeat('G', 41) || 'AE', :'coord_secret') \gset

-- The second flow begins authenticated (uid_b's session): the same
-- transaction binds the user and email shortcut.
select is(
  (select began_authenticated::text from private.invitation_continuations
   where flow_id = :'flow_two'::uuid),
  'true', 'a signed-in begin records the authenticated start'
);
select is(
  (select result::text from public.verify_group_invitation_flow(:'flow_two'::uuid, repeat('G', 41) || 'AE')),
  'verified', 'the signed-in begin shortcut verifies immediately'
);

select result::text as second_result, accepted_now as second_now
from public.accept_group_invitation_flow(:'flow_two'::uuid, repeat('G', 41) || 'AE') \gset
select is(:'second_result'::text, 'replayed', 'the second flow recognizes the existing use and joins by replay');
select is(:'second_now'::boolean, false, 'the continuation-only reconciliation emits no new acceptance');
select is(
  (select accepted_at is not null from private.invitation_continuations where flow_id = :'flow_two'::uuid),
  true, 'the second continuation is marked accepted'
);
select is(
  (select count(*)::int from public.audit_events
   where group_id = '00000000-0000-4000-8000-000000006c01' and event_type = 'invitation_accepted'),
  1, 'the second-flow reconciliation appends no audit event'
);

-- An already-joined user with no use of a token is write-free. Targeted to
-- the organizer (the group's single active generic stays live).
insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation, shareable_version
)
values (
  '00000000-0000-4000-8000-000000006c04', '00000000-0000-4000-8000-000000006c01',
  :'uid_a'::uuid, 'active',
  extensions.digest(convert_to(repeat('k', 42) || '8', 'UTF8'), 'sha256'),
  clock_timestamp() + interval '30 days', null, 0,
  :'uid_a'::uuid, 1, null
);

-- A dedicated coordinator for the already-joined and cap fixtures (distinct
-- from coord_secret, whose inventory already carries the earlier flows).
select repeat('H', 41) || 'AE' as coord_cap \gset
select is(
  (select result::text from public.establish_group_invitation_coordinator(:'coord_cap', repeat('L', 41) || 'AE')),
  'established', 'the cap fixture coordinator is established'
);

-- The organizer's own targeted credential: the accepting session is the
-- organizer (the target), set before the begin so the begin binds the same
-- identity the acceptance rechecks.
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select flow_id::text as flow_org
from public.begin_group_invitation_flow(repeat('k', 42) || '8', repeat('H', 41) || 'AE', :'coord_cap') \gset

select result::text as org_result
from public.accept_group_invitation_flow(:'flow_org'::uuid, repeat('H', 41) || 'AE') \gset
select is(:'org_result'::text, 'already_joined', 'a joined user with no use of this token is already_joined');

-- The organizer's flow, accepted state, is discarded to free the envelope.
select is(
  (select result::text from public.discard_group_invitation_flow(:'flow_org'::uuid, repeat('H', 41) || 'AE', :'coord_cap')),
  'discarded', 'the organizer fixture flow is discarded to free its envelope'
);

-- 9. The eight-envelope cap -----------------------------------------------------

create temp table cap_created (created integer);

do $$
declare
  chars text[] := string_to_array('AEIMQUYcgkosw048', null);
  v_secret text;
  v_flow uuid;
  v_created integer := 0;
begin
  for i in 1..9 loop
    v_secret := repeat('A', 41) || chars[i] || 'E';
    begin
      select flow_id into v_flow
      from public.begin_group_invitation_flow(
        repeat('k', 42) || '8', v_secret, 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAE'
      );
    exception when others then
      v_flow := null;
    end;
    if v_flow is not null then
      v_created := v_created + 1;
    end if;
  end loop;
  insert into cap_created (created) values (v_created);
end $$;

select is(
  (select created from cap_created),
  8, 'exactly eight of nine concurrent-entry begins create envelopes'
);
select is(
  (
    select count(*)::int
    from private.invitation_continuations
    where coordinator_id = (
      select id from private.invitation_coordinators
      where coordinator_digest = private.invitation_digest('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAE')
    ) and envelope_released_at is null
  ),
  8, 'the unreleased envelope inventory never exceeds eight'
);

-- Release the cap coordinator's whole inventory so the discard and logout
-- fixtures start from an empty inventory.
do $$
declare
  chars text[] := string_to_array('AEIMQUYcgkosw048', null);
  v_secret text;
  v_flow uuid;
begin
  for i in 1..8 loop
    v_secret := repeat('A', 41) || chars[i] || 'E';
    select c.flow_id into v_flow
    from private.invitation_continuations c
    join private.invitation_coordinators k on k.id = c.coordinator_id
    where k.coordinator_digest = private.invitation_digest('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAE')
      and c.browser_secret_digest = private.invitation_digest(v_secret)
      and c.envelope_released_at is null;
    if v_flow is not null then
      perform public.discard_group_invitation_flow(v_flow, v_secret, 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHAE');
    end if;
  end loop;
end $$;

-- 10. Discard and logout invalidation ------------------------------------------

-- Explicit discard proves both secrets and releases exactly one envelope.
select repeat('I', 41) || 'AE' as secret_discard \gset
select flow_id::text as flow_discard
from public.begin_group_invitation_flow(:'tok_live', :'secret_discard', :'coord_cap') \gset
select is(
  (select result::text from public.discard_group_invitation_flow(:'flow_discard'::uuid, :'secret_discard', :'coord_cap')),
  'discarded', 'a proven discard succeeds'
);
select is(
  (select count(*)::int from public.preview_group_invitation_flow(:'flow_discard'::uuid, :'secret_discard')),
  0, 'a discarded flow previews nothing'
);

-- Authoritative-inventory logout invalidation: build a dedicated coordinator
-- with one accepted and one unaccepted flow, then invalidate with both
-- cookies supplied.
select repeat('C', 41) || 'AE' as coord_logout \gset
select repeat('D', 41) || 'AE' as secret_logout_a \gset
select repeat('E', 41) || 'AE' as secret_logout_b \gset

-- The logout fixtures begin ANONYMOUSLY (no session identity); each flow's
-- binding and verification are then driven explicitly.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select is(
  (select result::text from public.establish_group_invitation_coordinator(:'coord_logout', repeat('L', 41) || 'AE')),
  'established', 'the logout fixture coordinator is established'
);

select flow_id::text as logout_flow_a
from public.begin_group_invitation_flow(:'tok_live', :'secret_logout_a', :'coord_logout') \gset
select flow_id::text as logout_flow_b
from public.begin_group_invitation_flow(:'tok_live', :'secret_logout_b', :'coord_logout') \gset

-- Bind, verify, and accept flow A (uid_b session).
select result::text as _bind_a
from public.bind_group_invitation_flow_email(:'logout_flow_a'::uuid, :'secret_logout_a', 'group-fixture-b@example.invalid') \gset
select set_config('request.jwt.claim.sub', :'uid_b', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select result::text as _verify_a
from public.verify_group_invitation_flow(:'logout_flow_a'::uuid, :'secret_logout_a') \gset
select result::text as _accept_a
from public.accept_group_invitation_flow(:'logout_flow_a'::uuid, :'secret_logout_a') \gset

-- Bind flow B to uid_c and verify as uid_c.
select result::text as _bind_b
from public.bind_group_invitation_flow_email(:'logout_flow_b'::uuid, :'secret_logout_b', 'group-fixture-c@example.invalid') \gset
select set_config('request.jwt.claim.sub', :'uid_c', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);
select result::text as _verify_b
from public.verify_group_invitation_flow(:'logout_flow_b'::uuid, :'secret_logout_b') \gset

-- Confirmed logout with both proven cookies.
select set_config('request.jwt.claim.sub', :'uid_c', true);
select is(
  (
    select result::text
    from public.invalidate_group_invitation_flows_for_logout(
      array[:'logout_flow_a'::uuid, :'logout_flow_b'::uuid],
      array[:'secret_logout_a', :'secret_logout_b'],
      :'coord_logout'
    )
  ),
  'invalidated', 'confirmed logout invalidates with the proven inventory'
);
select is(
  (
    select count(*)::int
    from private.invitation_continuations
    where coordinator_id = (
      select id from private.invitation_coordinators
      where coordinator_digest = private.invitation_digest(:'coord_logout')
    ) and envelope_released_at is not null
  ),
  2, 'every envelope in the inventory is released'
);
select is(
  (
    select count(*)::int
    from private.invitation_continuations
    where flow_id = :'logout_flow_a'::uuid and invalidated_at is not null
  ),
  0, 'the accepted row is released but never invalidated'
);
select is(
  (
    select count(*)::int
    from private.invitation_continuations
    where flow_id = :'logout_flow_b'::uuid and invalidated_at is not null
  ),
  1, 'the unaccepted row is invalidated'
);

-- An unverified supplied entry rolls the whole operation back.
select repeat('F', 41) || 'AE' as secret_logout_c \gset
select flow_id::text as logout_flow_c
from public.begin_group_invitation_flow(:'tok_live', :'secret_logout_c', :'coord_logout') \gset

select is(
  (
    select result::text
    from public.invalidate_group_invitation_flows_for_logout(
      array[:'logout_flow_c'::uuid],
      array[repeat('9', 41) || 'AE'],
      :'coord_logout'
    )
  ),
  'unavailable', 'an unverified supplied entry is refused'
);
select is(
  (
    select count(*)::int
    from private.invitation_continuations
    where flow_id = :'logout_flow_c'::uuid and envelope_released_at is not null
  ),
  0, 'a refused logout invalidation releases nothing'
);

-- 11. The auth-mutation lease and session epoch ---------------------------------

select repeat('G', 41) || 'AE' as coord_lease \gset
select is(
  (select result::text from public.establish_group_invitation_coordinator(:'coord_lease', repeat('L', 41) || 'AE')),
  'established', 'the lease fixture coordinator is established'
);

select is(
  (select result::text from public.acquire_group_invitation_auth_lease(:'coord_lease', 0, 'otp_verify')),
  'acquired', 'the first lease acquisition succeeds at epoch zero'
);
select is(
  (select result::text from public.acquire_group_invitation_auth_lease(:'coord_lease', 0, 'logout')),
  'blocked', 'a competing mutation is blocked while the lease is held'
);

select set_config('request.jwt.claim.sub', :'uid_b', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select result::text
    from public.mark_group_invitation_delivery_pending(
      :'coord_lease', 0, repeat('P', 41) || 'AE', :'uid_b'::uuid
    )
  ),
  'pending', 'the held lease moves to delivery_pending'
);

-- Wrong nonce: refused; right nonce: acknowledged with the epoch advanced once.
select is(
  (
    select result::text
    from public.acknowledge_group_invitation_delivery(:'coord_lease', repeat('Q', 41) || 'AE', :'uid_b'::uuid)
  ),
  'unavailable', 'a wrong delivery nonce cannot acknowledge'
);
select is(
  (
    select result::text || '|' || session_epoch::text
    from public.acknowledge_group_invitation_delivery(:'coord_lease', repeat('P', 41) || 'AE', :'uid_b'::uuid)
  ),
  'acknowledged|1', 'the correct nonce acknowledges and advances the epoch exactly once'
);

-- A stale epoch cannot acquire the lease.
select is(
  (select result::text from public.acquire_group_invitation_auth_lease(:'coord_lease', 0, 'logout')),
  'epoch', 'a stale session epoch cannot acquire the lease'
);
select is(
  (select result::text from public.acquire_group_invitation_auth_lease(:'coord_lease', 1, 'logout')),
  'acquired', 'the current epoch acquires the lease'
);
-- Recovery without a proven nonce abandons the delivery back to idle.
select is(
  (select result::text from public.recover_group_invitation_auth_lease(:'coord_lease', null)),
  'abandoned', 'recovery without a proven nonce abandons the lease to idle'
);

-- 12. Secrecy scan --------------------------------------------------------------

-- No digest or derived column ever carries recognizable plaintext material.
select ok(
  (
    select bool_and(octet_length(x.col) = 32)
    from (
      select browser_secret_digest as col from private.invitation_continuations
      union all
      select coordinator_digest as col from private.invitation_coordinators
      union all
      select nonce_digest as col from private.invitation_pending_starts
    ) x
  ),
  'every stored digest is exactly 32 bytes (SHA-256), never plaintext material'
);

rollback;
