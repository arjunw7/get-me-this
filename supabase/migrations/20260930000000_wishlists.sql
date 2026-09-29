-- 005a: wishlists and wishlist_items schema, grants, RLS, and triggers.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/005a-wishlist-schema-grants-rls-and-tests.md
-- (planning commit 251d574). Never edit this file once it has been applied
-- anywhere; fix forward with a new migration (see supabase/README.md).
--
-- Guarantees:
--   * One wishlist per owner: the UNIQUE constraint on wishlists.owner_id
--     caps the relation at one row per user on every write path, including
--     the signup trigger, the backfill below, and the seed fixture. The
--     trigger and backfill alone do not establish the invariant.
--   * Wishlist auto-creation at signup: a SECURITY DEFINER AFTER INSERT
--     trigger on auth.users creates the owner's single wishlist inside the
--     signup transaction. Trigger failure blocks signup, so no auth user
--     can end up without a wishlist. The backfill below covers users that
--     predate this migration and is idempotent (ON CONFLICT DO NOTHING).
--   * Redundant ownership cannot drift: wishlist_items carries owner_id,
--     and a composite foreign key (wishlist_id, owner_id) referencing
--     wishlists (id, owner_id) makes an item row point only at a wishlist
--     that names the same owner. Deleting a wishlist cascades to its items
--     through this same FK (there is no second plain wishlist_id FK).
--   * Money is integer minor units plus an ISO 4217 currency code, never
--     floating point: original_amount_minor bigint with original_currency
--     char(3) CHECK-constrained to ^[A-Z]{3}$, both present or both null,
--     amounts non-negative. The optional converted-money tuple carries the
--     same all-or-nothing rule across its four columns, so a stored
--     conversion always has its rate provenance.
--   * Sort order is total and deterministic: sort_position is a finite
--     double precision (NaN and infinities are rejected) and every read
--     orders by (sort_position ASC, id ASC). Duplicates are allowed by
--     design; the id tiebreak, not a UNIQUE constraint, prevents instability.
--   * Least privilege: anon has no privileges. authenticated may SELECT
--     wishlists (the trigger creates wishlists; no client INSERT/UPDATE/
--     DELETE grant exists) and SELECT/INSERT/UPDATE/DELETE wishlist_items,
--     with the INSERT grant excluding only id, created_at, and updated_at,
--     and the UPDATE grant additionally excluding wishlist_id and owner_id
--     so items cannot be moved between wishlists or re-owned. Correctness
--     of the client-supplied wishlist_id/owner_id pair is enforced by the
--     owner-only WITH CHECK plus the composite FK, not by grants.
--   * Function EXECUTE is revoked from PUBLIC, anon, and authenticated on
--     all three new functions: Postgres grants EXECUTE to PUBLIC by
--     default, and trigger-function EXECUTE is checked at CREATE TRIGGER
--     time, not when the trigger fires, so no client role needs it.
--   * updated_at is database-managed by BEFORE UPDATE triggers using
--     clock_timestamp(), which advances within a transaction, unlike the
--     transaction-fixed now(). A column default would fire on insert only.
--   * Owner-only RLS: every policy compares auth.uid() to the row's
--     owner_id. No group-member access exists before Phase 5.

create type public.wishlist_item_desire_level as enum
  ('really_want', 'would_love', 'just_an_idea');

create type public.wishlist_item_extraction_status as enum
  ('manual', 'extracting', 'extracted', 'failed');

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  -- FK target for wishlist_items' composite (wishlist_id, owner_id): keeps
  -- redundant item ownership unrepresentable as drift.
  constraint wishlists_id_owner_id_key unique (id, owner_id)
);

comment on table public.wishlists is
  'One persistent wishlist per authenticated user (1:1 with auth.users).';
comment on column public.wishlists.id is
  'The wishlist identity; client rows are created only by the signup trigger.';
comment on column public.wishlists.owner_id is
  'The owning auth user; UNIQUE here is the one-wishlist-per-owner invariant.';
comment on column public.wishlists.created_at is
  'Database-set creation time (clock_timestamp()).';
