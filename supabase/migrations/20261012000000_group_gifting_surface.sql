-- 008a: share-wishlists-only mode — the single gifting-surface projection.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/008a-share-wishlists-only-mode.md. Never edit this
-- file once it has been applied anywhere; fix forward with a new migration.
--
-- What this adds on top of the 006a/006b group model:
--   * public.group_gifting_surface(uuid): one SECURITY DEFINER, STABLE,
--     single-statement projection returning the authoritative stored mode
--     and group status, whether a draw version exists (never its value),
--     the caller's current participating flag, and the participating
--     member count — to currently joined members of active groups only.
--     Every other caller receives zero rows with no distinguishing detail.
--   * No table, column, enum, index, trigger, seed row, policy, or direct
--     table privilege is added or changed. groups.mode and
--     current_draw_version are untouched; mode changes remain a
--     data-neutral stored value change made only by update_group_settings.
--
-- The projection makes no mode-independent claim about what the client may
-- do: it is an input to server rendering. The enforceable boundaries for
-- checklist and assignment state live inside the functions that own that
-- state (008b, 008c) and in unchanged RLS.

create function public.group_gifting_surface(p_group_id uuid)
returns table (
  mode public.group_mode,
  group_status public.group_status,
  has_draw_version boolean,
  caller_is_participating boolean,
  participating_member_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  -- One data-reading statement: authorization, the membership predicate,
  -- and the returned values share one PostgreSQL snapshot. Authorization is
  -- never a separate statement from the mode read.
  select
    g.mode,
    g.status,
    (g.current_draw_version is not null),
    m.participating,
    (
      select count(*)::bigint
      from public.group_members pm
      where pm.group_id = g.id
        and pm.status = 'joined'
        and pm.participating
    )
  from public."groups" g
  join public.group_members m
    on m.group_id = g.id
   and m.user_id = auth.uid()
   and m.status = 'joined'
  where g.id = p_group_id
    and g.status = 'active'
$$;

comment on function public.group_gifting_surface(uuid) is
  'Joined-member gifting-mode projection: exactly (mode, group_status, has_draw_version, caller_is_participating, participating_member_count) from one statement snapshot; zero rows for every unauthorized or inactive-group caller. Read-only; emits no audit event (a mode read is not a lifecycle change). Never exposes current_draw_version itself.';

-- Privilege inventory: revoke the default EXECUTE from every application
-- role before the exact grant.
revoke execute on function public.group_gifting_surface(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.group_gifting_surface(uuid)
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE immediately; a later
-- reviewed migration may drop the function after the application stops
-- calling it. No stored data is touched by this migration, so a revert
-- destroys nothing.
