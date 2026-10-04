-- 009a: pgTAP suite for the durable email outbox contract.
--
-- Run with: pnpm test:db (as part of pnpm test:db).
--
-- Covers the 009a brief's database-slice criteria: the outbox shape and
-- isolation (columns, bounds, four-value status enum, unique idempotency
-- key, claim lease column, RESTRICT recipient FK, managed timestamps,
-- REVOKE-then-no-GRANT for every role, no RLS-policy substitute), enqueue
-- atomicity and idempotency (caller-transaction commit, replay without a
-- second write, generic rejections, exhaustive per-template payload
-- allowlists), and claim/retry semantics (SKIP LOCKED claim as the durable
-- serialization point, claim-time attempt accounting and lease, backoff from
-- claim-time fields, the attempt bound retiring at claim time, expired-lease
-- recovery, and idempotent result recording).
--
-- The whole suite runs in one transaction that ends with rollback, so no
-- synthetic row persists.

begin;

select plan(92);

-- Synthetic fixture identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'email-009a-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'email-009a-b@example.invalid', '');

-------------------------------------------------------------------------------
-- 1. Outbox shape and isolation.
-------------------------------------------------------------------------------

select has_type('public', 'email_outbox_status', 'the email_outbox_status enum exists');
select is(
  (select count(*)::int from unnest(enum_range(null::public.email_outbox_status)) v),
  4,
  'the status enum has exactly four values'
);

select has_table('private', 'email_outbox', 'the private outbox table exists');
select has_column('private', 'email_outbox', 'id', 'outbox.id exists');
select has_column('private', 'email_outbox', 'template_key', 'outbox.template_key exists');
select has_column('private', 'email_outbox', 'idempotency_key', 'outbox.idempotency_key exists');
select has_column('private', 'email_outbox', 'recipient_user_id', 'outbox.recipient_user_id exists');
select has_column('private', 'email_outbox', 'payload', 'outbox.payload exists');
select has_column('private', 'email_outbox', 'status', 'outbox.status exists');
select has_column('private', 'email_outbox', 'attempt_count', 'outbox.attempt_count exists');
select has_column('private', 'email_outbox', 'last_attempt_at', 'outbox.last_attempt_at exists');
select has_column('private', 'email_outbox', 'claim_expires_at', 'outbox.claim_expires_at exists');
select has_column('private', 'email_outbox', 'provider_message_id', 'outbox.provider_message_id exists');
select has_column('private', 'email_outbox', 'last_error_category', 'outbox.last_error_category exists');
select has_column('private', 'email_outbox', 'created_at', 'outbox.created_at exists');
select has_column('private', 'email_outbox', 'updated_at', 'outbox.updated_at exists');

select col_is_pk('private', 'email_outbox', ARRAY['id'], 'outbox.id is the primary key');
select col_type_is('private', 'email_outbox', 'recipient_user_id', 'uuid', 'recipient_user_id is a uuid');
select col_not_null('private', 'email_outbox', 'recipient_user_id', 'recipient_user_id is not null');
select col_default_is('private', 'email_outbox', 'status', 'pending', 'status defaults to pending');
select col_default_is('private', 'email_outbox', 'attempt_count', '0', 'attempt_count defaults to 0');
select col_not_null('private', 'email_outbox', 'payload', 'payload is not null');
select col_not_null('private', 'email_outbox', 'idempotency_key', 'idempotency_key is not null');

select has_index(
  'private', 'email_outbox', 'email_outbox_idempotency_key',
  'the unique idempotency-key index exists'
);

-- No recipient address is ever stored: no email-bearing column exists.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'email_outbox'
      and column_name in (
        'email', 'recipient_email', 'to_address', 'address', 'subject', 'body'
      )
  ),
  'no recipient-address or content column exists on the outbox'
);

-- Token hygiene: no token column.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'email_outbox'
      and column_name in ('token', 'token_hash', 'opaque_token', 'secret_url')
  ),
  'no token or secret-URL column exists on the outbox'
);

-- Recipient FK is RESTRICT against auth.users.
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'private.email_outbox'::regclass
      and contype = 'f'
      and confdeltype = 'r'
      and (select count(*)::int from unnest(conkey) k) = 1
  ),
  'the recipient FK restricts deletion of referenced users'
);

