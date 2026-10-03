-- 006d: the private group room's single read projection.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/006d-private-group-room-member-and-pending-states.md.
-- Never edit this file once it has been applied anywhere; fix forward with a
-- new migration (see supabase/README.md).
--
-- Scope: exactly one function, public.group_room_snapshot(uuid), plus its
-- revokes and the exact authenticated EXECUTE grant. No table, column,
-- enum, index, trigger, seed row, audit event, or direct table privilege is
-- added, and no existing function signature changes.
--
-- Contract highlights (brief "Exact private read model"):
--   * The caller is derived ONLY from auth.uid(); the caller's current
--     membership must be `joined` and the group must be in the supported
--     active lifecycle state. Null auth and every other membership state
--     return zero rows.
--   * The body is ONE data-reading SQL statement: authorization, the active
--     filter, the single volatile clock capture (checked_at :=
--     clock_timestamp()), the joined count, live targeted-pending
--     eligibility, profile fallback labels, and the returned rows are all
--     CTEs of that one statement and therefore share one statement
--     snapshot. Because the wall-clock call is volatile, the function is
--     NOT falsely labelled STABLE.
--   * A pending row exists only for a currently `invited` membership whose
--     exact (user, current generation) matches a targeted invitation that
--     is active, unexpired at the one captured check time, and within its
--     use limit. Generic links, revoked/expired/exhausted/stale-generation
--     tokens, and declined/left/removed rows produce no pending row.
--   * member_state is exactly 'joined' or 'invited'; member_is_organizer is
--     true only where member_user_id = organizer_id (invariantly joined).
--   * Deterministic order: caller first; then the organizer if different;
--     then other joined members by joined_at asc, user_id asc; then invited
--     members by case-folded display label asc, user ID asc. Ordering is
--     presentation only.
--   * SECURITY DEFINER owned by the trusted non-client database role,
--     empty search_path, schema-qualified objects, fixed types, no dynamic
--     SQL. EXECUTE is revoked from PUBLIC, anon, authenticated, and
--     service_role, then granted only to authenticated for the exact (uuid)
--     overload. No new table or schema privilege is added for any role.

create function public.group_room_snapshot(p_group_id uuid)
returns table (
  group_id uuid,
  organizer_id uuid,
  group_name text,
  occasion text,
  occasion_at timestamp without time zone,
  time_zone text,
  location text,
  description text,
  budget_amount_minor bigint,
  budget_currency char(3),
  mode text,
  group_status text,
  joined_member_count bigint,
  member_user_id uuid,
  member_display_name text,
  member_state text,
  member_is_organizer boolean
)
language sql
security definer
set search_path = ''
as $$
  with checked as (
    -- The single volatile wall-clock capture, evaluated once per statement
    -- execution: every expiry comparison below reads this one value.
    select clock_timestamp() as checked_at
  ),
  scope as (
    select
      g.id as group_id,
      g.organizer_id,
      g.name as group_name,
      g.occasion,
      -- The stored instant rendered as the group-zone wall clock: the
      -- calendar day is the group's, never the viewer's.
      (g.occasion_at at time zone g.time_zone) as occasion_at,
      g.time_zone,
      g.location,
      g.description,
      g.budget_amount_minor,
      g.budget_currency,
      g.mode::text as mode,
      g.status::text as group_status,
      (
        select count(*)::bigint
        from public.group_members jm
        where jm.group_id = g.id
          and jm.status = 'joined'
      ) as joined_member_count
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
  visible as (
    select
      m.user_id,
      m.status::text as member_state,
      m.joined_at
    from public.group_members m, checked c
    where m.group_id = (select group_id from scope)
      and (
        m.status = 'joined'
        or (
          m.status = 'invited'
          and exists (
            select 1
            from public.group_invitations i
            where i.group_id = (select group_id from scope)
              and i.target_user_id = m.user_id
              and i.target_membership_generation = m.membership_generation
              and i.status = 'active'
              and i.expires_at > c.checked_at
              and (i.max_uses is null or i.use_count < i.max_uses)
          )
        )
      )
  ),
  labelled as (
    select
      s.group_id,
      s.organizer_id,
      s.group_name,
      s.occasion,
      s.occasion_at,
      s.time_zone,
      s.location,
      s.description,
      s.budget_amount_minor,
      s.budget_currency,
      s.mode,
      s.group_status,
      s.joined_member_count,
      v.user_id as member_user_id,
      v.member_state,
      coalesce(
        nullif(btrim(pr.display_name, E' \t\n\r\u000B\u000C\u0085\u00A0\u1680\u2000\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'), ''),
        case
          when v.member_state = 'invited' then 'Invited member'
          when v.user_id = s.organizer_id then 'Organizer'
          else 'Member'
        end
      ) as member_display_name,
      (v.user_id = s.organizer_id) as member_is_organizer,
      v.joined_at as member_joined_at
    from scope s
    cross join visible v
    left join public.profiles pr on pr.id = v.user_id
  )
  select
    l.group_id,
    l.organizer_id,
    l.group_name,
    l.occasion,
    l.occasion_at,
    l.time_zone,
    l.location,
    l.description,
    l.budget_amount_minor,
    l.budget_currency,
    l.mode,
    l.group_status,
    l.joined_member_count,
    l.member_user_id,
    l.member_display_name,
    l.member_state,
    l.member_is_organizer
  from labelled l
  order by
    (l.member_user_id = auth.uid()) desc,
    (l.member_state = 'joined') desc,
    l.member_is_organizer desc,
    (case when l.member_state = 'joined' then l.member_joined_at end) asc,
    (case when l.member_state = 'invited'
      then lower(l.member_display_name) end) asc,
    l.member_user_id asc
$$;

comment on function public.group_room_snapshot(uuid) is
  'The private group room''s one-statement snapshot: the approved group facts plus one deterministic row per visible joined or pending member, for the joined caller derived from auth.uid() only. Empty for every outsider, non-joined state, and inactive group.';

revoke execute on function public.group_room_snapshot(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.group_room_snapshot(uuid)
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE immediately; a later
-- reviewed migration may drop the function after the application no longer
-- calls it: drop function public.group_room_snapshot(uuid);
