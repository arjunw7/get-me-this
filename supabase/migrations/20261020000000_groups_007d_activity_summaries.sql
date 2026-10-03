-- 007d: member activity summaries that never leak private gifting state.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/007d-activity-summaries.md. Never edit this file once
-- it has been applied anywhere; fix forward with a new migration.
--
-- Scope: exactly two read-only SECURITY DEFINER projections,
-- public.group_activity(uuid, timestamptz, integer) and
-- public.member_activity(uuid, uuid, timestamptz, integer), plus their
-- revokes and the exact authenticated grants. No table, column, enum,
-- index, trigger, policy, or write path is added, and no existing
-- function signature, policy, or grant changes.
--
-- Contract highlights (brief "Read model", "Per-viewer visibility matrix"):
--   * Sources, exactly: the 006a audit kinds group_created,
--     invitation_accepted, member_left, member_removed, and
--     organizer_transferred; the 007c kinds item_reserved and
--     reservation_released; and 007a reaction rows. Invitation mechanics
--     (invitation_issued/revoked/declined, member_reinvited) are excluded
--     for every viewer.
--   * Owner blind spot: reservation entries on the viewer's own items never
--     appear — no row, no placeholder, no marker. The organizer has no
--     exemption: organizer status confers exactly the joined-member view.
--   * Reservation entries are state-only for every viewer except the
--     reserver: the reserver identity, reservation id, and release reason
--     are never returned. The reserver sees involves_viewer = true instead
--     of an actor name.
--   * Item titles resolve through the audit metadata's reservation_id to
--     group_item_reservations.item_title_snapshot — never through a direct
--     wishlist_items join, which a deleted item can no longer satisfy.
--   * Reaction entries use only the fields 007a's committed read surface
--     exposes to eligible members: the reaction's existence, the reacted
--     item, and the actor (the same class of fact 007a's friend-facing
--     summary exposes), restricted to authors currently joined — the same
--     authorship predicate 007a's counts apply.
--   * One-statement snapshot: authorization, per-viewer filtering, and
--     ordering are CTEs of a single SQL statement sharing one statement
--     snapshot; no volatile wall-clock call is required (the cursor is a
--     bound parameter), so the functions are honestly STABLE.
--   * Display names use the established generic Member/Organizer fallback
--     inside the statement, so the application never performs a direct
--     profile lookup.
--   * Every denial — signed-out, outsider, pending, declined, left,
--     removed, cross-group, stale target membership, unknown group —
--     returns zero rows, the same empty result for every denial class.
--   * No count, total, or aggregate field exists in either shape, so no
--     viewer can infer how many entries were withheld.
--   * SECURITY DEFINER owned by the trusted non-client database role,
--     empty search_path, schema-qualified objects, fixed types, no dynamic
--     SQL. EXECUTE is revoked from PUBLIC, anon, authenticated, and
--     service_role, then granted only to authenticated for the exact
--     signatures.

