-- 009a: invitation, assignment, and reminder email templates with idempotent,
-- observable delivery — the durable email outbox.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/009a-email-templates-and-delivery-reliability.md.
-- Never edit this file once it has been applied anywhere; fix forward with a
-- new migration (see supabase/README.md).
--
-- What this adds:
--   * public.email_outbox_status: the four-value status enum, created in the
--     public schema per the repository convention (every enum type lives in
--     public; 007c's group_reservation_status pair established the
--     public-enum/private-table pattern).
--   * private.email_outbox: the durable outbox. No client role receives any
--     privilege on it — REVOKE-then-no-grant, RLS enabled with deliberately
--     no permissive policy, exactly the group_members/audit_events posture.
--     Recipient addresses are NEVER stored; the email is addressed from the
--     profile's email at send time from recipient_user_id.
--   * private.enqueue_email: idempotent, allowlist-validated enqueue that
--     commits in the caller's transaction. Replaying an idempotency key
--     performs no second write and returns the existing row's status.
--   * private.claim_due_emails: atomic FOR UPDATE SKIP LOCKED claim that is
--     itself the durable serialization point — it sets status='claimed',
--     bumps attempt_count, stamps last_attempt_at, and sets the bounded
--     claim_expires_at lease. A row at the attempt bound transitions to
--     failed_permanent instead of being claimed. An expired claimed row
--     (crashed worker) is re-claimable; a lease-live one is not.
--   * private.record_email_result: resolves only claimed rows; sent / retry
--     (pending) / failed_permanent; replays idempotently for unknown,
--     already-resolved, or non-claimed ids.
--
-- Rollback / forward-fix note: this migration is forward-only; any correction
-- ships as a NEW migration. The revert path, in dependency order, is: drop
-- record_email_result, claim_due_emails, enqueue_email, then the
-- private.email_outbox table. The public.email_outbox_status enum value set
-- is PERMANENT once added (ALTER TYPE ... DROP VALUE does not exist in
-- PostgreSQL) and would remain as harmless unused values, exactly as
-- documented in 008c. Reverting deletes queued-but-unsent emails
-- irreversibly, so a revert is a deliberate, data-destroying gate, never a
-- hotfix. No rollback path silently drops undelivered state.

-------------------------------------------------------------------------------
-- 1. The status enum (public schema per repository convention).
-------------------------------------------------------------------------------

create type public.email_outbox_status as enum ('pending', 'claimed', 'sent', 'failed_permanent');

-------------------------------------------------------------------------------
-- 2. The outbox table (private schema, deny-by-default).
-------------------------------------------------------------------------------

create table private.email_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  template_key text not null,
  idempotency_key text not null,
  recipient_user_id uuid not null references auth.users (id) on delete restrict,
  payload jsonb not null,
  status public.email_outbox_status not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  claim_expires_at timestamptz,
  provider_message_id text,
  last_error_category text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint email_outbox_template_key_check
    check (template_key in ('invitation', 'assignment', 'reminder')),
  constraint email_outbox_attempt_count_bounded check (attempt_count <= 10),
  constraint email_outbox_provider_message_id_bounded
    check (provider_message_id is null or char_length(provider_message_id) <= 128),
  constraint email_outbox_error_category_bounded
    check (
      last_error_category is null
      or last_error_category in (
        'provider_error', 'rate_limited', 'invalid_payload', 'recipient_unavailable'
      )
    )
);

create unique index email_outbox_idempotency_key
  on private.email_outbox (idempotency_key);

comment on table private.email_outbox is
  'Durable transactional-email outbox (009a). Recipient addresses are never stored; the email is addressed from the profile email at send time. Tokens, assignment identities, and secret URLs never enter the payload. No client role holds any privilege; all writes go through the SECURITY DEFINER functions below.';
comment on column private.email_outbox.idempotency_key is
  'Caller-supplied deterministic key making a logical email replay-safe. Per template: invitation row id + shareable_invitation_version; (group_id, draw_version, giver_id); (group_id, template_key, reminder_offset, occasion_date).';
comment on column private.email_outbox.claim_expires_at is
  'The durable claim lease expiry set by claim_due_emails and cleared by record_email_result.';

revoke all on private.email_outbox from public;
revoke all on private.email_outbox from anon;
revoke all on private.email_outbox from authenticated;
revoke all on private.email_outbox from service_role;

alter table private.email_outbox enable row level security;

-- Deliberately no policy: application roles have no direct table privilege
-- or permissive RLS policy on the outbox; only the definer functions below
-- touch it.

-------------------------------------------------------------------------------
-- 3. Payload allowlists (template variables only, per template_key).
--
-- No email address, token, token hash, secret URL, assignment identity, or
-- wishlist content beyond what the named template legitimately renders may
-- ever be stored. Anything else is generically rejected.
-------------------------------------------------------------------------------

