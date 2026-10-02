-- 006a: group security model, invitations, and database proof.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/006a-group-security-model.md (approved brief commit
-- 92e03f3). Never edit this file once it has been applied anywhere; fix
-- forward with a new migration (see supabase/README.md).
--
-- Guarantees:
--   * Organizer authority lives ONLY in public.groups.organizer_id. The old
--     logical model's group_members.role is deliberately superseded; a group
--     row and a membership role can never disagree. The organizer is always
--     a joined member, created in the same transaction as the group.
--   * Status is durable history: group_members rows are never deleted. Every
--     status-changing action increments membership_generation (new rows start
--     at generation 1). Removal is sticky: a generic link cannot move a
--     removed row to joined; only a new organizer-targeted invitation bound to
--     the row's exact current generation can reinstate that user.
--   * Bearer tokens: a 32-byte cryptographically random token encoded as
--     canonical unpadded base64url (43 characters) is returned to the issuer
--     exactly once. Only its SHA-256 digest (pgcrypto's extensions.digest)
--     is stored. Raw tokens never appear in tables, seed, audit, or logs.
--   * Destructive references are denied: every auth-user reference and every
--     parent reference introduced here uses ON DELETE RESTRICT, and
--     audit_events references groups, invitations, and members through
--     composite RESTRICT foreign keys so audit history cannot be erased or
--     attached to the wrong group by deleting a referenced row. Account
--     deletion is blocked by the database while any such history exists.
--   * Least privilege: anon has no table privileges. authenticated gets a
--     column-limited SELECT on groups (joined rows only, through a
--     non-recursive SECURITY DEFINER helper) and EXECUTE on exact functions.
--     group_members, group_invitations, group_invitation_uses, and
--     audit_events have no client grants and no permissive policies.
--     Authorization helpers live in the unexposed private schema. Function
--     EXECUTE is revoked from PUBLIC, anon, authenticated, and service_role
--     before exact grants; audit_events gets no client write path at all.
--   * Locking: all contending functions take the groups row lock first,
--     then invitation locks by ascending id, then membership locks by
--     ascending user id, then create rows; audit events are appended last.
--     Acceptance evaluates expiry with clock_timestamp() only after the
--     group and invitation locks are held and the invitation re-read.
--   * "groups" is a reserved word in PostgreSQL; the table is created and
--     referenced with a quoted identifier everywhere.

create type public.group_mode as enum
  ('secret_draw', 'gift_everyone', 'wishlist_only');

create type public.group_status as enum
  ('active', 'archived');

create type public.group_member_status as enum
  ('invited', 'joined', 'declined', 'left', 'removed');

create type public.group_invitation_status as enum
  ('active', 'revoked');

create type public.group_audit_event_type as enum
  (
    'group_created',
    'organizer_transferred',
    'invitation_issued',
    'invitation_revoked',
    'invitation_accepted',
    'member_left',
    'invitation_declined',
    'member_removed',
    'member_reinvited'
  );

-- The pgcrypto digest is used through its schema-qualified name only.
create extension if not exists pgcrypto with schema extensions;

create table public."groups" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  occasion text not null,
  occasion_at timestamptz not null,
  time_zone text not null,
  location text,
  description text,
  budget_amount_minor bigint,
  budget_currency char(3),
  mode public.group_mode not null,
  status public.group_status not null default 'active',
  current_draw_version integer,
  organizer_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint groups_name_bounded check (
    name !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
    and char_length(name) <= 120
  ),
  constraint groups_occasion_bounded check (
    occasion !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
    and char_length(occasion) <= 120
  ),
  constraint groups_time_zone_bounded check (char_length(time_zone) <= 64),
  constraint groups_location_bounded check (location is null or char_length(location) <= 200),
  constraint groups_description_bounded check (
    description is null or char_length(description) <= 2000
  ),
  constraint groups_budget_pair check (
    (budget_amount_minor is null) = (budget_currency is null)
  ),
  constraint groups_budget_amount_non_negative check (
    budget_amount_minor is null or budget_amount_minor >= 0
  ),
  constraint groups_budget_currency_iso check (
    budget_currency is null or budget_currency ~ '^[A-Z]{3}$'
  ),
  constraint groups_draw_version_positive check (
    current_draw_version is null or current_draw_version >= 1
  )
);

