-- 006b: create-private-group receipts and the shareable-invitation CAS model.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/006b-create-private-group.md (approved brief commit
-- 6950105). Never edit this file once it has been applied anywhere; fix
-- forward with a new migration (see supabase/README.md).
--
-- What this adds on top of 006a (20261003000000_groups.sql):
--   * groups.shareable_invitation_version: the one durable compare-and-swap
--     version for the group's generic shareable link. Internal: excluded from
--     the client column grant and every projection.
--   * group_invitations.shareable_version: generic rows (both target fields
--     null) carry exactly one version per (group, version) and at most one
--     stored-active generic row exists per group. Targeted rows keep a null
--     shareable_version. The pairing check makes a row exactly one of
--     generic or targeted.
--   * Deterministic populated-state upgrade: legacy generic rows are
--     versioned by created_at/id; duplicate stored-active rows are resolved
--     by the pinned ranking (still-usable ahead of expired, then
--     created_at/id descending); every loser is revoked with one truthful
--     actor-null system audit row; group counters are initialized exactly.
--   * group_creation_receipts: the user-scoped idempotency receipt keyed by
--     (actor_id, request_key). Canonical payload version and SHA-256 digest
--     only — never the raw payload or user text. No client grant, deny-all
--     RLS.
--   * create_group_v1(p_request_key uuid, p_payload jsonb): the only callable
--     creation path. The database normalizes and validates the canonical
--     payload v1, recomputes the digest, and creates the group, joined
--     participating organizer membership, receipt, and audit event in one
--     transaction. Same key + same payload replays the original group; same
--     key + different payload is a typed conflict; concurrent same-key
--     requests serialize inside the database.
--   * group_shareable_invitation_state(uuid): the organizer-only projection
--     returning exactly (invitation_version, state, expires_at) with state
--     in never_issued / active / issued_expired / revoked.
--   * Generic compare-and-swap issue/revoke overloads
--     issue_group_invitation(uuid, bigint) and
--     revoke_group_invitation(uuid, bigint): group-first lock order, exact
--     expected-version check (SQLSTATE 22023 invalid / PT409 stale), the
--     authoritative expiry fixed by the database clock, no use limit, and
--     one audit event per change.
--   * The targeted issue overload is reshaped to (uuid, uuid): the caller
--     can no longer choose expiry or use limit; the database fixes a 30-day
--     expiry after locks and a one-use limit. The targeted revoke-by-ID
--     overload refuses generic rows. 006a's broader issue overload
--     (uuid, timestamptz, integer, uuid) is dropped with its grant.
--   * 006a's receipt-less create_group is dropped with its grant: the
--     receipt-backed create_group_v1 is the only creation path, so a forged
--     or missing browser guard is still rejected by the database receipt.
--   * audit_events.actor_id becomes nullable under an equivalence check: a
--     null actor is valid if and only if the event is an invitation_revoked
--     carrying both exact migration metadata values (the system-marked
--     normalization revocation). Every application event still requires a
--     nonnull actor, and the existing restrictive actor foreign key remains
--     for every nonnull actor.

-------------------------------------------------------------------------------
-- 1. Metadata allowlist extension (system migration metadata keys).
-------------------------------------------------------------------------------

