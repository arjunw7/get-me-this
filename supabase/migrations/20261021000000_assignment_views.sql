-- 008d: the private assignment-viewed state and the draw email-enqueue read.
--
-- Implements the binding brief
-- docs/delivery/issues/008d-assignment-view-and-redraw.md against the
-- untouched 008c contract (20261012020000_secret_draw.sql). This slice:
--   * public.group_assignment_views: a giver's private "seen" marker keyed
--     by the 008c assignment identity (group_id, draw_version, giver_id)
--     with the 006a composite RESTRICT foreign-key pattern. Rows are never
--     mutated or deleted; a redraw bumps the version, so superseded
--     versions' markers stay as internal history, unreachable by every
--     client projection. Deny-all RLS and no client grant.
--   * public.mark_assignment_viewed(uuid): insertable-only by the giver
--     through the reviewed definer function. Every denial class is a
--     non-enumerating no-op success.
--   * public.my_assignment_view_state(uuid): the caller's own viewed marker
--     for their current assignment version, or zero rows.
--   * public.draw_assignments_for_email(uuid): the narrowly reviewed
--     server-side read that feeds the 009a assignment-email enqueue in the
--     draw server action. Organizer-gated inside the function; uses exactly
--     the current-version, current-generation read predicate `my_assignment`
--     uses. Its output is consumed only by the enqueue path and is never
--     rendered, logged, or returned to any client surface. The 008c
--     projection `my_assignment` itself is not broadened.

create table public.group_assignment_views (
  group_id uuid not null,
  draw_version integer not null,
  giver_id uuid not null,
  viewed_at timestamptz not null default clock_timestamp(),

  primary key (group_id, draw_version, giver_id),
  -- The 006a composite RESTRICT pattern: a viewed marker can never attach to
  -- the wrong group, and no member, group, or account deletion can erase or
  -- orphan the private viewed history.
  constraint group_assignment_views_giver_member_fkey
    foreign key (group_id, giver_id)
    references public.group_members (group_id, user_id) on delete restrict
);

comment on table public.group_assignment_views is
  'A giver''s private viewed markers for their own current assignments, keyed by the 008c assignment identity. Rows are never mutated or deleted; superseded versions'' markers stay as internal history unreachable by every client projection. Deny-all RLS and no client grant; only the reviewed definer functions touch the table.';

-- ---------------------------------------------------------------------------
-- mark_assignment_viewed: insertable-only by the giver, non-enumerating.
-- ---------------------------------------------------------------------------

