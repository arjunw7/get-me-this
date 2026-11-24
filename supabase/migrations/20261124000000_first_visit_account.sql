-- Phase 1: deploy this function and the first-visit application path before
-- removing either shared Auth signup trigger. Existing accounts are unchanged.
create function public.ensure_get_me_this_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from auth.users where id = actor and email_confirmed_at is not null
  ) then
    raise exception 'A verified account is required' using errcode = '42501';
  end if;
  -- Serializes two first visits for the same account, including public-link
  -- provisioning performed by the existing wishlist INSERT trigger.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 240001));
  insert into public.profiles(id) values (actor) on conflict (id) do nothing;
  insert into public.wishlists(owner_id) values (actor) on conflict (owner_id) do nothing;
end;
$$;
revoke all on function public.ensure_get_me_this_account() from public, anon, authenticated, service_role;
grant execute on function public.ensure_get_me_this_account() to authenticated;