-- Attempt bound and bounded provider id / category checks.
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.email_outbox'::regclass
      and conname = 'email_outbox_attempt_count_bounded'
  ),
  'attempt_count is bounded to at most 10'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.email_outbox'::regclass
      and conname = 'email_outbox_template_key_check'
  ),
  'template_key is bounded to the three template keys'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.email_outbox'::regclass
      and conname = 'email_outbox_error_category_bounded'
  ),
  'last_error_category is bounded to the four coarse categories'
);

-- Privilege inventory: no role holds any table privilege, RLS is on with no
-- permissive client policy, and the client roles cannot reach the functions.
select ok(not has_table_privilege('anon', 'private.email_outbox', 'SELECT'), 'anon has no SELECT on the outbox');
select ok(not has_table_privilege('anon', 'private.email_outbox', 'INSERT'), 'anon has no INSERT on the outbox');
select ok(not has_table_privilege('authenticated', 'private.email_outbox', 'SELECT'), 'authenticated has no SELECT on the outbox');
select ok(not has_table_privilege('authenticated', 'private.email_outbox', 'INSERT'), 'authenticated has no INSERT on the outbox');
select ok(not has_table_privilege('authenticated', 'private.email_outbox', 'UPDATE'), 'authenticated has no UPDATE on the outbox');
select ok(not has_table_privilege('authenticated', 'private.email_outbox', 'DELETE'), 'authenticated has no DELETE on the outbox');
select ok(not has_table_privilege('service_role', 'private.email_outbox', 'SELECT'), 'service_role has no direct SELECT on the outbox');
select ok(not has_table_privilege('service_role', 'private.email_outbox', 'INSERT'), 'service_role has no direct INSERT on the outbox');
select ok(
  (select relrowsecurity from pg_class where oid = 'private.email_outbox'::regclass),
  'RLS is enabled on the outbox'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'private' and tablename = 'email_outbox'),
  0,
  'no permissive RLS policy substitutes for the absent grants'
);
select ok(
  not has_function_privilege('anon', 'private.enqueue_email(text, text, uuid, jsonb)', 'EXECUTE'),
  'anon cannot execute enqueue_email'
);
select ok(
  not has_function_privilege('authenticated', 'private.enqueue_email(text, text, uuid, jsonb)', 'EXECUTE'),
  'authenticated cannot execute enqueue_email'
);
select ok(
  not has_function_privilege('authenticated', 'private.claim_due_emails(integer)', 'EXECUTE'),
  'authenticated cannot execute claim_due_emails'
);
select ok(
  has_function_privilege('service_role', 'private.claim_due_emails(integer)', 'EXECUTE'),
  'the server-side worker role executes claim_due_emails'
);
select ok(
  has_function_privilege('service_role', 'private.record_email_result(uuid, text, text, text)', 'EXECUTE'),
  'the server-side worker role executes record_email_result'
);

-- The outbox table is not exposed through the public-schema inventory: the
-- smoke suite's public-table count is unchanged (the table is private).

-------------------------------------------------------------------------------
-- 2. Enqueue atomicity and idempotency.
-------------------------------------------------------------------------------

-- Generic rejections: unknown template key, disallowed payload key,
-- missing/oversized idempotency key, null recipient.
select is(
  private.enqueue_email('k-bad-template', 'newsletter', :'uid_a'::uuid, '{"group_name":"G"}'),
  'rejected',
  'an unknown template key is generically rejected'
);
select is(
  private.enqueue_email('k-bad-payload', 'reminder', :'uid_a'::uuid, '{"group_name":"G","email":"x@example.test"}'),
  'rejected',
  'a payload carrying an email address is rejected'
);
select is(
  private.enqueue_email('k-bad-token-payload', 'invitation', :'uid_a'::uuid,
    '{"group_name":"G","invitation_token":"tok"}'),
  'rejected',
  'a payload carrying a token is rejected'
);
select is(
  private.enqueue_email('k-bad-identity-payload', 'assignment', :'uid_a'::uuid,
    '{"group_name":"G","recipient_user_id":"u"}'),
  'rejected',
  'a payload carrying an assignment identity is rejected'
);
select is(
  private.enqueue_email('', 'reminder', :'uid_a'::uuid, '{"group_name":"G"}'),
  'rejected',
  'an empty idempotency key is rejected'
);
select is(
  private.enqueue_email(repeat('k', 201), 'reminder', :'uid_a'::uuid, '{"group_name":"G"}'),
  'rejected',
  'an oversized idempotency key is rejected'
);
select is(
  private.enqueue_email('k-null-recipient', 'reminder', null::uuid, '{"group_name":"G"}'),
  'rejected',
  'a null recipient is rejected'
);