comment on column public.wishlists.updated_at is
  'Database-managed on every update by the wishlists_set_updated_at trigger.';

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  source_url text,
  retailer text,
  image_url text,
  image_snapshot_path text,
  note text,
  original_amount_minor bigint,
  original_currency char(3),
  converted_amount_minor bigint,
  converted_currency char(3),
  conversion_rate_source text,
  conversion_rate_at timestamptz,
  desire_level public.wishlist_item_desire_level
    not null default 'would_love',
  extraction_status public.wishlist_item_extraction_status
    not null default 'manual',
  sort_position double precision not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  -- The only parent link: deleting a wishlist cascades to its items, and an
  -- item can only point at a wishlist naming the same owner. There is no
  -- second plain wishlist_id foreign key.
  constraint wishlist_items_wishlist_owned foreign key (wishlist_id, owner_id)
    references public.wishlists (id, owner_id) on delete cascade,

  -- Field bounds (brief resolution 10): defense in depth under every write
  -- path; 005c's server validation sits on top of these.
  constraint wishlist_items_title_bounded check (
    title !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
    and char_length(title) <= 200
  ),
  constraint wishlist_items_note_bounded check (
    note is null or char_length(note) <= 2000
  ),
  constraint wishlist_items_source_url_bounded check (
    source_url is null
    or (char_length(source_url) <= 2048 and source_url ~* '^https?://')
  ),
  constraint wishlist_items_retailer_bounded check (
    retailer is null
    or (
      retailer !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
      and char_length(retailer) <= 120
    )
  ),
  constraint wishlist_items_image_url_bounded check (
    image_url is null
    or (
      char_length(image_url) <= 2048
      and image_url ~* '^https?://'
    )
  ),
  constraint wishlist_items_image_snapshot_path_bounded check (
    image_snapshot_path is null or char_length(image_snapshot_path) <= 1024
  ),

  -- Money integrity (brief resolution 3): integer minor units plus an
  -- uppercase ISO 4217 code, both present or both absent, never negative.
  -- char(3) plus the regex is preferred over varchar(3): a blank-padded or
  -- short value fails the CHECK, so the interplay is safe but non-obvious.
  constraint wishlist_items_original_money_pair check (
    (original_amount_minor is null) = (original_currency is null)
  ),
  constraint wishlist_items_original_amount_non_negative check (
    original_amount_minor is null or original_amount_minor >= 0
  ),
  constraint wishlist_items_original_currency_iso check (
    original_currency is null or original_currency ~ '^[A-Z]{3}$'
  ),
  constraint wishlist_items_converted_money_tuple check (
    (converted_amount_minor is null
      and converted_currency is null
      and conversion_rate_source is null
      and conversion_rate_at is null)
    or (converted_amount_minor is not null
      and converted_currency is not null
      and conversion_rate_source is not null
      and conversion_rate_at is not null)
  ),
  constraint wishlist_items_converted_amount_non_negative check (
    converted_amount_minor is null or converted_amount_minor >= 0
  ),
  constraint wishlist_items_converted_currency_iso check (
    converted_currency is null or converted_currency ~ '^[A-Z]{3}$'
  ),
  constraint wishlist_items_conversion_rate_source_bounded check (
    conversion_rate_source is null or char_length(conversion_rate_source) <= 200
  ),
  constraint wishlist_items_sort_position_finite check (
    sort_position < 'Infinity'::float8 and sort_position > '-Infinity'::float8
  )
);

comment on table public.wishlist_items is
  'Durable items on an owner''s wishlist; ownership is redundant with the parent wishlist and kept consistent by the composite foreign key.';
comment on column public.wishlist_items.wishlist_id is
  'The parent wishlist; with owner_id it forms the composite foreign key to wishlists(id, owner_id).';
comment on column public.wishlist_items.owner_id is
  'Denormalized from the parent wishlist for owner-only policies; never client-writable and kept consistent by the composite foreign key.';
comment on column public.wishlist_items.title is
  'Required, 1-200 characters, never blank (the canonical 004e blank-set rule).';
comment on column public.wishlist_items.source_url is
  'Optional product link, at most 2048 characters, http(s) only when present; URL semantics beyond the scheme are extraction security (005e), not schema behavior.';
comment on column public.wishlist_items.retailer is
  'Optional retailer label, at most 120 characters, non-blank when present.';
comment on column public.wishlist_items.image_url is
  'Optional selected remote image URL, at most 2048 characters, http(s) only.';
comment on column public.wishlist_items.image_snapshot_path is
  'Optional Supabase Storage object path of the stored snapshot copy (never an external address); display prefers it over image_url (005b).';
comment on column public.wishlist_items.note is
  'Optional free note, at most 2000 characters; blank-to-null normalization is 005c''s server concern.';
comment on column public.wishlist_items.original_amount_minor is
  'Original price in integer minor units of original_currency (never floating point); null when the item has no price yet.';
comment on column public.wishlist_items.original_currency is
  'Uppercase ISO 4217 code for original_amount_minor; zero-decimal and two-decimal currencies share the minor-unit representation.';
comment on column public.wishlist_items.converted_amount_minor is
  'Optional approximate conversion in integer minor units; stored only with its full provenance tuple.';
