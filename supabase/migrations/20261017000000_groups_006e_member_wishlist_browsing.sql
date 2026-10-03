-- 006e: the member wishlist browsing projection.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/006e-member-wishlist-browsing.md.
-- Never edit this file once it has been applied anywhere; fix forward with a
-- new migration (see supabase/README.md).
--
-- Scope: exactly one function, public.member_wishlist_snapshot(uuid, uuid),
-- plus its revokes and the exact authenticated grant. No table, column,
-- enum, index, trigger, policy, or seed row is added, and no existing
-- function signature, policy, or grant changes. The 005a owner-only RLS on
-- profiles and wishlist_items is untouched: no broad group-member SELECT
-- policy or direct table grant exists for browsing.
--
-- Contract highlights (brief "Read model and authorization"):
--   * The caller is derived ONLY from auth.uid(). The caller's
--     private.is_joined_group_member(p_group_id) verdict (the 006a helper's
--     exact semantics), the target member's currently-joined
--     group_members row for the SAME group, and the group's active
--     lifecycle status are all evaluated inside the one statement — the
--     identical active-group membership predicate 006d's
--     group_room_snapshot applies. Every denial returns zero rows; a
--     denied call is indistinguishable from an unknown group.
--   * Authorized-empty representation: a successfully authorized target
--     whose visible item set is empty returns exactly one sentinel row —
--     item_id null and every other item column null — with the member
--     display label still populated. Empty and denied are distinguishable
--     only through authorization, never by shape ambiguity.
--   * Active-item predicate: a row exists in wishlist_items joined through
--     the composite (wishlist_id, owner_id) foreign key to the target's
--     single wishlists row (row existence IS the active state — there is
--     no soft-delete column), and extraction_status is 'manual' or
--     'extracted'. Every other extraction state is invisible.
--   * Deterministic order: sort_position asc, id asc (the 005d total
--     order) inside the statement. sort_position is not a returned column
--     and the client never reorders.
--   * One-statement snapshot: authorization, the active-group predicate,
--     item visibility, ordering, and the returned rows are CTEs and
--     expressions of that single statement, sharing one statement
--     snapshot. No read can straddle a membership change: a leave or
--     removal committed before the snapshot yields zero rows; committed
--     after, the reader sees the complete pre-commit authorized snapshot.
--     No volatile wall-clock call is required, so the function is honestly
--     STABLE.
--   * The image contract returns the item's optional remote image_url and
--     never image_snapshot_path or any raw Storage object path.
--   * SECURITY DEFINER owned by the trusted non-client database role,
--     empty search_path, schema-qualified objects, fixed types, no dynamic
--     SQL. EXECUTE is revoked from PUBLIC, anon, authenticated, and
--     service_role, then granted only to authenticated for the exact
--     (uuid, uuid) overload.

create function public.member_wishlist_snapshot(p_group_id uuid, p_member_id uuid)
returns table (
  member_display_name text,
  item_id uuid,
  title text,
  source_url text,
  retailer text,
  image_url text,
  note text,
  desire_level public.wishlist_item_desire_level,
  original_amount_minor bigint,
  original_currency char(3)
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    -- The one authorization verdict for the whole read: the group is in the
    -- currently supported active lifecycle state, the caller is a joined
    -- member (the 006a helper's auth.uid()-derived semantics), and the
    -- requested target member is currently joined to the SAME group.
    select
      g.id as group_id,
      g.status
    from public."groups" g
    where g.id = p_group_id
      and g.status = 'active'
      and private.is_joined_group_member(p_group_id)
      and exists (
        select 1
        from public.group_members tm
        where tm.group_id = g.id
          and tm.user_id = p_member_id
          and tm.status = 'joined'
      )
  ),
  labelled as (
    -- The target member's display label, with the established generic
    -- fallback for a missing or whitespace-only display name, so the
    -- application never performs a direct profile lookup.
    select
      s.group_id,
      coalesce(
        nullif(btrim(pr.display_name, E' \t\n\r\u000B\u000C\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'), ''),
        'Member'
      ) as member_display_name
    from scope s
    left join public.profiles pr on pr.id = p_member_id
  ),
  visible as (
    -- An item is visible exactly when the row exists (no soft-delete
    -- column) joined through the composite (wishlist_id, owner_id) foreign
    -- key to the target member's single wishlist, and its extraction state
    -- is manual or extracted. Row existence IS the active state.
    select
      i.id,
      i.title,
      i.source_url,
      i.retailer,
      i.image_url,
      i.note,
      i.desire_level,
      i.original_amount_minor,
      i.original_currency,
      i.sort_position
    from public.wishlist_items i, scope s
    where s.group_id is not null
      and exists (
        select 1
        from public.wishlists w
        where w.id = i.wishlist_id
          and w.owner_id = i.owner_id
          and w.owner_id = p_member_id
      )
      and i.extraction_status::text in ('manual', 'extracted')
  ),
  result as (
    select
      1 as kind,
      l.member_display_name,
      v.id as item_id,
      v.title,
      v.source_url,
      v.retailer,
      v.image_url,
      v.note,
      v.desire_level,
      v.original_amount_minor,
      v.original_currency,
      v.sort_position
    from labelled l
    cross join visible v
    where l.group_id is not null
    union all
    -- The authorized-empty sentinel: exactly one row, item fields null,
    -- the member label populated. Produced only when authorization
    -- succeeded and the visible item set is empty.
    select
      0 as kind,
      l.member_display_name,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::public.wishlist_item_desire_level,
      null::bigint,
      null::char(3),
      null::double precision
    from labelled l
    where l.group_id is not null
      and not exists (select 1 from visible)
  )
  select
    r.member_display_name,
    r.item_id,
    r.title,
    r.source_url,
    r.retailer,
    r.image_url,
    r.note,
    r.desire_level,
    r.original_amount_minor,
    r.original_currency
  from result r
  order by
    r.kind asc,
    r.sort_position asc,
    r.item_id asc
$$;

comment on function public.member_wishlist_snapshot(uuid, uuid) is
  'The member wishlist browse snapshot: one deterministic row per visible wishlist item of a currently joined target member, read by a currently joined caller of the same active group, both derived from auth.uid() and one statement snapshot. Returns exactly one sentinel row (null item fields, populated label) for an authorized empty wishlist and zero rows for every denial.';

revoke execute on function public.member_wishlist_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.member_wishlist_snapshot(uuid, uuid)
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. The safe
-- disabling migration revokes authenticated EXECUTE immediately; a later
-- reviewed migration may drop the function after the application no longer
-- calls it: drop function public.member_wishlist_snapshot(uuid, uuid);
