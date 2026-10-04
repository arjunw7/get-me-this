-- 008c: transactional secret-draw algorithm and invariants.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/008c-secret-draw-algorithm.md. Never edit this file
-- once it has been applied anywhere; fix forward with a new migration.
--
-- What this adds on top of the 006a/006b/008a/008b model:
--   * public.group_assignments: the durable draw result, keyed by
--     (group_id, draw_version, giver_id) with a unique (group_id,
--     draw_version, recipient_id) bijection constraint, composite RESTRICT
--     foreign keys into group_members, and both membership generations bound
--     at draw time. Deny-all RLS and no client grant: no client role can
--     read or write it directly, including service_role.
--   * Two audit enum values ('draw_created', 'draw_redrawn') and three
--     metadata allowlist keys ('draw_version', 'previous_draw_version',
--     'participant_count'). The migration never writes the new enum values
--     (PostgreSQL cannot use an enum value added in the same transaction).
--   * private.derangement_from_bytes(uuid[], bytea): the pure Fisher-Yates
--     derangement core with unbiased rejection sampling from a byte stream.
--     Never granted to any application role.
--   * public.run_secret_draw(uuid, integer): the organizer-only,
--     compare-and-swap transactional draw following the 006a fixed lock
--     order.
--   * public.my_assignment(uuid) and public.group_draw_state(uuid): the
--     single-statement read projections — a member's own current assignment
--     and the organizer's existence metadata only.
--   * A narrow extension of public.update_group_settings: a committed mode
--     change AWAY from 'secret_draw' while a draw version exists tombstones
--     the current version by incrementing groups.current_draw_version by
--     exactly one in the same transaction. Assignment rows are never
--     mutated, rewritten, or deleted; the reachability switch is a
--     read-predicate property of the monotonic version counter only.

create table public.group_assignments (
  group_id uuid not null,
  draw_version integer not null,
  giver_id uuid not null,
  recipient_id uuid not null,
  giver_membership_generation integer not null,
  recipient_membership_generation integer not null,
  created_at timestamptz not null default clock_timestamp(),

  primary key (group_id, draw_version, giver_id),
  constraint group_assignments_recipient_unique
    unique (group_id, draw_version, recipient_id),
  constraint group_assignments_giver_is_not_recipient
    check (giver_id <> recipient_id),
  constraint group_assignments_generations_positive
    check (giver_membership_generation >= 1 and recipient_membership_generation >= 1),
  -- The 006a composite RESTRICT pattern: an assignment can never attach to
  -- the wrong group, and no member, group, or account deletion can erase or
  -- orphan assignment history.
  constraint group_assignments_giver_member_fkey
    foreign key (group_id, giver_id)
    references public.group_members (group_id, user_id) on delete restrict,
  constraint group_assignments_recipient_member_fkey
    foreign key (group_id, recipient_id)
    references public.group_members (group_id, user_id) on delete restrict
);

comment on table public.group_assignments is
  'Secret-draw assignment history. Rows are never deleted or rewritten: superseded versions stay as internal durable history and become client-unreachable through the version read predicate. Deny-all RLS and no client grant; only the reviewed definer functions touch the table.';

create index group_assignments_recipient_idx
  on public.group_assignments (group_id, recipient_id);

-- Audit enum extension (permanent once added; no ALTER TYPE DROP VALUE).
alter type public.group_audit_event_type add value 'draw_created';
alter type public.group_audit_event_type add value 'draw_redrawn';