comment on table public."groups" is
  'An occasion-based gifting group; organizer_id is the single source of organizer authority.';
comment on column public."groups".occasion_at is
  'The occasion instant; the wall-clock presentation derives from time_zone.';
comment on column public."groups".time_zone is
  'IANA time zone for the occasion; presentation concern, never an authorization input.';
comment on column public."groups".budget_amount_minor is
  'Optional budget cap in integer minor units of budget_currency; both present or both absent.';
comment on column public."groups".current_draw_version is
  'Inert in 006a; no assignment table or draw operation exists yet.';
comment on column public."groups".organizer_id is
  'The sole organizer-authority field; ON DELETE RESTRICT denies account deletion while the group exists.';

create table public.group_members (
  group_id uuid not null references public."groups" (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  status public.group_member_status not null default 'invited',
  participating boolean not null default true,
  invited_at timestamptz not null default clock_timestamp(),
  joined_at timestamptz,
  left_at timestamptz,
  membership_generation integer not null,
  primary key (group_id, user_id),

  constraint group_members_generation_positive check (membership_generation >= 1)
);

comment on table public.group_members is
  'Durable membership history; rows are never deleted. status is history, membership_generation monotonically increases on every status change.';
comment on column public.group_members.participating is
  'Whether the member is currently an active participant; true only while joined.';
comment on column public.group_members.membership_generation is
  'Monotonically increasing per membership; starts at 1 and increments on every status change and every new targeted invitation.';

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."groups" (id) on delete restrict,
  creator_id uuid not null references auth.users (id) on delete restrict,
  status public.group_invitation_status not null default 'active',
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  max_uses integer,
  use_count integer not null default 0,
  target_user_id uuid references auth.users (id) on delete restrict,
  target_membership_generation integer,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  -- Declared FK target for audit_events (group_id, invitation_id).
  constraint group_invitations_group_id_id_key unique (group_id, id),

  constraint group_invitations_max_uses_positive check (
    max_uses is null or max_uses > 0
  ),
  constraint group_invitations_use_count_non_negative check (use_count >= 0),
  constraint group_invitations_target_pair check (
    (target_user_id is null) = (target_membership_generation is null)
  ),
  constraint group_invitations_token_hash_sha256 check (octet_length(token_hash) = 32)
);

comment on table public.group_invitations is
  'Shareable-link and targeted invitations. Only the SHA-256 token digest is stored; the raw bearer token is shown to the issuer exactly once and never persisted.';
comment on column public.group_invitations.target_user_id is
  'Together with target_membership_generation: both null for a shareable link, both populated for a targeted invitation.';

create table public.group_invitation_uses (
  invitation_id uuid not null references public.group_invitations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  membership_generation integer not null,
  used_at timestamptz not null default clock_timestamp(),
  primary key (invitation_id, user_id),

  constraint group_invitation_uses_generation_positive check (membership_generation >= 1)
);

comment on table public.group_invitation_uses is
  'One row per accepted invitation per user, recording the membership generation reached; replays reuse the existing row without consuming another use.';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete restrict,
  group_id uuid not null references public."groups" (id) on delete restrict,
  event_type public.group_audit_event_type not null,
  invitation_id uuid,
  subject_user_id uuid references auth.users (id) on delete restrict,
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default clock_timestamp(),

  -- Composite RESTRICT FKs: audit history can never be erased by deleting a
  -- referenced row, and a subject can never be attached to the wrong group.
  constraint audit_events_group_invitation_fkey foreign key (group_id, invitation_id)
    references public.group_invitations (group_id, id) on delete restrict,
  constraint audit_events_group_subject_fkey foreign key (group_id, subject_user_id)
    references public.group_members (group_id, user_id) on delete restrict
);

comment on table public.audit_events is
  'Append-only consequential audit trail. Application roles, including service_role, hold no direct write privilege; definer functions perform the narrowly authorized inserts.';
comment on column public.audit_events.metadata is
  'Bounded, typed identifiers/generations only; never raw tokens, emails, private assignments, or wishlist contents.';

-- Lookup indexes: hash lookups (unique index above), group-scoped lookups.
create index group_invitations_group_id_idx on public.group_invitations (group_id);
create index group_invitation_uses_user_id_idx on public.group_invitation_uses (user_id);
create index audit_events_group_id_idx on public.audit_events (group_id);
create index audit_events_actor_id_idx on public.audit_events (actor_id);
create index "groups_organizer_id_idx" on public."groups" (organizer_id);

