-- 008b: gift-everyone checklists.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/008b-gift-everyone-checklists.md. Never edit this
-- file once it has been applied anywhere; fix forward with a new migration.
--
-- What this adds on top of the 006a/006b group model and the 008a
-- gifting-surface projection:
--   * public.gift_checklist_status: the exactly-two-state entry lifecycle
--     ('todo', 'completed').
--   * public.gift_checklist_entries: per-giver private checklists keyed by
--     (group_id, giver_id, recipient_id). RLS is enabled with NO policy and
--     NO client grant of any kind — only the two reviewed definer functions
--     touch the table, so a recipient cannot read gifting rows about
--     themselves even in principle.
--   * public.gift_checklist_snapshot(uuid): the giver's own checklist — one
--     row per other current participant (or the authorized empty sentinel
--     when the caller is the only participant), from one statement snapshot.
--   * public.set_gift_checklist_entry_status(uuid, uuid, bigint, text): the
--     compare-and-swap status lifecycle with the 006a fixed lock order and
--     generic non-enumerating results ('updated' | 'conflict' |
--     'unavailable').
--   * Mode gating inside both functions: a group whose stored mode is not
--     'gift_everyone' receives the generic denial, per the 008a contract.
--     Mode transitions destroy no stored rows.

create type public.gift_checklist_status as enum ('todo', 'completed');

create table public.gift_checklist_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."groups" (id) on delete restrict,
  giver_id uuid not null references auth.users (id) on delete restrict,
  recipient_id uuid not null references auth.users (id) on delete restrict,
  status public.gift_checklist_status not null default 'todo',
  version bigint not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (group_id, giver_id, recipient_id),
  constraint gift_entry_giver_is_not_recipient check (giver_id <> recipient_id),
  constraint gift_entry_version_positive check (version >= 1),
  constraint gift_entry_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null))
);

comment on table public.gift_checklist_entries is
  'Per-giver private gift-everyone checklists. One entry per (group, giver, recipient); rows are durable progress and are never deleted by a leave, decline, or removal. No client grant and no permissive RLS policy: only the reviewed definer functions touch the table.';

comment on column public.gift_checklist_entries.version is
  'The optimistic-concurrency version: incremented atomically on every committed status change; the CAS arbitration key.';

-- The unique constraint serves the point lookups; the participation joins in
-- the snapshot read only (group_id, status, participating) columns of
-- group_members, which 006a's primary key and scans serve. One writer index
-- for the CAS update path.
create index gift_checklist_entries_giver_idx
  on public.gift_checklist_entries (group_id, giver_id);

-- Point-lookup index: the snapshot left-joins stored entries per (group,
-- giver, recipient); the unique constraint already serves it exactly, so no
-- additional index is added.

create function public.gift_checklist_snapshot(p_group_id uuid)
returns table (
  recipient_user_id uuid,
  recipient_display_name text,
  recipient_is_organizer boolean,
  entry_status public.gift_checklist_status,
  entry_version bigint,
  entry_completed_at timestamptz,
  participating_member_count bigint,
  budget_amount_minor bigint,
  budget_currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select m.user_id
    from public."groups" g
    join public.group_members m
      on m.group_id = g.id
     and m.user_id = auth.uid()
    where g.id = p_group_id
      and g.status = 'active'
      and g.mode = 'gift_everyone'
      and m.status = 'joined'
      and m.participating
  ),
  participants as (
    select m.user_id
    from public.group_members m
    where m.group_id = p_group_id
      and m.status = 'joined'
      and m.participating
  ),
  cnt as (
    select count(*)::bigint as n from participants
  ),
  grp as (
    select g.organizer_id, g.budget_amount_minor, g.budget_currency
    from public."groups" g
    where g.id = p_group_id
  ),
  -- One row per other current participant, with the stored entry state or
  -- the derived todo default.
  with_sentinel as (
  select
    p.user_id as recipient_user_id,
    coalesce(pr.display_name, 'Member') as recipient_display_name,
    (p.user_id = grp.organizer_id) as recipient_is_organizer,
    coalesce(e.status, 'todo') as entry_status,
    e.version as entry_version,
    e.completed_at as entry_completed_at,
    cnt.n as participating_member_count,
    grp.budget_amount_minor as budget_amount_minor,
    grp.budget_currency as budget_currency
  from participants p
  cross join caller c
  cross join cnt
  cross join grp
  left join public.profiles pr on pr.id = p.user_id
  left join public.gift_checklist_entries e
    on e.group_id = p_group_id
   and e.giver_id = (select user_id from caller)
   and e.recipient_id = p.user_id
  where p.user_id <> (select user_id from caller)
  union all
  -- The authorized empty sentinel: exactly one row when the caller is the
  -- only current participant. Every non-key column is null except the
  -- caller's own fallback display name.
  select
    null::uuid as recipient_user_id,
    coalesce(pr.display_name, 'Member') as recipient_display_name,
    null::boolean as recipient_is_organizer,
    null::public.gift_checklist_status as entry_status,
    null::bigint as entry_version,
    null::timestamptz as entry_completed_at,
    null::bigint as participating_member_count,
    null::bigint as budget_amount_minor,
    null::text as budget_currency
  from caller c
  cross join cnt
  left join public.profiles pr on pr.id = c.user_id
  where cnt.n = 1
)
select * from with_sentinel
order by (recipient_user_id is null) desc,
  lower(recipient_display_name) asc,
  recipient_user_id asc nulls last