create function private.email_payload_is_allowed(p_template_key text, p_payload jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Bounded text helper: every allowed string value is bounded, mirroring the
  -- 005a/006a text bounds.
  with value_bounds as (
    select
      bool_and(
        e.v = 'null'::jsonb
        or (
          jsonb_typeof(e.v) = 'string'
          and char_length(e.v #>> '{}') <= 200
        )
      ) as strings_bounded
    from jsonb_each(p_payload) as e(k, v)
    where e.v is not null
  )
  select case
    when p_payload is null or jsonb_typeof(p_payload) <> 'object' then false
    when not exists (
      select 1 from jsonb_object_keys(p_payload) k
    ) then false
    when p_template_key = 'invitation' then
      -- Exactly the 006c seven-field limited preview fields plus the
      -- invitation reference (id + shareable version) — never the token.
      (
        (select array_agg(k order by k) from jsonb_object_keys(p_payload) k)
        = array[
          'budget_amount_minor', 'budget_currency', 'gifting_mode',
          'group_id', 'group_name', 'host_display_name', 'invitation_id',
          'invitation_version', 'joined_member_count', 'occasion_date'
        ]
        and (select strings_bounded from value_bounds)
      )
    when p_template_key = 'assignment' then
      -- Exactly what my_assignment lawfully shows one giver: recipient
      -- display name (generic Member fallback applied at render), group
      -- name/occasion, and the draw version. No giver identity, no
      -- reservation or checklist state, no recipient user id.
      (
        (select array_agg(k order by k) from jsonb_object_keys(p_payload) k)
        = array[
          'draw_version', 'group_id', 'group_name', 'occasion_date',
          'recipient_display_name'
        ]
        and (select strings_bounded from value_bounds)
      )
    when p_template_key = 'reminder' then
      -- Group name, occasion date, and the scheduled offset only. No
      -- per-member progress, reservation state, checklist state, or
      -- assignment hints.
      (
        (select array_agg(k order by k) from jsonb_object_keys(p_payload) k)
        = array['group_id', 'group_name', 'occasion_date', 'reminder_offset_days']
        and (select strings_bounded from value_bounds)
      )
    else false
  end
$$;

comment on function private.email_payload_is_allowed(text, jsonb) is
  'CHECK helper: the outbox payload carries exactly the allowlisted template variables per template_key, all bounded strings; anything else (email address, token, assignment identity, wishlist content) is generically rejected.';

-------------------------------------------------------------------------------
-- 4. Enqueue (idempotent, caller-transaction commit).
-------------------------------------------------------------------------------

create function private.enqueue_email(
  p_idempotency_key text,
  p_template_key text,
  p_recipient_user_id uuid,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.email_outbox_status;
begin
  -- Generic rejection for every malformed input: unknown template key,
  -- disallowed or oversized payload, unbounded or missing idempotency key.
  if p_idempotency_key is null
    or char_length(p_idempotency_key) = 0
    or char_length(p_idempotency_key) > 200
    or p_template_key not in ('invitation', 'assignment', 'reminder')
    or p_recipient_user_id is null
    or not private.email_payload_is_allowed(p_template_key, p_payload)
  then
    return 'rejected';
  end if;

  insert into private.email_outbox (
    idempotency_key, template_key, recipient_user_id, payload
  )
  values (p_idempotency_key, p_template_key, p_recipient_user_id, p_payload)
  on conflict (idempotency_key) do nothing;

  if found then
    return 'enqueued';
  end if;

  -- Replay: no second write; report the existing row's current status.
  select status into v_existing
  from private.email_outbox
  where idempotency_key = p_idempotency_key;

  return case v_existing
    when 'pending' then 'already_pending'
    when 'claimed' then 'already_claimed'
    when 'sent' then 'already_sent'
    when 'failed_permanent' then 'already_failed'
  end;
end;
$$;

comment on function private.enqueue_email(text, text, uuid, jsonb) is
  'Idempotent outbox enqueue committing in the caller''s transaction: an email is enqueued if and only if the state change that justifies it commits. Replays report the existing status without a second write; unknown template keys and disallowed payloads are generically rejected.';

-------------------------------------------------------------------------------
-- 5. Claim due rows (the durable serialization point).
--
-- A row is DUE when it is pending with its backoff window elapsed, or when
-- it is claimed with an expired lease (crashed worker). The claim itself is
-- the durable write: status='claimed', attempt_count bumped,
-- last_attempt_at stamped, bounded lease set. A row at the attempt bound
-- transitions to failed_permanent instead of being claimed.
--
-- Backoff (claim-time, attempt-driven): window = min(2^(attempt_count-1)
-- minutes, 60) — 1m, 2m, 4m, ... capped at 60m; attempt 1 is due immediately.
-------------------------------------------------------------------------------

create function private.claim_due_emails(p_limit integer)
returns table(
  id uuid,
  template_key text,
  recipient_user_id uuid,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_now timestamptz;
begin
  if p_limit is null or p_limit < 1 then
    return;
  end if;
  v_limit := least(p_limit, 100);
  v_now := clock_timestamp();

  -- The attempt bound is enforced at claim time: a pending row at the bound
  -- can never leave pending through a claim, so claiming first retires every
  -- bound-reached pending row to failed_permanent.
  update private.email_outbox
  set status = 'failed_permanent',
      updated_at = v_now
  where status = 'pending'
    and attempt_count >= 10;

  return query
  with due as (
    select d.id
    from private.email_outbox d
    where (
            d.status = 'pending'
            and (
              d.attempt_count = 0
              or d.last_attempt_at is null
              or d.last_attempt_at
                <= v_now - least(
                     power(2, greatest(d.attempt_count, 1) - 1) * interval '1 minute',
                     interval '60 minutes'
                   )
            )
          )
          or (
            d.status = 'claimed'
            and d.claim_expires_at is not null
            and d.claim_expires_at <= v_now
          )
    order by d.created_at, d.id
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update private.email_outbox o
    set status = 'claimed',
        attempt_count = o.attempt_count + 1,
        last_attempt_at = v_now,
        claim_expires_at = v_now + interval '5 minutes',
        updated_at = v_now
    where o.id in (select du.id from due du)
      and o.status in ('pending', 'claimed')
    returning o.id
  )
  select o.id, o.template_key, o.recipient_user_id, o.payload
  from private.email_outbox o
  join claimed c on c.id = o.id
  order by o.created_at, o.id;
end;
$$;

-- Rows AT the attempt bound are retired inside claim_due_emails (above), so
-- the bounded-retry guarantee is enforced exactly at claim time.

comment on function private.claim_due_emails(integer) is
  'Atomic FOR UPDATE SKIP LOCKED claim: concurrent workers never double-claim. The claim is the durable serialization point — status=claimed, attempt_count bump, last_attempt_at, and the bounded 5-minute claim_expires_at lease. Pending rows with elapsed claim-time backoff and expired-lease claimed rows are due; a row at the attempt bound is instead retired to failed_permanent by retire_exhausted_emails.';

-------------------------------------------------------------------------------
-- 6. Record the send result (only claimed rows resolve; replay is a no-op).
-------------------------------------------------------------------------------

create function private.record_email_result(
  p_id uuid,
  p_outcome text,
  p_provider_message_id text,
  p_error_category text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated timestamptz;
begin
  if p_id is null or p_outcome is null
    or p_outcome not in ('sent', 'retry', 'failed_permanent')
  then
    return 'ignored';
  end if;

  if p_outcome = 'sent' then
    if p_provider_message_id is not null
      and char_length(p_provider_message_id) > 128
    then
      return 'ignored';
    end if;

    update private.email_outbox
    set status = 'sent',
        provider_message_id = p_provider_message_id,
        claim_expires_at = null,
        updated_at = clock_timestamp()
    where id = p_id
      and status = 'claimed';

    if found then
      return 'recorded';
    end if;
    return 'ignored';
  end if;

  if p_error_category is null
    or p_error_category not in (
      'provider_error', 'rate_limited', 'invalid_payload', 'recipient_unavailable'
    )
  then
    return 'ignored';
  end if;

  update private.email_outbox
  set status = case p_outcome when 'retry' then 'pending' else 'failed_permanent' end::public.email_outbox_status,
      last_error_category = p_error_category,
      claim_expires_at = null,
      updated_at = clock_timestamp()
  where id = p_id
    and status = 'claimed';

  if found then
    return 'recorded';
  end if;
  return 'ignored';
end;
$$;

comment on function private.record_email_result(uuid, text, text, text) is
  'Resolves only claimed rows: sent (storing the bounded provider id, clearing the lease), retry (back to pending, clearing the lease so claim-time backoff governs the next attempt), or failed_permanent. Unknown, already-resolved, or non-claimed ids are an idempotent no-op.';

-------------------------------------------------------------------------------
-- 7. Exact privilege inventory for the functions.
--
-- The outbox functions are server-side infrastructure: the send worker and
-- server-side callers run with the service role (a server-only secret that
-- never reaches any client bundle). No browser-facing role receives EXECUTE.
-------------------------------------------------------------------------------

revoke execute on function private.enqueue_email(text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.claim_due_emails(integer)
  from public, anon, authenticated, service_role;
revoke execute on function private.record_email_result(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.email_payload_is_allowed(text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function private.enqueue_email(text, text, uuid, jsonb)
  to service_role;
grant execute on function private.claim_due_emails(integer)
  to service_role;
grant execute on function private.record_email_result(uuid, text, text, text)
  to service_role;
