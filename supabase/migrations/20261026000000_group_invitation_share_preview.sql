-- Link holders may share a read-only banner capability with chat crawlers.
-- SHA-256 of a 256-bit bearer is not a join bearer and cannot recover one.
-- No table grants, new storage, membership writes, or invitation uses.
create function public.group_invitation_share_preview(p_digest text)
returns table(host_display_name text, group_name text, occasion_at timestamp without time zone)
language sql security definer set search_path = '' as $$
  select coalesce(nullif(btrim(p.display_name), ''), 'Organizer'), g.name,
    g.occasion_at at time zone g.time_zone
  from public.group_invitations i
  join public.groups g on g.id = i.group_id
  left join public.profiles p on p.id = g.organizer_id
  where i.token_hash = case when p_digest ~ '^[a-f0-9]{64}$' then decode(p_digest, 'hex') end
    and i.target_user_id is null
    and i.target_membership_generation is null
    and i.shareable_version is not null
    and g.status = 'active'
    and i.status = 'active'
    and i.expires_at > clock_timestamp()
    and (i.max_uses is null or i.use_count < i.max_uses)
$$;
alter function public.group_invitation_share_preview(text) owner to postgres;
revoke execute on function public.group_invitation_share_preview(text) from public, anon, authenticated, service_role;
grant execute on function public.group_invitation_share_preview(text) to anon, authenticated;
comment on function public.group_invitation_share_preview(text) is
  'Read-only social banner: current organizer display name, group name and group-zone occasion wall clock for an active generic invitation on an active group. Digest capability cannot join, rotate or recover the bearer. Invalid, expired, revoked, exhausted and targeted links reveal no fields. Never log the capability.';