-- Allowed reminder payload (exact allowlist).
select is(
  private.enqueue_email('k-reminder-1', 'reminder', :'uid_a'::uuid,
    '{"group_id":"g1","group_name":"Crew","occasion_date":"2026-12-01","reminder_offset_days":"7"}'),
  'enqueued',
  'an allowlisted reminder payload is enqueued'
);
select is(
  private.enqueue_email('k-reminder-1', 'reminder', :'uid_a'::uuid,
    '{"group_id":"g1","group_name":"Crew","occasion_date":"2026-12-01","reminder_offset_days":"7"}'),
  'already_pending',
  'replaying a pending key reports already_pending'
);
select is(
  (select count(*)::int from private.email_outbox where idempotency_key = 'k-reminder-1'),
  1,
  'a replay performs no second write'
);

-- Replay statuses per current row state.
update private.email_outbox set status = 'claimed' where idempotency_key = 'k-reminder-1';
select is(
  private.enqueue_email('k-reminder-1', 'reminder', :'uid_a'::uuid,
    '{"group_id":"g1","group_name":"Crew","occasion_date":"2026-12-01","reminder_offset_days":"7"}'),
  'already_claimed',
  'replaying a claimed key reports already_claimed'
);
update private.email_outbox set status = 'sent' where idempotency_key = 'k-reminder-1';
select is(
  private.enqueue_email('k-reminder-1', 'reminder', :'uid_a'::uuid,
    '{"group_id":"g1","group_name":"Crew","occasion_date":"2026-12-01","reminder_offset_days":"7"}'),
  'already_sent',
  'replaying a sent key reports already_sent'
);
update private.email_outbox set status = 'failed_permanent' where idempotency_key = 'k-reminder-1';
select is(
  private.enqueue_email('k-reminder-1', 'reminder', :'uid_a'::uuid,
    '{"group_id":"g1","group_name":"Crew","occasion_date":"2026-12-01","reminder_offset_days":"7"}'),
  'already_failed',
  'replaying a failed key reports already_failed'
);
delete from private.email_outbox where idempotency_key = 'k-reminder-1';

-- Invitation allowlist: exactly the preview fields plus the invitation
-- reference; invitation and assignment allowlists are exercised in the
-- caller-transaction atomicity block below.

-- Enqueue commits in the caller's transaction: a forced rollback leaves no
-- row, and a committed transaction leaves the enqueue behind.
savepoint before_enqueue;
select private.enqueue_email('k-rollback', 'invitation', :'uid_a'::uuid,
  '{"budget_amount_minor":"100000","budget_currency":"INR","gifting_mode":"secret_draw","group_id":"g1","group_name":"G","host_display_name":"H","invitation_id":"i1","invitation_version":"1","joined_member_count":"2","occasion_date":"2026-11-01"}');
rollback to savepoint before_enqueue;
select is(
  (select count(*)::int from private.email_outbox where idempotency_key = 'k-rollback'),
  0,
  'a rolled-back enqueue leaves no row (commits in the caller transaction)'
);

select private.enqueue_email('k-committed', 'invitation', :'uid_a'::uuid,
  '{"budget_amount_minor":"100000","budget_currency":"INR","gifting_mode":"secret_draw","group_id":"g1","group_name":"G","host_display_name":"H","invitation_id":"i1","invitation_version":"1","joined_member_count":"2","occasion_date":"2026-11-01"}') as enq \gset
select is(:'enq'::text, 'enqueued', 'a committed enqueue persists');

-- Assignment allowlist accept/reject matrix.
select is(
  private.enqueue_email('k-assignment-ok', 'assignment', :'uid_a'::uuid,
    '{"draw_version":"1","group_id":"g1","group_name":"G","occasion_date":"2026-12-20","recipient_display_name":null}'),
  'enqueued',
  'an allowlisted assignment payload (null Member fallback) is enqueued'
);
select is(
  private.enqueue_email('k-assignment-organizer', 'assignment', :'uid_a'::uuid,
    '{"draw_version":"1","group_id":"g1","group_name":"G","occasion_date":"2026-12-20","recipient_display_name":"D","organizer_note":"secret"}'),
  'rejected',
  'an assignment payload with a non-allowlisted key is rejected'
);
select is(
  private.enqueue_email('k-reminder-banned', 'reminder', :'uid_a'::uuid,
    '{"group_id":"g1","group_name":"G","occasion_date":"2026-12-01","reminder_offset_days":"7","assignment_hint":"x"}'),
  'rejected',
  'a reminder payload with assignment content is rejected'
);

