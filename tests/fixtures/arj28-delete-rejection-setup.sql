create or replace function public.arj28_test_reject_item_delete()
returns trigger
language plpgsql
as $$
begin
  if old.title = 'ARJ-28 definite SQL rejection fixture' then
    raise exception using
      errcode = '23514',
      message = 'ARJ-28 local test constraint rejection';
  end if;
  return old;
end;
$$;

drop trigger if exists arj28_test_reject_item_delete on public.wishlist_items;
create trigger arj28_test_reject_item_delete
before delete on public.wishlist_items
for each row execute function public.arj28_test_reject_item_delete();
