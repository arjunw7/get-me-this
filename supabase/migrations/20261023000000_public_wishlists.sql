-- User-approved extension: every wishlist has a public bearer link by default.
-- Private group data and base-table RLS are unchanged. See public-wishlists.md.
create table private.wishlist_public_links (
  wishlist_id uuid primary key references public.wishlists(id) on delete cascade,
  share_token text not null check (share_token ~ '^[A-Za-z0-9_-]{43}$'),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  enabled boolean not null default true,
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint wishlist_public_links_matching_digest check (
    token_hash = extensions.digest(convert_to(share_token, 'UTF8'), 'sha256')
  )
);
alter table private.wishlist_public_links enable row level security;
revoke all on private.wishlist_public_links from public, anon, authenticated, service_role;
comment on table private.wishlist_public_links is
  'Secret-bearing, deny-all link state. Raw token is retained solely so the authenticated owner can copy the same link later. Never log tokens or expose this table.';

create function private.create_wishlist_public_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  v_token := left(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), 43);
  insert into private.wishlist_public_links(wishlist_id, share_token, token_hash)
    values(new.id, v_token, extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'));
  return new;
end;
$$;
alter function private.create_wishlist_public_link() owner to postgres;
revoke execute on function private.create_wishlist_public_link() from public, anon, authenticated, service_role;
create trigger wishlist_created_public_link after insert on public.wishlists
  for each row execute function private.create_wishlist_public_link();

-- Materialization keeps one independent cryptographically random value per row.
with tokens as materialized (
  select w.id, left(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), 43) as token
  from public.wishlists w
)
insert into private.wishlist_public_links(wishlist_id, share_token, token_hash)
  select t.id, t.token, extensions.digest(convert_to(t.token, 'UTF8'), 'sha256') from tokens t;

create table public.public_wishlist_item_reactions (
  item_id uuid not null references public.wishlist_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction public.group_item_reaction_kind not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint public_wishlist_item_reactions_pkey primary key(item_id, user_id)
);
create index public_wishlist_item_reactions_user_idx on public.public_wishlist_item_reactions(user_id);
alter table public.public_wishlist_item_reactions enable row level security;
revoke all on public.public_wishlist_item_reactions from public, anon, authenticated, service_role;
comment on table public.public_wishlist_item_reactions is
  'Public-link reaction context only, one per item/user. No group memberships or group reactions are copied into this table. No client table access.';

create function public.own_wishlist_share_state()
returns table(enabled boolean, version bigint, share_token text)
language sql stable security definer set search_path = '' as $$
  select l.enabled, l.version, case when l.enabled then l.share_token else null end
  from private.wishlist_public_links l join public.wishlists w on w.id = l.wishlist_id
  where w.owner_id = auth.uid()
$$;

create function public.enable_wishlist_share(p_expected_version bigint)
returns table(enabled boolean, version bigint, share_token text)
language plpgsql security definer set search_path = '' as $$
declare v_wishlist uuid; v_link private.wishlist_public_links%rowtype; v_token text;
begin
  if auth.uid() is null or p_expected_version is null then return; end if;
  select w.id into v_wishlist from public.wishlists w where w.owner_id = auth.uid() for update;
  if not found then return; end if;
  select l.* into v_link from private.wishlist_public_links l where l.wishlist_id = v_wishlist for update;
  if not found or v_link.version <> p_expected_version then return; end if;
  if v_link.enabled then
    return query select v_link.enabled, v_link.version, v_link.share_token;
    return;
  end if;
  if v_link.version = 9223372036854775807 then return; end if;
  v_token := left(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), 43);
  return query update private.wishlist_public_links l
    set enabled = true, version = l.version + 1, share_token = v_token,
        token_hash = extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), updated_at = clock_timestamp()
    where l.wishlist_id = v_wishlist returning l.enabled, l.version, l.share_token;
end;
$$;

create function public.revoke_wishlist_share(p_expected_version bigint)
returns table(enabled boolean, version bigint, share_token text)
language plpgsql security definer set search_path = '' as $$
declare v_wishlist uuid; v_link private.wishlist_public_links%rowtype;
begin
  if auth.uid() is null or p_expected_version is null then return; end if;
  select w.id into v_wishlist from public.wishlists w where w.owner_id = auth.uid() for update;
  if not found then return; end if;
  select l.* into v_link from private.wishlist_public_links l where l.wishlist_id = v_wishlist for update;
  if not found or v_link.version <> p_expected_version then return; end if;
  if not v_link.enabled then
    return query select false, v_link.version, null::text;
    return;
  end if;
  if v_link.version = 9223372036854775807 then return; end if;
  return query update private.wishlist_public_links l
    set enabled = false, version = l.version + 1, updated_at = clock_timestamp()
    where l.wishlist_id = v_wishlist returning l.enabled, l.version, null::text;
end;
$$;

