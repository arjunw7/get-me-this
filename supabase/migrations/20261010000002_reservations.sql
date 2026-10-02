-- 007c (part 2 of 2): atomic private reservations with race tests.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/007c-atomic-private-reservations.md. Never edit this
-- file once it has been applied anywhere; fix forward.
--
-- Guarantees:
--   * Exactly one active reservation per group and item: the partial unique
--     index backstops the transactional claim function; no co-reservation.
--   * Owner-blind: the item's owner learns nothing. The table has no client
--     grants and no RLS policies; every read goes through narrowly granted
--     SECURITY DEFINER projections whose owner path never reads reservation
--     rows for the owner's own items.
--   * Departure releases: a reserver's transition to left/removed releases
--     their active reservations in the same transaction (reason
--     `reserver_departed`), silently, with one audit event per release.
--   * Owner deletion is unaffected: a BEFORE DELETE trigger on
--     wishlist_items releases any active reservation (reason
--     `item_deleted`) before the FK nulls item_id; no audit event, no
--     notification, no observable difference for the owner.
--   * Fixed lock order (extends 006a): groups row FOR UPDATE, then the
--     wishlist_items row, then existing reservation rows by ascending id;
--     clock_timestamp() is evaluated only after all locks are held.
--   * 006a amendment 2 of 2: the audit metadata allowlist gains exactly
--     `item_id` and `reservation_id`.

create type public.group_reservation_status as enum
  ('active', 'released');

create type public.group_reservation_release_reason as enum
  ('by_reserver', 'item_deleted', 'reserver_departed');

create table public.group_item_reservations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."groups" (id) on delete restrict,
  item_id uuid references public.wishlist_items (id) on delete set null,
  reserver_id uuid not null references auth.users (id) on delete restrict,
  status public.group_reservation_status not null default 'active',
  item_title_snapshot text not null,
  reserved_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  released_reason public.group_reservation_release_reason,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint group_item_reservations_title_snapshot_bounded check (
    item_title_snapshot !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
    and char_length(item_title_snapshot) <= 200
  ),
  constraint group_item_reservations_release_pair check (
    (released_at is null) = (released_reason is null)
  )
);

comment on table public.group_item_reservations is
  'Durable private reservation history; rows are never deleted. The owner of a reserved item can never observe any of this through the application.';
comment on column public.group_item_reservations.item_title_snapshot is
  'The item title captured at claim time; keeps a released row meaningful after the item is deleted.';
comment on column public.group_item_reservations.released_reason is
  'Why the reservation ended: by_reserver, item_deleted (no audit event), or reserver_departed.';

-- The database-level one-winner invariant: at most one active reservation
-- per group and item.
create unique index group_item_reservations_one_active
  on public.group_item_reservations (group_id, item_id)
  where status = 'active';

create index group_item_reservations_reserver_idx
  on public.group_item_reservations (reserver_id)
  where status = 'active';

-- Deny-all posture: RLS enabled, no policy of any kind, no client grants.
alter table public.group_item_reservations enable row level security;

revoke all on public.group_item_reservations from public;
revoke all on public.group_item_reservations from anon;
revoke all on public.group_item_reservations from authenticated;
revoke all on public.group_item_reservations from service_role;

-- Managed updated_at, per the 005a/006a pattern.
create function public.set_group_item_reservations_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger group_item_reservations_set_updated_at
  before update on public.group_item_reservations
  for each row
  execute function public.set_group_item_reservations_updated_at();

-- Owner deletion must never fail or differ because of a reservation: release
-- any active reservation before the FK ON DELETE SET NULL nulls item_id.
-- Silent: no audit event, no notification, no analytics.
create function public.release_reservations_on_item_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_item_reservations r
  set status = 'released',
      released_at = clock_timestamp(),
      released_reason = 'item_deleted'
  where r.item_id = old.id
    and r.status = 'active';
  return old;
end;
$$;

create trigger wishlist_items_release_reservations_before_delete
  before delete on public.wishlist_items
  for each row
  execute function public.release_reservations_on_item_delete();

