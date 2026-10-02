-- 006c: invitation preview and authenticated acceptance (the continuation
-- boundary).
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/006c-invitation-preview-and-acceptance.md (approved
-- brief commit ca07b66). Never edit this file once it has been applied
-- anywhere; fix forward with a new migration (see supabase/README.md).
--
-- What this adds on top of 006a/006b:
--   * private.invitation_continuations: one row per raw-link opening (a
--     "flow"). Stores only digests and references — never a raw token,
--     token-hash duplicate, browser secret, plaintext email, or group
--     content. envelope_released_at bounds the browser's live-cookie
--     inventory (at most eight unreleased envelopes per coordinator).
--   * private.invitation_coordinators: one row per browser that has opened
--     an invitation. Holds only the coordinator-secret digest, the session
--     epoch (a compare-and-swap version, never a session credential), the
--     one-use bootstrap lease, and the invitation-auth mutation lease
--     (idle/acquired/delivery_pending) with its delivery-nonce digest and
--     expected provider user id.
--   * private.invitation_pending_starts: bounded 30-second one-use records
--     that let a token-free bootstrap step begin the first flow without any
--     raw token re-entering the URL.
--   * Public SECURITY DEFINER functions: continuation begin (raw-token and
--     pending-start forms), the seven-field flow preview, requested-email
--     binding, session-derived verification/reconciliation, the minimal
--     verified/accepted state projection, continuation-bound acceptance
--     (reusing the reviewed private 006a acceptance core), explicit
--     discard, authoritative-inventory logout invalidation/release, and the
--     auth-mutation lease/acknowledge/recover operations.
--   * The direct raw-token acceptance entry point public.accept_group_
--     invitation(text) is moved behind private.accept_invitation_core and
--     its client EXECUTE is REVOKED from anon, authenticated, service_role,
--     and PUBLIC: application roles can accept only through the
--     continuation-bound function, which enforces the requested-email,
--     verified-user, and completed-profile gates the raw entry point skips.
--   * The raw-token PREVIEW entry point public.preview_group_invitation(text)
--     remains anon-callable: the initial landing handler validates a bearer
--     token before it creates a continuation. It never consumes a use or
--     creates membership.
--
-- Locking discipline (006a order preserved):
--   * Acceptance: resolve the group without a lock, lock the groups row,
--     then the invitation, then (only after those) the continuation row.
--   * Logout invalidation locks only coordinator + continuation rows and
--     never later requests a group or invitation lock.
--   * Begin/creation take the coordinator row lock; the begin path's
--     invitation eligibility check never takes a group lock.
--
-- Secrecy: every digest is SHA-256 via pgcrypto; the requested-email
-- binding is HMAC-SHA256(lower(trim(email)), browser_secret) with the
-- high-entropy browser secret as the key. No column, function result, or
-- audit row ever carries secret or user-content material.

-------------------------------------------------------------------------------
-- 1. Private tables.
-------------------------------------------------------------------------------

