create trigger arj28_test_reject_item_delete
before delete on public.wishlist_items
for each row execute function public.arj28_test_reject_item_delete();