create function public.public_wishlist_snapshot(p_token text)
returns table (
  display_name text, taste_line text, vibe text, viewer_is_owner boolean,
  item_id uuid, title text, source_url text, retailer text, note text,
  desire_level public.wishlist_item_desire_level,
  original_amount_minor text, original_currency text, has_image boolean,
  very_you_count bigint, questionable_count bigint, want_it_too_count bigint,
  viewer_reaction public.group_item_reaction_kind
)
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(p.display_name), ''), 'Wishlist'), p.taste_line, p.vibe,
    coalesce(w.owner_id = auth.uid(), false),
    i.id, i.title, i.source_url, i.retailer, i.note, i.desire_level,
    i.original_amount_minor::text, i.original_currency::text,
    case when i.id is not null then i.image_snapshot_path is not null or i.image_url is not null end,
    case when i.id is not null then r.very_you end,
    case when i.id is not null then r.questionable end,
    case when i.id is not null then r.want_it_too end,
    case when w.owner_id <> auth.uid() then (
      select mine.reaction from public.public_wishlist_item_reactions mine
      where mine.item_id = i.id and mine.user_id = auth.uid()
    ) end
  from private.wishlist_public_links l
  join public.wishlists w on w.id = l.wishlist_id
  join public.profiles p on p.id = w.owner_id
  left join public.wishlist_items i on i.wishlist_id = w.id and i.owner_id = w.owner_id
    and i.extraction_status in ('manual', 'extracted')
  left join lateral (
    select count(*) filter(where reaction = 'very_you') as very_you,
      count(*) filter(where reaction = 'questionable') as questionable,
      count(*) filter(where reaction = 'want_it_too') as want_it_too
    from public.public_wishlist_item_reactions r where r.item_id = i.id
  ) r on true
  where p_token ~ '^[A-Za-z0-9_-]{43}$' and l.enabled
    and l.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
  order by i.sort_position asc, i.id asc
$$;

create function public.set_public_wishlist_reaction(
  p_token text, p_item_id uuid, p_reaction public.group_item_reaction_kind
)
returns table(item_id uuid, very_you_count bigint, questionable_count bigint,
  want_it_too_count bigint, viewer_reaction public.group_item_reaction_kind)
language plpgsql security definer set search_path = '' as $$
declare v_wishlist uuid; v_item uuid; v_actor uuid := auth.uid();
begin
  if v_actor is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return; end if;
  -- FOR SHARE conflicts with revocation/rotation, including non-key updates.
  -- A waiting statement rechecks enabled and the digest after a committed change.
  select l.wishlist_id into v_wishlist from private.wishlist_public_links l
    where l.enabled and l.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256') for share;
  if not found then return; end if;
  -- Serialize reactions per item, and prevent deletion/visibility edits during a write.
  select i.id into v_item from public.wishlist_items i
    where i.id = p_item_id and i.wishlist_id = v_wishlist and i.owner_id <> v_actor
      and i.extraction_status in ('manual', 'extracted') for update;
  if not found then return; end if;
  if p_reaction is null then
    delete from public.public_wishlist_item_reactions r where r.item_id = v_item and r.user_id = v_actor;
  else
    insert into public.public_wishlist_item_reactions(item_id, user_id, reaction)
      values(v_item, v_actor, p_reaction)
      on conflict on constraint public_wishlist_item_reactions_pkey do update
        set reaction = excluded.reaction, updated_at = clock_timestamp();
  end if;
  return query select v_item,
    count(*) filter(where r.reaction = 'very_you'),
    count(*) filter(where r.reaction = 'questionable'),
    count(*) filter(where r.reaction = 'want_it_too'),
    (select mine.reaction from public.public_wishlist_item_reactions mine where mine.item_id = v_item and mine.user_id = v_actor)
    from public.public_wishlist_item_reactions r where r.item_id = v_item;
end;
$$;

create function public.own_public_wishlist_reaction_summary()
returns table(item_id uuid, very_you_count bigint, questionable_count bigint, want_it_too_count bigint)
language sql stable security definer set search_path = '' as $$
  select i.id, count(r.item_id) filter(where r.reaction = 'very_you'),
    count(r.item_id) filter(where r.reaction = 'questionable'),
    count(r.item_id) filter(where r.reaction = 'want_it_too')
  from public.wishlist_items i left join public.public_wishlist_item_reactions r on r.item_id = i.id
  where i.owner_id = auth.uid() and i.extraction_status in ('manual', 'extracted')
  group by i.id order by i.sort_position asc, i.id asc
$$;

-- This source never reaches public JSON/HTML. A server route validates path ownership,
-- safely fetches/normalizes bytes, and sets no-store/no-referrer response headers.
create function public.public_wishlist_image_source(p_token text, p_item_id uuid)
returns table(image_snapshot_path text, image_url text, owner_id uuid)
language sql stable security definer set search_path = '' as $$
  select i.image_snapshot_path, i.image_url, i.owner_id
  from private.wishlist_public_links l join public.wishlist_items i on i.wishlist_id = l.wishlist_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$' and l.enabled
    and l.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and i.id = p_item_id and i.extraction_status in ('manual', 'extracted')
$$;

alter function public.own_wishlist_share_state() owner to postgres;
alter function public.enable_wishlist_share(bigint) owner to postgres;
alter function public.revoke_wishlist_share(bigint) owner to postgres;
alter function public.public_wishlist_snapshot(text) owner to postgres;
alter function public.set_public_wishlist_reaction(text, uuid, public.group_item_reaction_kind) owner to postgres;
alter function public.own_public_wishlist_reaction_summary() owner to postgres;
alter function public.public_wishlist_image_source(text, uuid) owner to postgres;
revoke execute on function public.own_wishlist_share_state(), public.enable_wishlist_share(bigint),
  public.revoke_wishlist_share(bigint), public.public_wishlist_snapshot(text),
  public.set_public_wishlist_reaction(text, uuid, public.group_item_reaction_kind),
  public.own_public_wishlist_reaction_summary(), public.public_wishlist_image_source(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.own_wishlist_share_state(), public.enable_wishlist_share(bigint),
  public.revoke_wishlist_share(bigint), public.set_public_wishlist_reaction(text, uuid, public.group_item_reaction_kind),
  public.own_public_wishlist_reaction_summary() to authenticated;
grant execute on function public.public_wishlist_snapshot(text) to anon, authenticated;
grant execute on function public.public_wishlist_image_source(text, uuid) to service_role;