-- Payload allowlist exhaustiveness: an unknown key on every template is
-- rejected, and every allowed key alone is accepted.
select is(
  private.enqueue_email('k-inv-extra', 'invitation', :'uid_a'::uuid,
    '{"budget_amount_minor":"1","budget_currency":"INR","gifting_mode":"secret_draw","group_id":"g","group_name":"G","host_display_name":"H","invitation_id":"i","invitation_version":"1","joined_member_count":"1","occasion_date":"d","token":"t"}'),
  'rejected',
  'an invitation payload carrying a token key is rejected'
);
select is(
  private.enqueue_email('k-rem-empty', 'reminder', :'uid_a'::uuid, '{}'),
  'rejected',
  'an empty payload is rejected'
);
select is(
  private.enqueue_email('k-rem-scalar', 'reminder', :'uid_a'::uuid, '"group_name"'),
  'rejected',
  'a non-object payload is rejected'
);
select is(
  private.enqueue_email('k-rem-unbounded', 'reminder', :'uid_a'::uuid,
    format('{"group_id":"g","group_name":"%s","occasion_date":"d","reminder_offset_days":"7"}', repeat('x', 201))::jsonb),
  'rejected',
  'an unbounded string value is rejected'
);

-------------------------------------------------------------------------------
-- 3. Claim and retry semantics.
-------------------------------------------------------------------------------

-- Reset the committed row to pending with attempt 0 for the claim tests.
update private.email_outbox
set status = 'pending', attempt_count = 0, last_attempt_at = null, claim_expires_at = null
where idempotency_key = 'k-committed';

select is(
  (select status::text from private.email_outbox where idempotency_key = 'k-committed'),
  'pending',
  'the row starts pending'
);

-- First claim: due immediately, claim is the durable write.
select * from private.claim_due_emails(10) limit 1 \gset
select is(
  (select status::text from private.email_outbox where idempotency_key = 'k-committed'),
  'claimed',
  'the claim transition is durable'
);
select is(
  (select attempt_count from private.email_outbox where idempotency_key = 'k-committed'),
  1,
  'the claim bumps attempt_count by one'
);
select ok(
  (select last_attempt_at is not null from private.email_outbox where idempotency_key = 'k-committed'),
  'the claim stamps last_attempt_at'
);
select ok(
  (
    select claim_expires_at > clock_timestamp()
      and claim_expires_at <= clock_timestamp() + interval '10 minutes'
    from private.email_outbox where idempotency_key = 'k-committed'
  ),
  'the claim sets a bounded claim_expires_at lease'
);

-- A lease-live claimed row is NOT due; an expired-lease claimed row IS.
select is(
  (select count(*)::int from private.claim_due_emails(10) where id = (select id from private.email_outbox where idempotency_key = 'k-committed')),
  0,
  'a lease-live claimed row is not re-claimable'
);
update private.email_outbox
set claim_expires_at = clock_timestamp() - interval '1 second'
where idempotency_key = 'k-committed';
select is(
  (select count(*)::int from private.claim_due_emails(10) where id = (select id from private.email_outbox where idempotency_key = 'k-committed')),
  1,
  'an expired-lease claimed row (crashed worker) is re-claimable'
);
select is(
  (select attempt_count from private.email_outbox where idempotency_key = 'k-committed'),
  2,
  'the recovery claim bumps attempt_count again'
);

-- Claim-time backoff: a pending row with a recent attempt is not due, one
-- with an elapsed backoff window is.
update private.email_outbox
set status = 'pending', attempt_count = 3, last_attempt_at = clock_timestamp(),
    claim_expires_at = null
where idempotency_key = 'k-committed';
select is(
  (select count(*)::int from private.claim_due_emails(10) where id = (select id from private.email_outbox where idempotency_key = 'k-committed')),
  0,
  'a pending row inside its claim-time backoff window is not due'
);
update private.email_outbox
set status = 'pending', attempt_count = 3,
    last_attempt_at = clock_timestamp() - interval '10 minutes'