-- Keeps updated_at owned by the database on every row update.
create function public.set_groups_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger groups_set_updated_at
  before update on public."groups"
  for each row
  execute function public.set_groups_updated_at();

create function public.set_group_invitations_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger group_invitations_set_updated_at
  before update on public.group_invitations
  for each row
  execute function public.set_group_invitations_updated_at();

-- Unexposed private schema: authorization helpers and the narrowly
-- authorized audit appender. No dynamic SQL, no arbitrary user ids.
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on schema private from service_role;

grant usage on schema private to authenticated;

-- SECURITY DEFINER helpers derive the caller from auth.uid(); a null
-- auth.uid() always returns false. Their owner reads the underlying tables
-- without invoking those tables' RLS, so policies never recurse.
create function private.is_joined_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = auth.uid()
      and m.status = 'joined'
  )
$$;

comment on function private.is_joined_group_member(uuid) is
  'RLS helper: true iff the caller (from auth.uid()) is a joined member of the group.';

create function private.is_group_organizer(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."groups" g
    where g.id = p_group_id
      and g.organizer_id = auth.uid()
  )
  and exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = auth.uid()
      and m.status = 'joined'
  )
$$;

comment on function private.is_group_organizer(uuid) is
  'RLS/function helper: true iff the caller is the groups.organizer_id and a joined member.';