create function public.mark_assignment_viewed(p_group_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or p_group_id is null then
    return 'unavailable';
  end if;

  -- The exact current-version, current-generation read predicate
  -- `my_assignment` uses: the marker can only ever attach to the caller's
  -- own valid current assignment. Every denial class (outsider, pending,
  -- left, removed, stale own generation, wrong mode, archived, no draw)
  -- leaves the insert touching zero rows: a no-op success, never an
  -- enumeration oracle.
  insert into public.group_assignment_views (group_id, draw_version, giver_id)
  select g.id, g.current_draw_version, me.user_id
  from public."groups" g
  join public.group_members me
    on me.group_id = g.id
   and me.user_id = caller_id
   and me.status = 'joined'
  join public.group_assignments a
    on a.group_id = g.id
   and a.draw_version = g.current_draw_version
   and a.giver_id = me.user_id
   and a.giver_membership_generation = me.membership_generation
  where g.id = p_group_id
    and g.status = 'active'
    and g.mode = 'secret_draw'
  on conflict (group_id, draw_version, giver_id) do nothing;

  -- Both the marked and the nothing-to-mark cases succeed generically.
  return 'viewed';
end;
$$;

comment on function public.mark_assignment_viewed(uuid) is
  'The giver''s private viewed marker for their own current assignment. Zero matching rows (nothing to mark) is a no-op success; every denial class is the same no-op, never an enumeration oracle. Existing rows are never mutated or deleted.';

-- ---------------------------------------------------------------------------
-- my_assignment_view_state: the caller's own marker, or zero rows.
-- ---------------------------------------------------------------------------

create function public.my_assignment_view_state(p_group_id uuid)
returns table (draw_version integer, viewed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.draw_version, v.viewed_at
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
  join public.group_assignment_views v
    on v.group_id = g.id
   and v.draw_version = g.current_draw_version
   and v.giver_id = me.user_id
  where g.id = p_group_id
    and g.status = 'active'
    and g.mode = 'secret_draw'
$$;

comment on function public.my_assignment_view_state(uuid) is
  'The caller''s own viewed marker for their current assignment version, or zero rows. Private per giver: no cross-member read path exists. Every denial class returns zero rows.';

-- ---------------------------------------------------------------------------
-- draw_assignments_for_email: the narrowly reviewed server-side read that
-- feeds the 009a enqueue in the draw server action. Organizer-gated inside;
-- its rows carry exactly what each giver's own email may lawfully show and
-- are never returned to any client surface.
-- ---------------------------------------------------------------------------

create function public.draw_assignments_for_email(p_group_id uuid)
returns table (
  group_name text,
  occasion_date text,
  draw_version integer,
  giver_id uuid,
  recipient_display_name text,
  is_valid boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.name,
    to_char(g.occasion_at, 'YYYY-MM-DD'),
    a.draw_version,
    a.giver_id,
    case
      when rm.status = 'joined'
        and rm.membership_generation = a.recipient_membership_generation
      then coalesce(pr.display_name, 'Member')
    end,
    (rm.status = 'joined'
      and rm.membership_generation = a.recipient_membership_generation)
  from public."groups" g
  join public.group_members om
    on om.group_id = g.id
   and om.user_id = auth.uid()
   and om.status = 'joined'
  join public.group_assignments a
    on a.group_id = g.id
   and a.draw_version = g.current_draw_version
  join public.group_members gm
    on gm.group_id = g.id
   and gm.user_id = a.giver_id
   and gm.status = 'joined'
   and gm.membership_generation = a.giver_membership_generation
  join public.group_members rm
    on rm.group_id = g.id
   and rm.user_id = a.recipient_id
  left join public.profiles pr on pr.id = a.recipient_id
  where g.id = p_group_id
    and g.status = 'active'
    and g.mode = 'secret_draw'
    and g.organizer_id = auth.uid()
$$;

comment on function public.draw_assignments_for_email(uuid) is
  'The narrowly reviewed organizer-gated server-side read for the 009a assignment-email enqueue: the caller''s own group''s current-version, current-generation assignments under exactly the read predicate my_assignment uses. Non-organizers read zero rows. The output is consumed only by the enqueue path and is never rendered, logged, or returned to any client surface; my_assignment itself is not broadened.';

-- ---------------------------------------------------------------------------
-- The 008d integration correction for the 009a enqueue call path.
--
-- The 009a outbox grants EXECUTE on private.enqueue_email to service_role
-- only, but PostgREST exposes only the `public` and `graphql_public`
-- schemas, so no server-side caller — this slice's draw server action
-- included — could ever reach it. The narrowest correction that preserves
-- the 009a privilege model exactly: a public definer passthrough, EXECUTE
-- granted to service_role ONLY (never anon, authenticated, or PUBLIC). No
-- outbox behavior, worker, or template changes; the pinned
-- src/email/assignment-enqueue.ts contract is untouched.
-- ---------------------------------------------------------------------------

create function public.enqueue_email(
  p_idempotency_key text,
  p_template_key text,
  p_recipient_user_id uuid,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.enqueue_email(
    p_idempotency_key, p_template_key, p_recipient_user_id, p_payload
  );
end;
$$;

comment on function public.enqueue_email(text, text, uuid, jsonb) is
  '008d integration correction: the PostgREST-reachable passthrough to private.enqueue_email with the identical allowlist validation and idempotency, EXECUTE granted to service_role only. No client role can enqueue; all application enqueues go through the reviewed server action path.';

-- ---------------------------------------------------------------------------
-- Privilege inventory.
-- ---------------------------------------------------------------------------

revoke all on public.group_assignment_views from public;
revoke all on public.group_assignment_views from anon;
revoke all on public.group_assignment_views from authenticated;
revoke all on public.group_assignment_views from service_role;

alter table public.group_assignment_views enable row level security;

-- Deliberately no policy: no client role can read or write viewed markers
-- directly, including service_role through the application API.

revoke execute on function public.mark_assignment_viewed(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.my_assignment_view_state(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.draw_assignments_for_email(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.enqueue_email(text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.mark_assignment_viewed(uuid)
  to authenticated;
grant execute on function public.my_assignment_view_state(uuid)
  to authenticated;
grant execute on function public.draw_assignments_for_email(uuid)
  to authenticated;
grant execute on function public.enqueue_email(text, text, uuid, jsonb)
  to service_role;

-- Rollback / forward-fix note: the revert path drops the three new functions
-- and group_assignment_views in dependency order (functions first, then the
-- table). Viewed rows are ephemeral private state and their loss is
-- non-destructive; assignment history (group_assignments) is untouched.
-- The 008c migration is never edited.
