-- 006f: Organizer membership controls and audit behavior.
--
-- Brief: docs/delivery/issues/006f-organizer-membership-controls.md
-- (Linear ARJ-38). Depends on the merged heads of 006a
-- (20261003000000_groups.sql), 006b
-- (20261004000000_groups_006b_shareable_invitations.sql), 006c
-- (20261005000000_groups_006c_invitation_continuations.sql), and 006d
-- (20261016000000_groups_006d_group_room.sql); their exact merged shapes
-- were re-verified before this migration was written (the recheck gate):
--
--   * `audit_events` has the stable identity column `id uuid` (primary
--     key), so the audit projection's deterministic tie-break is
--     `occurred_at desc, id desc`. The merged storage column is
--     `occurred_at`; the brief's `created_at` projection label is served
--     from it without renaming storage.
--   * The merged audit vocabulary identifiers consumed by this surface are
--     exactly `member_removed`, `organizer_transferred`, `member_reinvited`
--     (the targeted issue/reinvitation event; `invitation_issued` is the
--     generic shareable issuance), and `invitation_revoked` (stored for
--     both targeted and generic revocations; the stored event does not
--     distinguish them). The brief's expectation `invitation_issued` for
--     targeted issue binds to the merged `member_reinvited` value.
--   * `group_admin_members(uuid)` already exists with exactly the six
--     approved columns; this slice adds nothing to it.
--
-- This migration adds:
--   * `public.groups.member_admin_version bigint not null default 0` with a
--     nonnegative check (internal: excluded from the column-limited client
--     grant, which is never widened).
--   * Compare-and-swap replacements for the four organizer mutation
--     overloads. 006b's overload-hygiene rule is applied: the non-CAS
--     006a/006b overloads are DROPPED (never edited in place) and replaced
--     by the exact CAS signatures below; every older overload is
--     enumerated and dropped/revoked before the exact grants.
--   * The organizer-only `group_admin_audit` projection and the narrow
--     `group_admin_version` read the page needs (the brief's "separate
--     reviewed calls"; group_admin_members' approved shape is not widened).
--   * A live targeted-invitation read for the same surface
--     (`group_admin_live_invitations`): the per-member action mapping
--     (Revoke invite vs Invite again) and the revoke-by-id action need the
--     live invitation's id and expiry, and the approved
--     `group_admin_members` shape cannot carry them.
--
-- Denial shape: every mutating function returns ZERO ROWS for a denial
-- (unknown group, non-organizer, refused state) — no detail, no hint, no
-- distinction between causes. Concurrency: a null or negative expected
-- version raises SQLSTATE 22023 `invalid_member_admin_version`; a mismatched
-- expected version under the group lock raises SQLSTATE PT409
-- `stale_member_admin_version` — in both cases with no detail or hint and
-- no write. The lock order is 006a's fixed order: the group row FOR UPDATE
-- first, then affected membership rows in ascending user_id order, then
-- invitation rows. Authority (auth.uid() plus currently joined organizer)
-- is always evaluated inside the transaction, after locks.

---------------------------------------------------------------------------
-- 1. The durable member-admin version.
---------------------------------------------------------------------------

alter table public."groups"
  add column member_admin_version bigint not null default 0;

alter table public."groups"
  add constraint groups_member_admin_version_non_negative
  check (member_admin_version >= 0);

comment on column public."groups".member_admin_version is
  'Internal durable CAS version stamping every organizer membership mutation; invisible to every client read and non-organizer projection.';

---------------------------------------------------------------------------
-- 2. Drop the replaced non-CAS overloads (006b hygiene rule).
---------------------------------------------------------------------------

-- The 006a/006b targeted issue without the member-admin compare-and-swap.
drop function public.issue_group_invitation(uuid, uuid);

-- The 006a/006b targeted revoke-by-ID without the compare-and-swap.
drop function public.revoke_group_invitation(uuid, uuid);

-- The 006a removal and transfer without the compare-and-swap.
drop function public.remove_group_member(uuid, uuid);
drop function public.transfer_group_organizer(uuid, uuid);

---------------------------------------------------------------------------
-- 3. The compare-and-swap mutations.
---------------------------------------------------------------------------

-- Removal: the target's current membership must be joined, must not be the
-- caller's own row, and must not be the organizer's row. Sticky history:
-- the row becomes removed and is never deleted; repeated removal of a
-- former row is a denial with no write.
create function public.remove_group_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_expected_member_admin_version bigint
)
returns table ( member_admin_version bigint )
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_current bigint;
  v_new bigint;
  reached_generation integer;
