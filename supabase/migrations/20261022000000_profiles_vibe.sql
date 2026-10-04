-- Persist the user-selected Vibe without broadening profile visibility.
-- Existing and newly created profiles retain the current marigold default.
-- Forward-only: see docs/architecture/profile-vibe.md for rollback notes.
alter table public.profiles
  add column vibe text not null default 'marigold'
  constraint profiles_vibe_allowed check (
    vibe in ('tomato', 'marigold', 'electric', 'acid_lime')
  );

comment on column public.profiles.vibe is
  'Wishlist presentation colour: tomato, marigold, electric, or acid_lime. Owner editable; no gifting semantics.';

-- The existing owner-only SELECT/UPDATE policies remain unchanged. SELECT
-- already covers the table; only this new UPDATE column privilege is needed.
grant update (vibe) on public.profiles to authenticated;

-- A separate projection avoids changing established room/wishlist RPC shapes.
-- Only a currently joined caller of an active group can read that group's
-- joined members' Vibes. Pending/former members and all other profile fields
-- are excluded. This statement never reads assignments or reservations.
create function public.group_member_vibes(p_group_id uuid)
returns table (member_user_id uuid, vibe text)
language sql
stable
security definer
set search_path = ''
as $$
  select member.user_id, profile.vibe
  from public.group_members as member
  join public.profiles as profile on profile.id = member.user_id
  join public."groups" as grp on grp.id = member.group_id
  where member.group_id = p_group_id
    and member.status = 'joined'
    and grp.status = 'active'
    and exists (
      select 1
      from public.group_members as caller
      where caller.group_id = member.group_id
        and caller.user_id = auth.uid()
        and caller.status = 'joined'
    )
  order by member.user_id
$$;

alter function public.group_member_vibes(uuid) owner to postgres;
comment on function public.group_member_vibes(uuid) is
  'Exactly joined member user_id and Vibe for an active group the caller currently belongs to. Identity is auth.uid(); zero rows for all denied membership/group states. No other profile, assignment, or reservation data.';
revoke execute on function public.group_member_vibes(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.group_member_vibes(uuid) to authenticated;
