-- 007b: copy a friend's group item into the copier's own wishlist.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/007b-copy-to-own-wishlist.md.
-- Never edit this file once it has been applied anywhere; fix forward with a
-- new migration (see supabase/README.md).
--
-- Scope: exactly one new column (wishlist_items.copied_from_item_id), one
-- partial unique index, and one SECURITY DEFINER function
-- public.copy_group_item(uuid, uuid) with its revokes and the exact
-- authenticated grant. No table is added, no existing function signature,
-- policy, or grant changes, and no 006e snapshot shape grows a column.
--
-- Contract highlights (brief "Data model", "Database function"):
--   * copied_from_item_id is a write-path-only provenance marker: it is
--     written exclusively by the definer function, appears in no client
--     INSERT or UPDATE column grant (the 005a grants are column lists and
--     are deliberately not extended), and is returned by no group-facing
--     function. The source owner has no read path that reveals a copy.
--   * The partial unique index (owner_id, copied_from_item_id) where
--     copied_from_item_id is not null is the database-level idempotency
--     rule: at most one live copy of a given source item per copier.
--     ON DELETE SET NULL dissolves provenance when the source item is
--     deleted; the copied item itself is never deleted by it.
--   * copy_group_item derives the caller from auth.uid(), applies the
--     006a joined-membership predicates for the caller and the source
--     owner in the same group, the group's active lifecycle status, and
--     the exact 006e active-item predicate, inside one authorization
--     statement. Every denial — signed-out, outsider, pending, declined,
--     left, removed, cross-group, unknown group/item, invisible
--     extraction state, own item — is the same uniform null result with
--     no distinguishing detail and no enumeration.
--   * Idempotency under a lock: the function locks the caller's single
--     wishlists row FOR UPDATE (the 005d append convention), then looks up
--     an existing copy for (owner, source). If one exists it returns that
--     id and writes nothing. The lock serializes a user's concurrent
--     copies; the partial unique index is the backstop.
--   * The creating path appends with the exact 005d append_wishlist_item
--     key algorithm (empty list -> 1; otherwise
--     max_key + greatest(abs(max_key), 1::float8); on finite-bound
--     overflow, compact by rank and use existing_count + 1), copying only
--     title, source_url, retailer, image_url, and the original money pair,
--     with a null note, the default desire level, manual extraction, no
--     snapshot path, no converted tuple, and no client_submission_id.

alter table public.wishlist_items
  add column copied_from_item_id uuid
    references public.wishlist_items (id) on delete set null;

create unique index wishlist_items_one_copy_per_source
  on public.wishlist_items (owner_id, copied_from_item_id)
  where copied_from_item_id is not null;

comment on column public.wishlist_items.copied_from_item_id is
  'Write-path-only copy provenance (007b): written exclusively by public.copy_group_item, never by any client grant, exposed only in the copier''s own owner-scoped reads, and rendered by no UI.';

create function public.copy_group_item(p_group_id uuid, p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  source public.wishlist_items%rowtype;
  owner_wishlist_id uuid;
  existing_id uuid;
  max_key double precision;
  append_key double precision;
  existing_count integer;
  inserted_id uuid;
begin
  if caller_id is null or p_group_id is null or p_item_id is null then
    return null;
  end if;

  -- One authorization-and-fetch statement: the group is in the currently
  -- supported active lifecycle state, the caller is currently joined to
  -- the group, the source item exists under its composite (wishlist_id,
  -- owner_id) wishlist, its owner is currently joined to the SAME group,
  -- the item satisfies the exact 006e active-item predicate, and the
  -- caller is not the source owner. Every denial is this same null.
  select i.*
    into source
  from public.wishlist_items i
  where i.id = p_item_id
    and i.owner_id <> caller_id
    and i.extraction_status::text in ('manual', 'extracted')
    and exists (
      select 1 from public.wishlists w
      where w.id = i.wishlist_id and w.owner_id = i.owner_id
    )
    and exists (
      select 1 from public.group_members cm
      where cm.group_id = p_group_id and cm.user_id = caller_id
        and cm.status = 'joined'
    )
    and exists (
      select 1 from public.group_members om
      where om.group_id = p_group_id and om.user_id = i.owner_id
        and om.status = 'joined'
    )
    and exists (
      select 1 from public."groups" g
      where g.id = p_group_id and g.status = 'active'
    );

  if not found then
    return null;
  end if;

  -- The 005d serialization point: the copier's single wishlist row lock
  -- serializes concurrent copies and appends for the same user, so the
  -- check-then-insert below cannot interleave.
  select w.id
    into owner_wishlist_id
  from public.wishlists w
  where w.owner_id = caller_id
  for update;

  if owner_wishlist_id is null then
    return null;
  end if;

  -- Idempotent: an existing copy returns its id with no write of any kind
  -- (no new item, no sort-position churn, no duplicate).
  select c.id
    into existing_id
  from public.wishlist_items c
  where c.owner_id = caller_id
    and c.copied_from_item_id = p_item_id;

  if found then
    return existing_id;
  end if;

  -- The exact 005d append_wishlist_item key algorithm under the lock.
  select max(items.sort_position), count(*)::integer
    into max_key, existing_count
  from public.wishlist_items as items
  where items.wishlist_id = owner_wishlist_id
    and items.owner_id = caller_id;

  if existing_count = 0 then
    append_key := 1::float8;
  else
    begin
      append_key := max_key + greatest(abs(max_key), 1::float8);
    exception when numeric_value_out_of_range then
      append_key := null;
    end;
    if append_key is null or not (
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

  begin
    insert into public.wishlist_items (
      wishlist_id,
      owner_id,
      title,
      source_url,
      retailer,
      image_url,
      note,
      desire_level,
      original_amount_minor,
      original_currency,
      image_snapshot_path,
      extraction_status,
      sort_position,
      client_submission_id,
      copied_from_item_id
    )
    values (
      owner_wishlist_id,
      caller_id,
      source.title,
      source.source_url,
      source.retailer,
      source.image_url,
      null,
      'would_love'::public.wishlist_item_desire_level,
      source.original_amount_minor,
      source.original_currency,
      null,
      'manual'::public.wishlist_item_extraction_status,
      append_key,
      null,
      p_item_id
    )
    returning id into inserted_id;
  exception
    -- The source item was hard-deleted between authorization and insert
    -- (the brief's copy-versus-delete race): a uniform uniform failure,
    -- never a partial metadata row.
    when foreign_key_violation then
      return null;
  end;

  return inserted_id;
end;
$$;

comment on function public.copy_group_item(uuid, uuid) is
  'The 007b copy path: a joined member copies a friend''s visible item from a shared active group into their own wishlist as a fully owned manual item. Idempotent per source item per copier under the wishlist lock; every denial class is the same uniform null result with no enumeration. Returns the new (or existing) copied item id.';

revoke execute on function public.copy_group_item(uuid, uuid)
  from public, anon, service_role;
-- Supabase default privileges may grant EXECUTE on new functions to
-- authenticated; the explicit grant below pins the exact inventory.
revoke execute on function public.copy_group_item(uuid, uuid)
  from authenticated;
grant execute on function public.copy_group_item(uuid, uuid)
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE on copy_group_item
-- immediately; a later reviewed migration may then drop the function, the
-- partial unique index, and the column:
--   drop function public.copy_group_item(uuid, uuid);
--   drop index public.wishlist_items_one_copy_per_source;
--   alter table public.wishlist_items drop column copied_from_item_id;
-- The provenance history is lost; copied items remain as normal items —
-- a deliberate, scoped gate, not a hotfix.