create function private.token_is_canonical(p_token text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(p_token) = 43
    and p_token ~ '^[A-Za-z0-9_-]{43}$'
    and right(p_token, 1) similar to '[AEIMQUYcgkosw048]'
$$;

comment on function private.token_is_canonical(text) is
  'True iff the token is the canonical unpadded 43-character base64url encoding of 32 bytes (the final character carries two zero bits).';

create function private.audit_metadata_is_safe(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_metadata) = 'object'
    and coalesce(
      bool_and(
        e.k = any (
          array[
            'invitation_id',
            'membership_generation',
            'target_user_id',
            'previous_organizer_id',
            'new_organizer_id'
          ]
        )
        and jsonb_typeof(e.v) = any (array['string', 'number'])
      ),
      true
    )
  from jsonb_each(p_metadata) as e(k, v)
$$;

comment on function private.audit_metadata_is_safe(jsonb) is
  'CHECK helper: audit metadata is a bounded object of identifier/generation keys only.';

-- Attach the bounded typed metadata constraint now that its helper exists.
alter table public.audit_events
  add constraint audit_events_metadata_safe
  check (private.audit_metadata_is_safe(metadata));

-- The only authorized audit writer. Never granted to any client role.
create function private.append_group_event(
  p_actor_id uuid,
  p_group_id uuid,
  p_event_type public.group_audit_event_type,
  p_invitation_id uuid,
  p_subject_user_id uuid,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    actor_id, group_id, event_type, invitation_id, subject_user_id, metadata
  )
  values (
    p_actor_id, p_group_id, p_event_type, p_invitation_id, p_subject_user_id, p_metadata
  );
end;
$$;

comment on function private.append_group_event(uuid, uuid, public.group_audit_event_type, uuid, uuid, jsonb) is
  'The only audit write path: one narrowly authorized insert, called in the same transaction as the change.';

-- Shared input validation for create/update; generic failures never reveal
-- which field was rejected.
create function private.group_fields_are_valid(
  p_name text,
  p_occasion text,
  p_time_zone text,
  p_location text,
  p_description text,
  p_budget_amount_minor bigint,
  p_budget_currency text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_name !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
    and char_length(p_name) <= 120
    and p_occasion !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
    and char_length(p_occasion) <= 120
    and char_length(p_time_zone) <= 64
    and exists (
      select 1 from pg_timezone_names where name = p_time_zone
    )
    and (p_location is null or char_length(p_location) <= 200)
    and (p_description is null or char_length(p_description) <= 2000)
    and (
      (p_budget_amount_minor is null and p_budget_currency is null)
      or (
        p_budget_amount_minor >= 0
        and p_budget_currency ~ '^[A-Z]{3}$'
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- Public database API. Every function: SECURITY DEFINER, empty search_path,
-- caller derived from auth.uid(), authority checked inside the transaction,
-- minimum result, generic non-enumerating failures.
-- ---------------------------------------------------------------------------

create function public.create_group(
  p_name text,
  p_occasion text,
  p_occasion_at timestamptz,
  p_time_zone text,
  p_location text,
  p_description text,
  p_budget_amount_minor bigint,
  p_budget_currency text,
  p_mode text
)
returns table(result text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_group_id uuid;
begin
  if caller_id is null
    or p_name is null
    or p_occasion is null
    or p_occasion_at is null
    or p_time_zone is null
    or p_mode is null
    or p_mode not in ('secret_draw', 'gift_everyone', 'wishlist_only')
    or not private.group_fields_are_valid(
      p_name, p_occasion, p_time_zone, p_location, p_description,
      p_budget_amount_minor, p_budget_currency
    )
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  insert into public."groups" (
    name, occasion, occasion_at, time_zone, location, description,
    budget_amount_minor, budget_currency, mode, organizer_id
  )
  values (
    p_name, p_occasion, p_occasion_at, p_time_zone, p_location, p_description,
    p_budget_amount_minor, p_budget_currency, p_mode::public.group_mode, caller_id
  )
  returning id into new_group_id;

  -- The organizer is a joined member from the same transaction.
  insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
  values (new_group_id, caller_id, 'joined', true, clock_timestamp(), 1);

  perform private.append_group_event(
    caller_id, new_group_id, 'group_created', null, null, '{}'::jsonb
  );

  return query select 'created'::text, new_group_id;
end;
$$;

comment on function public.create_group(text, text, timestamptz, text, text, text, bigint, text, text) is
  'Creates a group with a joined organizer member and one audit event, atomically.';

create function public.update_group_settings(
  p_group_id uuid,
  p_name text,
  p_occasion text,
  p_occasion_at timestamptz,
  p_time_zone text,
  p_location text,
  p_description text,
  p_budget_amount_minor bigint,
  p_budget_currency text,
  p_mode text
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null
    or p_group_id is null
    or p_mode is null
    or p_mode not in ('secret_draw', 'gift_everyone', 'wishlist_only')
    or not private.group_fields_are_valid(
      p_name, p_occasion, p_time_zone, p_location, p_description,
      p_budget_amount_minor, p_budget_currency
    )
  then
    return query select 'unavailable'::text;
    return;
  end if;

  -- Fixed lock order starts at the group row.
  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  -- Organizer authority is re-checked inside the transaction, after locks.
  if not private.is_group_organizer(p_group_id) then
    return query select 'unavailable'::text;
    return;
  end if;

  update public."groups"
  set name = p_name,
      occasion = p_occasion,
      occasion_at = p_occasion_at,
      time_zone = p_time_zone,
      location = p_location,
      description = p_description,
      budget_amount_minor = p_budget_amount_minor,
      budget_currency = p_budget_currency,
      mode = p_mode::public.group_mode
  where id = p_group_id;

  return query select 'updated'::text;
end;
$$;

comment on function public.update_group_settings(uuid, text, text, timestamptz, text, text, text, bigint, text, text) is
  'Organizer-only settings update; authority is checked inside the transaction after the group lock.';

create function public.issue_group_invitation(
  p_group_id uuid,
  p_expires_at timestamptz,
  p_max_uses integer,
  p_target_user_id uuid
)
returns table(result text, invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_invitation_id uuid;
  raw_token bytea;
  token_text text;
  bound_generation integer;
  member_existed boolean;
  member_row public.group_members%rowtype;
begin
  if caller_id is null
    or p_group_id is null
    or p_expires_at is null
    or p_expires_at <= clock_timestamp()
    or (p_max_uses is not null and p_max_uses <= 0)
  then
    return query select 'unavailable'::text, null::uuid, null::text;
    return;
  end if;

  -- Fixed lock order: group row first.
  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return query select 'unavailable'::text, null::uuid, null::text;
    return;
  end if;

  if not private.is_group_organizer(p_group_id) then
    return query select 'unavailable'::text, null::uuid, null::text;
    return;
  end if;

  if p_target_user_id is not null then
    -- Targeted invitation: create an invited row if none exists, otherwise
    -- increment the existing row's generation. Either way the token binds to
    -- that exact generation. The row's status is durable history and is not
    -- rewritten here.
    select *
      into member_row
    from public.group_members
    where group_id = p_group_id
      and user_id = p_target_user_id
    for update;

    member_existed := found;

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
  end if;

  raw_token := extensions.gen_random_bytes(32);
  -- Canonical unpadded base64url: 43 characters, shown to the issuer exactly
  -- once and never persisted. encode is a pg_catalog function.
  token_text := left(translate(encode(raw_token, 'base64'), '+/', '-_'), 43);

  insert into public.group_invitations (
    group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
    target_user_id, target_membership_generation
  )
  values (
    p_group_id, caller_id, 'active',
    extensions.digest(convert_to(token_text, 'UTF8'), 'sha256'),
    p_expires_at, p_max_uses, 0,
    p_target_user_id, bound_generation
  )
  returning id into new_invitation_id;

  if p_target_user_id is null then
    perform private.append_group_event(
      caller_id, p_group_id, 'invitation_issued', new_invitation_id, null,
      jsonb_build_object('invitation_id', new_invitation_id)
    );
  else
    perform private.append_group_event(
      caller_id, p_group_id, 'member_reinvited', new_invitation_id, p_target_user_id,
      jsonb_build_object(
        'invitation_id', new_invitation_id,
        'target_user_id', p_target_user_id,
        'membership_generation', bound_generation
      )
    );
  end if;

  return query select 'issued'::text, new_invitation_id, token_text;
exception
  when foreign_key_violation then
    -- The target user lost a deletion race; fail generically and atomically.
    return query select 'unavailable'::text, null::uuid, null::text;
end;
$$;

comment on function public.issue_group_invitation(uuid, timestamptz, integer, uuid) is
  'Organizer-only issuance; the raw token is returned exactly once and only its SHA-256 digest is stored. Targeted invitations bind to the exact membership generation.';

create function public.revoke_group_invitation(
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
  'Organizer-only revocation; a revoke racing an accept serializes through the group lock.';

create function public.accept_group_invitation(p_token text)
returns table(result text, group_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_token_hash bytea;
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
  if caller_id is null
    or p_token is null
    or not private.token_is_canonical(p_token)
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  v_token_hash := extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');

  -- Resolve the invitation's group from its hash without taking a row lock.
  select i.group_id
    into resolved_group_id
  from public.group_invitations i
  where i.token_hash = v_token_hash;

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

  -- Lock the invitation and re-read it: a hash lookup that raced a revoke
  -- must recheck after acquiring locks.
  select *
    into inv
  from public.group_invitations i
  where i.token_hash = v_token_hash
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
    and m.user_id = caller_id
  for update;

  member_found := found;

  select *
    into prior_use
  from public.group_invitation_uses u
  where u.invitation_id = inv.id
    and u.user_id = caller_id;

  use_found := found;

  if use_found then
    -- Safe idempotent replay: same user, still joined in that accepted
    -- generation. Valid even if the invitation was since revoked, expired,
    -- or exhausted. No use, count, or audit change.
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
  -- locks are held and the invitation has been re-read. Never now(), never a
  -- pre-lock expiry check.
  checked_at := clock_timestamp();

  if inv.status <> 'active'
    or inv.expires_at <= checked_at
    or (inv.max_uses is not null and inv.use_count >= inv.max_uses)
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  targeted_ok := true;

  if inv.target_user_id is not null then
    targeted_ok := inv.target_user_id = caller_id
      and member_found
      and member_row.membership_generation = inv.target_membership_generation;

    if not targeted_ok then
      return query select 'unavailable'::text, null::uuid;
      return;
    end if;
  end if;

  if member_found then
    if member_row.status = 'joined' then
      -- A joined user with no use of this token is not a replay: no writes.
      return query select 'already_joined'::text, resolved_group_id;
      return;
    end if;

    if member_row.status = 'removed' then
      -- Sticky removal: only the targeted reinvitation path above (matching
      -- user and generation) can reinstate; a generic link never can.
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
    where group_id = resolved_group_id
      and user_id = caller_id
    returning membership_generation into reached_generation;
  else
    insert into public.group_members (
      group_id, user_id, status, participating, joined_at, membership_generation
    )
    values (
      resolved_group_id, caller_id, 'joined', true, clock_timestamp(), 1
    )
    returning membership_generation into reached_generation;
  end if;

  insert into public.group_invitation_uses (invitation_id, user_id, membership_generation)
  values (inv.id, caller_id, reached_generation);

  update public.group_invitations
  set use_count = use_count + 1
  where id = inv.id;

  perform private.append_group_event(
    caller_id, resolved_group_id, 'invitation_accepted', inv.id, caller_id,
    jsonb_build_object('invitation_id', inv.id, 'membership_generation', reached_generation)
  );

  return query select 'joined'::text, resolved_group_id;
exception
  when foreign_key_violation or unique_violation then
    -- A concurrent deletion or first-insert race lost; fail generically and
    -- atomically with no partial membership, use, count, or audit effects.
    return query select 'unavailable'::text, null::uuid;
end;
$$;

comment on function public.accept_group_invitation(text) is
  'Atomic, idempotent acceptance: one use row and one count increment per successful new acceptance; same-user replay is safe while joined in the accepted generation; removal is sticky.';

create function public.remove_group_member(
  p_group_id uuid,
  p_target_user_id uuid
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  reached_generation integer;
begin
  if caller_id is null
    or p_group_id is null
    or p_target_user_id is null
    or p_target_user_id = caller_id
  then
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

  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = p_target_user_id
      and m.status <> 'removed'
    for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  update public.group_members
  set status = 'removed',
      participating = false,
      left_at = clock_timestamp(),
      membership_generation = membership_generation + 1
  where group_id = p_group_id
    and user_id = p_target_user_id
  returning membership_generation into reached_generation;

  perform private.append_group_event(
    caller_id, p_group_id, 'member_removed', null, p_target_user_id,
    jsonb_build_object('membership_generation', reached_generation)
  );

  return query select 'removed'::text;
end;
$$;

comment on function public.remove_group_member(uuid, uuid) is
  'Organizer-only removal; sets removed, increments the generation, and never deletes the history row. The organizer cannot be removed (self-removal is denied).';

create function public.transfer_group_organizer(
  p_group_id uuid,
  p_new_organizer_id uuid
)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null
    or p_group_id is null
    or p_new_organizer_id is null
    or p_new_organizer_id = caller_id
  then
    return query select 'unavailable'::text;
    return;
  end if;

  -- Lock the group row first; the destination membership lock follows below
  -- (ascending user id ordering is trivially satisfied: the group lock is
  -- always acquired before any membership lock).
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

  -- Both affected memberships are locked; the destination must be joined.
  perform 1
  from public.group_members m
  where m.group_id = p_group_id
    and m.user_id in (caller_id, p_new_organizer_id)
  order by m.user_id
  for update;

  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = p_new_organizer_id
      and m.status = 'joined'
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  update public."groups"
  set organizer_id = p_new_organizer_id
  where id = p_group_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'organizer_transferred', null, p_new_organizer_id,
    jsonb_build_object(
      'previous_organizer_id', caller_id,
      'new_organizer_id', p_new_organizer_id
    )
  );

  return query select 'transferred'::text;
end;
$$;

comment on function public.transfer_group_organizer(uuid, uuid) is
  'Atomic organizer transfer: locks the group and both memberships, requires a joined destination, changes the sole authority field, and appends exactly one audit event.';

create function public.leave_group(p_group_id uuid)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or p_group_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  -- The organizer cannot leave before a successful transfer.
  if private.is_group_organizer(p_group_id) then
    return query select 'unavailable'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = caller_id
      and m.status = 'joined'
    for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  update public.group_members
  set status = 'left',
      participating = false,
      left_at = clock_timestamp(),
      membership_generation = membership_generation + 1
  where group_id = p_group_id
    and user_id = caller_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'member_left', null, caller_id, '{}'::jsonb
  );

  return query select 'left'::text;
end;
$$;

comment on function public.leave_group(uuid) is
  'Joined-member leave; the row is durable history and the generation advances. The organizer must transfer first.';

create function public.decline_group_invitation(p_group_id uuid)
returns table(result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or p_group_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = caller_id
      and m.status = 'invited'
    for update
  ) then
    return query select 'unavailable'::text;
    return;
  end if;

  update public.group_members
  set status = 'declined',
      participating = false,
      membership_generation = membership_generation + 1
  where group_id = p_group_id
    and user_id = caller_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'invitation_declined', null, caller_id, '{}'::jsonb
  );

  return query select 'declined'::text;
end;
$$;

comment on function public.decline_group_invitation(uuid) is
  'Invited-user decline; the row is durable history and the generation advances.';

-- ---------------------------------------------------------------------------
-- Read projections: closed result shapes, no internal draw/audit state.
-- ---------------------------------------------------------------------------

create function public.group_detail(p_group_id uuid)
returns table(
  id uuid,
  organizer_id uuid,
  name text,
  occasion text,
  occasion_at timestamptz,
  time_zone text,
  location text,
  description text,
  budget_amount_minor bigint,
  budget_currency char(3),
  mode text,
  status text,
  joined_member_count integer
)
language sql
security definer
set search_path = ''
as $$
  select
    g.id,
    g.organizer_id,
    g.name,
    g.occasion,
    g.occasion_at,
    g.time_zone,
    g.location,
    g.description,
    g.budget_amount_minor,
    g.budget_currency,
    g.mode::text,
    g.status::text,
    (
      select count(*)::integer
      from public.group_members m
      where m.group_id = g.id
        and m.status = 'joined'
    )
  from public."groups" g
  where g.id = p_group_id
    and private.is_joined_group_member(g.id)
$$;

comment on function public.group_detail(uuid) is
  'Joined-member group detail: exactly the approved columns, empty for outsiders.';

create function public.group_roster(p_group_id uuid)
returns table(
  user_id uuid,
  display_name text,
  participating boolean,
  joined_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    m.user_id,
    coalesce(
      pr.display_name,
      case when m.user_id = g.organizer_id then 'Organizer' else 'Member' end
    ),
    m.participating,
    m.joined_at
  from public.group_members m
  join public."groups" g on g.id = m.group_id
  left join public.profiles pr on pr.id = m.user_id
  where m.group_id = p_group_id
    and m.status = 'joined'
    and private.is_joined_group_member(p_group_id)
  order by m.joined_at, m.user_id
$$;

comment on function public.group_roster(uuid) is
  'Joined-only roster for joined members; a missing display name falls back to a generic label.';

create function public.group_admin_members(p_group_id uuid)
returns table(
  user_id uuid,
  display_name text,
  status text,
  participating boolean,
  joined_at timestamptz,
  left_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    m.user_id,
    coalesce(
      pr.display_name,
      case when m.user_id = g.organizer_id then 'Organizer' else 'Member' end
    ),
    m.status::text,
    m.participating,
    m.joined_at,
    m.left_at
  from public.group_members m
  join public."groups" g on g.id = m.group_id
  left join public.profiles pr on pr.id = m.user_id
  where m.group_id = p_group_id
    and private.is_group_organizer(p_group_id)
  order by m.invited_at, m.user_id
$$;

comment on function public.group_admin_members(uuid) is
  'Organizer-only membership/status view including pending and former rows; no emails or generations.';

create function public.preview_group_invitation(p_token text)
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
  from public.group_invitations i
  join public."groups" g on g.id = i.group_id
  left join public.profiles pr on pr.id = g.organizer_id
  where private.token_is_canonical(p_token)
    and i.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and i.status = 'active'
    and i.expires_at > clock_timestamp()
    and (i.max_uses is null or i.use_count < i.max_uses)
$$;

comment on function public.preview_group_invitation(text) is
  'The only anon-callable function: seven approved preview fields for a valid token, the same empty result for every invalid state, and no side effects.';

-- ---------------------------------------------------------------------------
-- Privilege inventory: explicit REVOKE of inherited/default privileges from
-- PUBLIC, anon, authenticated, and service_role before exact grants.
-- ---------------------------------------------------------------------------

revoke all on public."groups" from public;
revoke all on public."groups" from anon;
revoke all on public."groups" from authenticated;
revoke all on public."groups" from service_role;

revoke all on public.group_members from public;
revoke all on public.group_members from anon;
revoke all on public.group_members from authenticated;
revoke all on public.group_members from service_role;

revoke all on public.group_invitations from public;
revoke all on public.group_invitations from anon;
revoke all on public.group_invitations from authenticated;
revoke all on public.group_invitations from service_role;

revoke all on public.group_invitation_uses from public;
revoke all on public.group_invitation_uses from anon;
revoke all on public.group_invitation_uses from authenticated;
revoke all on public.group_invitation_uses from service_role;

revoke all on public.audit_events from public;
revoke all on public.audit_events from anon;
revoke all on public.audit_events from authenticated;
revoke all on public.audit_events from service_role;

-- The only direct client read: column-limited groups SELECT for joined
-- members (RLS narrows rows; the grant narrows columns). It excludes the
-- internal draw state and the managed timestamps.
grant select (
  id, organizer_id, name, occasion, occasion_at, time_zone, location,
  description, budget_amount_minor, budget_currency, mode, status
) on public."groups" to authenticated;

-- Functions are EXECUTE-granted to PUBLIC by default and Supabase default
-- privileges extend that to anon, authenticated, and service_role. Revoke
-- every public function from all four before exact grants.
revoke execute on function public.create_group(text, text, timestamptz, text, text, text, bigint, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.update_group_settings(uuid, text, text, timestamptz, text, text, text, bigint, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.issue_group_invitation(uuid, timestamptz, integer, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.revoke_group_invitation(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.accept_group_invitation(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.remove_group_member(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.transfer_group_organizer(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.leave_group(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.decline_group_invitation(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_detail(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_roster(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_admin_members(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.preview_group_invitation(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_groups_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.set_group_invitations_updated_at()
  from public, anon, authenticated, service_role;

revoke execute on function private.is_joined_group_member(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.is_group_organizer(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.token_is_canonical(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.audit_metadata_is_safe(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.group_fields_are_valid(text, text, text, text, text, bigint, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.append_group_event(uuid, uuid, public.group_audit_event_type, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.create_group(text, text, timestamptz, text, text, text, bigint, text, text)
  to authenticated;
grant execute on function public.update_group_settings(uuid, text, text, timestamptz, text, text, text, bigint, text, text)
  to authenticated;
grant execute on function public.issue_group_invitation(uuid, timestamptz, integer, uuid)
  to authenticated;
grant execute on function public.revoke_group_invitation(uuid, uuid)
  to authenticated;
grant execute on function public.accept_group_invitation(text)
  to authenticated;
grant execute on function public.remove_group_member(uuid, uuid)
  to authenticated;
grant execute on function public.transfer_group_organizer(uuid, uuid)
  to authenticated;
grant execute on function public.leave_group(uuid)
  to authenticated;
grant execute on function public.decline_group_invitation(uuid)
  to authenticated;
grant execute on function public.group_detail(uuid)
  to authenticated;
grant execute on function public.group_roster(uuid)
  to authenticated;
grant execute on function public.group_admin_members(uuid)
  to authenticated;

-- The invitation preview is the only anon-callable function.
grant execute on function public.preview_group_invitation(text)
  to anon, authenticated;

-- Exact helper EXECUTE; the private schema USAGE grant covers lookups.
grant execute on function private.is_joined_group_member(uuid)
  to authenticated;
grant execute on function private.is_group_organizer(uuid)
  to authenticated;

-- No EXECUTE is granted on private.token_is_canonical,
-- private.audit_metadata_is_safe, or private.append_group_event to any
-- application role: the audit appender is the only audit write path, and no
-- UPDATE/DELETE/TRUNCATE function exists.

alter table public."groups" enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;
alter table public.group_invitation_uses enable row level security;
alter table public.audit_events enable row level security;

-- The single permissive client policy in this slice: joined-member row
-- visibility on groups. The helper is SECURITY DEFINER, so policy
-- evaluation never recurses through group_members' own (deny-all) RLS.
create policy groups_select_joined on public."groups"
  for select
  to authenticated
  using (private.is_joined_group_member(id));

-- group_members, group_invitations, group_invitation_uses, and audit_events
-- deliberately have no policy at all: no client role can read or write them
-- directly, and no client grant exists to combine with one.

-- Rollback / forward-fix note: this migration is forward-only; any correction
-- ships as a NEW migration. The revert path, in dependency order, is: drop
-- the two updated_at triggers and functions, drop the 13 public functions,
-- drop the groups_select_joined policy and RLS, drop the private schema with
-- its five functions, drop public.audit_events,
-- public.group_invitation_uses, public.group_invitations,
-- public.group_members, and public."groups", then drop the five enum types
-- and (if this migration installed it) the pgcrypto extension. Reverting
-- deletes group membership and audit history irreversibly, so a revert is a
-- deliberate data-destroying gate, never a hotfix.