-- Departure releases the reserver's active reservations in the same
-- transaction as the membership transition, with the same single audit
-- event as an explicit release (actor is the departing reserver).
create function public.release_reservations_on_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status not in ('left', 'removed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  for r in
    select id, item_id
    from public.group_item_reservations
    where group_id = new.group_id
      and reserver_id = new.user_id
      and status = 'active'
    order by id asc
  loop
    update public.group_item_reservations
    set status = 'released',
        released_at = clock_timestamp(),
        released_reason = 'reserver_departed'
    where id = r.id
      and status = 'active';

    perform private.append_group_event(
      new.user_id,
      new.group_id,
      'reservation_released',
      null,
      null,
      coalesce(
        jsonb_build_object('reservation_id', r.id)
        || case when r.item_id is not null
          then jsonb_build_object('item_id', r.item_id)
        end,
        '{}'::jsonb
      )
    );
  end loop;

  return new;
end;
$$;

create trigger group_members_release_reservations_on_departure
  after insert or update of status on public.group_members
  for each row
  execute function public.release_reservations_on_departure();

-- 006a amendment 2 of 2: exactly item_id and reservation_id join the safe
-- metadata allowlist. Not loosened beyond these two keys.
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
              'item_id',
              'reservation_id'
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
  'CHECK helper (007c amendment): audit metadata is a bounded object of identifier/generation keys only; 006b''s two system migration keys are preserved and 007c adds item_id and reservation_id.';

-- ---------------------------------------------------------------------------
-- Atomic claim and lifecycle.
-- ---------------------------------------------------------------------------

create function public.reserve_group_item(
  p_group_id uuid,
  p_item_id uuid
)
returns table (result text, reservation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_group_id uuid;
  v_item record;
  v_active_id uuid;
  v_active_reserver uuid;
  v_new_id uuid;
begin
  if caller_id is null or p_group_id is null or p_item_id is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Fixed lock order (006a convention): the groups row first.
  select g.id into v_group_id
  from public."groups" g
  where g.id = p_group_id
    and g.status = 'active'
  for update;
  if v_group_id is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Then the wishlist_items row, with the 006e active-item predicate.
  select i.id, i.owner_id, i.title into v_item
  from public.wishlist_items i
  where i.id = p_item_id
    and i.extraction_status in ('manual', 'extracted')
  for update;
  if v_item.id is null then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Eligibility (uniform across group modes): caller joined, owner joined,
  -- caller not the owner. Every failure is the same generic denial.
  if v_item.owner_id = caller_id
    or not exists (
      select 1 from public.group_members cm
      where cm.group_id = p_group_id
        and cm.user_id = caller_id
        and cm.status = 'joined'
    )
    or not exists (
      select 1 from public.group_members om
      where om.group_id = p_group_id
        and om.user_id = v_item.owner_id
        and om.status = 'joined'
    )
  then
    return query select 'unavailable'::text, null::uuid;
    return;
  end if;

  -- Then any existing reservation rows for the context, by ascending id.
  -- Locking them also serializes against a concurrent claim's insert via
  -- the partial unique index.
  begin
    select r.id, r.reserver_id into v_active_id, v_active_reserver
    from public.group_item_reservations r
    where r.group_id = p_group_id
      and r.item_id = p_item_id
      and r.status = 'active'
    order by r.id asc
    for update;

    if v_active_id is not null then
      if v_active_reserver = caller_id then
        -- Idempotent no-write replay: no second row, no second audit event.
        return query select 'already_yours'::text, v_active_id;
        return;
      end if;
      return query select 'conflict'::text, null::uuid;
      return;
    end if;

    -- clock_timestamp() is evaluated only after all locks are held.
    insert into public.group_item_reservations (
      group_id, item_id, reserver_id, status, item_title_snapshot
    )
    values (
      p_group_id, p_item_id, caller_id, 'active', v_item.title
    )
    returning id into v_new_id;

    perform private.append_group_event(
      caller_id,
      p_group_id,
      'item_reserved',
      null,
      v_item.owner_id,
      jsonb_build_object('item_id', p_item_id, 'reservation_id', v_new_id)
    );

    return query select 'reserved'::text, v_new_id;
    return;
  exception
    when unique_violation then
      -- The index backstop: convert a losing index race into the friendly
      -- conflict with no partial effects (the subtransaction already rolled
      -- back the only attempted write).
      return query select 'conflict'::text, null::uuid;
      return;
  end;
end;
$$;

comment on function public.reserve_group_item(uuid, uuid) is
  'Atomically claim the single active reservation for a group and item. Results: reserved, already_yours (idempotent replay), conflict (another member holds it), unavailable (every denial class, indistinguishable).';

create function public.release_group_reservation(
  p_group_id uuid,
  p_reservation_id uuid
)
returns table (result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_group_id uuid;
  v_r record;
begin
  if caller_id is null or p_group_id is null or p_reservation_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  -- Fixed lock order: the groups row first.
  select g.id into v_group_id
  from public."groups" g
  where g.id = p_group_id
    and g.status = 'active'
  for update;
  if v_group_id is null then
    return query select 'unavailable'::text;
    return;
  end if;

  select r.* into v_r
  from public.group_item_reservations r
  where r.id = p_reservation_id
    and r.group_id = p_group_id
  for update;

  if v_r.id is null or v_r.reserver_id <> caller_id then
    -- Unknown reservation or not the reserver: identical generic denial.
    return query select 'unavailable'::text;
    return;
  end if;

  if v_r.status = 'released' then
    -- Idempotent replay: success, no second audit event.
    return query select 'released'::text;
    return;
  end if;

  update public.group_item_reservations
  set status = 'released',
      released_at = clock_timestamp(),
      released_reason = 'by_reserver'
  where id = v_r.id;

  perform private.append_group_event(
    caller_id,
    p_group_id,
    'reservation_released',
    null,
    null,
    coalesce(
      jsonb_build_object('reservation_id', v_r.id)
      || case when v_r.item_id is not null
        then jsonb_build_object('item_id', v_r.item_id)
      end,
      '{}'::jsonb
    )
  );

  return query select 'released'::text;
end;
$$;

comment on function public.release_group_reservation(uuid, uuid) is
  'Reserver-only release; idempotent for an already-released own reservation; every failure class is the same unavailable result.';

-- ---------------------------------------------------------------------------
-- Read model (owner-blind).
-- ---------------------------------------------------------------------------

create function public.my_group_reservations(p_group_id uuid)
returns table (
  reservation_id uuid,
  item_id uuid,
  item_title_snapshot text,
  owner_display_name text,
  reserved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.item_id,
    r.item_title_snapshot,
    coalesce(p.display_name, 'Member'),
    r.reserved_at
  from public.group_item_reservations r
  left join public.wishlist_items i on i.id = r.item_id
  left join public.profiles p on p.id = i.owner_id
  where r.group_id = p_group_id
    and r.reserver_id = auth.uid()
    and r.status = 'active'
    and exists (
      select 1 from public.group_members cm
      where cm.group_id = r.group_id
        and cm.user_id = auth.uid()
        and cm.status = 'joined'
    )
    and exists (
      select 1 from public."groups" g
      where g.id = r.group_id
        and g.status = 'active'
    )
  order by r.reserved_at desc, r.id asc
$$;

comment on function public.my_group_reservations(uuid) is
  'The caller''s own active reservations in the group, with the generic Member owner fallback; empty for every denial class and never reveals another member''s reservations.';

-- The gifting read model for the 006e browse surface: the item columns plus
-- exactly viewer_reserved and reserved_by_other. Owner-blind evaluation: for
-- the caller's own items both flags are false and the reservation table is
-- never evaluated. NOTE (fast-lane): 006e's frozen snapshot shape is not on
-- this base yet, so the item column list is the 005d public item projection;
-- aligning the exact 006e column set is a tracked wiring TODO.
create function public.member_wishlist_gifting_snapshot(
  p_group_id uuid,
  p_member_id uuid
)
returns table (
  item_id uuid,
  title text,
  image_url text,
  note text,
  desire_level public.wishlist_item_desire_level,
  original_amount_minor bigint,
  original_currency char(3),
  converted_amount_minor bigint,
  converted_currency char(3),
  sort_position double precision,
  viewer_reserved boolean,
  reserved_by_other boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.title,
    i.image_url,
    i.note,
    i.desire_level,
    i.original_amount_minor,
    i.original_currency,
    i.converted_amount_minor,
    i.converted_currency,
    i.sort_position,
    case
      when auth.uid() = p_member_id then false
      else exists (
        select 1 from public.group_item_reservations r
        where r.item_id = i.id
          and r.group_id = p_group_id
          and r.status = 'active'
          and r.reserver_id = auth.uid()
      )
    end,
    case
      when auth.uid() = p_member_id then false
      else exists (
        select 1 from public.group_item_reservations r
        where r.item_id = i.id
          and r.group_id = p_group_id
          and r.status = 'active'
          and r.reserver_id <> auth.uid()
      )
    end
  from public.wishlist_items i
  where i.owner_id = p_member_id
    and i.extraction_status in ('manual', 'extracted')
    and exists (
      select 1 from public."groups" g
      where g.id = p_group_id
        and g.status = 'active'
    )
    and exists (
      select 1 from public.group_members cm
      where cm.group_id = p_group_id
        and cm.user_id = auth.uid()
        and cm.status = 'joined'
    )
    and exists (
      select 1 from public.group_members om
      where om.group_id = p_group_id
        and om.user_id = p_member_id
        and om.status = 'joined'
    )
  order by i.sort_position asc, i.id asc
$$;

comment on function public.member_wishlist_gifting_snapshot(uuid, uuid) is
  'One-statement gifting read model for the 006e browse surface: the item projection plus viewer_reserved and reserved_by_other only — never a reservation id, reserver identity, count, or timestamp. The owner''s own output never reads reservation rows and is byte-identical however many reservations exist.';

-- ---------------------------------------------------------------------------
-- Privilege inventory.
-- ---------------------------------------------------------------------------

revoke execute on function public.reserve_group_item(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.release_group_reservation(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.my_group_reservations(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.member_wishlist_gifting_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.reserve_group_item(uuid, uuid) to authenticated;
grant execute on function public.release_group_reservation(uuid, uuid) to authenticated;
grant execute on function public.my_group_reservations(uuid) to authenticated;
grant execute on function public.member_wishlist_gifting_snapshot(uuid, uuid) to authenticated;

-- Rollback / forward-fix note: forward-only; corrections ship as NEW
-- migrations. The revert path, in dependency order, is: drop the four
-- public functions, the group_members and wishlist_items triggers and their
-- functions, restore the prior private.audit_metadata_is_safe body, drop the
-- group_item_reservations table with its indexes, then the two enum types;
-- the two group_audit_event_type values added by part 1 cannot be removed
-- (PostgreSQL enum values are permanent), which is acceptable because they
-- are additive vocabulary only. Reverting deletes reservation history — a
-- deliberate data-destroying gate, never a hotfix.
