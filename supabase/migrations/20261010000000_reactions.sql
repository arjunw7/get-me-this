-- 007a: group item reactions and read-only owner summaries.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/007a-reactions-owner-summaries.md. Never edit this
-- file once it has been applied anywhere; fix forward with a new migration.
--
-- Guarantees:
--   * One reaction per user per group/item context, enforced by the unique
--     (group_id, item_id, user_id) key; every write path goes through it.
--   * Least privilege: group_item_reactions has NO client table privileges
--     and a deny-all policy set (RLS enabled, zero policies). Exactly three
--     SECURITY DEFINER functions are executable, only by authenticated.
--   * Uniform denials: every function denial is indistinguishable and
--     enumerates nothing (zero rows, no distinguishing error detail).
--   * Counts include only reactions whose author is currently joined in the
--     same group; rows are durable history and never deleted on leave.
--   * No reactor identities, timestamps, or gifting-private data are ever
--     returned by any function.

create type public.group_item_reaction_kind as enum
  ('very_you', 'questionable', 'want_it_too');

create table public.group_item_reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."groups" (id) on delete restrict,
  item_id uuid not null references public.wishlist_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  reaction public.group_item_reaction_kind not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint group_item_reactions_unique_context
    unique (group_id, item_id, user_id)
);

comment on table public.group_item_reactions is
  'One reaction per user per group/item context; rows are durable history, never deleted on leave. Counts expose only aggregated per-kind numbers, never identities.';
comment on column public.group_item_reactions.reaction is
  'The closed three-value reaction vocabulary; display strings live in the UI, never here.';

-- Index on item_id supports the summary joins.
create index group_item_reactions_item_id_idx
  on public.group_item_reactions (item_id);

-- Database-managed updated_at, per the 005a/006a pattern.
create function public.set_group_item_reactions_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger group_item_reactions_set_updated_at
  before update on public.group_item_reactions
  for each row
  execute function public.set_group_item_reactions_updated_at();

-- Deny-all posture: RLS enabled, no policy of any kind, no client grants.
alter table public.group_item_reactions enable row level security;

revoke all on public.group_item_reactions from public;
revoke all on public.group_item_reactions from anon;
revoke all on public.group_item_reactions from authenticated;
revoke all on public.group_item_reactions from service_role;

-- ---------------------------------------------------------------------------
-- Public database API: three SECURITY DEFINER functions, empty search_path,
-- caller derived from auth.uid(), uniform denials.
-- ---------------------------------------------------------------------------

-- Write path: set (insert or replace), or remove with a null reaction. Both
-- behaviors run as one statement, so a concurrent replace and remove resolve
-- to a single committed winner under the unique key. The result is the
-- authoritative post-write summary counting only currently-joined authors.
create function public.set_group_item_reaction(
  p_group_id uuid,
  p_item_id uuid,
  p_reaction public.group_item_reaction_kind
)
returns table (
  very_you_count bigint,
  questionable_count bigint,
  want_it_too_count bigint,
  viewer_reaction public.group_item_reaction_kind
)
language sql
security definer
set search_path = ''
as $$
  with target as (
    -- Authorization, in one statement, before any write: the caller is
    -- currently joined in p_group_id; the item's owner is currently joined
    -- in the same group; the caller is not the owner; the group is active;
    -- the item satisfies the 006e active-item predicate. Any failure yields
    -- an empty set: a uniform, non-enumerating denial.
    select i.id as item_id
    from public.wishlist_items i
    where i.id = p_item_id
      and i.owner_id <> auth.uid()
      and i.extraction_status in ('manual', 'extracted')
      and exists (
        select 1 from public."groups" g
        where g.id = p_group_id and g.status = 'active'
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
          and om.user_id = i.owner_id
          and om.status = 'joined'
      )
  ),
  removed as (
    -- Removes the caller's row only when p_reaction is null; a no-op
    -- otherwise, so the two branches are mutually exclusive.
    delete from public.group_item_reactions r
    using target t
    where r.group_id = p_group_id
      and r.item_id = t.item_id
      and r.user_id = auth.uid()
      and p_reaction is null
    returning 1
  ),
  upserted as (
    insert into public.group_item_reactions (group_id, item_id, user_id, reaction)
    select p_group_id, t.item_id, auth.uid(), p_reaction
    from target t
    where p_reaction is not null
    on conflict (group_id, item_id, user_id) do update
      set reaction = excluded.reaction,
          updated_at = clock_timestamp()
    returning reaction
  ),
  base as (
    -- Pre-write per-kind counts over currently-joined authors, excluding the
    -- caller's own row (its effect is added back below from the CTE result).
    select
      count(*) filter (where r.reaction = 'very_you') as very_you,
      count(*) filter (where r.reaction = 'questionable') as questionable,
      count(*) filter (where r.reaction = 'want_it_too') as want_it_too
    from public.group_item_reactions r
    where r.group_id = p_group_id
      and r.item_id = (select item_id from target)
      and r.user_id <> auth.uid()
      and exists (
        select 1 from public.group_members rm
        where rm.group_id = r.group_id
          and rm.user_id = r.user_id
          and rm.status = 'joined'
      )
  ),
  final as (
    select
      b.very_you
        + (case when p_reaction = 'very_you' then 1 else 0 end)::bigint as very_you_count,
      b.questionable
        + (case when p_reaction = 'questionable' then 1 else 0 end)::bigint as questionable_count,
      b.want_it_too
        + (case when p_reaction = 'want_it_too' then 1 else 0 end)::bigint as want_it_too_count
    from base b
  )
  select
    f.very_you_count,
    f.questionable_count,
    f.want_it_too_count,
    (select reaction from upserted) as viewer_reaction
  from final f
  where exists (select 1 from target)