begin
  if p_expected_member_admin_version is null
    or p_expected_member_admin_version < 0
  then
    raise exception 'invalid_member_admin_version' using errcode = '22023';
  end if;

  if caller_id is null
    or p_group_id is null
    or p_target_user_id is null
    or p_target_user_id = caller_id
  then
    return;
  end if;

  -- Fixed lock order: the group row first.
  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return;
  end if;

  select g.member_admin_version into v_current
  from public."groups" g
  where g.id = p_group_id;

  -- The compare-and-swap is evaluated first, before authority: a stale
  -- expected version deterministically produces PT409 — for a former
  -- organizer acting after someone else's transfer this is the same
  -- designed recovery state, never an authority revival.
  if p_expected_member_admin_version <> v_current then
    raise exception 'stale_member_admin_version' using errcode = 'PT409';
  end if;

  -- Authority is evaluated inside the transaction, after locks.
  if not private.is_group_organizer(p_group_id) then
    return;
  end if;

  perform 1
  from public.group_members m
  where m.group_id = p_group_id
    and m.user_id = p_target_user_id
  for update;

  -- Only a currently joined, non-organizer target is removable; the
  -- organizer is the caller, so this denies self-removal and any
  -- transfer-first requirement in one predicate.
  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = p_target_user_id
      and m.status = 'joined'
      and m.user_id <> (select g2.organizer_id from public."groups" g2 where g2.id = p_group_id)
  ) then
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

  v_new := v_current + 1;

  update public."groups"
  set member_admin_version = v_new
  where id = p_group_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'member_removed', null, p_target_user_id,
    jsonb_build_object('membership_generation', reached_generation)
  );

  return query select v_new;
end;
$$;

comment on function public.remove_group_member(uuid, uuid, bigint) is
  'Compare-and-swap organizer removal: locks the group, requires a joined non-organizer target, increments the member-admin version and the membership generation, and appends one member_removed audit event atomically. A former row is a denial with no write.';

-- Atomic organizer transfer: the destination must be currently joined and
-- not the caller. The outgoing organizer remains joined with unchanged
-- participation; groups.organizer_id is the sole authority field, so no
-- zero-organizer or two-organizer state can commit.
create function public.transfer_group_organizer(
  p_group_id uuid,
  p_target_user_id uuid,
  p_expected_member_admin_version bigint
)
returns table (
  member_admin_version bigint,
  new_organizer_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_current bigint;
  v_new bigint;
begin
  if p_expected_member_admin_version is null
    or p_expected_member_admin_version < 0
  then
    raise exception 'invalid_member_admin_version' using errcode = '22023';
  end if;

  if caller_id is null
    or p_group_id is null
    or p_target_user_id is null
    or p_target_user_id = caller_id
  then
    return;
  end if;

  -- Fixed lock order: the group row first.
  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return;
  end if;

  select g.member_admin_version into v_current
  from public."groups" g
  where g.id = p_group_id;

  -- The compare-and-swap is evaluated first, before authority: a stale
  -- expected version deterministically produces PT409 — for a former
  -- organizer acting after someone else's transfer this is the same
  -- designed recovery state, never an authority revival.
  if p_expected_member_admin_version <> v_current then
    raise exception 'stale_member_admin_version' using errcode = 'PT409';
  end if;

  if not private.is_group_organizer(p_group_id) then
    return;
  end if;

  -- Both affected memberships are locked in ascending user-id order.
  perform 1
  from public.group_members m
  where m.group_id = p_group_id
    and m.user_id in (caller_id, p_target_user_id)
  order by m.user_id
  for update;

  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = p_target_user_id
      and m.status = 'joined'
  ) then
    return;
  end if;

  v_new := v_current + 1;

  update public."groups"
  set organizer_id = p_target_user_id,
      member_admin_version = v_new
  where id = p_group_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'organizer_transferred', null, p_target_user_id,
    jsonb_build_object(
      'previous_organizer_id', caller_id,
      'new_organizer_id', p_target_user_id
    )
  );

  return query select v_new, p_target_user_id;
end;
$$;

comment on function public.transfer_group_organizer(uuid, uuid, bigint) is
  'Compare-and-swap atomic organizer transfer: locks the group and both memberships, requires a joined non-caller destination, commits the new organizer_id, the version increment, and one organizer_transferred audit event together.';

