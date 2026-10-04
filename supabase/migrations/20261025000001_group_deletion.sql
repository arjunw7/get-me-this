-- Permanent application deletion with retained, inaccessible audit/history.
-- No table grants, RLS relaxations, or client-supplied actor identities.
create function public.delete_group(p_group_id uuid, p_expected_member_admin_version bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public."groups"%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null or p_group_id is null then return false; end if;

  -- Shared lock order with invitation acceptance, transfers, draws, and
  -- other group mutations: group, invitations, then memberships.
  select * into v_group from public."groups" where id = p_group_id for update;
  if not found or v_group.status <> 'active'
    or not private.is_group_organizer(p_group_id)
  then return false; end if;

  -- Check authority before version to avoid disclosing group existence or
  -- changes to an outsider/former organizer with a guessed version.
  if p_expected_member_admin_version is null or p_expected_member_admin_version < 0 then
    return false;
  end if;
  if v_group.member_admin_version <> p_expected_member_admin_version then
    raise exception 'stale_member_admin_version' using errcode = 'PT409';
  end if;

  perform 1 from public.group_invitations where group_id = p_group_id order by id for update;
  perform 1 from public.group_members where group_id = p_group_id order by user_id for update;

  update public.group_invitations set status = 'revoked'
  where group_id = p_group_id and status = 'active';
  delete from private.group_shareable_invitation_tokens t
  using public.group_invitations i
  where t.invitation_id = i.id and i.group_id = p_group_id;

  -- End every live membership so even older membership-only projections
  -- and RLS helpers fail closed. Historical states remain durable.
  update public.group_members
  set status = 'removed', participating = false, left_at = clock_timestamp(),
      membership_generation = membership_generation + 1
  where group_id = p_group_id and status in ('joined', 'invited');

  update public."groups" set status = 'deleted',
    member_admin_version = member_admin_version + 1
  where id = p_group_id;

  -- Retire outstanding group emails; no future retry may revive them.
  -- An email already handed to the provider cannot be recalled.
  update private.email_outbox set status = 'failed_permanent',
    claim_expires_at = null, last_error_category = 'recipient_unavailable',
    updated_at = clock_timestamp()
  where payload->>'group_id' = p_group_id::text and status in ('pending', 'claimed');

  perform private.append_group_event(v_actor, p_group_id, 'group_deleted', null, null, '{}');
  return true;
end;
$$;

revoke all on function public.delete_group(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.delete_group(uuid, bigint) to authenticated;
comment on function public.delete_group(uuid, bigint) is
  'Confirmed current-organizer deletion. Locks before authority/CAS; revokes invites and live memberships, retains private audit history, preserves personal wishlists. No restore API.';

-- Rollback: disable the feature by revoking authenticated EXECUTE and
-- removing the UI/action in a forward release. Keep the enum values,
-- tombstones, membership generations and audit records; never reactivate
-- deleted groups or old invitation capabilities during rollback.