$$;

comment on function public.gift_checklist_snapshot(uuid) is
  'The caller''s own gift-everyone checklist from one statement snapshot: one row per other current participant (derived todo state for absent entries), the authorized empty sentinel when the caller is the only participant, and zero rows for every denial class. Never surfaces another member''s checklist or any gifting state about the caller.';

create function public.set_gift_checklist_entry_status(
  p_group_id uuid,
  p_recipient_id uuid,
  p_expected_version bigint,
  p_status text
)
returns table (result text, version bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_new_version bigint;
begin
  if caller_id is null
    or p_group_id is null
    or p_recipient_id is null
    or p_status not in ('todo', 'completed')
  then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  -- Fixed lock order: the groups row FOR UPDATE first.
  if not exists (
    select 1 from public."groups" g
    where g.id = p_group_id
      and g.status = 'active'
      and g.mode = 'gift_everyone'
    for update
  ) then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  -- Then the giver's and recipient's membership rows by ascending user id.
  perform 1
  from public.group_members m
  where m.group_id = p_group_id
    and (m.user_id = caller_id or m.user_id = p_recipient_id)
  order by m.user_id
  for update;

  -- Authority checks run inside the transaction after the locks, against
  -- the locked rows. Every failure is the same generic result.
  if not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = caller_id
      and m.status = 'joined'
      and m.participating
  ) or not exists (
    select 1
    from public.group_members m
    where m.group_id = p_group_id
      and m.user_id = p_recipient_id
      and m.status = 'joined'
      and m.participating
  ) or p_recipient_id = caller_id then
    return query select 'unavailable'::text, null::bigint;
    return;
  end if;

  if p_expected_version is null then
    -- First marking: the unique constraint arbitrates a concurrent first
    -- insert; the loser returns conflict with the winner's new version.
    begin
      insert into public.gift_checklist_entries
        (group_id, giver_id, recipient_id, status, completed_at, version)
      values (
        p_group_id, caller_id, p_recipient_id, p_status::public.gift_checklist_status,
        case when p_status = 'completed' then clock_timestamp() else null end,
        1
      );
      -- The insert sets version 1 exactly; plpgsql variable substitution
      -- makes RETURNING unreliable for the OUT column name.
      v_new_version := 1;
    exception
      when unique_violation then
        select en.version into v_new_version
        from public.gift_checklist_entries en
        where en.group_id = p_group_id
          and en.giver_id = caller_id
          and en.recipient_id = p_recipient_id;
        return query select 'conflict'::text, v_new_version;
        return;
    end;
  else
    -- Optimistic compare-and-swap: only an exact version match writes.
    update public.gift_checklist_entries
    set status = p_status::public.gift_checklist_status,
        completed_at = case when p_status = 'completed' then clock_timestamp() else null end,
        updated_at = clock_timestamp(),
        version = public.gift_checklist_entries.version + 1
    where group_id = p_group_id
      and giver_id = caller_id
      and recipient_id = p_recipient_id
      and public.gift_checklist_entries.version = p_expected_version
    returning public.gift_checklist_entries.version into v_new_version;

    if not found then
      select en.version into v_new_version
      from public.gift_checklist_entries en
      where en.group_id = p_group_id
        and en.giver_id = caller_id
        and en.recipient_id = p_recipient_id;
      return query select 'conflict'::text, v_new_version;
      return;
    end if;
  end if;

  return query select 'updated'::text, v_new_version;
end;
$$;

comment on function public.set_gift_checklist_entry_status(uuid, uuid, bigint, text) is
  'Compare-and-swap checklist status lifecycle: exactly updated (with the new version) or conflict (with the current version) for an authorized giver of an active gift_everyone group, and the generic unavailable denial for every other caller and mode. Locks the group row first, then membership rows by ascending user id; writes nothing on any failure.';

-- ---------------------------------------------------------------------------
-- Privilege inventory: the table gets no client privilege at all; the two
-- functions get the exact authenticated grant only.
-- ---------------------------------------------------------------------------

revoke all on public.gift_checklist_entries from public;
revoke all on public.gift_checklist_entries from anon;
revoke all on public.gift_checklist_entries from authenticated;
revoke all on public.gift_checklist_entries from service_role;

alter table public.gift_checklist_entries enable row level security;

-- Deliberately no policy: application roles have no direct table privilege
-- or permissive RLS policy; only the definer functions touch the table.

revoke execute on function public.gift_checklist_snapshot(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.set_gift_checklist_entry_status(uuid, uuid, bigint, text)
  from public, anon, authenticated, service_role;

grant execute on function public.gift_checklist_snapshot(uuid)
  to authenticated;
grant execute on function public.set_gift_checklist_entry_status(uuid, uuid, bigint, text)
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE on both functions
-- immediately, after which the surface fails closed everywhere; a later
-- reviewed migration may drop the functions and the table once the
-- application no longer calls them. Stored entries are durable progress;
-- never delete rows to restore behavior, and never weaken RLS.