-- One row per browser that has opened an invitation. Only digests and
-- lease/epoch state; never a secret, token, email, or group value.
create table private.invitation_coordinators (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 of the browser's fixed coordinator secret (canonical base64url).
  coordinator_digest bytea not null unique
    check (octet_length(coordinator_digest) = 32),
  -- Compare-and-swap version for auth-mutation leases; never a credential.
  session_epoch bigint not null default 0
    check (session_epoch >= 0),
  -- One-use 15-second bootstrap lease (digest of the lease secret).
  bootstrap_lease_digest bytea
    check (octet_length(bootstrap_lease_digest) = 32),
  bootstrap_lease_expires_at timestamptz,
  auth_mutation_state text not null default 'idle'
    check (auth_mutation_state in ('idle', 'acquired', 'delivery_pending')),
  auth_mutation_kind text
    check (auth_mutation_kind in
      ('otp_verify', 'magic_link_verify', 'refresh', 'logout', 'account_replace')),
  auth_mutation_identifier uuid,
  auth_mutation_expires_at timestamptz,
  -- Digest of the sealed one-use delivery nonce presented by the
  -- acknowledgement POST.
  delivery_nonce_digest bytea
    check (octet_length(delivery_nonce_digest) = 32),
  expected_provider_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- The continuation rows. No RLS policy and no client grant is ever created:
-- only the definer functions below touch this table.
create table private.invitation_continuations (
  flow_id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.group_invitations (id) on delete restrict,
  coordinator_id uuid not null references private.invitation_coordinators (id) on delete restrict,
  -- SHA-256 of the flow's 32-byte browser secret (canonical base64url text).
  browser_secret_digest bytea not null
    check (octet_length(browser_secret_digest) = 32),
  -- HMAC-SHA256(lower(trim(email)), browser_secret), 32 bytes, once bound.
  email_binding_digest bytea
    check (octet_length(email_binding_digest) = 32),
  -- Set only by session-derived verification; never caller-supplied.
  verified_user_id uuid references auth.users (id) on delete restrict,
  began_authenticated boolean not null default false,
  revision integer not null default 1
    check (revision >= 1),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invalidated_at timestamptz,
  -- Null while the browser holds a live envelope cookie; the bounded
  -- unreleased inventory per coordinator is what the eight-envelope cap
  -- counts, and what confirmed logout releases in full.
  envelope_released_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  -- An accepted row is never invalidated: accepted envelopes stay usable
  -- for joined reload until expiry or confirmed logout, which releases them
  -- without invalidation.
  constraint invitation_continuations_accepted_not_invalidated check (
    accepted_at is null or invalidated_at is null
  )
);

create index invitation_continuations_coordinator_idx
  on private.invitation_continuations (coordinator_id)
  where envelope_released_at is null;
create index invitation_continuations_expiry_idx
  on private.invitation_continuations (expires_at)
  where accepted_at is null;

-- Bounded 30-second one-use pending starts for the token-free bootstrap.
create table private.invitation_pending_starts (
  start_id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.group_invitations (id) on delete restrict,
  nonce_digest bytea not null check (octet_length(nonce_digest) = 32),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index invitation_pending_starts_expiry_idx
  on private.invitation_pending_starts (expires_at)
  where consumed_at is null;

-------------------------------------------------------------------------------
-- 2. Shared private helpers.
-------------------------------------------------------------------------------

create function private.invitation_digest(p_secret text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256')
$$;

comment on function private.invitation_digest(text) is
  'The only digest form used for browser secrets, coordinator secrets, leases, and nonces: SHA-256 of the canonical text.';

create function private.invitation_email_binding(
  p_email text,
  p_browser_secret text
)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.hmac(
    convert_to(lower(trim(p_email)), 'UTF8'),
    convert_to(p_browser_secret, 'UTF8'),
    'sha256'
  )
$$;

comment on function private.invitation_email_binding(text, text) is
  'The requested-email binding: HMAC-SHA256 of the normalized email keyed by the high-entropy browser secret. Plaintext email is never stored.';

create function private.invitation_email_is_valid(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
    and char_length(p_email) <= 254
    and p_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
$$;

comment on function private.invitation_email_is_valid(text) is
  'Bounded provider-compatible email shape check for the requested-email binding.';

create function private.invitation_is_live(
  p_status public.group_invitation_status,
  p_expires_at timestamptz,
  p_max_uses integer,
  p_use_count integer,
  p_checked_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status = 'active'
    and p_expires_at > p_checked_at
    and (p_max_uses is null or p_use_count < p_max_uses)
$$;

comment on function private.invitation_is_live(public.group_invitation_status, timestamptz, integer, integer, timestamptz) is
  'The single liveness predicate shared by preview, begin, and acceptance: active, unexpired at the caller-supplied post-lock clock read, and under any use limit.';

-------------------------------------------------------------------------------
-- 3. The reviewed 006a acceptance core, moved behind the private schema.
--
-- Same guarantees as the 006a public function (caller derived from
-- auth.uid(), group-first lock order, after-lock clock_timestamp() expiry
-- checks, sticky removal, replay and already_joined semantics), exposed as
-- (actor, invitation) so both the legacy wrapper and the 006c
-- continuation-bound acceptance share one reviewed implementation.
-------------------------------------------------------------------------------

create function private.accept_invitation_core(
  p_actor_id uuid,
  p_invitation_id uuid
)
returns table(result text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_group_id uuid;
  inv public.group_invitations%rowtype;
  member_row public.group_members%rowtype;
  member_found boolean;
  prior_use public.group_invitation_uses%rowtype;
  use_found boolean;
  checked_at timestamptz;
  targeted_ok boolean;
  reached_generation integer;
begin
  if p_actor_id is null or p_invitation_id is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Resolve the invitation's group from its id without taking a row lock.
  select i.group_id
    into resolved_group_id
  from public.group_invitations i
  where i.id = p_invitation_id;

  if resolved_group_id is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Fixed lock order: the group row first.
  if not exists (
    select 1 from public."groups" g where g.id = resolved_group_id for update
  ) then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Lock the invitation and re-read it.
  select *
    into inv
  from public.group_invitations i
  where i.id = p_invitation_id
    and i.group_id = resolved_group_id
  for update;

  if not found then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Lock the caller's membership row, then check a prior use after locks.
  select *
    into member_row
  from public.group_members m
  where m.group_id = resolved_group_id
    and m.user_id = p_actor_id
  for update;

  member_found := found;

  select *
    into prior_use
  from public.group_invitation_uses u
  where u.invitation_id = inv.id
    and u.user_id = p_actor_id;

  use_found := found;

  if use_found then
    if member_found
      and member_row.status = 'joined'
      and member_row.membership_generation = prior_use.membership_generation
    then
      return query select 'replayed'::text, resolved_group_id;
    else
      return query select 'unavailable'::text, null::uuid;
    end if;
    return;
  end if;

  -- Fresh wall-clock time, evaluated only after the group and invitation
  -- locks are held and the invitation has been re-read.
  checked_at := clock_timestamp();

  if not private.invitation_is_live(
    inv.status, inv.expires_at, inv.max_uses, inv.use_count, checked_at
  ) then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  targeted_ok := true;

  if inv.target_user_id is not null then
    targeted_ok := inv.target_user_id = p_actor_id
      and member_found
      and member_row.membership_generation = inv.target_membership_generation;

    if not targeted_ok then
      return query select 'unavailable'::text, null::uuid;
      return;
    end if;
  end if;

  if member_found then
    if member_row.status = 'joined' then
      return query select 'already_joined'::text, resolved_group_id;
      return;
    end if;

    if member_row.status = 'removed' and inv.target_user_id is null then
      return query select 'unavailable'::text, null::uuid;
      return;
    end if;
  end if;

  if member_found then
    update public.group_members
    set status = 'joined',
        participating = true,
        joined_at = clock_timestamp(),
        left_at = null,
        membership_generation = membership_generation + 1
    where public.group_members.group_id = resolved_group_id
      and public.group_members.user_id = p_actor_id
    returning membership_generation into reached_generation;
  else
    insert into public.group_members (
      group_id, user_id, status, participating, joined_at, membership_generation
    )
    values (
      resolved_group_id, p_actor_id, 'joined', true, clock_timestamp(), 1
    )
    returning membership_generation into reached_generation;
  end if;

  insert into public.group_invitation_uses (invitation_id, user_id, membership_generation)
  values (inv.id, p_actor_id, reached_generation);

  update public.group_invitations
  set use_count = use_count + 1
  where id = inv.id;

  perform private.append_group_event(
    p_actor_id, resolved_group_id, 'invitation_accepted', inv.id, p_actor_id,
    jsonb_build_object('invitation_id', inv.id, 'membership_generation', reached_generation)
  );

  return query select 'joined'::text, resolved_group_id;
exception
  when foreign_key_violation or unique_violation then
    return query select 'unavailable'::text, null::uuid;
end;
$$;

comment on function private.accept_invitation_core(uuid, uuid) is
  'The reviewed 006a acceptance core over (actor, invitation): group-first lock order, after-lock clock checks, one use row and count increment, one audit event, atomic. Callers must have resolved the invitation from their own credential form.';

-- The legacy raw-token entry point becomes a thin wrapper over the core and
-- is no longer executable by any application role (revocations in section 8).
create or replace function public.accept_group_invitation(p_token text)
returns table(result text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_invitation_id uuid;
begin
  if caller_id is null
    or p_token is null
    or not private.token_is_canonical(p_token)
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  select i.id into v_invitation_id
  from public.group_invitations i
  where i.token_hash = private.invitation_digest(p_token);

  if v_invitation_id is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  return query select *
  from private.accept_invitation_core(caller_id, v_invitation_id);
end;
$$;

comment on function public.accept_group_invitation(text) is
  'Superseded raw-token entry point: thin wrapper over the private core, kept so the 006a semantics have exactly one implementation. Client EXECUTE is revoked (006c); only the continuation-bound acceptance is callable.';

-------------------------------------------------------------------------------
-- 4. Continuation lifecycle functions.
-------------------------------------------------------------------------------

-- The raw landing handler's pending-start creation: resolves the invitation
-- reference from the canonical token server-side. The caller never supplies
-- an invitation id. No liveness shortcut: begin rechecks liveness.
create function public.create_group_invitation_pending_start(
  p_token text,
  p_nonce text
)
returns table(start_id uuid, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  insert into private.invitation_pending_starts (invitation_id, nonce_digest, expires_at)
  select i.id, private.invitation_digest(p_nonce), clock_timestamp() + interval '30 seconds'
  from public.group_invitations i
  where private.token_is_canonical(p_token)
    and i.token_hash = private.invitation_digest(p_token)
  returning start_id, expires_at
$$;

comment on function public.create_group_invitation_pending_start(text, text) is
  'Creates the bounded one-use pending start for the token-free bootstrap: the invitation reference is resolved server-side from the token, and the nonce digest is stored. Empty for an unknown or malformed token.';

-- Opportunistic bounded cleanup: expired, unaccepted, already-released or
-- invalidated rows only. Never touches accepted history, invitation uses,
-- or audit rows.
create function private.invitation_cleanup_expired()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.invitation_continuations
  where flow_id in (
    select c.flow_id
    from private.invitation_continuations c
    where c.accepted_at is null
      and c.expires_at <= clock_timestamp()
      and (c.envelope_released_at is not null or c.invalidated_at is not null)
    order by c.expires_at
    limit 32
  );

  delete from private.invitation_pending_starts
  where start_id in (
    select s.start_id
    from private.invitation_pending_starts s
    where s.expires_at <= clock_timestamp()
    order by s.expires_at
    limit 32
  );
end;
$$;

comment on function private.invitation_cleanup_expired() is
  'Bounded opportunistic cleanup of expired terminal rows; finite limits, no accepted history, no uses, no audit rows.';

-- The validated insert shared by both begin forms.
create function private.invitation_begin_validated(
  p_invitation_id uuid,
  p_coordinator_row private.invitation_coordinators,
  p_browser_secret text
)
returns table(flow_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_user_email text;
  v_email_binding bytea;
  v_verified_user uuid;
  v_began_authenticated boolean := false;
  v_checked_at timestamptz;
  inv public.group_invitations%rowtype;
  new_flow_id uuid;
  v_expiry timestamptz;
  v_unreleased integer;
begin
  -- The browser secret must be canonical 32-byte base64url text.
  if not private.token_is_canonical(p_browser_secret) then
    return;
  end if;

  select * into inv from public.group_invitations
  where id = p_invitation_id;

  if not found then
    return;
  end if;

  v_checked_at := clock_timestamp();

  if not private.invitation_is_live(
    inv.status, inv.expires_at, inv.max_uses, inv.use_count, v_checked_at
  ) then
    return;
  end if;

  -- A signed-in beginner is bound by the database, never by caller input:
  -- the same transaction derives the canonical email and user id from the
  -- verified session.
  if caller_id is not null then
    select u.email into v_user_email
    from auth.users u
    where u.id = caller_id;

    if v_user_email is not null then
      v_email_binding := private.invitation_email_binding(v_user_email, p_browser_secret);
      v_verified_user := caller_id;
      v_began_authenticated := true;
    end if;
  end if;

  -- Release expired envelopes and count again under the coordinator lock
  -- already held by the caller. The eight-envelope cap includes accepted
  -- flows; a full inventory refuses creation without evicting.
  update private.invitation_continuations
  set envelope_released_at = clock_timestamp()
  where coordinator_id = p_coordinator_row.id
    and envelope_released_at is null
    and accepted_at is null
    and invitation_continuations.expires_at <= clock_timestamp();

  select count(*)::integer into v_unreleased
  from private.invitation_continuations
  where coordinator_id = p_coordinator_row.id
    and envelope_released_at is null;

  if v_unreleased >= 8 then
    return;
  end if;

  v_expiry := least(v_checked_at + interval '3600 seconds', inv.expires_at);

  insert into private.invitation_continuations (
    invitation_id, coordinator_id, browser_secret_digest,
    email_binding_digest, verified_user_id, began_authenticated, expires_at
  )
  values (
    inv.id, p_coordinator_row.id, private.invitation_digest(p_browser_secret),
    v_email_binding, v_verified_user, v_began_authenticated, v_expiry
  )
  returning id into new_flow_id;

  perform private.invitation_cleanup_expired();

  return query select new_flow_id, v_expiry;
end;
$$;

comment on function private.invitation_begin_validated(uuid, private.invitation_coordinators, text) is
  'Shared continuation insert: canonical browser secret, live invitation, at-most-eight unreleased envelopes under the held coordinator lock, session-derived identity binding when signed in. Returns only the flow id and expiry.';

-- Begin from the raw token (later flows: the established coordinator is
-- presented directly). Callable by anon and authenticated.
create function public.begin_group_invitation_flow(
  p_token text,
  p_browser_secret text,
  p_coordinator_secret text
)
returns table(flow_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
  inv_id uuid;
begin
  if p_token is null
    or not private.token_is_canonical(p_token)
    or p_coordinator_secret is null
  then
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found then
    return;
  end if;

  select i.id into inv_id
  from public.group_invitations i
  where i.token_hash = private.invitation_digest(p_token);

  if inv_id is null then
    return;
  end if;

  return query select *
  from private.invitation_begin_validated(inv_id, coordinator_row, p_browser_secret);
end;
$$;

comment on function public.begin_group_invitation_flow(text, text, text) is
  'Continuation begin from a raw token plus browser and coordinator proofs: locks the coordinator inventory, enforces the eight-envelope cap, checks invitation liveness, stores digests only, and returns only the flow id and expiry. No row for any invalid cause.';

-- Begin from a consumed-once pending start: the invitation reference is
-- already stored server-side, and the pending nonce proves the bounded
-- token-free bootstrap. Callable by anon and authenticated.
create function public.begin_group_invitation_flow_from_start(
  p_start_id uuid,
  p_browser_secret text,
  p_pending_nonce text,
  p_coordinator_secret text
)
returns table(flow_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
  pending_row private.invitation_pending_starts%rowtype;
begin
  if p_start_id is null
    or p_pending_nonce is null
    or p_coordinator_secret is null
  then
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found then
    return;
  end if;

  -- One-use consumption under the coordinator lock: an expired, replayed,
  -- or already-consumed start begins nothing.
  update private.invitation_pending_starts
  set consumed_at = clock_timestamp()
  where start_id = p_start_id
    and consumed_at is null
    and invitation_pending_starts.expires_at > clock_timestamp()
    and nonce_digest = private.invitation_digest(p_pending_nonce)
  returning * into pending_row;

  if not found then
    return;
  end if;

  return query select *
  from private.invitation_begin_validated(
    pending_row.invitation_id, coordinator_row, p_browser_secret
  );
end;
$$;

comment on function public.begin_group_invitation_flow_from_start(uuid, text, text, text) is
  'Continuation begin from a one-use pending start: consumes the start once under the coordinator lock, resolves the stored invitation reference (never caller-supplied), and repeats the same liveness and inventory checks.';

-- The seven-field preview through a valid flow. Empty for every invalid
-- cause; no write, no use, no extension.
create function public.preview_group_invitation_flow(
  p_flow_id uuid,
  p_browser_secret text
)
returns table(
  host_display_name text,
  group_name text,
  occasion_at timestamptz,
  budget_amount_minor bigint,
  budget_currency char(3),
  mode text,
  joined_member_count integer
)
language sql
security definer
set search_path = ''
as $$
  select
    coalesce(pr.display_name, 'Organizer'),
    g.name,
    g.occasion_at,
    g.budget_amount_minor,
    g.budget_currency,
    g.mode::text,
    (
      select count(*)::integer
      from public.group_members m
      where m.group_id = g.id
        and m.status = 'joined'
    )
  from private.invitation_continuations c
  join public.group_invitations i on i.id = c.invitation_id
  join public."groups" g on g.id = i.group_id
  left join public.profiles pr on pr.id = g.organizer_id
  where c.flow_id = p_flow_id
    and c.browser_secret_digest = private.invitation_digest(p_browser_secret)
    and c.invalidated_at is null
    and c.accepted_at is null
    and c.expires_at > clock_timestamp()
    and private.invitation_is_live(
      i.status, i.expires_at, i.max_uses, i.use_count, clock_timestamp()
    )
$$;

comment on function public.preview_group_invitation_flow(uuid, text) is
  'The seven approved preview fields through a valid flow and browser secret; the same empty result for every invalid, invalidated, expired, or non-live cause, with no side effects.';

-- Bind the requested email once. Same normalized email replays idempotently;
-- a different email is a restart and changes nothing.
create function public.bind_group_invitation_flow_email(
  p_flow_id uuid,
  p_browser_secret text,
  p_email text
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c private.invitation_continuations%rowtype;
  v_binding bytea;
begin
  if p_flow_id is null
    or not private.token_is_canonical(p_browser_secret)
    or not private.invitation_email_is_valid(p_email)
  then
    return query select 'unavailable'::text;
    return;
  end if;

  select * into c
  from private.invitation_continuations
  where flow_id = p_flow_id
    and browser_secret_digest = private.invitation_digest(p_browser_secret)
    and invalidated_at is null
    and expires_at > clock_timestamp()
  for update;

  if not found then
    return query select 'unavailable'::text;
    return;
  end if;

  v_binding := private.invitation_email_binding(p_email, p_browser_secret);

  if c.email_binding_digest is not null then
    if c.email_binding_digest = v_binding then
      return query select 'bound'::text;
    else
      return query select 'restart'::text;
    end if;
    return;
  end if;

  update private.invitation_continuations
  set email_binding_digest = v_binding,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where flow_id = c.flow_id;

  return query select 'bound'::text;
end;
$$;

comment on function public.bind_group_invitation_flow_email(uuid, text, text) is
  'One requested-email binding per flow: first valid binding wins, the same normalized email replays, a different email returns the generic restart result and changes nothing. Plaintext email is never stored.';

-- Session-derived verification and idempotent reconciliation: the user and
-- canonical email come only from the verified Supabase session.
create function public.verify_group_invitation_flow(
  p_flow_id uuid,
  p_browser_secret text
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  c private.invitation_continuations%rowtype;
  v_user_email text;
  v_binding bytea;
begin
  if caller_id is null
    or p_flow_id is null
    or not private.token_is_canonical(p_browser_secret)
  then
    return query select 'restart'::text;
    return;
  end if;

  select * into c
  from private.invitation_continuations
  where flow_id = p_flow_id
    and browser_secret_digest = private.invitation_digest(p_browser_secret)
    and invalidated_at is null
    and expires_at > clock_timestamp()
  for update;

  if not found then
    return query select 'restart'::text;
    return;
  end if;

  select u.email into v_user_email
  from auth.users u
  where u.id = caller_id;

  if v_user_email is null then
    return query select 'restart'::text;
    return;
  end if;

  v_binding := private.invitation_email_binding(v_user_email, p_browser_secret);

  -- The session email must match the requested-email binding; a null
  -- binding (sign-in shortcut only) is never verifiable through this path.
  if c.email_binding_digest is null
    or c.email_binding_digest <> v_binding
  then
    return query select 'restart'::text;
    return;
  end if;

  if c.verified_user_id is not null and c.verified_user_id <> caller_id then
    return query select 'restart'::text;
    return;
  end if;

  if c.verified_user_id is null then
    update private.invitation_continuations
    set verified_user_id = caller_id,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where flow_id = c.flow_id;
  end if;

  return query select 'verified'::text;
end;
$$;

comment on function public.verify_group_invitation_flow(uuid, text) is
  'Authenticated-only verification and reconciliation: the provider-verified session user and email are derived server-side, compared against the requested-email binding, and bound idempotently. Every mismatch, expiry, or missing proof returns the same restart result.';

-- The minimal authenticated continuation-state projection. The
-- began_authenticated start-state flag is exposed only to the verified
-- user, solely to source the one approved `invite_accepted` analytics
-- property (was_authenticated).
create function public.group_invitation_flow_state(
  p_flow_id uuid,
  p_browser_secret text
)
returns table(state text, group_id uuid, began_authenticated boolean)
language sql
security definer
set search_path = ''
as $$
  select
    case when c.accepted_at is not null then 'accepted' else 'verified' end::text,
    case
      when c.accepted_at is not null
        and exists (
          select 1 from public.group_members m
          where m.group_id = i.group_id
            and m.user_id = c.verified_user_id
            and m.status = 'joined'
        )
      then i.group_id
      else null
    end,
    c.began_authenticated
  from private.invitation_continuations c
  join public.group_invitations i on i.id = c.invitation_id
  where c.flow_id = p_flow_id
    and c.browser_secret_digest = private.invitation_digest(p_browser_secret)
    and c.invalidated_at is null
    and c.verified_user_id = auth.uid()
    and (c.accepted_at is null or c.expires_at > clock_timestamp())
$$;

comment on function public.group_invitation_flow_state(uuid, text) is
  'Minimal verified/accepted continuation state for the session-derived verified user; group_id appears only after that same user joined, and began_authenticated only sources the approved was_authenticated analytics property. No email, invitation id, target, generation, revision, or audit data.';

-- Continuation-bound acceptance. Authenticated only; the actor, email, and
-- completion state are derived server-side inside the transaction.
create function public.accept_group_invitation_flow(
  p_flow_id uuid,
  p_browser_secret text
)
returns table(result text, group_id uuid, accepted_now boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  c private.invitation_continuations%rowtype;
  core_result text;
  core_group_id uuid;
  v_invitation_id uuid;
  v_display_name text;
  inv public.group_invitations%rowtype;
begin
  if caller_id is null
    or p_flow_id is null
    or not private.token_is_canonical(p_browser_secret)
  then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  select * into c
  from private.invitation_continuations
  where flow_id = p_flow_id;

  if not found
    or c.browser_secret_digest <> private.invitation_digest(p_browser_secret)
    or c.verified_user_id is null
    or c.verified_user_id <> caller_id
  then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  -- An already-accepted continuation is fully write-free: reload, back
  -- navigation, and lost responses reconcile to the same success.
  if c.accepted_at is not null then
    select i.group_id into core_group_id
    from public.group_invitations i
    where i.id = c.invitation_id;
    return query select 'replayed'::text, core_group_id, false;
    return;
  end if;

  if c.invalidated_at is not null
    or c.expires_at <= clock_timestamp()
  then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  -- Profile completeness is rechecked from profiles inside the transaction.
  select display_name into v_display_name
  from public.profiles
  where id = caller_id;

  if v_display_name is null or btrim(v_display_name) = '' then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  -- The requested-email binding must still match the session's canonical
  -- email under this flow's browser secret.
  select u.email into v_display_name
  from auth.users u
  where u.id = caller_id;

  if v_display_name is null
    or c.email_binding_digest is null
    or c.email_binding_digest
      <> private.invitation_email_binding(v_display_name, p_browser_secret)
  then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  v_invitation_id := c.invitation_id;

  -- The core takes the group then invitation locks in the 006a order; the
  -- continuation lock is taken only afterwards (below), so the shared
  -- continuation lock is downstream of the group/invitation locks exactly
  -- as the brief requires.
  select core.result::text, core.group_id::uuid into core_result, core_group_id
  from private.accept_invitation_core(caller_id, v_invitation_id) core;

  if core_result = 'unavailable' then
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  if core_result = 'already_joined' then
    -- A joined user with no use of this token: write-free denial of the
    -- acceptance effects, no continuation or invitation write.
    return query select 'already_joined'::text, core_group_id, false;
    return;
  end if;

  -- core_result in ('joined', 'replayed'): the continuation may now be
  -- marked accepted. For a replay through a second independent flow this is
  -- the continuation-only reconciliation, and it remains a live-invitation
  -- acceptance: recheck the invitation under the still-held locks.
  select * into inv
  from public.group_invitations i
  where i.id = v_invitation_id;

  if not private.invitation_is_live(
    inv.status, inv.expires_at, inv.max_uses, inv.use_count, clock_timestamp()
  ) then
    -- A first acceptance cannot have returned joined for a non-live
    -- invitation; only the replay path can reach this branch.
    return query select 'unavailable'::text, null::uuid, null::boolean;
    return;
  end if;

  -- Lock the continuation last and recheck every binding after locks.
  select * into c
  from private.invitation_continuations
  where flow_id = p_flow_id
  for update;

  if not found
    or c.accepted_at is not null
    or c.invalidated_at is not null
    or c.expires_at <= clock_timestamp()
    or c.verified_user_id is null
    or c.verified_user_id <> caller_id
    or c.browser_secret_digest <> private.invitation_digest(p_browser_secret)
  then
    -- Lost a concurrent invalidation or logout race: the core's membership,
    -- use, and audit writes made above must NOT commit. Raising here rolls
    -- the entire transaction back atomically — a waiting acceptance that
    -- observes invalidation commits no partial effect.
    raise exception 'invitation_acceptance_lost_race' using errcode = '40001';
  end if;

  update private.invitation_continuations
  set accepted_at = clock_timestamp(),
      revision = revision + 1,
      updated_at = clock_timestamp()
  where flow_id = p_flow_id;

  return query select core_result, core_group_id, core_result = 'joined';
end;
$$;

comment on function public.accept_group_invitation_flow(uuid, text) is
  'Continuation-bound atomic acceptance: group/invitation locks first via the reviewed core, continuation lock last; the requested-email, verified-user, and completed-profile gates are rechecked inside the transaction; replay and already_joined are write-free; only a new core acceptance returns accepted_now.';

-- Explicit discard of one unaccepted flow: proves the coordinator and that
-- flow's browser secret, and releases only that envelope.
create function public.discard_group_invitation_flow(
  p_flow_id uuid,
  p_browser_secret text,
  p_coordinator_secret text
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_flow_id uuid;
begin
  if p_flow_id is null
    or not private.token_is_canonical(p_browser_secret)
    or p_coordinator_secret is null
  then
    return query select 'unavailable'::text;
    return;
  end if;

  update private.invitation_continuations c
  set invalidated_at = clock_timestamp(),
      envelope_released_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where c.flow_id = p_flow_id
    and c.accepted_at is null
    and c.envelope_released_at is null
    and c.browser_secret_digest = private.invitation_digest(p_browser_secret)
    and c.coordinator_id in (
      select k.id
      from private.invitation_coordinators k
      where k.coordinator_digest = private.invitation_digest(p_coordinator_secret)
    )
  returning c.flow_id into v_flow_id;

  if v_flow_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  return query select 'discarded'::text;
end;
$$;

comment on function public.discard_group_invitation_flow(uuid, text, text) is
  'Confirmed discard: coordinator-plus-browser-proven invalidation and release of one unaccepted flow envelope; nothing else is touched.';

-- Confirmed-logout invalidation: derives the authoritative unreleased
-- inventory, locks every row in it, verifies every supplied cookie belongs
-- to that inventory, invalidates every active unaccepted row, and releases
-- every envelope in one transaction. Locks only continuation rows — never a
-- group or invitation lock afterwards.
create function public.invalidate_group_invitation_flows_for_logout(
  p_flow_ids uuid[],
  p_browser_secrets text[],
  p_coordinator_secret text
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
  v_supplied integer;
  v_distinct integer;
  v_entry record;
begin
  if p_flow_ids is null
    or p_browser_secrets is null
    or p_coordinator_secret is null
    or array_length(p_flow_ids, 1) is null
    or array_length(p_flow_ids, 1) <> array_length(p_browser_secrets, 1)
  then
    return query select 'unavailable'::text;
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found then
    return query select 'unavailable'::text;
    return;
  end if;

  -- Duplicates or more than the capped inventory size are refused outright.
  v_supplied := array_length(p_flow_ids, 1);
  select count(distinct f) into v_distinct from unnest(p_flow_ids) as f;
  if v_distinct <> v_supplied or v_supplied > 8 then
    return query select 'unavailable'::text;
    return;
  end if;

  -- Sort and lock the authoritative inventory (in flow_id order).
  for v_entry in
    select c.flow_id, c.browser_secret_digest
    from private.invitation_continuations c
    where c.coordinator_id = coordinator_row.id
      and c.envelope_released_at is null
    order by c.flow_id
    for update
  loop
    -- Locked; validation of the browser-supplied entries follows.
    null;
  end loop;

  -- Every supplied entry must belong to the inventory and verify against
  -- its stored browser-secret digest; any extra, duplicate, or unverified
  -- entry rolls the whole operation back.
  for v_index in 1..v_supplied
  loop
    if not exists (
      select 1
      from private.invitation_continuations c
      where c.coordinator_id = coordinator_row.id
        and c.flow_id = p_flow_ids[v_index]
        and c.envelope_released_at is null
        and c.browser_secret_digest
          = private.invitation_digest(p_browser_secrets[v_index])
    ) then
      return query select 'unavailable'::text;
      return;
    end if;
  end loop;

  -- Invalidate every active unaccepted row; release every envelope.
  update private.invitation_continuations c
  set invalidated_at = case
        when c.accepted_at is null and c.invalidated_at is null
          then clock_timestamp()
        else c.invalidated_at
      end,
      envelope_released_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where c.coordinator_id = coordinator_row.id
    and c.envelope_released_at is null;

  return query select 'invalidated'::text;
end;
$$;

comment on function public.invalidate_group_invitation_flows_for_logout(uuid[], text[], text) is
  'Confirmed-logout cleanup: authoritative unreleased inventory, per-row verification of every supplied cookie, atomic invalidation of unaccepted rows and release of every envelope. Locks only continuation rows.';

-------------------------------------------------------------------------------
-- 5. Auth-mutation lease operations (session epoch compare-and-swap).
-------------------------------------------------------------------------------

create function public.acquire_group_invitation_auth_lease(
  p_coordinator_secret text,
  p_expected_epoch bigint,
  p_kind text
)
returns table(result text, session_epoch bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
begin
  if p_coordinator_secret is null
    or p_expected_epoch is null
    or p_expected_epoch < 0
    or p_kind not in
      ('otp_verify', 'magic_link_verify', 'refresh', 'logout', 'account_replace')
  then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  -- A held lease (acquired, or delivery_pending that has not expired)
  -- blocks every competing mutation. delivery_pending never silently
  -- expires into permission for a competing mutation; only acknowledgement
  -- or explicit recovery resolves it.
  if coordinator_row.auth_mutation_state = 'acquired'
    or (
      coordinator_row.auth_mutation_state = 'delivery_pending'
      and (coordinator_row.auth_mutation_expires_at is null
        or coordinator_row.auth_mutation_expires_at > clock_timestamp())
    )
  then
    return query select 'blocked'::text, coordinator_row.session_epoch;
    return;
  end if;

  if coordinator_row.session_epoch <> p_expected_epoch then
    return query select 'epoch'::text, coordinator_row.session_epoch;
    return;
  end if;

  update private.invitation_coordinators
  set auth_mutation_state = 'acquired',
      auth_mutation_kind = p_kind,
      auth_mutation_identifier = gen_random_uuid(),
      auth_mutation_expires_at = clock_timestamp() + interval '120 seconds',
      delivery_nonce_digest = null,
      expected_provider_user_id = null,
      updated_at = clock_timestamp()
  where id = coordinator_row.id;

  return query select 'acquired'::text, coordinator_row.session_epoch;
end;
$$;

comment on function public.acquire_group_invitation_auth_lease(text, bigint, text) is
  'Acquires the coordinator single auth-mutation lease under its row lock; a held lease or a stale session epoch blocks the caller without changing state.';

create function public.mark_group_invitation_delivery_pending(
  p_coordinator_secret text,
  p_expected_epoch bigint,
  p_delivery_nonce text,
  p_expected_provider_user_id uuid
)
returns table(result text, session_epoch bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
begin
  if p_coordinator_secret is null
    or p_expected_epoch is null
    or p_delivery_nonce is null
  then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found
    or coordinator_row.auth_mutation_state <> 'acquired'
    or coordinator_row.session_epoch <> p_expected_epoch
  then
    return query select 'unavailable'::text, coordinator_row.session_epoch;
    return;
  end if;

  update private.invitation_coordinators
  set auth_mutation_state = 'delivery_pending',
      auth_mutation_expires_at = clock_timestamp() + interval '120 seconds',
      delivery_nonce_digest = private.invitation_digest(p_delivery_nonce),
      expected_provider_user_id = p_expected_provider_user_id,
      updated_at = clock_timestamp()
  where id = coordinator_row.id;

  return query select 'pending'::text, coordinator_row.session_epoch;
end;
$$;

comment on function public.mark_group_invitation_delivery_pending(text, bigint, text, uuid) is
  'Moves the held lease to delivery_pending with the delivery-nonce digest and expected provider user, keeping the lease exclusive until acknowledgement or recovery.';

create function public.acknowledge_group_invitation_delivery(
  p_coordinator_secret text,
  p_delivery_nonce text,
  p_expected_provider_user_id uuid
)
returns table(result text, session_epoch bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
begin
  if p_coordinator_secret is null or p_delivery_nonce is null then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found
    or coordinator_row.auth_mutation_state <> 'delivery_pending'
    or coordinator_row.delivery_nonce_digest
      <> private.invitation_digest(p_delivery_nonce)
    or (p_expected_provider_user_id is not null
      and coordinator_row.expected_provider_user_id is not null
      and coordinator_row.expected_provider_user_id <> p_expected_provider_user_id)
  then
    return query select 'unavailable'::text, coordinator_row.session_epoch;
    return;
  end if;

  update private.invitation_coordinators
  set auth_mutation_state = 'idle',
      auth_mutation_kind = null,
      auth_mutation_identifier = null,
      auth_mutation_expires_at = null,
      delivery_nonce_digest = null,
      expected_provider_user_id = null,
      session_epoch = invitation_coordinators.session_epoch + 1,
      updated_at = clock_timestamp()
  where id = coordinator_row.id;

  return query select 'acknowledged'::text, coordinator_row.session_epoch + 1;
end;
$$;

comment on function public.acknowledge_group_invitation_delivery(text, text, uuid) is
  'Verifies the one-use delivery nonce and expected provider user, advances the session epoch exactly once, and releases the lease.';

create function public.recover_group_invitation_auth_lease(
  p_coordinator_secret text,
  p_delivery_nonce text
)
returns table(result text, session_epoch bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
  v_nonce_proven boolean;
begin
  if p_coordinator_secret is null then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  v_nonce_proven :=
    p_delivery_nonce is not null
    and coordinator_row.delivery_nonce_digest
      = private.invitation_digest(p_delivery_nonce);

  if coordinator_row.auth_mutation_state = 'delivery_pending' and v_nonce_proven then
    -- Cookies were applied but the response body/navigation was lost:
    -- recovery acknowledges the delivery.
    update private.invitation_coordinators
    set auth_mutation_state = 'idle',
        auth_mutation_kind = null,
        auth_mutation_identifier = null,
        auth_mutation_expires_at = null,
        delivery_nonce_digest = null,
        expected_provider_user_id = null,
        session_epoch = invitation_coordinators.session_epoch + 1,
        updated_at = clock_timestamp()
    where id = coordinator_row.id;

    return query select 'acknowledged'::text, coordinator_row.session_epoch + 1;
    return;
  end if;

  -- No matching session evidence: abandon the delivery and return to idle
  -- so an honest fresh-credential restart can proceed.
  if coordinator_row.auth_mutation_state <> 'idle' then
    update private.invitation_coordinators
    set auth_mutation_state = 'idle',
        auth_mutation_kind = null,
        auth_mutation_identifier = null,
        auth_mutation_expires_at = null,
        delivery_nonce_digest = null,
        expected_provider_user_id = null,
        updated_at = clock_timestamp()
    where id = coordinator_row.id;

    return query select 'abandoned'::text, coordinator_row.session_epoch;
    return;
  end if;

  return query select 'idle'::text, coordinator_row.session_epoch;
end;
$$;

comment on function public.recover_group_invitation_auth_lease(text, text) is
  'Recovery under the still-exclusive lease: acknowledges a provable delivery, otherwise abandons it to idle for an honest fresh-credential restart. Never grants permission to a competing mutation implicitly.';

-------------------------------------------------------------------------------
-- 6. Bootstrap lease operations (token-free first-contact coordination).
-------------------------------------------------------------------------------

create function public.establish_group_invitation_coordinator(
  p_coordinator_secret text,
  p_bootstrap_lease text
)
returns table(result text, coordinator_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_coordinator_id uuid;
  coordinator_row private.invitation_coordinators%rowtype;
begin
  if not private.token_is_canonical(p_coordinator_secret)
    or not private.token_is_canonical(p_bootstrap_lease)
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  insert into private.invitation_coordinators (
    coordinator_digest, bootstrap_lease_digest, bootstrap_lease_expires_at
  )
  values (
    private.invitation_digest(p_coordinator_secret),
    private.invitation_digest(p_bootstrap_lease),
    clock_timestamp() + interval '15 seconds'
  )
  on conflict (coordinator_digest) do nothing
  returning id into new_coordinator_id;

  if new_coordinator_id is not null then
    return query select 'established'::text, new_coordinator_id;
    return;
  end if;

  -- Already established: a repeat bootstrap proves the existing secret and
  -- leaves any existing lease state alone.
  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret);

  if found then
    return query select 'established'::text, coordinator_row.id;
    return;
  end if;

  return query select 'unavailable'::text, null::uuid;
end;
$$;

comment on function public.establish_group_invitation_coordinator(text, text) is
  'Token-free bootstrap: establishes the browser coordinator row with a one-use 15-second lease, or proves an already-established secret. Called only by the bootstrap endpoint.';

create function public.consume_group_invitation_bootstrap_lease(
  p_coordinator_secret text,
  p_bootstrap_lease text
)
returns table(result text, coordinator_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  coordinator_row private.invitation_coordinators%rowtype;
begin
  if not private.token_is_canonical(p_coordinator_secret)
    or not private.token_is_canonical(p_bootstrap_lease)
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  select * into coordinator_row
  from private.invitation_coordinators
  where coordinator_digest = private.invitation_digest(p_coordinator_secret)
  for update;

  if not found
    or coordinator_row.bootstrap_lease_digest is null
    or coordinator_row.bootstrap_lease_digest
      <> private.invitation_digest(p_bootstrap_lease)
    or coordinator_row.bootstrap_lease_expires_at is null
    or coordinator_row.bootstrap_lease_expires_at <= clock_timestamp()
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  update private.invitation_coordinators
  set bootstrap_lease_digest = null,
      bootstrap_lease_expires_at = null,
      updated_at = clock_timestamp()
  where id = coordinator_row.id;

  return query select 'consumed'::text, coordinator_row.id;
end;
$$;

comment on function public.consume_group_invitation_bootstrap_lease(text, text) is
  'Consumes the one-use bootstrap lease once under the coordinator row lock; only the second bootstrap request holding the lease may proceed to begin the first flow.';

-------------------------------------------------------------------------------
-- 7. Trigger upkeep for the private tables.
-------------------------------------------------------------------------------

create function private.set_invitation_continuations_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger invitation_continuations_set_updated_at
  before update on private.invitation_continuations
  for each row
execute function private.set_invitation_continuations_updated_at();

-------------------------------------------------------------------------------
-- 8. Privilege inventory.
-------------------------------------------------------------------------------

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from service_role;

-- The continuation boundary adds no table privilege to any client role and
-- no RLS policy on the private tables: the definer functions are the only
-- surface. The 006a grant of USAGE on the private schema to authenticated
-- intentionally REMAINS (the two RLS helpers stay callable); schema USAGE
-- grants no access to these tables — no table here is ever granted to a
-- client role, and the suites assert that inventory.

-- The direct raw-token acceptance entry point is no longer executable by
-- any application role: the continuation-bound acceptance function is the
-- only client acceptance surface.
revoke execute on function public.accept_group_invitation(text)
  from public, anon, authenticated, service_role;

revoke execute on function public.begin_group_invitation_flow(text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.begin_group_invitation_flow_from_start(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.preview_group_invitation_flow(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.bind_group_invitation_flow_email(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.verify_group_invitation_flow(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_invitation_flow_state(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.accept_group_invitation_flow(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.discard_group_invitation_flow(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.invalidate_group_invitation_flows_for_logout(uuid[], text[], text)
  from public, anon, authenticated, service_role;
revoke execute on function public.acquire_group_invitation_auth_lease(text, bigint, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.mark_group_invitation_delivery_pending(text, bigint, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.acknowledge_group_invitation_delivery(text, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.recover_group_invitation_auth_lease(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.establish_group_invitation_coordinator(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.consume_group_invitation_bootstrap_lease(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.create_group_invitation_pending_start(text, text)
  from public, anon, authenticated, service_role;

-- Anonymous-capable surface: begin (both forms) and the flow preview. The
-- bootstrap operations are called by the server route on the browser's
-- behalf before any session exists.
grant execute on function public.begin_group_invitation_flow(text, text, text)
  to anon, authenticated;
grant execute on function public.begin_group_invitation_flow_from_start(uuid, text, text, text)
  to anon, authenticated;
grant execute on function public.preview_group_invitation_flow(uuid, text)
  to anon, authenticated;
grant execute on function public.establish_group_invitation_coordinator(text, text)
  to anon, authenticated;
grant execute on function public.consume_group_invitation_bootstrap_lease(text, text)
  to anon, authenticated;
grant execute on function public.create_group_invitation_pending_start(text, text)
  to anon, authenticated;

-- Email binding and discard prove the sealed browser secret; both roles.
grant execute on function public.bind_group_invitation_flow_email(uuid, text, text)
  to anon, authenticated;
grant execute on function public.discard_group_invitation_flow(uuid, text, text)
  to anon, authenticated;

-- Authenticated-only surface: verification/reconciliation, the state
-- projection, continuation-bound acceptance, logout invalidation, and the
-- auth-mutation lease operations.
grant execute on function public.verify_group_invitation_flow(uuid, text)
  to authenticated;
grant execute on function public.group_invitation_flow_state(uuid, text)
  to authenticated;
grant execute on function public.accept_group_invitation_flow(uuid, text)
  to authenticated;
grant execute on function public.invalidate_group_invitation_flows_for_logout(uuid[], text[], text)
  to authenticated;
grant execute on function public.acquire_group_invitation_auth_lease(text, bigint, text)
  to authenticated;
grant execute on function public.mark_group_invitation_delivery_pending(text, bigint, text, uuid)
  to authenticated;
grant execute on function public.acknowledge_group_invitation_delivery(text, text, uuid)
  to authenticated;
grant execute on function public.recover_group_invitation_auth_lease(text, text)
  to authenticated;

-- No EXECUTE is granted on private.invitation_digest,
-- private.invitation_email_binding, private.invitation_email_is_valid,
-- private.invitation_is_live, private.invitation_begin_validated,
-- private.invitation_cleanup_expired, or
-- private.accept_invitation_core to any client role.

-- Rollback / forward-fix note: this migration is forward-only; any
-- correction ships as a NEW migration. The revert path, in dependency
-- order, is: drop the lease, bootstrap, lifecycle, and projection functions;
-- restore client EXECUTE on public.accept_group_invitation(text) (grant to
-- authenticated) if the 006a surface must return; drop the three private
-- tables and their indexes, constraints, and trigger; drop the six private
-- helper functions. Reverting deletes continuation and coordinator state
-- irreversibly (memberships, invitation uses, and audit history are never
-- touched), so a revert is a deliberate gate, never a hotfix.
