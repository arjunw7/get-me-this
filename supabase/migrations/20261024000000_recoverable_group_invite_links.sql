-- User-approved invitation modal: reopen the same generic link without rotation.
-- Targeted invitations and all existing accept/preview/revoke protocols are unchanged.
create table private.group_shareable_invitation_tokens (
  invitation_id uuid primary key references public.group_invitations(id) on delete cascade,
  token text not null check (private.token_is_canonical(token)),
  created_at timestamptz not null default clock_timestamp()
);
alter table private.group_shareable_invitation_tokens enable row level security;
revoke all on private.group_shareable_invitation_tokens from public, anon, authenticated, service_role;
comment on table private.group_shareable_invitation_tokens is
  'Recoverable bearer material for newly issued generic invitations only. No application table grants. Current joined organizer reads only through the locked group RPC; never log tokens.';

-- Retain the reviewed CAS issuance implementation, including lock order, fixed
-- expiry, canonical token generation and audit events, as an uncallable helper.
alter function public.issue_group_invitation(uuid, bigint) rename to issue_group_invitation_digest_core;
alter function public.issue_group_invitation_digest_core(uuid, bigint) set schema private;
alter function private.issue_group_invitation_digest_core(uuid, bigint) owner to postgres;
revoke execute on function private.issue_group_invitation_digest_core(uuid, bigint)
  from public, anon, authenticated, service_role;

create function public.issue_group_invitation(p_group_id uuid, p_expected_invitation_version bigint)
returns table(invitation_version bigint, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_issued record; v_invitation uuid;
begin
  if auth.uid() is null or p_group_id is null then return; end if;
  -- Authority and lifecycle are rechecked under the same group lock as all
  -- invitation and organizer mutations. Reentrant locking in the core is safe.
  perform 1 from public.groups g where g.id=p_group_id and g.status='active' for update;
  if not found or not private.is_group_organizer(p_group_id) then return; end if;
  select * into v_issued from private.issue_group_invitation_digest_core(p_group_id,p_expected_invitation_version);
  if not found then return; end if;
  select i.id into strict v_invitation from public.group_invitations i
    where i.group_id=p_group_id and i.shareable_version=v_issued.invitation_version
      and i.target_user_id is null and i.target_membership_generation is null
      and i.token_hash=extensions.digest(convert_to(v_issued.token,'UTF8'),'sha256');
  -- Obsolete recoverable tokens are no longer needed. The original digest and
  -- audit records remain; this only removes secret material from prior links.
  delete from private.group_shareable_invitation_tokens secret
    using public.group_invitations prior
    where prior.id=secret.invitation_id and prior.group_id=p_group_id;
  insert into private.group_shareable_invitation_tokens(invitation_id,token)
    values(v_invitation,v_issued.token);
  return query select v_issued.invitation_version::bigint, v_issued.token::text, v_issued.expires_at::timestamptz;
end;
$$;
alter function public.issue_group_invitation(uuid,bigint) owner to postgres;
revoke execute on function public.issue_group_invitation(uuid,bigint) from public, anon, authenticated, service_role;
grant execute on function public.issue_group_invitation(uuid,bigint) to authenticated;
comment on function public.issue_group_invitation(uuid,bigint) is
  'Explicit organizer CAS replacement. Preserves the reviewed issuance protocol and atomically retains the new generic bearer token in a deny-all private table for later organizer recovery.';

create function public.get_group_invite_link(p_group_id uuid)
returns table(result text, invitation_version bigint, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_version bigint; v_link public.group_invitations%rowtype; v_token text; v_now timestamptz;
begin
  if auth.uid() is null or p_group_id is null then return; end if;
  select g.shareable_invitation_version into v_version from public.groups g
    where g.id=p_group_id and g.status='active' for update;
  if not found or not private.is_group_organizer(p_group_id) then return; end if;
  select i.* into v_link from public.group_invitations i
    where i.group_id=p_group_id and i.shareable_version is not null
      and i.target_user_id is null and i.target_membership_generation is null
    order by i.shareable_version desc limit 1 for update;
  v_now := clock_timestamp();
  if found and v_link.status='active' and v_link.expires_at>v_now
    and (v_link.max_uses is null or v_link.use_count<v_link.max_uses) then
    select secret.token into v_token from private.group_shareable_invitation_tokens secret
      where secret.invitation_id=v_link.id
        and extensions.digest(convert_to(secret.token,'UTF8'),'sha256')=v_link.token_hash;
    if found then
      return query select 'ready'::text,v_version,v_token,v_link.expires_at;
    else
      -- A pre-migration digest cannot recover its bearer. Do not rotate it
      -- merely because the organizer opened the modal; require confirmation.
      return query select 'replacement_required'::text,v_version,null::text,v_link.expires_at;
    end if;
    return;
  end if;
  -- No usable generic link exists. The enclosing lock makes concurrent opens
  -- converge on one issued link; the next waiter returns that same saved token.
  return query select 'ready'::text,issued.invitation_version,issued.token,issued.expires_at
    from public.issue_group_invitation(p_group_id,v_version) issued;
end;
$$;
alter function public.get_group_invite_link(uuid) owner to postgres;
revoke execute on function public.get_group_invite_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_group_invite_link(uuid) to authenticated;
comment on function public.get_group_invite_link(uuid) is
  'Current joined organizer only, active group, serialized by the group lock. Returns the same recoverable active link, requires confirmation for live legacy hash-only links, or creates one when no usable link remains. No caller-supplied actor, version or expiry.';
comment on table public.group_invitations is
  'Invitation authority is its stored digest. Newly issued generic links additionally retain bearer material in a deny-all private table for current organizer recovery. Targeted and legacy generic tokens remain digest-only.';