-- Targeted reinvitation with the member-admin compare-and-swap. Allowed
-- for declined/left/removed rows (restores the row to invited with a new
-- generation), for absent rows (creates the invited row at generation 1),
-- and for invited rows with NO live targeted invitation (the row and its
-- generation are unchanged). Refused for joined rows, for the caller
-- themself, and for an invited row that still has a live targeted
-- invitation. 006b's targeted token semantics are unchanged: 30-day
-- after-lock expiry, fixed one-use limit, digest-only persistence,
-- canonical 43-character base64url token returned exactly once.
create function public.issue_group_invitation(
  p_group_id uuid,
  p_target_user_id uuid,
  p_expected_member_admin_version bigint
)
returns table (
  token text,
  expires_at timestamptz,
  target_membership_generation bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_current bigint;
  v_new bigint;
  member_row public.group_members%rowtype;
  member_found boolean;
  raw_token bytea;
  token_text text;
  checked_at timestamptz;
  new_invitation_id uuid;
begin
  if p_expected_member_admin_version is null
    or p_expected_member_admin_version < 0
  then
    raise exception 'invalid_member_admin_version' using errcode = '22023';
  end if;

  if caller_id is null
    or p_group_id is null
    or p_target_user_id is null
    or p_target_user_id = caller_id
  then
    return;
  end if;

  -- Fixed lock order: the group row first.
  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return;
  end if;

  select g.member_admin_version into v_current
  from public."groups" g
  where g.id = p_group_id;

  -- The compare-and-swap is evaluated first, before authority: a stale
  -- expected version deterministically produces PT409 as the same designed
  -- recovery state for every caller.
  if p_expected_member_admin_version <> v_current then
    raise exception 'stale_member_admin_version' using errcode = 'PT409';
  end if;

  if not private.is_group_organizer(p_group_id) then
    return;
  end if;

  select *
    into member_row
  from public.group_members
  where group_id = p_group_id
    and user_id = p_target_user_id
  for update;

  member_found := found;

  if member_found and member_row.status = 'joined' then
    return;
  end if;

  if member_found and member_row.status = 'invited' then
    -- An invited row still holding a live targeted invitation (active,
    -- unexpired, uses remaining, targeted not generic) cannot be
    -- reinvited: at most one deliberate live path per person.
    if exists (
      select 1
      from public.group_invitations i
      where i.group_id = p_group_id
        and i.target_user_id = p_target_user_id
        and i.shareable_version is null
        and i.status = 'active'
        and i.expires_at > clock_timestamp()
        and (i.max_uses is null or i.use_count < i.max_uses)
    ) then
      return;
    end if;
    -- No live token exists to invalidate: the membership row and its
    -- generation are unchanged, and the new token binds to the current
    -- generation. The version still increments: the reinvitation is a
    -- committed organizer mutation with its own audit event, so two
    -- concurrent reinvitations still have exactly one winner.
    v_new := v_current + 1;
  elsif member_found then
    -- declined/left/removed: restore the row to invited with a new
    -- generation. Sticky removal is honored: only this explicit targeted
    -- reinvitation reinstates the person.
    update public.group_members
    set status = 'invited',
        participating = false,
        invited_at = clock_timestamp(),
        membership_generation = membership_generation + 1
    where group_id = p_group_id
      and user_id = p_target_user_id
    returning * into member_row;
    v_new := v_current + 1;
  else
    -- No row yet: create the invited row at generation 1.
    insert into public.group_members (
      group_id, user_id, status, participating, invited_at, membership_generation
    )
    values (
      p_group_id, p_target_user_id, 'invited', false, clock_timestamp(), 1
    )
    returning * into member_row;
    v_new := v_current + 1;
  end if;

  -- Persist the committed version: the reinvitation is a durable
  -- organizer mutation like removal, transfer, and revocation.
  update public."groups"
  set member_admin_version = v_new
  where id = p_group_id;

  -- Canonical unpadded base64url: 43 characters, shown to the issuer
  -- exactly once and never persisted. The final character is re-rolled
  -- until it satisfies the canonical-token predicate (006b precedent).
  loop
    raw_token := extensions.gen_random_bytes(32);
    token_text := left(translate(encode(raw_token, 'base64'), '+/', '-_'), 43);
    exit when right(token_text, 1) similar to '[AEIMQUYcgkosw048]';
  end loop;

  checked_at := clock_timestamp();

  insert into public.group_invitations (
    group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
    target_user_id, target_membership_generation
  )
  values (
    p_group_id, caller_id, 'active',
    extensions.digest(convert_to(token_text, 'UTF8'), 'sha256'),
    checked_at + interval '30 days', 1, 0,
    p_target_user_id, member_row.membership_generation
  )
  returning id into new_invitation_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'member_reinvited', new_invitation_id, p_target_user_id,
    jsonb_build_object(
      'invitation_id', new_invitation_id,
      'target_user_id', p_target_user_id,
      'membership_generation', member_row.membership_generation
    )
  );

  return query select
    token_text,
    checked_at + interval '30 days',
    member_row.membership_generation::bigint;