$$;

comment on function public.set_group_item_reaction(uuid, uuid, public.group_item_reaction_kind) is
  'Set, replace, or remove the caller''s single reaction for the group/item context; returns the authoritative post-write joined-author summary. Every denial is the same empty, non-enumerating result.';

-- Friend-facing read: one row per item the 006e snapshot would show, in 005d
-- order, including zero-count rows. One statement, one PostgreSQL statement
-- snapshot; authorizations and reads never straddle a membership change.
create function public.group_item_reaction_snapshot(
  p_group_id uuid,
  p_member_id uuid
)
returns table (
  item_id uuid,
  very_you_count bigint,
  questionable_count bigint,
  want_it_too_count bigint,
  viewer_reaction public.group_item_reaction_kind
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    (
      select count(*) from public.group_item_reactions r
      where r.item_id = i.id
        and r.group_id = p_group_id
        and r.reaction = 'very_you'
        and exists (
          select 1 from public.group_members rm
          where rm.group_id = r.group_id
            and rm.user_id = r.user_id
            and rm.status = 'joined'
        )
    )::bigint,
    (
      select count(*) from public.group_item_reactions r
      where r.item_id = i.id
        and r.group_id = p_group_id
        and r.reaction = 'questionable'
        and exists (
          select 1 from public.group_members rm
          where rm.group_id = r.group_id
            and rm.user_id = r.user_id
            and rm.status = 'joined'
        )
    )::bigint,
    (
      select count(*) from public.group_item_reactions r
      where r.item_id = i.id
        and r.group_id = p_group_id
        and r.reaction = 'want_it_too'
        and exists (
          select 1 from public.group_members rm
          where rm.group_id = r.group_id
            and rm.user_id = r.user_id
            and rm.status = 'joined'
        )
    )::bigint,
    case when auth.uid() = p_member_id then null::public.group_item_reaction_kind else (
      select r.reaction from public.group_item_reactions r
      where r.item_id = i.id
        and r.group_id = p_group_id
        and r.user_id = auth.uid()
      limit 1
    ) end
  from public.wishlist_items i
  where i.owner_id = p_member_id
    and i.extraction_status in ('manual', 'extracted')
    and exists (
      select 1 from public."groups" g
      where g.id = p_group_id and g.status = 'active'
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

comment on function public.group_item_reaction_snapshot(uuid, uuid) is
  'One-statement friend-facing reaction summary per visible item (005d order, zero-count rows included, viewer''s own reaction attached); denials return zero rows.';

-- Owner-facing read: per-kind counts for the caller's own items, aggregated
-- across every group where the caller is currently joined, counting only
-- currently-joined authors of that group. No parameters, no identities.
create function public.own_item_reaction_summary()
returns table (
  item_id uuid,
  very_you_count bigint,
  questionable_count bigint,
  want_it_too_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    (
      select count(*) from public.group_item_reactions r
      where r.item_id = i.id
        and r.reaction = 'very_you'
        and exists (
          select 1 from public.group_members om
          where om.group_id = r.group_id
            and om.user_id = auth.uid()
            and om.status = 'joined'
        )
        and exists (
          select 1 from public.group_members rm
          where rm.group_id = r.group_id
            and rm.user_id = r.user_id
            and rm.status = 'joined'
        )
    )::bigint,
    (
      select count(*) from public.group_item_reactions r
      where r.item_id = i.id
        and r.reaction = 'questionable'
        and exists (
          select 1 from public.group_members om
          where om.group_id = r.group_id
            and om.user_id = auth.uid()
            and om.status = 'joined'
        )
        and exists (
          select 1 from public.group_members rm
          where rm.group_id = r.group_id
            and rm.user_id = r.user_id
            and rm.status = 'joined'
        )
    )::bigint,
    (
      select count(*) from public.group_item_reactions r
      where r.item_id = i.id
        and r.reaction = 'want_it_too'
        and exists (
          select 1 from public.group_members om
          where om.group_id = r.group_id
            and om.user_id = auth.uid()
            and om.status = 'joined'
        )
        and exists (
          select 1 from public.group_members rm
          where rm.group_id = r.group_id
            and rm.user_id = r.user_id
            and rm.status = 'joined'
        )
    )::bigint
  from public.wishlist_items i
  where i.owner_id = auth.uid()
    and i.extraction_status in ('manual', 'extracted')
  order by i.sort_position asc, i.id asc
$$;

comment on function public.own_item_reaction_summary() is
  'Read-only per-kind reaction counts for the caller''s own items across currently-joined group contexts; no identities, no timestamps, zero rows when signed out.';

-- ---------------------------------------------------------------------------
-- Privilege inventory: REVOKE every public function from all four roles
-- before the exact grant to authenticated only.
-- ---------------------------------------------------------------------------

revoke execute on function public.set_group_item_reaction(uuid, uuid, public.group_item_reaction_kind)
  from public, anon, authenticated, service_role;
revoke execute on function public.group_item_reaction_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.own_item_reaction_summary()
  from public, anon, authenticated, service_role;

grant execute on function public.set_group_item_reaction(uuid, uuid, public.group_item_reaction_kind)
  to authenticated;
grant execute on function public.group_item_reaction_snapshot(uuid, uuid)
  to authenticated;
grant execute on function public.own_item_reaction_summary()
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only; corrections
-- ship as a NEW migration. The revert path, in dependency order, is: drop
-- the three public functions, the updated_at trigger and its function, the
-- group_item_reactions table with its index and enum, then the
-- group_item_reaction_kind enum type. Reverting deletes reaction history
-- irreversibly, so a revert is a deliberate data-destroying gate, never a
-- hotfix.