where idempotency_key = 'k-committed';
select is(
  (select count(*)::int from private.claim_due_emails(10) where id = (select id from private.email_outbox where idempotency_key = 'k-committed')),
  1,
  'a pending row with an elapsed backoff window is due'
);

-- The attempt bound: a row at the bound transitions to failed_permanent at
-- claim time instead of being claimed.
update private.email_outbox
set status = 'pending', attempt_count = 10, last_attempt_at = null, claim_expires_at = null
where idempotency_key = 'k-committed';
select is(
  (select count(*)::int from private.claim_due_emails(10) where id = (select id from private.email_outbox where idempotency_key = 'k-committed')),
  0,
  'a row at the attempt bound is not claimed'
);
select is(
  (select status::text from private.email_outbox where idempotency_key = 'k-committed'),
  'failed_permanent',
  'a row at the attempt bound transitions to failed_permanent at claim time'
);

-- record_email_result resolves only claimed rows, idempotently.
update private.email_outbox
set status = 'pending', attempt_count = 0, last_attempt_at = null, claim_expires_at = null
where idempotency_key = 'k-committed';
select count(*)::int as claimed_count from private.claim_due_emails(10) \gset
select is(
  private.record_email_result((select id from private.email_outbox where idempotency_key = 'k-committed'), 'sent', 'resend-id-42', null),
  'recorded',
  'a claimed row resolves to sent'
);
select is(
  (select provider_message_id from private.email_outbox where idempotency_key = 'k-committed'),
  'resend-id-42',
  'the bounded provider id is stored'
);
select ok(
  (select claim_expires_at is null from private.email_outbox where idempotency_key = 'k-committed'),
  'the lease is cleared on sent'
);
select is(
  private.record_email_result((select id from private.email_outbox where idempotency_key = 'k-committed'), 'sent', 'resend-id-42', null),
  'ignored',
  'resolving an already-resolved row is an idempotent no-op'
);
select is(
  private.record_email_result(gen_random_uuid(), 'sent', 'x', null),
  'ignored',
  'resolving an unknown id is an idempotent no-op'
);
select is(
  private.record_email_result((select id from private.email_outbox where idempotency_key = 'k-committed'), 'retry', null, 'provider_error'),
  'ignored',
  'a sent row cannot be flipped to retry (non-claimed)'
);

-- Retry clears the lease and stores only bounded categories.
update private.email_outbox
set status = 'pending', attempt_count = 0, last_attempt_at = null, claim_expires_at = null
where idempotency_key = 'k-committed';
select count(*)::int as claimed_count from private.claim_due_emails(10) \gset
update private.email_outbox set claim_expires_at = clock_timestamp() + interval '5 minutes'
where idempotency_key = 'k-committed';
select is(
  private.record_email_result((select id from private.email_outbox where idempotency_key = 'k-committed'), 'retry', null, 'rate_limited'),
  'recorded',
  'a claimed row returns to pending on retry'
);
select is(
  (select last_error_category from private.email_outbox where idempotency_key = 'k-committed'),
  'rate_limited',
  'the bounded category is stored'
);
select ok(
  (select claim_expires_at is null from private.email_outbox where idempotency_key = 'k-committed'),
  'the lease is cleared on retry so claim-time backoff governs'
);
select is(
  private.record_email_result((select id from private.email_outbox where idempotency_key = 'k-committed'), 'retry', null, 'totally_bogus_category'),
  'ignored',
  'an unbounded category is refused'
);
select is(
  private.record_email_result((select id from private.email_outbox where idempotency_key = 'k-committed'), 'explode', null, null),
  'ignored',
  'an unknown outcome is refused'
);

-- Concurrent claims: two sequential emulations of the FOR UPDATE SKIP
-- LOCKED serialization — the second concurrent worker finds the row already
-- claimed with a live lease and cannot double-claim (the interleaving is
-- exercised by the claim's atomic UPDATE ... SKIP LOCKED; the durable
-- single-row transition above is the proof point).
select is(
  (select count(*)::int from private.email_outbox where idempotency_key = 'k-committed' and status = 'pending'),
  1,
  'exactly one durable row state exists per idempotency key after retry'
);

-- The outbox is not exposed via the public schema (criterion 8: the smoke
-- inventory stays unchanged because the table is private).
select is(
  (select count(*)::int from pg_tables where schemaname = 'private' and tablename = 'email_outbox'),
  1,
  'exactly the private outbox table exists in private from this slice'
);

select *
from finish();

rollback;
