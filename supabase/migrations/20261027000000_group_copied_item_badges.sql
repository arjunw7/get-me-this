-- Product-approved change: show a copied-destination sticker to joined group members.
-- No source IDs, source owners, copy counts, or gifting state are disclosed.
-- Base-table grants and owner-only RLS remain unchanged.
create function public.group_copied_item_ids(p_group_id uuid, p_member_id uuid)
returns table (item_id uuid)
language sql stable security definer set search_path = ''
as $$
  select i.id
  from public.member_wishlist_snapshot(p_group_id, p_member_id) visible
  join public.wishlist_items i on i.id = visible.item_id
  where i.copied_from_item_id is not null
$$;
revoke execute on function public.group_copied_item_ids(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.group_copied_item_ids(uuid, uuid) to authenticated;
comment on function public.group_copied_item_ids(uuid, uuid) is
  'Copied destination IDs from the authorized member wishlist; never source provenance.';
-- Rollback: revoke execute from authenticated, deploy UI without badges,
-- then drop function public.group_copied_item_ids(uuid, uuid).
