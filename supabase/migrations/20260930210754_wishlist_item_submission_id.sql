-- 005c: owner-scoped live-row submission keys for manual wishlist creates.
-- This migration is forward-only. Deleting a row removes its replay guard.

alter table public.wishlist_items
  add column client_submission_id uuid;

comment on column public.wishlist_items.client_submission_id is
  'Owner-scoped live-row manual create key; hard deletion removes its replay protection.';

create unique index wishlist_items_owner_submission_live_key
  on public.wishlist_items (owner_id, client_submission_id)
  where client_submission_id is not null;

grant insert (client_submission_id)
  on public.wishlist_items
  to authenticated;
