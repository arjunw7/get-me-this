-- Home: the authenticated home's single read projection for the caller's
-- groups.
--
-- Forward-only migration implementing the fast-lane brief "real
-- authenticated home". Never edit this file once it has been applied
-- anywhere; fix forward with a new migration (see supabase/README.md).
--
-- Scope: exactly one function, public.my_groups_snapshot(), plus its
-- revokes and the exact authenticated EXECUTE grant. No table, column,
-- enum, index, trigger, seed row, audit event, or direct table privilege is
-- added, and no existing function signature changes. A new FUNCTION adds no
-- public table, so the 002d smoke suite's table count is unaffected.
--
-- Contract highlights:
--   * The caller is derived ONLY from auth.uid(); a membership counts only
--     where its status is exactly 'joined' and the group is in the
--     supported active lifecycle state. Null auth, invited/declined/left/
--     removed memberships, and inactive groups return zero rows.
--   * The body is ONE data-reading SQL statement; authorization, the
--     active filter, the joined count, and the returned rows are all part
--     of that one statement and therefore share one statement snapshot.
--   * No volatile wall-clock call is required (no expiry comparison), so
--     the function is honestly labelled STABLE.
--   * Deterministic order: oldest group first (created_at asc), then group
--     id asc as the tiebreak. Ordering is presentation only.
--   * SECURITY DEFINER owned by the trusted non-client database role,
--     empty search_path, schema-qualified objects, fixed types, no dynamic
--     SQL. EXECUTE is revoked from PUBLIC, anon, authenticated, and
--     service_role, then granted only to authenticated for the exact ()
--     overload. No new table or schema privilege is added for any role.

create function public.my_groups_snapshot()
returns table (
  group_id uuid,
  group_name text,
  occasion text,
  occasion_at timestamp without time zone,
  time_zone text,
  location text,
  mode text,
  joined_member_count bigint,
  caller_is_organizer boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.occasion,
    -- The stored instant rendered as the group-zone wall clock: the
    -- calendar day is the group's, never the viewer's.
    (g.occasion_at at time zone g.time_zone),
    g.time_zone,
    g.location,
    g.mode::text,
    (
      select count(*)::bigint
      from public.group_members jm
      where jm.group_id = g.id
        and jm.status = 'joined'
    ),
    (g.organizer_id = auth.uid())
  from public."groups" g
  where g.status = 'active'
    and exists (
      select 1
      from public.group_members m
      where m.group_id = g.id
        and m.user_id = auth.uid()
        and m.status = 'joined'
    )
  order by g.created_at asc, g.id asc
$$;

comment on function public.my_groups_snapshot() is
  'The authenticated home''s one-statement snapshot: one deterministic row per active group the caller has joined, derived from auth.uid() only. Empty for every outsider, non-joined membership state, and inactive group.';

revoke execute on function public.my_groups_snapshot()
  from public, anon, authenticated, service_role;

grant execute on function public.my_groups_snapshot()
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE immediately; a later
-- reviewed migration may drop the function after the application no longer
-- calls it: drop function public.my_groups_snapshot();
