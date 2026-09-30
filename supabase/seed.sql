-- Synthetic seed entry point for the local database.
--
-- Applied automatically by `pnpm db:reset` (see [db.seed] sql_paths in
-- supabase/config.toml), and on demand against a running stack with
-- `pnpm db:seed`.
--
-- Owned by the 005a wishlist slice (binding brief
-- docs/delivery/issues/005a-wishlist-schema-grants-rls-and-tests.md,
-- planning commit 251d574): it seeds exactly one deterministic synthetic
-- fixture user, whose insert fires the real profile and wishlist signup
-- triggers, plus a small fixed set of wishlist items for local development
-- and the gated e2e specs. The fixture wishlist's id is trigger-generated,
-- so item inserts resolve it by the fixture owner_id and never hard-code it.
--
-- Rules for this file:
--   * Synthetic data only. Never real user data. The fixture address is an
--     @example.invalid one and the UUIDs are fixed constants.
--   * No credentials, tokens, password hashes, or personal data.
--   * Every statement must be safe to re-run (idempotent via ON CONFLICT
--     DO NOTHING on deterministic UUIDs).
--   * Seed data exists only in the local/CI stack: migrations-only
--     deployments never run seed against staging or production.

do $$
begin
  raise notice '005a seed: one synthetic fixture user with trigger-created profile and wishlist, plus three fixture wishlist items.';
end
$$;

-- The fixture user. The insert fires the committed signup triggers, so the
-- profile row and the single wishlist row are created by the same code paths
-- production uses, never by hand.
insert into auth.users (id, aud, role, email, encrypted_password)
values (
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'wishlist-fixture@example.invalid',
  ''
)
on conflict (id) do nothing;

-- Fixture items, resolved to the trigger-generated wishlist by owner_id.
-- Money is integer minor units plus an uppercase ISO 4217 code (INR paise,
-- JPY zero-decimal, USD cents) per the 005a money contract.
insert into public.wishlist_items (
  id, wishlist_id, owner_id, title, source_url, retailer, note,
  desire_level, extraction_status, sort_position,
  original_amount_minor, original_currency
)
select
  '00000000-0000-4000-8000-000000000002',
  w.id,
  w.owner_id,
  'Ceramic pour-over coffee set',
  'https://example.invalid/products/pour-over-set',
  'Fixture Roasters',
  'The matte one, not the glossy one.',
  'really_want',
  'manual',
  1,
  249900,
  'INR'
from public.wishlists w
where w.owner_id = '00000000-0000-4000-8000-000000000001'
on conflict (id) do nothing;

insert into public.wishlist_items (
  id, wishlist_id, owner_id, title, retailer, note,
  desire_level, extraction_status, sort_position,
  original_amount_minor, original_currency
)
select
  '00000000-0000-4000-8000-000000000003',
  w.id,
  w.owner_id,
  'The Overstory paperback',
  'Fixture Books',
  null,
  'would_love',
  'manual',
  2,
  132000,
  'JPY'
from public.wishlists w
where w.owner_id = '00000000-0000-4000-8000-000000000001'
on conflict (id) do nothing;

insert into public.wishlist_items (
  id, wishlist_id, owner_id, title, note,
  desire_level, extraction_status, sort_position
)
select
  '00000000-0000-4000-8000-000000000004',
  w.id,
  w.owner_id,
  'Mechanical keyboard keycaps',
  'Just an idea for now, no link yet.',
  'just_an_idea',
  'manual',
  3
from public.wishlists w
where w.owner_id = '00000000-0000-4000-8000-000000000001'
on conflict (id) do nothing;