create function public.group_activity(
  p_group_id uuid,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table (
  event_kind text,
  occurred_at timestamptz,
  actor_display_name text,
  subject_display_name text,
  item_id uuid,
  item_title text,
  owner_display_name text,
  involves_viewer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    -- The one authorization verdict for the whole read: the group is in the
    -- currently supported active lifecycle state and the caller is a joined
    -- member (the 006a joined-member predicate, auth.uid()-derived).
    select
      g.id as group_id,
      g.organizer_id
    from public."groups" g
    where g.id = p_group_id
      and g.status = 'active'
      and exists (
        select 1
        from public.group_members cm
        where cm.group_id = g.id
          and cm.user_id = auth.uid()
          and cm.status = 'joined'
      )
  ),
  membership_entries as (
    -- 006a kinds in the inventory. Invitation mechanics and token-adjacent
    -- kinds (invitation_issued, invitation_revoked, invitation_declined,
    -- member_reinvited) are excluded for every viewer.
    select
      ae.id,
      ae.event_type::text as event_kind,
      ae.occurred_at,
      ae.actor_id,
      ae.subject_user_id,
      null::uuid as reserver_id,
      null::uuid as entry_item_id,
      null::text as entry_item_title,
      null::uuid as item_owner_id,
      false as is_reservation
    from scope s
    join public.audit_events ae on ae.group_id = s.group_id
    where ae.event_type::text in (
        'group_created',
        'invitation_accepted',
        'member_left',
        'member_removed',
        'organizer_transferred'
      )
  ),
  reservation_entries as (
    -- 007c kinds, resolved through the metadata reservation_id to the
    -- reservation row's item_title_snapshot — never through a direct
    -- wishlist_items join. The owner's blind spot is total: the item's
    -- owner never sees the entry, and no reserver identity, reservation
    -- id, or release reason is carried into the output.
    select
      ae.id,
      ae.event_type::text as event_kind,
      ae.occurred_at,
      null::uuid as actor_id,
      ae.subject_user_id,
      r.reserver_id,
      r.item_id as entry_item_id,
      r.item_title_snapshot as entry_item_title,
      i.owner_id as item_owner_id,
      true as is_reservation
    from scope s
    join public.audit_events ae on ae.group_id = s.group_id
    join public.group_item_reservations r
      on r.id = (ae.metadata ->> 'reservation_id')::uuid
    left join public.wishlist_items i on i.id = r.item_id
    where ae.event_type::text in ('item_reserved', 'reservation_released')
      -- The owner blind spot: never the viewer's own items. (For an entry
      -- whose item row is gone, ownership is no longer attributable — the
      -- entry is state-only with the snapshot title and no identity.)
      and (i.owner_id is null or i.owner_id <> auth.uid())
  ),
  reaction_entries as (
    -- 007a reactions, within exactly the shape 007a's committed read
    -- surface exposes to eligible members: the reaction's existence on the
    -- item, the actor, and the owner's label — restricted to authors
    -- currently joined, the same authorship predicate 007a's counts apply.
    select
      r.id,
      'item_reacted'::text as event_kind,
      r.created_at as occurred_at,
      r.user_id as actor_id,
      null::uuid as subject_user_id,
      null::uuid as reserver_id,
      r.item_id as entry_item_id,
      i.title as entry_item_title,
      i.owner_id as item_owner_id,
      false as is_reservation
    from scope s
    join public.group_item_reactions r on r.group_id = s.group_id
    join public.wishlist_items i on i.id = r.item_id
    where exists (
        select 1
        from public.group_members rm
        where rm.group_id = r.group_id
          and rm.user_id = r.user_id
          and rm.status = 'joined'
      )
  ),
  unified as (
    select
      m.id,
      m.event_kind,
      m.occurred_at,
      m.actor_id,
      m.subject_user_id,
      m.reserver_id,
      m.entry_item_id,
      m.entry_item_title,
      m.item_owner_id,
      m.is_reservation
    from membership_entries m
    union all
    select
      r.id, r.event_kind, r.occurred_at, r.actor_id, r.subject_user_id,
      r.reserver_id, r.entry_item_id, r.entry_item_title, r.item_owner_id,
      r.is_reservation
    from reservation_entries r
    union all
    select
      r.id, r.event_kind, r.occurred_at, r.actor_id, r.subject_user_id,
      r.reserver_id, r.entry_item_id, r.entry_item_title, r.item_owner_id,
      r.is_reservation
    from reaction_entries r
  ),
  labels as (
    -- The established generic fallback (Member, or Organizer for the
    -- group's organizer) applied inside the statement, so the application
    -- never performs a direct profile lookup.
    select
      u.uid,
      coalesce(
        nullif(btrim(pr.display_name, E' \t\n\r\u000B\u000C\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'), ''),
        case when u.uid = s.organizer_id then 'Organizer' else 'Member' end
      ) as display_name
    from (
      select distinct uid from (
        select e.actor_id as uid from unified e where e.actor_id is not null
        union
        select e.subject_user_id from unified e where e.subject_user_id is not null
        union
        select e.item_owner_id from unified e where e.item_owner_id is not null
      ) distinct_uids
    ) u
    cross join scope s
    left join public.profiles pr on pr.id = u.uid
  )
  select
    e.event_kind,
    e.occurred_at,
    case when e.is_reservation then null else a.display_name end as actor_display_name,
    case when e.is_reservation then null else sub.display_name end as subject_display_name,
    e.entry_item_id as item_id,
    e.entry_item_title as item_title,
    case when e.item_owner_id is null then null else own.display_name end as owner_display_name,
    case
      when e.is_reservation then (e.reserver_id = auth.uid())
      else (e.actor_id = auth.uid())
    end as involves_viewer
  from unified e
  cross join scope s
  left join labels a on a.uid = e.actor_id
  left join labels sub on sub.uid = e.subject_user_id
  left join labels own on own.uid = e.item_owner_id
  where p_before is null or e.occurred_at < p_before
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

comment on function public.group_activity(uuid, timestamptz, integer) is
  'The group activity summary: a bounded, keyset-ordered list of authorized membership, reservation, and reaction entries for the joined caller, filtered per viewer by the 007d visibility matrix — the owner sees no reservation entries for their own items, the organizer has no exemption, and reservation entries are state-only (never a reserver identity, reservation id, or release reason) except the reserver''s own self-labelled entries. Zero rows for every denial class.';

create function public.member_activity(
  p_group_id uuid,
  p_member_id uuid,
  p_before timestamptz default null,
  p_limit integer default 20
)
returns table (
  event_kind text,
  occurred_at timestamptz,
  actor_display_name text,
  subject_display_name text,
  item_id uuid,
  item_title text,
  owner_display_name text,
  involves_viewer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    -- The one authorization verdict: active group, joined caller, and the
    -- target member currently joined to the SAME group. Every denial,
    -- including stale target membership, returns zero rows.
    select
      g.id as group_id,
      g.organizer_id
    from public."groups" g
    where g.id = p_group_id
      and g.status = 'active'
      and exists (
        select 1
        from public.group_members cm
        where cm.group_id = g.id
          and cm.user_id = auth.uid()
          and cm.status = 'joined'
      )
      and exists (
        select 1
        from public.group_members tm
        where tm.group_id = g.id
          and tm.user_id = p_member_id
          and tm.status = 'joined'
      )
  ),
  membership_entries as (
    select
      ae.id,
      ae.event_type::text as event_kind,
      ae.occurred_at,
      ae.actor_id,
      ae.subject_user_id,
      null::uuid as reserver_id,
      null::uuid as entry_item_id,
      null::text as entry_item_title,
      null::uuid as item_owner_id,
      false as is_reservation
    from scope s
    join public.audit_events ae on ae.group_id = s.group_id
    where ae.event_type::text in (
        'group_created',
        'invitation_accepted',
        'member_left',
        'member_removed',
        'organizer_transferred'
      )
      -- Restricted to entries whose actor or membership subject is the
      -- target member.
      and (
        ae.actor_id = p_member_id
        or ae.subject_user_id = p_member_id
      )
  ),
  reservation_entries as (
    -- Binding 007d rule: another member's reservation entries never appear
    -- in their per-member activity at all — reserver identity is visible
    -- only to the reserver, so reservation-class entries appear only when
    -- the viewer IS the target member and the reserver. Self-labelled via
    -- involves_viewer, never an identity, id, or reason.
    select
      ae.id,
      ae.event_type::text as event_kind,
      ae.occurred_at,
      null::uuid as actor_id,
      ae.subject_user_id,
      r.reserver_id,
      r.item_id as entry_item_id,
      r.item_title_snapshot as entry_item_title,
      i.owner_id as item_owner_id,
      true as is_reservation
    from scope s
    join public.audit_events ae on ae.group_id = s.group_id
    join public.group_item_reservations r
      on r.id = (ae.metadata ->> 'reservation_id')::uuid
    left join public.wishlist_items i on i.id = r.item_id
    where ae.event_type::text in ('item_reserved', 'reservation_released')
      and r.reserver_id = p_member_id
      and r.reserver_id = auth.uid()
      and (i.owner_id is null or i.owner_id <> auth.uid())
  ),
  reaction_entries as (
    select
      r.id,
      'item_reacted'::text as event_kind,
      r.created_at as occurred_at,
      r.user_id as actor_id,
      null::uuid as subject_user_id,
      null::uuid as reserver_id,
      r.item_id as entry_item_id,
      i.title as entry_item_title,
      i.owner_id as item_owner_id,
      false as is_reservation
    from scope s
    join public.group_item_reactions r on r.group_id = s.group_id
    join public.wishlist_items i on i.id = r.item_id
    where r.user_id = p_member_id
      and exists (
        select 1
        from public.group_members rm
        where rm.group_id = r.group_id
          and rm.user_id = r.user_id
          and rm.status = 'joined'
      )
  ),
  unified as (
    select
      m.id, m.event_kind, m.occurred_at, m.actor_id, m.subject_user_id,
      m.reserver_id, m.entry_item_id, m.entry_item_title, m.item_owner_id,
      m.is_reservation
    from membership_entries m
    union all
    select
      r.id, r.event_kind, r.occurred_at, r.actor_id, r.subject_user_id,
      r.reserver_id, r.entry_item_id, r.entry_item_title, r.item_owner_id,
      r.is_reservation
    from reservation_entries r
    union all
    select
      r.id, r.event_kind, r.occurred_at, r.actor_id, r.subject_user_id,
      r.reserver_id, r.entry_item_id, r.entry_item_title, r.item_owner_id,
      r.is_reservation
    from reaction_entries r
  ),
  labels as (
    select
      u.uid,
      coalesce(
        nullif(btrim(pr.display_name, E' \t\n\r\u000B\u000C\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'), ''),
        case when u.uid = s.organizer_id then 'Organizer' else 'Member' end
      ) as display_name
    from (
      select distinct uid from (
        select e.actor_id as uid from unified e where e.actor_id is not null
        union
        select e.subject_user_id from unified e where e.subject_user_id is not null
        union
        select e.item_owner_id from unified e where e.item_owner_id is not null
      ) distinct_uids
    ) u
    cross join scope s
    left join public.profiles pr on pr.id = u.uid
  )
  select
    e.event_kind,
    e.occurred_at,
    case when e.is_reservation then null else a.display_name end as actor_display_name,
    case when e.is_reservation then null else sub.display_name end as subject_display_name,
    e.entry_item_id as item_id,
    e.entry_item_title as item_title,
    case when e.item_owner_id is null then null else own.display_name end as owner_display_name,
    case
      when e.is_reservation then (e.reserver_id = auth.uid())
      else (e.actor_id = auth.uid())
    end as involves_viewer
  from unified e
  cross join scope s
  left join labels a on a.uid = e.actor_id
  left join labels sub on sub.uid = e.subject_user_id
  left join labels own on own.uid = e.item_owner_id
  where p_before is null or e.occurred_at < p_before
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

comment on function public.member_activity(uuid, uuid, timestamptz, integer) is
  'The per-member activity summary: a bounded, keyset-ordered list of entries whose actor or membership subject is the target member, for a joined caller of the same active group with the target currently joined. Another member''s reservation entries never appear (reserver identity is visible only to the reserver''s own self-labelled entries); the same 007d matrix applies otherwise. Zero rows for every denial class, including stale target membership.';

revoke execute on function public.group_activity(uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.member_activity(uuid, uuid, timestamptz, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.group_activity(uuid, timestamptz, integer)
  to authenticated;
grant execute on function public.member_activity(uuid, uuid, timestamptz, integer)
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE immediately; a later
-- reviewed migration may drop the functions after the application no longer
-- calls them:
--   drop function public.group_activity(uuid, timestamptz, integer);
--   drop function public.member_activity(uuid, uuid, timestamptz, integer);