exception
  when foreign_key_violation then
    -- The target user lost a deletion race; fail generically and atomically.
    return;
end;
$$;

comment on function public.issue_group_invitation(uuid, uuid, bigint) is
  'Compare-and-swap targeted reinvitation: reinstates declined/left/removed rows with a new generation, creates absent rows, reissues to invited rows with no live invitation without changing the row, and refuses joined rows and rows with a live targeted invitation. Token semantics are 006b''s: 30-day one-use, digest-only, shown once.';

-- Targeted revocation by invitation id with the member-admin
-- compare-and-swap. The CAS is evaluated even when the write is a no-op, so
-- a stale expected version deterministically produces PT409 before any
-- idempotent response. An already-revoked, expired, exhausted, nonexistent,
-- or generic invitation returns revoked = false with no write and no audit
-- event; a successful revocation increments the version and appends one
-- event. The membership row remains invited.
create function public.revoke_group_invitation(
  p_group_id uuid,
  p_invitation_id uuid,
  p_expected_member_admin_version bigint
)
returns table (
  revoked boolean,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_current bigint;
  v_new bigint;
  target_row public.group_invitations%rowtype;
  target_found boolean;
  revoked_at timestamptz;
begin
  if p_expected_member_admin_version is null
    or p_expected_member_admin_version < 0
  then
    raise exception 'invalid_member_admin_version' using errcode = '22023';
  end if;

  if caller_id is null
    or p_group_id is null
    or p_invitation_id is null
  then
    return;
  end if;

  -- Fixed lock order: the group row first.
  if not exists (
    select 1 from public."groups" g where g.id = p_group_id for update
  ) then
    return;
  end if;

  select g.member_admin_version into v_current
  from public."groups" g
  where g.id = p_group_id;

  -- The compare-and-swap is evaluated first — before authority and before
  -- any idempotent response: a stale expected version fails with PT409
  -- even for a no-op revoke.
  if p_expected_member_admin_version <> v_current then
    raise exception 'stale_member_admin_version' using errcode = 'PT409';
  end if;

  if not private.is_group_organizer(p_group_id) then
    return;
  end if;

  select *
    into target_row
  from public.group_invitations i
  where i.id = p_invitation_id
    and i.group_id = p_group_id
    and i.shareable_version is null
  for update;

  target_found := found;

  if not target_found
    or target_row.status <> 'active'
    or target_row.expires_at <= clock_timestamp()
    or (target_row.max_uses is not null and target_row.use_count >= target_row.max_uses)
    or not exists (
      select 1
      from public.group_members m
      where m.group_id = p_group_id
        and m.user_id = target_row.target_user_id
        and m.status = 'invited'
    )
  then
    -- Already revoked, expired, exhausted, nonexistent, or the person is
    -- no longer invited: the idempotent no-op with no write and no event.
    return query select false, null::timestamptz;
    return;
  end if;

  update public.group_invitations
  set status = 'revoked'
  where id = target_row.id;

  revoked_at := clock_timestamp();
  v_new := v_current + 1;

  update public."groups"
  set member_admin_version = v_new
  where id = p_group_id;

  perform private.append_group_event(
    caller_id, p_group_id, 'invitation_revoked', target_row.id, null,
    jsonb_build_object('invitation_id', target_row.id)
  );

  return query select true, revoked_at;
end;
$$;

comment on function public.revoke_group_invitation(uuid, uuid, bigint) is
  'Compare-and-swap targeted revocation by invitation id: the version check runs even for the idempotent no-op; a live targeted invitation for an invited member is revoked with one version increment and one event; the generic link is never touched.';

---------------------------------------------------------------------------
-- 4. The organizer-only projections.
---------------------------------------------------------------------------

-- The bounded audit projection: the most recent 100 member-control events
-- for the group, ordered created_at desc with the stable event identity as
-- the deterministic tie-break, in one statement. The subject label is
-- resolved inside the definer with the same generic fallback
-- group_admin_members uses; rows without a subject return null. No actor,
-- email, invitation id, token, generation beyond the column, or any
-- wishlist/assignment/reservation/purchase/reaction data is exposed.
create function public.group_admin_audit(p_group_id uuid)
returns table (
  event_type text,
  created_at timestamptz,
  subject_user_id uuid,
  subject_display_label text,
  membership_generation bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.event_type::text,
    e.occurred_at,
    e.subject_user_id,
    coalesce(
      pr.display_name,
      case when e.subject_user_id = g.organizer_id
        then 'Organizer' else 'Member' end
    ),
    case
      when e.metadata->>'membership_generation' ~ '^[0-9]+$'
        then (e.metadata->>'membership_generation')::bigint
    end
  from public.audit_events e
  join public."groups" g on g.id = e.group_id
  left join public.profiles pr on pr.id = e.subject_user_id
  where e.group_id = p_group_id
    and e.event_type in (
      'member_removed', 'organizer_transferred', 'member_reinvited', 'invitation_revoked'
    )
    and private.is_group_organizer(p_group_id)
  order by e.occurred_at desc, e.id desc
  limit 100
$$;

comment on function public.group_admin_audit(uuid) is
  'Organizer-only bounded audit projection: the 100 most recent member-control events (removal, transfer, targeted issue/reinvitation, revocation) with the definer-resolved subject label and no private payload.';

-- The page's reviewed read of the durable member-admin version; the
-- approved group_admin_members shape is not widened.
create function public.group_admin_version(p_group_id uuid)
returns table ( member_admin_version bigint )
language sql
stable
security definer
set search_path = ''
as $$
  select g.member_admin_version
  from public."groups" g
  where g.id = p_group_id
    and private.is_group_organizer(p_group_id)
$$;

comment on function public.group_admin_version(uuid) is
  'Organizer-only read of the durable member-admin compare-and-swap version.';

-- The live targeted-invitation read for the per-member action mapping and
-- the revoke-by-id action: one row per invited member with a live targeted
-- invitation. No token or digest is exposed — only the invitation id
-- (required to revoke), the target, and the stored expiry.
create function public.group_admin_live_invitations(p_group_id uuid)
returns table (
  target_user_id uuid,
  invitation_id uuid,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    i.target_user_id,
    i.id,
    i.expires_at
  from public.group_invitations i
  where i.group_id = p_group_id
    and i.shareable_version is null
    and i.target_user_id is not null
    and i.status = 'active'
    and i.expires_at > clock_timestamp()
    and (i.max_uses is null or i.use_count < i.max_uses)
    and exists (
      select 1
      from public.group_members m
      where m.group_id = i.group_id
        and m.user_id = i.target_user_id
        and m.status = 'invited'
    )
    and private.is_group_organizer(p_group_id)
  order by i.target_user_id, i.id
$$;

comment on function public.group_admin_live_invitations(uuid) is
  'Organizer-only read of live targeted invitations (id and expiry per invited member); no token material.';

---------------------------------------------------------------------------
-- 5. Privilege inventory: revokes before exact grants.
---------------------------------------------------------------------------

revoke execute on function public.remove_group_member(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke execute on function public.transfer_group_organizer(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke execute on function public.issue_group_invitation(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke execute on function public.revoke_group_invitation(uuid, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_admin_audit(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_admin_version(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_admin_live_invitations(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.remove_group_member(uuid, uuid, bigint)
  to authenticated;
grant execute on function public.transfer_group_organizer(uuid, uuid, bigint)
  to authenticated;
grant execute on function public.issue_group_invitation(uuid, uuid, bigint)
  to authenticated;
grant execute on function public.revoke_group_invitation(uuid, uuid, bigint)
  to authenticated;
grant execute on function public.group_admin_audit(uuid)
  to authenticated;
grant execute on function public.group_admin_version(uuid)
  to authenticated;
grant execute on function public.group_admin_live_invitations(uuid)
  to authenticated;

-- No new table, schema, or sequence privilege: member_admin_version is
-- absent from the column-limited groups SELECT grant (which is not
-- widened), and the base tables stay deny-by-default.

-- Rollback / forward-fix note: this migration is forward-only; any
-- correction ships as a NEW migration. The immediate disable path revokes
-- authenticated EXECUTE on the seven functions above; a later reviewed
-- migration may drop them once the application stops calling them. The
-- member_admin_version column is inert once no function writes it and is
-- never read by any client grant. Never edit or roll back earlier group
-- migrations, delete member/invitation/audit rows, or weaken RLS.