create or replace function private.audit_metadata_is_safe(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Case-split without a set-returning FROM: jsonb_each yields no rows for
  -- non-objects, which would otherwise make the function return NULL and a
  -- CHECK constraint treat the value as satisfied.
  select case
    when p_metadata is null then true
    when jsonb_typeof(p_metadata) <> 'object' then false
    else coalesce(
      (
        select bool_and(
          e.k = any (
            array[
              'invitation_id',
              'membership_generation',
              'target_user_id',
              'previous_organizer_id',
              'new_organizer_id',
              'migration_version',
              'reason'
            ]
          )
          and jsonb_typeof(e.v) = any (array['string', 'number'])
        )
        from jsonb_each(p_metadata) as e(k, v)
      ),
      true
    )
  end
$$;

comment on function private.audit_metadata_is_safe(jsonb) is
  'CHECK helper: audit metadata is a bounded object of identifier/generation keys only; 006b adds the two system migration keys.';

-------------------------------------------------------------------------------
-- 2. Nullable audit actor under an exact equivalence check.
-------------------------------------------------------------------------------

alter table public.audit_events alter column actor_id drop not null;

alter table public.audit_events
  add constraint audit_events_actor_null_iff_system_revocation check (
    actor_id is not null
    or (
      event_type = 'invitation_revoked'
      and invitation_id is not null
      and metadata = '{"migration_version":"006b","reason":"multiple_stored_active"}'::jsonb
    )
  );

-------------------------------------------------------------------------------
-- 3. Nullable new columns (client-invisible: no grant is ever added).
-------------------------------------------------------------------------------

alter table public."groups" add column shareable_invitation_version bigint;
alter table public.group_invitations add column shareable_version bigint;

comment on column public."groups".shareable_invitation_version is
  'Internal compare-and-swap version for the generic shareable link; incremented exactly once per generic issue or revoke. Never client-readable.';
comment on column public.group_invitations.shareable_version is
  'The group shareable version this generic row was issued at; null for targeted rows.';

-------------------------------------------------------------------------------
-- 4. Deterministic populated-state upgrade (one transaction, all-or-nothing).
-------------------------------------------------------------------------------

do $$
declare
  migration_checked_at timestamptz;
begin
  -- Lock every touched table against concurrent writes for the whole
  -- backfill, then capture ONE clock value for the entire upgrade.
  lock table public."groups" in share row exclusive mode;
  lock table public.group_invitations in share row exclusive mode;
  lock table public.audit_events in share row exclusive mode;
  migration_checked_at := clock_timestamp();

  -- 4a. Assign legacy generic rows (both target fields null) their version
  -- by created_at ascending, id ascending, per group. Targeted rows keep a
  -- null shareable version and are otherwise untouched.
  create temp table migration_006b_legacy on commit drop as
    select i.id,
           i.group_id,
           row_number() over (
             partition by i.group_id
             order by i.created_at asc, i.id asc
           ) as rn
    from public.group_invitations i
    where i.target_user_id is null
      and i.target_membership_generation is null;

  update public.group_invitations i
  set shareable_version = l.rn
  from migration_006b_legacy l
  where i.id = l.id;

  -- 4b. Rank stored-active generic rows per group: a still-usable row
  -- (expires_at > checked_at) ranks ahead of an expired row; ties order by
  -- created_at descending, id descending. rn = 1 is the deterministic
  -- winner; every other stored-active row is revoked.
  create temp table migration_006b_losers on commit drop as
    select id, group_id from (
      select i.id,
             i.group_id,
             row_number() over (
               partition by i.group_id
               order by (i.expires_at > migration_checked_at) desc,
                        i.created_at desc,
                        i.id desc
             ) as rn
      from public.group_invitations i
      where i.shareable_version is not null
        and i.status = 'active'
    ) ranked
    where rn > 1;

  update public.group_invitations i
  set status = 'revoked'
  from migration_006b_losers l
  where i.id = l.id;

  -- 4c. One truthful actor-null system audit row per revoked loser. The
  -- metadata carries exactly the two system keys; no token, hash, name, or
  -- count.
  insert into public.audit_events
    (actor_id, group_id, event_type, invitation_id, metadata, occurred_at)
  select
    null::uuid,
    l.group_id,
    'invitation_revoked'::public.group_audit_event_type,
    l.id,
    jsonb_build_object('migration_version', '006b', 'reason', 'multiple_stored_active'),
    migration_checked_at
  from migration_006b_losers l;

  -- 4d. Initialize each group's counter exactly: the maximum assigned row
  -- version, plus one normalization epoch when step 4b revoked one or more
  -- duplicate stored-active rows in that group. Groups with no generic
  -- history stay at the 0 default.
  create temp table migration_006b_hist on commit drop as
    select group_id, max(shareable_version) as max_version
    from public.group_invitations
    where shareable_version is not null
    group by group_id;

  create temp table migration_006b_loser_groups on commit drop as
    select distinct group_id
    from migration_006b_losers;

  update public."groups" g
  set shareable_invitation_version =
        coalesce(h.max_version, 0)
        + case when lg.group_id is null then 0 else 1 end
  from migration_006b_hist h
  left join migration_006b_loser_groups lg on lg.group_id = h.group_id
  where g.id = h.group_id;
end;
$$;

-------------------------------------------------------------------------------
-- 5. The final version/pairing/uniqueness constraints.
-------------------------------------------------------------------------------

alter table public."groups"
  alter column shareable_invitation_version set default 0,
  alter column shareable_invitation_version set not null,
  add constraint groups_shareable_invitation_version_non_negative
    check (shareable_invitation_version >= 0);

alter table public.group_invitations
  add constraint group_invitations_shareable_version_positive
    check (shareable_version is null or shareable_version >= 1),
  add constraint group_invitations_shareable_target_pairing
    check (
      (shareable_version is not null)
      = (target_user_id is null and target_membership_generation is null)
    );

-- Exactly one generic row per (group, version), and at most one
-- stored-active generic row per group.
create unique index group_invitations_group_shareable_version_key
  on public.group_invitations (group_id, shareable_version)
  where shareable_version is not null;

create unique index group_invitations_one_active_generic
  on public.group_invitations (group_id)
  where shareable_version is not null and status = 'active';

-------------------------------------------------------------------------------
-- 6. The creation receipt (user-scoped idempotency).
-------------------------------------------------------------------------------

create table public.group_creation_receipts (
  actor_id uuid not null references auth.users (id) on delete restrict,
  request_key uuid not null,
  contract_version integer not null,
  payload_digest bytea not null,
  -- Nullable only inside the creating transaction: the receipt row is
  -- inserted first (to win the (actor_id, request_key) race) and bound to
  -- the new group by an update in the same transaction, so every committed
  -- receipt carries its group.
  group_id uuid references public."groups" (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),

  primary key (actor_id, request_key),

  constraint group_creation_receipts_version_is_v1 check (contract_version = 1),
  constraint group_creation_receipts_digest_sha256 check (octet_length(payload_digest) = 32)
);

comment on table public.group_creation_receipts is
  'User-scoped idempotency receipts for group creation, keyed uniquely by (actor_id, request_key). Only the canonical payload version and SHA-256 digest are stored — never the raw payload or user-entered text. No client grant and no permissive RLS policy.';
comment on column public.group_creation_receipts.request_key is
  'The browser-generated UUIDv4 request key; scoped by actor_id. Not an authorization token.';

revoke all on public.group_creation_receipts from public;
revoke all on public.group_creation_receipts from anon;
revoke all on public.group_creation_receipts from authenticated;
revoke all on public.group_creation_receipts from service_role;

alter table public.group_creation_receipts enable row level security;

-- Deliberately no policy: application roles have no direct table privilege
-- or permissive RLS policy on receipts; only the definer functions touch it.

-------------------------------------------------------------------------------
-- 7. Receipt-backed creation: the only callable creation path.
-------------------------------------------------------------------------------

create function public.create_group_v1(
  p_request_key uuid,
  p_payload jsonb
)
returns table(result text, group_id uuid, created_now boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_raw_name text;
  v_name text;
  v_occasion_type text;
  v_occasion_label text;
  v_date_text text;
  v_time_zone text;
  v_budget_text text;
  v_budget_amount_minor bigint;
  v_budget_currency text;
  v_mode text;
  v_occasion_at timestamptz;
  v_serial text;
  v_digest bytea;
  existing public.group_creation_receipts%rowtype;
  new_group_id uuid;
begin
  if caller_id is null
    or p_request_key is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  -- Canonical payload v1: the database normalizes and validates every value
  -- itself; client state is input, never authority.
  v_raw_name := p_payload ->> 'name';
  if v_raw_name is null then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  v_name := btrim(
    regexp_replace(
      normalize(v_raw_name, NFC),
      '[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+',
      ' ',
      'g'
    ),
    ' '
  );
  if v_name = '' or char_length(v_name) > 80 then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  v_occasion_type := p_payload ->> 'occasion_type';
  v_occasion_label := case v_occasion_type
    when 'diwali' then 'Diwali'
    when 'eid' then 'Eid'
    when 'birthday' then 'Birthday'
    when 'wedding' then 'Wedding'
    when 'housewarming' then 'Housewarming'
    when 'secret_santa' then 'Secret Santa'
    when 'other' then 'Something else'
  end;
  if v_occasion_label is null then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  v_date_text := p_payload ->> 'occasion_date';
  if v_date_text is null or v_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;
  begin
    v_occasion_at := v_date_text::date::timestamp at time zone (
      p_payload ->> 'time_zone'
    );
  exception
    when others then
      return query select 'invalid'::text, null::uuid, null::boolean;
      return;
  end;

  v_time_zone := p_payload ->> 'time_zone';
  if v_time_zone is null
    or char_length(v_time_zone) > 64
    or not exists (
      select 1 from pg_timezone_names where name = v_time_zone
    )
  then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  -- Re-derive the wall time now that the zone is known to be valid.
  v_occasion_at := (v_date_text::date)::timestamp at time zone v_time_zone;

  v_budget_text := p_payload ->> 'budget_amount_minor';
  if v_budget_text is null or v_budget_text !~ '^[0-9]+$' then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;
  begin
    v_budget_amount_minor := v_budget_text::numeric::bigint;
  exception
    when numeric_value_out_of_range then
      return query select 'invalid'::text, null::uuid, null::boolean;
      return;
  end;
  if v_budget_amount_minor < 1 then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  v_budget_currency := p_payload ->> 'budget_currency';
  if v_budget_currency not in ('INR', 'USD', 'GBP', 'EUR') then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  v_mode := p_payload ->> 'mode';
  if v_mode not in ('secret_draw', 'gift_everyone', 'wishlist_only') then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  if p_payload -> 'organizer_participating' is distinct from 'true'::jsonb then
    return query select 'invalid'::text, null::uuid, null::boolean;
    return;
  end if;

  -- The versioned deterministic serialization of canonical payload v1
  -- (explicit nulls included; the name cannot contain a newline after
  -- normalization). The digest is always recomputed here — never trusted
  -- from the client.
  v_serial := 'getmethis:create-group:v1' || chr(10)
    || 'name=' || v_name || chr(10)
    || 'occasion_type=' || v_occasion_type || chr(10)
    || 'occasion_date=' || v_date_text || chr(10)
    || 'time_zone=' || v_time_zone || chr(10)
    || 'location=' || chr(10)
    || 'description=' || chr(10)
    || 'budget_amount_minor=' || v_budget_amount_minor::text || chr(10)
    || 'budget_currency=' || v_budget_currency || chr(10)
    || 'mode=' || v_mode || chr(10);
  v_digest := extensions.digest(convert_to(v_serial, 'UTF8'), 'sha256');

  -- Concurrent same-key requests serialize on the receipt table's unique
  -- (actor_id, request_key) primary key: the first transaction's insert
  -- blocks every later same-key insert until it commits or rolls back.
  -- The receipt is inserted BEFORE the group so the same-key winner is
  -- decided here; creation only ever inserts new rows, so it cannot
  -- deadlock with the group-first lock order of the other functions.
  insert into public.group_creation_receipts (
    actor_id, request_key, contract_version, payload_digest, group_id
  )
  values (caller_id, p_request_key, 1, v_digest, null)
  on conflict (actor_id, request_key) do nothing;

  if not found then
    -- We lost the same-key race. The committed winner's receipt decides:
    -- same canonical payload replays, a changed payload conflicts.
    select * into existing
    from public.group_creation_receipts
    where actor_id = caller_id
      and request_key = p_request_key;

    if existing.contract_version = 1
      and existing.payload_digest = v_digest
    then
      return query select 'replayed'::text, existing.group_id, false;
    else
      return query select 'idempotency-conflict'::text, null::uuid, null::boolean;
    end if;
    return;
  end if;

  insert into public."groups" (
    name, occasion, occasion_at, time_zone, location, description,
    budget_amount_minor, budget_currency, mode, organizer_id
  )
  values (
    v_name, v_occasion_label, v_occasion_at, v_time_zone, null, null,
    v_budget_amount_minor, v_budget_currency, v_mode::public.group_mode, caller_id
  )
  returning id into new_group_id;

  -- Creating confirms participation: the organizer joins immediately.
  insert into public.group_members (
    group_id, user_id, status, participating, joined_at, membership_generation
  )
  values (
    new_group_id, caller_id, 'joined', true, clock_timestamp(), 1
  );

  update public.group_creation_receipts
  set group_id = new_group_id
  where actor_id = caller_id
    and request_key = p_request_key;

  perform private.append_group_event(
    caller_id, new_group_id, 'group_created', null, null, '{}'::jsonb
  );

  return query select 'created'::text, new_group_id, true;
end;
$$;

comment on function public.create_group_v1(uuid, jsonb) is
  'Receipt-backed canonical payload v1 creation: one group, joined participating organizer membership, receipt, and audit event per unique (actor, request key); same payload replays, a changed payload conflicts, all atomically.';

-------------------------------------------------------------------------------
-- 8. The organizer-only shareable-invitation state projection.
-------------------------------------------------------------------------------

create function public.group_shareable_invitation_state(p_group_id uuid)
returns table(invitation_version bigint, state text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
  v_row public.group_invitations%rowtype;
  v_checked_at timestamptz;
begin
  if p_group_id is null then
    return;
  end if;

  -- The group-first lock order keeps the projection consistent with issue
  -- and revoke; organizer authority is verified after the lock.
  select shareable_invitation_version into v_version
  from public."groups"
  where id = p_group_id
  for update;

  if not found or not private.is_group_organizer(p_group_id) then
    return;
  end if;

  v_checked_at := clock_timestamp();

  select *
  into v_row
  from public.group_invitations i
  where i.group_id = p_group_id
    and i.shareable_version is not null
  order by i.shareable_version desc
  limit 1;

  if not found then
    return query select v_version, 'never_issued'::text, null::timestamptz;
  elsif v_row.status = 'revoked' then
    return query select v_version, 'revoked'::text, null::timestamptz;
  elsif v_row.expires_at > v_checked_at then
    return query select v_version, 'active'::text, v_row.expires_at;
  else
    return query select v_version, 'issued_expired'::text, v_row.expires_at;
  end if;
end;
$$;

comment on function public.group_shareable_invitation_state(uuid) is
  'Organizer-only projection: exactly (invitation_version, state, expires_at) with state in never_issued/active/issued_expired/revoked; empty for everyone else. No invitation id, target, hash, use count, or token.';

-------------------------------------------------------------------------------
-- 9. Generic compare-and-swap issue and revoke.
-------------------------------------------------------------------------------

create function public.issue_group_invitation(
  p_group_id uuid,
  p_expected_invitation_version bigint
)
returns table(invitation_version bigint, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_current bigint;
  v_new bigint;
  v_checked_at timestamptz;
  v_token text;
  v_raw_token bytea;
  v_prior_id uuid;
  v_row public.group_invitations%rowtype;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if caller_id is null or p_group_id is null then
    return;
  end if;

  if p_expected_invitation_version is null
    or p_expected_invitation_version < 0
  then
    raise exception 'invalid_invitation_version' using errcode = '22023';
  end if;

  -- 1. Group lock first, organizer authority re-checked under the lock, and
  -- the durable version re-read under that lock.
  select shareable_invitation_version into v_current
  from public."groups"
  where id = p_group_id
  for update;

  if not found or not private.is_group_organizer(p_group_id) then
    return;
  end if;

  if p_expected_invitation_version <> v_current then
    raise exception 'stale_invitation_version' using errcode = 'PT409';
  end if;

  -- 2. Invitation locks in the 006a order.
  perform 1
  from public.group_invitations i
  where i.group_id = p_group_id
    and i.shareable_version is not null
  order by i.id
  for update;

  -- 3. The database clock is captured only after the locks.
  v_checked_at := clock_timestamp();
  v_expires_at := v_checked_at + interval '30 days';

  -- Revoke the prior generic row if its stored status is active, whether
  -- still usable or already expired. Targeted rows are never touched.
  for v_row in
    select *
    from public.group_invitations i
    where i.group_id = p_group_id
      and i.shareable_version is not null
      and i.status = 'active'
  loop
    update public.group_invitations
    set status = 'revoked'
    where id = v_row.id;
    v_prior_id := v_row.id;
  end loop;

  -- 4. The new version and row. A bigint overflow rejects and rolls back
  -- the whole operation.
  v_new := v_current + 1;

  loop
    v_raw_token := extensions.gen_random_bytes(32);
    v_token := left(translate(encode(v_raw_token, 'base64'), '+/', '-_'), 43);
    exit when right(v_token, 1) similar to '[AEIMQUYcgkosw048]';
  end loop;

  insert into public.group_invitations (
    group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
    target_user_id, target_membership_generation, shareable_version
  )
  values (
    p_group_id, caller_id, 'active',
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    v_expires_at, null, 0,
    null, null, v_new
  )
  returning id into v_invitation_id;

  update public."groups"
  set shareable_invitation_version = v_new
  where id = p_group_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'invitation_issued', v_invitation_id, null,
    jsonb_build_object('invitation_id', v_invitation_id)
  );
  if v_prior_id is not null then
    perform private.append_group_event(
      caller_id, p_group_id, 'invitation_revoked', v_prior_id, null,
      jsonb_build_object('invitation_id', v_prior_id)
    );
  end if;

  -- 5. Exactly the committed version, canonical token, and stored expiry.
  return query select v_new, v_token, v_expires_at;
end;
$$;

comment on function public.issue_group_invitation(uuid, bigint) is
  'Generic compare-and-swap issuance: the caller sends only the group id and the projected expected version; expiry is fixed by the database clock, no use limit exists, only the token digest persists, and one or two audit events record the change.';

create function public.revoke_group_invitation(
  p_group_id uuid,
  p_expected_invitation_version bigint
)
returns table(invitation_version bigint, revoked boolean, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_current bigint;
  v_new bigint;
  v_row public.group_invitations%rowtype;
begin
  if caller_id is null or p_group_id is null then
    return;
  end if;

  if p_expected_invitation_version is null
    or p_expected_invitation_version < 0
  then
    raise exception 'invalid_invitation_version' using errcode = '22023';
  end if;

  select shareable_invitation_version into v_current
  from public."groups"
  where id = p_group_id
  for update;

  if not found or not private.is_group_organizer(p_group_id) then
    return;
  end if;

  if p_expected_invitation_version <> v_current then
    raise exception 'stale_invitation_version' using errcode = 'PT409';
  end if;

  perform 1
  from public.group_invitations i
  where i.group_id = p_group_id
    and i.shareable_version is not null
  order by i.id
  for update;

  select *
  into v_row
  from public.group_invitations i
  where i.group_id = p_group_id
    and i.shareable_version = v_current
  for update;

  if found and v_row.status = 'active' then
    update public.group_invitations
    set status = 'revoked'
    where id = v_row.id;

    v_new := v_current + 1;
    update public."groups"
    set shareable_invitation_version = v_new
    where id = p_group_id;

    perform private.append_group_event(
      caller_id, p_group_id, 'invitation_revoked', v_row.id, null,
      jsonb_build_object('invitation_id', v_row.id)
    );

    return query select v_new, true, clock_timestamp();
  end if;

  return query select v_current, false, null::timestamptz;
end;
$$;

comment on function public.revoke_group_invitation(uuid, bigint) is
  'Generic compare-and-swap revocation: a stored-active generic row (including issued-but-expired) is revoked with exactly one version increment and audit event; with none, nothing changes and no event is written.';

-------------------------------------------------------------------------------
-- 10. The reshaped targeted overloads.
-------------------------------------------------------------------------------

-- The 006a targeted issue accepted caller-chosen expiry and use limits; 006b
-- fixes both inside the database.
drop function public.issue_group_invitation(uuid, timestamptz, integer, uuid);

create function public.issue_group_invitation(
  p_group_id uuid,
  p_target_user_id uuid
)
returns table(token text, expires_at timestamptz, target_membership_generation bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  checked_at timestamptz;
  raw_token bytea;
  token_text text;
  bound_generation integer;
  member_row public.group_members%rowtype;
  new_invitation_id uuid;
begin
  -- A targeted issue rejects a null target: the generic compare-and-swap
  -- overload is the only shareable-link path.
  if caller_id is null or p_group_id is null or p_target_user_id is null then
    return;
  end if;

  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return;
  end if;

  if not private.is_group_organizer(p_group_id) then
    return;
  end if;

  -- Bind the current target membership generation under the 006a locks.
  select *
  into member_row
  from public.group_members
  where group_id = p_group_id
    and user_id = p_target_user_id
  for update;

  if not found then
    insert into public.group_members (
      group_id, user_id, status, participating, invited_at, membership_generation
    )
    values (
      p_group_id, p_target_user_id, 'invited', false, clock_timestamp(), 1
    )
    returning * into member_row;
  else
    update public.group_members
    set membership_generation = membership_generation + 1,
        invited_at = clock_timestamp()
    where group_id = p_group_id
      and user_id = p_target_user_id
    returning * into member_row;
  end if;

  bound_generation := member_row.membership_generation;

  checked_at := clock_timestamp();

  loop
    raw_token := extensions.gen_random_bytes(32);
    token_text := left(translate(encode(raw_token, 'base64'), '+/', '-_'), 43);
    exit when right(token_text, 1) similar to '[AEIMQUYcgkosw048]';
  end loop;

  insert into public.group_invitations (
    group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
    target_user_id, target_membership_generation
  )
  values (
    p_group_id, caller_id, 'active',
    extensions.digest(convert_to(token_text, 'UTF8'), 'sha256'),
    checked_at + interval '30 days', 1, 0,
    p_target_user_id, bound_generation
  )
  returning id into new_invitation_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'member_reinvited', new_invitation_id, p_target_user_id,
    jsonb_build_object(
      'invitation_id', new_invitation_id,
      'target_user_id', p_target_user_id,
      'membership_generation', bound_generation
    )
  );

  return query select token_text, checked_at + interval '30 days', bound_generation;
exception
  when foreign_key_violation then
    -- The target user lost a deletion race; fail generically and atomically.
    return;
end;
$$;

comment on function public.issue_group_invitation(uuid, uuid) is
  'Targeted issuance with database-fixed semantics: 30-day expiry after locks, one-use limit, generation-bound token, returned exactly once. The caller cannot choose expiry or use limit.';

-- The targeted revoke-by-ID overload now refuses generic rows: the generic
-- compare-and-swap path can never be bypassed by invitation id.
create or replace function public.revoke_group_invitation(
  p_group_id uuid,
  p_invitation_id uuid
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  revoked_id uuid;
begin
  if caller_id is null or p_group_id is null or p_invitation_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  if not private.is_group_organizer(p_group_id) then
    return query select 'unavailable'::text;
    return;
  end if;

  update public.group_invitations
  set status = 'revoked'
  where id = p_invitation_id
    and group_id = p_group_id
    and status = 'active'
    and shareable_version is null
  returning id into revoked_id;

  if revoked_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  perform private.append_group_event(
    caller_id, p_group_id, 'invitation_revoked', revoked_id, null,
    jsonb_build_object('invitation_id', revoked_id)
  );

  return query select 'revoked'::text;
end;
$$;

comment on function public.revoke_group_invitation(uuid, uuid) is
  'Organizer-only targeted revocation by invitation id; generic (shareable) rows are refused so compare-and-swap can never be bypassed.';

-------------------------------------------------------------------------------
-- 11. Drop the receipt-less 006a creation path; exact privilege inventory.
-------------------------------------------------------------------------------

drop function public.create_group(
  text, text, timestamptz, text, text, text, bigint, text, text
);

-- Every public function: revoke default/inherited EXECUTE from all four
-- roles before the exact grants below.
revoke execute on function public.create_group_v1(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_shareable_invitation_state(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.issue_group_invitation(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke execute on function public.revoke_group_invitation(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke execute on function public.issue_group_invitation(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.revoke_group_invitation(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_group_v1(uuid, jsonb)
  to authenticated;
grant execute on function public.group_shareable_invitation_state(uuid)
  to authenticated;
grant execute on function public.issue_group_invitation(uuid, bigint)
  to authenticated;
grant execute on function public.revoke_group_invitation(uuid, bigint)
  to authenticated;
grant execute on function public.issue_group_invitation(uuid, uuid)
  to authenticated;
grant execute on function public.revoke_group_invitation(uuid, uuid)
  to authenticated;

-- No new table privileges: shareable_invitation_version and shareable_version
-- are absent from the existing column-limited groups grant, and
-- group_creation_receipts carries no grant at all (revoked above).

-- Rollback / forward-fix note: this migration is forward-only; any correction
-- ships as a NEW migration. The revert path, in dependency order, is: drop
-- the two generic compare-and-swap functions, the reshaped targeted issue
-- overload, the state projection, and create_group_v1; restore the 006a
-- create_group and 4-arg issue functions with their grants; drop the
-- receipt table, the new indexes and CHECK constraints, the group columns,
-- the actor equivalence check (restoring actor_id NOT NULL after deleting
-- the system-marked rows), and the extended metadata helper. Reverting
-- deletes the idempotency receipts and system audit rows irreversibly, so a
-- revert is a deliberate data-destroying gate, never a hotfix.