comment on column public.wishlist_items.converted_currency is
  'Uppercase ISO 4217 code for converted_amount_minor.';
comment on column public.wishlist_items.conversion_rate_source is
  'Where the conversion rate came from, at most 200 characters; part of the all-or-nothing converted tuple.';
comment on column public.wishlist_items.conversion_rate_at is
  'When the conversion rate was fetched; part of the all-or-nothing converted tuple.';
comment on column public.wishlist_items.desire_level is
  'Closed product vocabulary mapping 1:1 to the approved V18 display strings.';
comment on column public.wishlist_items.extraction_status is
  'How the item came to be; Phase 4 flows persist only manual and extracted.';
comment on column public.wishlist_items.sort_position is
  'Finite double precision ordering key; the total order is (sort_position ASC, id ASC) and duplicates are allowed by design.';

-- Creates the owner's single wishlist for every new auth user. Runs inside
-- the signup transaction: a failure here aborts the signup, so no auth user
-- exists without a wishlist (the 004a trigger pattern).
create function public.handle_new_user_wishlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wishlists (owner_id)
    values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_wishlist_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user_wishlist();

-- Keeps updated_at owned by the database on every row update.
create function public.set_wishlists_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger wishlists_set_updated_at
  before update on public.wishlists
  for each row
  execute function public.set_wishlists_updated_at();

create function public.set_wishlist_items_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger wishlist_items_set_updated_at
  before update on public.wishlist_items
  for each row
  execute function public.set_wishlist_items_updated_at();

-- Backfill: users that predate this migration also get exactly one wishlist
-- row. ON CONFLICT DO NOTHING keeps the statement idempotent when re-run.
-- In local/CI stacks this backfills 0 rows (the seed runs after migrations);
-- the staging figure is recorded when the separate staging gate applies it.
insert into public.wishlists (owner_id)
  select id
  from auth.users
  on conflict (owner_id) do nothing;

-- Explicit grants regardless of any default privileges in the stack.
revoke all on public.wishlists from anon;
revoke all on public.wishlists from authenticated;
revoke all on public.wishlists from public;

-- The signup trigger creates wishlists, so no client INSERT/UPDATE/DELETE
-- grant exists: authenticated rows are read-only.
grant select on public.wishlists to authenticated;

revoke all on public.wishlist_items from anon;
revoke all on public.wishlist_items from authenticated;
revoke all on public.wishlist_items from public;

grant select, delete on public.wishlist_items to authenticated;
grant insert (wishlist_id, owner_id, title, source_url, retailer, image_url,
              image_snapshot_path, note, original_amount_minor, original_currency,
              converted_amount_minor, converted_currency, conversion_rate_source,
              conversion_rate_at, desire_level, extraction_status, sort_position)
  on public.wishlist_items to authenticated;
grant update (title, source_url, retailer, image_url, image_snapshot_path, note,
              original_amount_minor, original_currency, converted_amount_minor,
              converted_currency, conversion_rate_source, conversion_rate_at,
              desire_level, extraction_status, sort_position)
  on public.wishlist_items to authenticated;

-- Functions are EXECUTE-granted to PUBLIC by default, and Supabase default
-- privileges extend that to anon, authenticated, and service_role. No client
-- role needs EXECUTE on any of them: the signup trigger is only ever reached
-- through signup itself, and trigger-function EXECUTE is checked at CREATE
-- TRIGGER time, not when the trigger fires. The function owner retains
-- implicit EXECUTE.
revoke execute on function public.handle_new_user_wishlist()
  from public, anon, authenticated;
revoke execute on function public.set_wishlists_updated_at()
  from public, anon, authenticated;
revoke execute on function public.set_wishlist_items_updated_at()
  from public, anon, authenticated;

alter table public.wishlists enable row level security;

create policy wishlists_select_own on public.wishlists
  for select
  to authenticated
  using (auth.uid() = owner_id);

alter table public.wishlist_items enable row level security;

create policy wishlist_items_select_own on public.wishlist_items
  for select
  to authenticated
  using (auth.uid() = owner_id);

create policy wishlist_items_insert_own on public.wishlist_items
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy wishlist_items_update_own on public.wishlist_items
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy wishlist_items_delete_own on public.wishlist_items
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- Rollback / forward-fix note: this migration is forward-only; any
-- correction ships as a NEW migration. The revert path, in dependency
-- order, is: drop the triggers on auth.users and both tables, drop the
-- three functions, drop the five RLS policies, drop public.wishlist_items,
-- drop public.wishlists, then drop the two enum types. Reverting deletes
-- wishlist data irreversibly (hard delete; no soft-delete column exists in
-- Phase 4), so a revert is a deliberate data-destroying gate, never a hotfix.