-- Metadata allowlist extension: exactly the three new draw keys, in addition
-- to the 006a/006b keys. No assignment-bearing key is ever permitted.
create or replace function private.audit_metadata_is_safe(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
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
              'reason',
              'draw_version',
              'previous_draw_version',
              'participant_count'
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
  'CHECK helper: audit metadata is a bounded object of identifier/generation keys only; 008c adds the three draw keys.';

-- ---------------------------------------------------------------------------
-- The pure permutation core. Never granted to any application role; pgTAP
-- exercises it as the table owner.
-- ---------------------------------------------------------------------------

create function private.derangement_from_bytes(p_members uuid[], p_bytes bytea)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n integer := array_length(p_members, 1);
  v_result uuid[] := p_members;
  v_len integer := octet_length(p_bytes);
  v_pos integer := 0;
  v_i integer;
  v_j integer;
  v_b integer;
  v_bucket integer;
  v_tmp uuid;
  v_k integer;
begin
  if v_n is null or v_n < 2 then
    return v_result;
  end if;

  v_i := v_n;
  while v_i > 1 loop
    -- Rejection sampling: an unbiased integer in [1, v_i] (array positions)
    -- drawn from whole bytes, accepting only bytes below the largest
    -- multiple of v_i that fits in a byte. Modulo of a rejected-free prefix
    -- never biases the draw.
    loop
      if v_pos > v_len then
        -- The caller's byte stream is exhausted; the transactional wrapper
        -- retries with a fresh stream. The helper stays pure.
        raise exception 'derangement_bytes_exhausted' using errcode = '22023';
      end if;
      v_b := get_byte(p_bytes, v_pos);
      v_pos := v_pos + 1;
      v_bucket := (256 / v_i) * v_i;
      if v_b < v_bucket then
        v_j := (v_b % v_i) + 1;
        exit;
      end if;
    end loop;

    v_tmp := v_result[v_i];
    v_result[v_i] := v_result[v_j];
    v_result[v_j] := v_tmp;

    v_i := v_i - 1;
  end loop;

  -- Verify the derangement: no fixed point.
  for v_k in 1..v_n loop
    if v_result[v_k] = p_members[v_k] then
      raise exception 'derangement_fixed_point' using errcode = '22023';
    end if;
  end loop;

  return v_result;
end;
$$;

comment on function private.derangement_from_bytes(uuid[], bytea) is
  'Pure Fisher-Yates derangement: unbiased rejection sampling against the byte stream, zero fixed points verified before returning. No randomness source of its own and no side effects; never granted to any application role.';

-- ---------------------------------------------------------------------------
-- The transactional draw. Organizer-only, compare-and-swap, 006a lock order.
-- ---------------------------------------------------------------------------

create function public.run_secret_draw(
  p_group_id uuid,
  p_expected_draw_version integer
)
returns table (result text, draw_version integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_version integer;
  v_new_version integer;
  v_participants uuid[];
  v_assignment uuid[];
  v_bytes bytea;
  v_attempts integer := 0;
  v_k integer;
begin
  if caller_id is null or p_group_id is null then
    return query select 'unavailable'::text, null::integer;
    return;
  end if;

  -- Fixed lock order: the groups row FOR UPDATE first.
  select g.current_draw_version into v_version
  from public."groups" g
  where g.id = p_group_id
  for update;

  if not found then
    return query select 'unavailable'::text, null::integer;
    return;
  end if;

  -- Authority, mode, and lifecycle re-checked inside the transaction after
  -- the lock. A non-organizer always receives the generic result and never
  -- reaches the compare-and-swap.
  if not exists (
    select 1
    from public."groups" g
    where g.id = p_group_id
      and g.organizer_id = caller_id
      and g.status = 'active'
      and g.mode = 'secret_draw'
  ) then
    return query select 'unavailable'::text, null::integer;
    return;
  end if;

  -- Compare-and-swap against the committed draw version (null = first draw).
  if p_expected_draw_version is distinct from v_version then
    return query select 'stale'::text, null::integer;
    return;
  end if;

  -- Eligibility is re-derived from current state at draw time: exactly the
  -- currently joined, participating members, ordered by user_id ascending.
  select array_agg(m.user_id order by m.user_id)
  into v_participants
  from public.group_members m
  where m.group_id = p_group_id
    and m.status = 'joined'
    and m.participating;

  if v_participants is null or array_length(v_participants, 1) < 2 then
    return query select 'insufficient_participants'::text, null::integer;
    return;
  end if;

  -- Then the participating membership rows, ascending user id.
  perform 1
  from public.group_members m
  where m.group_id = p_group_id
    and m.user_id = any (v_participants)
  order by m.user_id
  for update;

  -- The derangement core is pure; the wrapper supplies fresh cryptographic
  -- bytes and retries on fixed points or an exhausted stream (succeeds with
  -- probability ~1/e per attempt; 100 attempts is unreachable in practice).
  loop
    v_attempts := v_attempts + 1;
    exit when v_attempts > 100;
    v_bytes := extensions.gen_random_bytes(16 * array_length(v_participants, 1));
    begin
      v_assignment := private.derangement_from_bytes(v_participants, v_bytes);
    exception
      when others then
        v_assignment := null;
        continue;
    end;
    exit when v_assignment is not null;
  end loop;

  if v_assignment is null then
    return query select 'unavailable'::text, null::integer;
    return;
  end if;

  -- A null committed version is the first draw: the new version is 1.
  v_new_version := coalesce(v_version, 0) + 1;

  -- Insert one row per participant, binding both membership generations.
  for v_k in 1..array_length(v_participants, 1) loop
    insert into public.group_assignments (
      group_id, draw_version, giver_id, recipient_id,
      giver_membership_generation, recipient_membership_generation
    )
    values (
      p_group_id, v_new_version, v_participants[v_k], v_assignment[v_k],
      (select m.membership_generation from public.group_members m
        where m.group_id = p_group_id and m.user_id = v_participants[v_k]),
      (select m.membership_generation from public.group_members m
        where m.group_id = p_group_id and m.user_id = v_assignment[v_k])
    );
  end loop;

  update public."groups"
  set current_draw_version = v_new_version
  where id = p_group_id;

  -- Exactly one audit event per committed draw. The previous-version key is
  -- omitted on the first draw: a null value would violate the metadata
  -- allowlist's string-or-number rule.
  if v_version is null then
    perform private.append_group_event(
      caller_id, p_group_id, 'draw_created', null, null,
      jsonb_build_object(
        'draw_version', v_new_version,
        'participant_count', array_length(v_participants, 1)
      )
    );
  else
    perform private.append_group_event(
      caller_id, p_group_id, 'draw_redrawn', null, null,
      jsonb_build_object(
        'draw_version', v_new_version,
        'previous_draw_version', v_version,
        'participant_count', array_length(v_participants, 1)
      )
    );
  end if;

  return query select 'drawn'::text, v_new_version;
end;
$$;

comment on function public.run_secret_draw(uuid, integer) is
  'Organizer-only transactional secret draw: compare-and-swap expected version, cryptographically seeded derangement over the current participating roster, generation-bound assignment rows, a monotonic version bump, and exactly one audit event. Failed operations write nothing.';

-- ---------------------------------------------------------------------------
-- Read projections: single-statement, current-version, generation-bound.
-- ---------------------------------------------------------------------------

create function public.my_assignment(p_group_id uuid)
returns table (
  draw_version integer,
  recipient_id uuid,
  recipient_display_name text,
  is_valid boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.draw_version,
    case
      when rm.status = 'joined'
        and rm.membership_generation = a.recipient_membership_generation
      then a.recipient_id
    end,
    case
      when rm.status = 'joined'
        and rm.membership_generation = a.recipient_membership_generation
      then coalesce(pr.display_name, 'Member')
    end,
    (rm.status = 'joined'
      and rm.membership_generation = a.recipient_membership_generation)
  from public."groups" g
  join public.group_members me
    on me.group_id = g.id
   and me.user_id = auth.uid()
   and me.status = 'joined'
  join public.group_assignments a
    on a.group_id = g.id
   and a.draw_version = g.current_draw_version
   and a.giver_id = me.user_id
   and a.giver_membership_generation = me.membership_generation
  join public.group_members rm
    on rm.group_id = g.id
   and rm.user_id = a.recipient_id
  left join public.profiles pr on pr.id = a.recipient_id
  where g.id = p_group_id
    and g.status = 'active'
    and g.mode = 'secret_draw'
$$;

comment on function public.my_assignment(uuid) is
  'The caller''s own current assignment, from one statement snapshot. An invalidated recipient renders is_valid = false with both recipient columns null; every denial class — outsider, pending, left, removed, stale own generation, wrong mode, archived, no draw, superseded version — returns zero rows.';

create function public.group_draw_state(p_group_id uuid)
returns table (
  draw_version integer,
  drawn_at timestamptz,
  participant_count integer,
  roster_in_sync boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.current_draw_version,
    (select max(a.created_at)
      from public.group_assignments a
      where a.group_id = g.id
        and a.draw_version = g.current_draw_version),
    coalesce((
      select count(*)::integer
      from public.group_assignments a
      where a.group_id = g.id
        and a.draw_version = g.current_draw_version
    ), 0),
    case
      when g.current_draw_version is null then true
      else (
        -- Existence metadata only: the current eligible roster still matches
        -- the assignment bindings exactly. Never any giver-recipient pair.
        (select count(*) from public.group_members m
          where m.group_id = g.id and m.status = 'joined' and m.participating)
        = (select count(*) from public.group_assignments a
          where a.group_id = g.id and a.draw_version = g.current_draw_version)
        and not exists (
          select 1
          from public.group_members m
          join public.group_assignments a
            on a.group_id = m.group_id
           and a.giver_id = m.user_id
           and a.draw_version = g.current_draw_version
          where m.group_id = g.id
            and (m.status <> 'joined'
              or m.membership_generation <> a.giver_membership_generation)
        )
      )
    end as roster_in_sync
  from public."groups" g
  where g.id = p_group_id
    and g.status = 'active'
    and g.mode = 'secret_draw'
    and private.is_group_organizer(p_group_id)
$$;

comment on function public.group_draw_state(uuid) is
  'Organizer-only draw existence metadata: exactly (draw_version, drawn_at, participant_count, roster_in_sync). No giver-recipient pair, no viewed counts, no staleness attribution — the organizer is not omniscient.';

-- ---------------------------------------------------------------------------
-- The narrowly extended update_group_settings: the mode-change tombstone.
-- Nothing else about the 006a function changes.
-- ---------------------------------------------------------------------------

create or replace function public.update_group_settings(
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
  v_previous_mode public.group_mode;
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

  select g.mode into v_previous_mode
  from public."groups" g
  where g.id = p_group_id;

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

  -- The 008c tombstone: a committed mode change away from 'secret_draw'
  -- while a draw version exists bumps the monotonic version by exactly one
  -- in the same transaction, making the superseded version's assignments
  -- permanently unreachable (a mode round-trip never resurrects them).
  -- Assignment rows themselves are never mutated or deleted.
  if v_previous_mode = 'secret_draw'
    and p_mode <> 'secret_draw'
  then
    update public."groups"
    set current_draw_version = current_draw_version + 1
    where id = p_group_id
      and current_draw_version is not null;
  end if;

  return query select 'updated'::text;
end;
$$;

comment on function public.update_group_settings(uuid, text, text, timestamptz, text, text, text, bigint, text, text) is
  'Organizer-only settings update; authority is checked inside the transaction after the group lock. 008c extension: a mode change away from secret_draw tombstones an existing draw version by one monotonic bump, never mutating assignment rows.';

-- ---------------------------------------------------------------------------
-- Privilege inventory.
-- ---------------------------------------------------------------------------

revoke all on public.group_assignments from public;
revoke all on public.group_assignments from anon;
revoke all on public.group_assignments from authenticated;
revoke all on public.group_assignments from service_role;

alter table public.group_assignments enable row level security;

-- Deliberately no policy: no client role can read or write assignments
-- directly, including service_role through the application API.

revoke execute on function public.run_secret_draw(uuid, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.my_assignment(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_draw_state(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.derangement_from_bytes(uuid[], bytea)
  from public, anon, authenticated, service_role;

grant execute on function public.run_secret_draw(uuid, integer)
  to authenticated;
grant execute on function public.my_assignment(uuid)
  to authenticated;
grant execute on function public.group_draw_state(uuid)
  to authenticated;

-- private.derangement_from_bytes is granted to NO application role.

-- Rollback / forward-fix note: this migration is forward-only. The revert
-- path drops the three draw functions and group_assignments only, in
-- dependency order. The two enum values are permanent once added
-- (PostgreSQL has no ALTER TYPE ... DROP VALUE) and remain as harmless,
-- unused values. Reverting group_assignments deletes draw history
-- irreversibly: a revert is a deliberate data-destroying gate, never a
-- hotfix.
