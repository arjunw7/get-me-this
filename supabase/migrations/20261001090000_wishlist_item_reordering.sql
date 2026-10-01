-- 005d: exact-sequence wishlist reorder and shared-lock manual append.
-- Forward-only: applied migrations are never edited. A correction ships as
-- a later migration and preserves already-persisted canonical order.

create function public.reorder_wishlist_item(
  expected_ids uuid[],
  moved_item_id uuid,
  target_index integer
)
returns table(result text, ordered_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  owner_wishlist_id uuid;
  current_ids uuid[];
  desired_ids uuid[];
  remaining_ids uuid[];
  item_count integer;
  source_index integer;
  lower_item_id uuid;
  upper_item_id uuid;
  lower_key double precision;
  upper_key double precision;
  candidate_key double precision;
  candidate_valid boolean := false;
begin
  item_count := coalesce(array_length(expected_ids, 1), 0);
  if caller_id is null
    or expected_ids is null
    or item_count = 0
    or moved_item_id is null
    or target_index is null
    or target_index < 0
    or target_index >= item_count
    or exists (select 1 from unnest(expected_ids) as expected(id) where expected.id is null)
    or (select count(distinct expected.id) from unnest(expected_ids) as expected(id)) <> item_count
  then
    return query select 'unavailable'::text, null::uuid[];
    return;
  end if;

  -- The owner wishlist is the serialization point shared with app creates.
  select wishlists.id
    into owner_wishlist_id
  from public.wishlists
  where wishlists.owner_id = caller_id
  for update;

  if owner_wishlist_id is null then
    return query select 'unavailable'::text, null::uuid[];
    return;
  end if;

  -- A stable lock order prevents two reorders/deletes from deadlocking.
  perform items.id
  from public.wishlist_items as items
  where items.wishlist_id = owner_wishlist_id
    and items.owner_id = caller_id
  order by items.id
  for update;

  -- Foreign moved IDs are unavailable, never stale, so callers cannot use
  -- sequence differences to learn anything about a foreign row.
  if not exists (
    select 1
    from public.wishlist_items as items
    where items.id = moved_item_id
      and items.wishlist_id = owner_wishlist_id
      and items.owner_id = caller_id
  ) then
    return query select 'unavailable'::text, null::uuid[];
    return;
  end if;

  -- This is deliberately a fresh statement after all locks are acquired.
  select coalesce(array_agg(items.id order by items.sort_position, items.id), '{}'::uuid[])
    into current_ids
  from public.wishlist_items as items
  where items.wishlist_id = owner_wishlist_id
    and items.owner_id = caller_id;

  if current_ids is distinct from expected_ids then
    return query select 'stale'::text, null::uuid[];
    return;
  end if;

  source_index := array_position(current_ids, moved_item_id);
  if source_index is null then
    return query select 'unavailable'::text, null::uuid[];
    return;
  end if;

  if source_index = target_index + 1 then
    return query select 'unchanged'::text, current_ids;
    return;
  end if;

  remaining_ids := array_remove(current_ids, moved_item_id);
  if target_index = 0 then
    desired_ids := array_prepend(moved_item_id, remaining_ids);
  elsif target_index = item_count - 1 then
    desired_ids := array_append(remaining_ids, moved_item_id);
  else
    desired_ids := remaining_ids[1:target_index]
      || array[moved_item_id]
      || remaining_ids[target_index + 1:item_count - 1];
  end if;

  if target_index > 0 then
    lower_item_id := desired_ids[target_index];
    select items.sort_position into lower_key
    from public.wishlist_items as items
    where items.id = lower_item_id;
  end if;
  if target_index < item_count - 1 then
    upper_item_id := desired_ids[target_index + 2];
    select items.sort_position into upper_key
    from public.wishlist_items as items
    where items.id = upper_item_id;
  end if;

  if lower_item_id is not null and upper_item_id is not null then
    candidate_key := lower_key / 2::float8 + upper_key / 2::float8;
    candidate_valid := candidate_key > lower_key and candidate_key < upper_key;
  elsif upper_item_id is not null then
    candidate_key := upper_key - greatest(abs(upper_key), 1::float8);
    candidate_valid := candidate_key < upper_key;
  elsif lower_item_id is not null then
    candidate_key := lower_key + greatest(abs(lower_key), 1::float8);
    candidate_valid := candidate_key > lower_key;
  end if;

  candidate_valid := candidate_valid
    and candidate_key < 'Infinity'::float8
    and candidate_key > '-Infinity'::float8;

  if candidate_valid then
    update public.wishlist_items as items
    set sort_position = candidate_key
    where items.id = moved_item_id
      and items.wishlist_id = owner_wishlist_id
      and items.owner_id = caller_id;
  else
    -- No representable key exists at the requested place. Rebalance only
    -- the already-locked rows of this owner, in the requested order.
    update public.wishlist_items as items
    set sort_position = desired.position::double precision
    from unnest(desired_ids) with ordinality as desired(id, position)
    where items.id = desired.id
      and items.wishlist_id = owner_wishlist_id
      and items.owner_id = caller_id;
  end if;

  return query select 'moved'::text, desired_ids;
end;
$$;

comment on function public.reorder_wishlist_item(uuid[], uuid, integer) is
  'Owner-only exact-sequence wishlist move; locks wishlist then items and rebalances only when float8 spacing is exhausted.';

create function public.append_wishlist_item(
  submission_id uuid,
  item_title text,
  source_url text,
  retailer text,
  note text,
  desire_level text,
  original_amount_minor bigint,
  original_currency text
)
returns table(result text, item_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  owner_wishlist_id uuid;
  existing public.wishlist_items%rowtype;
  inserted_id uuid;
  max_key double precision;
  append_key double precision;
  existing_count integer;
begin
  if caller_id is null
    or submission_id is null
    or item_title is null
    or desire_level is null
  then
    return query select 'unavailable'::text, null::uuid, false;
    return;
  end if;

  select wishlists.id
    into owner_wishlist_id
  from public.wishlists
  where wishlists.owner_id = caller_id
  for update;

  if owner_wishlist_id is null then
    return query select 'unavailable'::text, null::uuid, false;
    return;
  end if;

  select items.* into existing
  from public.wishlist_items as items
  where items.owner_id = caller_id
    and items.client_submission_id = submission_id;

  if found then
    if existing.title = item_title
      and existing.source_url is not distinct from source_url
      and existing.retailer is not distinct from retailer
      and existing.note is not distinct from note
      and existing.desire_level::text = desire_level
      and existing.original_amount_minor is not distinct from original_amount_minor
      and existing.original_currency::text is not distinct from original_currency
    then
      return query select 'replayed'::text, existing.id, true;
    else
      return query select 'submission-conflict'::text, existing.id, false;
    end if;
    return;
  end if;

  select max(items.sort_position), count(*)::integer
    into max_key, existing_count
  from public.wishlist_items as items
  where items.wishlist_id = owner_wishlist_id
    and items.owner_id = caller_id;

  if existing_count = 0 then
    append_key := 1::float8;
  else
    append_key := max_key + greatest(abs(max_key), 1::float8);
    if not (
      append_key > max_key
      and append_key < 'Infinity'::float8
      and append_key > '-Infinity'::float8
    ) then
      update public.wishlist_items as items
      set sort_position = ordered.position::double precision
      from (
        select ranked.id, row_number() over (order by ranked.sort_position, ranked.id) as position
        from public.wishlist_items as ranked
        where ranked.wishlist_id = owner_wishlist_id
          and ranked.owner_id = caller_id
      ) as ordered
      where items.id = ordered.id
        and items.wishlist_id = owner_wishlist_id
        and items.owner_id = caller_id;
      append_key := existing_count + 1;
    end if;
  end if;

  insert into public.wishlist_items (
    wishlist_id,
    owner_id,
    title,
    source_url,
    retailer,
    note,
    desire_level,
    original_amount_minor,
    original_currency,
    image_url,
    image_snapshot_path,
    extraction_status,
    sort_position,
    client_submission_id
  )
  values (
    owner_wishlist_id,
    caller_id,
    item_title,
    source_url,
    retailer,
    note,
    desire_level::public.wishlist_item_desire_level,
    original_amount_minor,
    original_currency,
    null,
    null,
    'manual'::public.wishlist_item_extraction_status,
    append_key,
    submission_id
  )
  returning id into inserted_id;

  return query select 'saved'::text, inserted_id, false;
exception
  when check_violation or invalid_text_representation or string_data_right_truncation then
    return query select 'unavailable'::text, null::uuid, false;
end;
$$;

comment on function public.append_wishlist_item(uuid, text, text, text, text, text, bigint, text) is
  'Owner-only idempotent manual create; locks the wishlist row shared with reorder before calculating the append key.';

-- Reorder is now the only authenticated path that can mutate sort keys.
-- INSERT retains sort_position for the reviewed 005a/005c direct path.
revoke update (sort_position) on public.wishlist_items from authenticated;

-- SECURITY DEFINER functions are executable by PUBLIC by default. Keep both
-- surfaces narrow even though service_role bypasses RLS elsewhere.
revoke execute on function public.reorder_wishlist_item(uuid[], uuid, integer)
  from public, anon, service_role;
revoke execute on function public.append_wishlist_item(uuid, text, text, text, text, text, bigint, text)
  from public, anon, service_role;
grant execute on function public.reorder_wishlist_item(uuid[], uuid, integer)
  to authenticated;
grant execute on function public.append_wishlist_item(uuid, text, text, text, text, text, bigint, text)
  to authenticated;

-- Rollback is coordinated, not destructive: first remove the reorder UI and
-- app RPC calls, then restore UPDATE(sort_position), revoke/drop these two
-- functions, and preserve existing item rows and their current order.
