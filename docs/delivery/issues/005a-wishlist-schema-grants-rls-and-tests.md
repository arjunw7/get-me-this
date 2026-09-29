# 005a — Wishlist schema, grants, RLS, and tests

## Outcome

Give each authenticated user exactly one persistent wishlist and durable
wishlist items, created automatically at signup, with original prices stored
in integer minor units with an ISO 4217 currency code, every write path
constrained by database-level bounds, and access restricted to the row's
owner through least-privilege grants and owner-only row level security — all
proven by pgTAP allow/deny suites running in the CI `database` job. It
excludes every piece of application behavior: no UI, no server data-access
code, no extraction, no groups, and no staging Supabase changes. 005b's
protected display path is the first consumer of the schema this slice lands.

## Scope

- One forward-only migration creating `public.wishlists` and
  `public.wishlist_items` per `docs/architecture/data-model.md`, following
  the exact style of `20260928090000_profiles.sql`: a header comment naming
  this subtask and binding brief, enumerated guarantees, `comment on`
  documentation, explicit REVOKE-then-minimal-GRANT, `alter table ...
  enable row level security`, policies named `<table>_<action>_own`, and
  `updated_at` maintained by a BEFORE UPDATE trigger using
  `clock_timestamp()` (the same transaction-fixed-`now()` reasoning as
  004a; triggers `wishlists_set_updated_at` and
  `wishlist_items_set_updated_at` executing
  `public.set_wishlists_updated_at()` and
  `public.set_wishlist_items_updated_at()`, mirroring the 004a naming).
  Never edit an applied migration; fix forward.
- **`public.wishlists`**: `id uuid primary key default gen_random_uuid()`;
  `owner_id uuid not null unique` referencing `auth.users(id) on delete
  cascade` (the UNIQUE constraint is the one-wishlist-per-owner invariant's
  enforcement point); `created_at`/`updated_at timestamptz not null default
  clock_timestamp()`. No personality/theme columns: no approved V18 Phase 4
  screen edits wishlist-level fields, and unused columns are schema debt
  until a UI needs them (a forward migration adds them later).
- **`public.wishlist_items`**: `id uuid primary key default
  gen_random_uuid()`; `wishlist_id uuid not null`; `owner_id uuid not null`
  referencing `auth.users(id) on delete cascade`; `title text not null`
  bounded and non-blank; `source_url`, `retailer`, `image_url`,
  `image_snapshot_path`, `note` nullable and bounded; the original money
  pair; the optional converted-money tuple; `desire_level` and
  `extraction_status` as new enum types; `sort_position double precision
  not null`; `created_at`/`updated_at` as above.
- A composite foreign key `(wishlist_id, owner_id)` referencing
  `public.wishlists (id, owner_id) on delete cascade` — backed by a new
  `unique (id, owner_id)` constraint on `wishlists` — makes redundant
  ownership unrepresentable as drift: an item row can only point at a
  wishlist that itself names the same `owner_id`. Deleting a wishlist
  cascades to its items through this same FK (a separate plain
  `wishlist_id` FK is not added; the composite FK is the only parent link).
- **Wishlist auto-creation at signup**: a `SECURITY DEFINER` AFTER INSERT
  trigger on `auth.users` (function `public.handle_new_user_wishlist()`,
  trigger `on_auth_user_wishlist_created`, empty `search_path`, fully
  qualified names) creates the owner's single wishlist inside the signup
  transaction, mirroring the proven 004a profile-trigger pattern; trigger
  failure blocks signup, so no user can end up without a wishlist. The
  migration backfills `INSERT ... SELECT id FROM auth.users ON CONFLICT
  (owner_id) DO NOTHING` after trigger creation for users predating it,
  and the backfill is idempotent (staging has synthetic users; where each
  backfill figure is recorded is pinned under Required proof).
- Least-privilege grants and RLS, mirroring the 004a column-grant
  discipline: `anon` receives no privileges on either table or EXECUTE on
  any new function; `authenticated` receives SELECT on `wishlists` only
  (the trigger creates wishlists, so no client INSERT/UPDATE/DELETE grant
  exists) and SELECT, INSERT, UPDATE, DELETE on `wishlist_items`. The
  INSERT grant excludes only `id`, `created_at`, and `updated_at` — the
  client legitimately supplies `wishlist_id` and `owner_id` (both NOT NULL
  with no defaults, so a column-limited INSERT excluding them would be
  unexecutable), and correctness there is enforced by the RLS `with check
  (auth.uid() = owner_id)` plus the composite FK, which together make a
  mismatched or hijacked insert impossible. The UPDATE grant is
  column-limited so `id`, `wishlist_id`, `owner_id`, `created_at`, and
  `updated_at` are never client-updatable — items cannot be moved between
  wishlists or re-owned after creation. Rejected alternative: excluding
  `wishlist_id`/`owner_id` from INSERT too (forces a definer-default
  mechanism for columns the owner's client must state, splitting the
  insert path for no added safety, since RLS and the composite FK already
  constrain exactly these two columns). RLS is enabled on both tables
  with owner-only policies: `wishlists_select_own` (`auth.uid() =
  owner_id`), and `wishlist_items_select_own`, `wishlist_items_insert_own`,
  `wishlist_items_update_own`, `wishlist_items_delete_own` (`auth.uid() =
  owner_id` on both USING and WITH CHECK sides where applicable). Trigger
  and updated_at functions get EXECUTE revoked from PUBLIC, anon, and
  authenticated (the 004a CREATE-TIME-check rule). Service-role credentials
  remain server-only. **No group-member grant or policy exists before
  Phase 5.**
- **Deliberate, reviewed amendment of `supabase/tests/smoke.sql`** (the
  only existing suite the schema and seed changes collide with): the
  public-table inventory assertion changes from "only `profiles` exists"
  (count 1) to "exactly `profiles`, `wishlists`, and `wishlist_items`
  exist" (count 3, with `has_table` for each new table), the seeded-data
  assertion changes from "no user rows were seeded" to "exactly the one
  synthetic fixture user from `supabase/seed.sql` exists", the header
  comment is updated so its prose matches the amended assertions, and the
  `plan()` count is updated in the same reviewed edit. The smoke suite
  gains assertions that the fixture wishlist and its fixture items exist
  and that nothing else was seeded. The other existing suites are traced
  and need no amendment: `profiles-004e.sql` asserts only by specific
  synthetic ids, and `profiles.sql`'s two absolute profile-count
  assertions run under owner-only RLS as the authenticated test user, so
  the fixture user's profile is invisible to them and they remain
  unchanged — with the fixture present they now prove non-enumeration
  against a genuinely pre-existing second user, a strengthening rather
  than a weakening. All smoke edits are explicit weakenings-with-scope
  recorded in the pull request — not silent edits.
- **Synthetic, non-persistent seed fixtures owned by this slice**
  (`supabase/seed.sql`): a single deterministic synthetic user
  (`@example.invalid` address, fixed UUID), whose insert fires the real
  profile and wishlist triggers, plus a small fixed set of wishlist items
  for local development and the gated e2e specs. Every statement is
  idempotent (`on conflict do nothing` on deterministic UUIDs), contains no
  credentials, tokens, or real personal data, and is safe to re-run. The
  fixture wishlist's id is trigger-generated, so the seed resolves
  `wishlist_id` by the fixture `owner_id` (never hard-codes it), keeping
  re-runs unambiguous. Seed
  data exists only in the local/CI stack (migrations-only deployments never
  run seed against staging or production), which is the sense in which it
  is non-persistent.

### Design resolutions owned by this brief

All resolutions are dated owner decisions (2026-09-30), pinning every open
question left by the Linear draft and the logical model. Rejected
alternatives are recorded with each.

1. **Desire level enum.** New type `public.wishlist_item_desire_level as
   enum ('really_want', 'would_love', 'just_an_idea')`, column NOT NULL
   with default `'would_love'`. The SQL labels map 1:1 to the approved V18
   display strings "Really want", "Would love", "Just an idea"
   (`docs/flows/wishlist.md`, item fields). A nullable column was rejected:
   every item in the V18 prototype shows a desire level, and tri-state
   nulls would leak into every display branch; a NOT NULL default keeps
   manual rows valid while 005c's form still supplies an explicit choice.
   A free-text column was rejected: the value set is closed product
   vocabulary, and an enum makes invalid states unrepresentable.
2. **Extraction status enum.** New type
   `public.wishlist_item_extraction_status as enum ('manual',
   'extracting', 'extracted', 'failed')`, column NOT NULL with default
   `'manual'`. The four values mirror the four `/wishlist/items/new`
   states 005f implements (initial, extracting, extracted-review,
   failed/manual), so review UI state and persisted item state share one
   vocabulary; `manual` covers hand-created items and the fallback
   completion path. Only `manual` and `extracted` rows are persisted by
   Phase 4 flows (`extracting`/`failed` exist so 005e/005f never need a
   type-breaking migration if they persist in-flight or failed attempts);
   005a tests assert only the type, default, and rejection of foreign
   values. Text with a CHECK was rejected: the parallel with an approved
   closed vocabulary is exact and enums self-document.
3. **Money representation.** `original_amount_minor bigint` and
   `original_currency char(3)`, both nullable, with CHECK constraints
   enforcing (a) both null or both non-null, (b) amounts `>= 0` (the
   same non-negativity CHECK applies to `converted_amount_minor`), (c)
   currency matching `^[A-Z]{3}$` (uppercase ISO 4217). Minor units are
   never floating point (`docs/architecture/data-model.md`), and
   `bigint` removes any overflow class for even zero-decimal high-unit
   currencies (the rejected `integer` saves 4 bytes and buys a real
   overflow surface; `numeric` re-admits fractional drift). Zero-decimal
   (JPY) and two-decimal (USD, INR) currencies therefore share one
   representation: the integer count of the currency's minor unit. The
   optional converted tuple — `converted_amount_minor bigint`,
   `converted_currency char(3)`, `conversion_rate_source text` (≤ 200
   chars), `conversion_rate_at timestamptz` — carries the same all-or-
   nothing CHECK across all four columns, so a stored conversion always
   has its rate provenance (005g's display contract depends on this).
   Both currency columns carry the same `^[A-Z]{3}$` CHECK.
   Storing a single JSON blob for money was rejected: constraints and
   indexes on typed columns are what make the guarantees testable.
4. **Sort position representation.** `sort_position double precision not
   null`, no UNIQUE constraint, with the deterministic total order defined
   as `ORDER BY sort_position ASC, id ASC` everywhere items are read. A
   CHECK constraint rejects non-finite values (`sort_position <
   'Infinity'::float8 AND sort_position > '-Infinity'::float8`, which
   fails NaN and both infinities), so the read order is total over real
   numbers and 005d's midpoint arithmetic never meets NaN. New items
   append beyond the current maximum; insertion between neighbors
   takes the midpoint; midpoint exhaustion (after ~50 consecutive inserts
   into the same slot, given a 53-bit mantissa) is resolved by 005d's
   rebalancing. A UNIQUE constraint on `(wishlist_id, sort_position)` was
   rejected: it manufactures write conflicts between concurrent inserts
   and adds no safety, because the `id` tiebreak already guarantees a
   stable, duplicate-free total order for any stored values — "collision
   safety" comes from the deterministic tiebreak, not from forbidding
   equal positions. Text-based lexicographic fractional indexes were
   rejected as harder to inspect and debug with no additional guarantee;
   integer positions with full renumbering were rejected as O(n) writes
   per reorder. This slice pins the representation and the read order
   only; the interaction and rebalancing algorithm belong to 005d.
5. **Redundant `owner_id` on items — approved.** Items carry `owner_id`
   even though it is derivable via `wishlist_id`, kept consistent by the
   composite FK (Scope above) and never client-writable. The logical model
   permits this "only if it materially simplifies secure policies and is
   kept consistent by the database": every owner-only policy on items —
   and every Phase 5+ policy for reactions, reservations, and copy
   provenance — compares one constant per row instead of evaluating a
   subquery against `wishlists`, and the FK makes inconsistency a
   constraint violation rather than an application bug. The alternative
   (no redundancy; policies use `EXISTS (SELECT 1 FROM wishlists ...)`)
   is correct but gives up the database-level guarantee that the redundant
   question "who owns this item" can never drift from its parent. No
   secondary index on `wishlist_items (wishlist_id, owner_id)` is pinned
   here — the composite FK alone does not create one — and personal
   wishlists make the omission immaterial at Phase 4 scale; the Phase 5
   group-visibility brief should revisit it when member reads fan out
   across items.
6. **Deletion policy — hard delete, cascade upward.** `wishlist_items`
   rows are hard-deleted by their owner (005c's confirmed delete); no
   `deleted_at` soft-delete column exists in Phase 4. Wishlists cascade
   deletion to items via the composite FK; deleting an `auth.users` row
   cascades to both tables via the `owner_id` FKs. Adding `deleted_at` now
   was rejected: no Phase 4 flow hides or restores items, so the column
   would add RLS filtering and test surface for behavior nothing uses —
   and a forward migration can add it without breaking anything shipped
   here. No client DELETE grant exists on `wishlists` (no Phase 4 flow
   deletes a wishlist; account deletion is the cascade's job).
7. **Image and snapshot storage.** Two nullable fields per item:
   `image_url text` — the selected remote image URL (bounded to 2048
   chars, CHECK-constrained to `http(s)`) — and `image_snapshot_path
   text` — the Supabase Storage object path of the stored snapshot copy
   (bounded to 1024 chars, deliberately NOT a URL or scheme-checked, and
   never holding an external address). This implements the flow contract
   "store the source URL and selected product snapshot; never depend on
   the retailer remaining available": display prefers the snapshot path,
   falls back to `image_url`, then the branded placeholder (005b's
   contract). Creating the Storage bucket, upload/snapshot mechanics, and
   path conventions are owned by the 005e/005f briefs — 005a ships the
   columns and their bounds only. The flow doc's "optional candidate
   images" item field is acknowledged here as deliberately unpersisted:
   candidates matter only while the extraction-review screen is open. A
   `jsonb` candidates array was
   rejected: candidate images are transient extraction-review state, and
   persisting them would store data no screen reads.
8. **One-wishlist-per-owner enforcement.** `owner_id uuid not null unique`
   on `wishlists`: one declarative constraint, enforced on every write
   path including the trigger, backfill, and seed. A definer-function
   assertion or trigger-based dedupe was rejected as strictly more moving
   parts for the same guarantee.
9. **Auto-creation semantics — signup trigger, not lazy creation.** The
   wishlist is created by the signup trigger plus backfill (Scope above).
   Lazy creation on first wishlist read was rejected: it introduces
   concurrent-first-request races that must be resolved with a definer
   function plus conflict handling, splits "does the wishlist exist yet?"
   across every future code path, and gives 005b's read path no single
   invariant to rely on. The trigger pattern is the one 004a already
   proved, including its failure-blocks-signup semantics.
10. **Field bounds (defense in depth for 005c's server validation).**
    CHECK-constrained at the database so no write path can bypass them:
    `title` NOT NULL, 1–200 characters after the 004e canonical blank-set
    rule (never blank-only, mirroring the `profiles_display_name_non_blank`
    pattern); `note` ≤ 2000 characters (blank-to-null normalization of the
    note is 005c's server concern, not schema behavior); `source_url` ≤
    2048 chars and matching `^https?://` case-insensitively when present
    (URL semantics beyond the scheme are 005e's server-side validation);
    `retailer` ≤ 120 characters, non-blank when present; `image_url` ≤
    2048 chars and `http(s)`; `image_snapshot_path` ≤ 1024 chars. Tighter
    product-level rules (e.g. rejecting whitespace-padded titles) live in
    005c's server validation and its tests.

### Owner authorizations applied here

- **Database tests run in CI, not locally** (owner decision 2026-09-30,
  recorded in the merged 005h brief): the binding proof of every pgTAP
  claim below is the green `database` job on the implementation PR head,
  not a local run.
- **AI reviewer signoff plus green required checks authorize merging
  Phase 4 pull requests** (owner decision 2026-09-30, recorded in 005h):
  this brief's planning PR merges under that gate.

## Non-goals

- No group visibility of any kind: no group/member/invitation tables, no
  member-read policies, no reactions, reservations, copies, or assignments
  (Phase 5/6 slices; nothing here may preclude the recipient-never-sees-
  reservations guarantee).
- No application code: no pages, server actions, Supabase client data
  access, or proxy-policy changes (005b and later consume this schema).
- No Supabase Storage bucket creation, upload, or snapshot logic (005e/005f).
- No extraction behavior or URL fetching; the `source_url` scheme CHECK is
  storage hygiene, not extraction security (005e).
- No conversion-rate fetching, caching, or display (005g consumes the
  converted tuple pinned above).
- No reorder interaction or rebalancing algorithm (005d consumes the
  representation pinned above).
- No staging or production Supabase mutation. Applying the migration to
  the staging Supabase project is a separate owner-approved gate that must
  close before 005b's staging validation begins, mirroring the 004a
  staging gate; it is not part of this slice.
- No new npm dependencies.

## Acceptance criteria

Test types: **pgTAP** = assertions in the new transaction-wrapped
`supabase/tests/wishlist.sql` suite (mirroring `profiles.sql`: synthetic
`auth.users`, `set local role authenticated` with simulated JWT claims,
`throws_ok` with SQLSTATE, `finish()` + `rollback`), run by `pnpm
test:db` in the CI `database` job; **pgTAP/smoke** = amended
`supabase/tests/smoke.sql`; **CI** = observed `gh pr checks` on the exact
PR head; **review** = PR-diff inspection. Allow AND deny cases are all
mandatory.

1. **Schema shape (pgTAP).** Both tables exist with the pinned columns,
   types, nullability, defaults, PKs; `wishlists.owner_id` is UNIQUE and
   references `auth.users(id) on delete cascade`; the composite FK
   `(wishlist_id, owner_id) → wishlists(id, owner_id) on delete cascade`
   exists and no second plain `wishlist_id` FK exists; both enum types
   exist with exactly the pinned labels in order; RLS is enabled on both
   tables; the four item policies and the wishlist select policy exist
   under their pinned names; the `updated_at` triggers
   (`wishlists_set_updated_at`, `wishlist_items_set_updated_at`) and
   `on_auth_user_wishlist_created` exist; all CHECK constraints from
   resolutions 3, 4 (money, bounds), and 10 exist.
2. **Auto-creation and backfill (pgTAP).** A new `auth.users` insert gets
   exactly one wishlist (trigger); trigger failure aborts the signup
   transaction leaving no user row (forced-failure case, 004a pattern); a
   simulated pre-trigger user gets exactly one wishlist from the backfill
   statement, and re-running it is idempotent.
3. **Owner allow — read (pgTAP).** The authenticated owner selects their
   own wishlist and items; an owner's item list contains exactly their
   rows; the owner's `wishlists` select returns exactly one row (their
   own) even when other users' wishlists exist.
4. **Owner allow — write (pgTAP).** The owner inserts an item supplying
   all client-writable columns (including an explicit `sort_position` and
   both `manual` and `extracted` statuses), updates it through every
   granted column, and deletes it; each write lands with correct values.
5. **Grant/RLS inventory (pgTAP).** From `information_schema`: `anon` has
   zero table, column, or function privileges on anything new;
   `authenticated` has SELECT-only on `wishlists` (no INSERT/UPDATE/
   DELETE) and SELECT/INSERT/UPDATE/DELETE on `wishlist_items`, with the
   INSERT column list excluding only `id`, `created_at`, `updated_at`,
   and the UPDATE column list additionally excluding `wishlist_id` and
   `owner_id`; no client role holds EXECUTE on any new function; no policy
   references groups or grants any non-owner access.
6. **Signed-out deny (pgTAP).** As `anon`: SELECT, INSERT, UPDATE, DELETE
   on both tables each raise 42501.
7. **Cross-user enumeration deny (pgTAP).** Authenticated user B sees zero
   rows when selecting user A's wishlist by id, zero of A's items, and a
   count of only their own rows across both tables.
8. **Cross-user mutation deny (pgTAP).** B's UPDATE and DELETE targeting
   A's items affect zero rows and change nothing; B's INSERT with
   `owner_id = A` raises 42501 (WITH CHECK); B's INSERT with their own
   `owner_id` but A's `wishlist_id` raises 23503 (composite FK); B's
   UPDATE of A's wishlist row raises 42501 (SELECT-only grant), and
   authenticated INSERT and DELETE on `wishlists` each raise 42501
   (behavioral proof of the SELECT-only grant).
9. **Uniqueness (pgTAP).** A second `wishlists` row for the same owner
   raises 23505, including via the trigger's own insert path context
   (insert as the table owner in-transaction).
10. **Timestamps (pgTAP).** `created_at`/`updated_at` default to
    non-null values on insert; an owner edit advances `updated_at`
    strictly within `clock_timestamp()` bounds taken inside the test
    transaction and a later edit lands at or after an earlier one (no
    `now()` reliance); client attempts to change `id`, `wishlist_id`,
    `owner_id`, `created_at`, or `updated_at` on an existing item via
    UPDATE raise 42501 (column grant), and the database-set `updated_at`
    cannot be overwritten directly; client INSERT attempts supplying
    `id`, `created_at`, or `updated_at` also raise 42501.
11. **Money integrity (pgTAP).** Amount without currency, currency
    without amount, negative amounts, a lowercase currency code, and a
    two-letter code each raise 23514; JPY and INR/USD amounts round-trip
    exactly as stored minor units; a converted tuple missing any one of
    its four columns raises 23514, an invalid converted currency code and
    a negative converted amount raise 23514, and a complete tuple
    round-trips.
12. **Enum and bound rejections (pgTAP).** A non-enum desire level and a
    non-enum extraction status raise 22P02; a 201-character title, a
    blank-only title, a 2001-character note, a 2049-character
    `source_url`, a non-`http(s)` `source_url`, a non-`http(s)`
    `image_url`, a 121-character retailer, a blank-only retailer, a
    201-character `conversion_rate_source`, a 1025-character
    `image_snapshot_path`, and a non-finite (`NaN` or infinity)
    `sort_position` each raise 23514.
13. **Sort position semantics (pgTAP).** Two items in the same wishlist
    may share one `sort_position` (no UNIQUE constraint, by design), and
    a read ordered by `(sort_position, id)` returns a deterministic,
    stable order across two identical queries.
14. **Cascade (pgTAP).** Deleting the wishlist row (as the table owner,
    in-transaction) removes its items; deleting the fixture-or-synthetic
    `auth.users` row removes the wishlist and items with no orphans.
15. **Smoke inventory (pgTAP/smoke).** After `supabase db reset --local`
    rebuilds from committed migrations and seed alone: exactly
    `profiles`, `wishlists`, and `wishlist_items` exist in `public`
    (count 3, each `has_table`-asserted); exactly one seeded synthetic
    user exists (the `.invalid` fixture), with its trigger-created
    profile and wishlist and its fixture items — and nothing else; and
    the unchanged `profiles.sql` enumeration assertions (criteria 3 and
    7's profile counterparts) still pass with the fixture user present.
16. **Seed hygiene (pgTAP/smoke + review).** The seed contains no
    credentials, tokens, or real personal data; re-running the seed is
    idempotent (fixture counts unchanged after a second application);
    review confirms the seed writes only the synthetic fixture.
17. **CI proof (CI).** The `database` job runs `pnpm test:db` green on the
    implementation PR head; a failing pgTAP assertion fails that job
    (negative-gate behavior recorded in 005h), demonstrated once during
    implementation or cited from the runner's documented non-zero exit.
18. **Forward-only discipline (review).** The migration is never edited
    after first application; any correction ships as a new migration;
    rollback notes appear in the PR.

## Required proof

- Green `gh pr checks` on the implementation PR head showing the
  `database` job (pgTAP suites including `wishlist.sql`) and `verify` both
  green — the binding database proof per the 2026-09-30 owner decision
  (no local Docker on this machine).
- Grants and RLS inventory transcript for both tables (from the pgTAP
  inventory assertions), attached to the PR.
- The deliberate failing negative-test demonstration: a forced-failing
  pgTAP assertion shown red in CI once, or the runner's documented
  non-zero-exit behavior cited, per 005h's precedent.
- Migration and rollback notes in the PR: forward-fix discipline, and the
  revert path (drop trigger, functions, policies, tables, and enum types
  in dependency order).
- The backfill result count is recorded in the PR: the local/CI figure
  is 0 (seed runs after migrations, so no user predates the wishlist
  trigger there); the staging figure — non-zero for existing staging
  users — is recorded when the separate staging gate applies the
  migration, mirroring 004a's backfill-count wording.
- "No Magic Patterns mock data or editor artifacts shipped" confirmation
  (schema-only slice; no before/after screenshots or preview URL apply —
  state their absence explicitly).
- `pnpm verify` green locally (the CI `verify` job re-proves it).

## Dependencies

- Linear [ARJ-26](https://linear.app/arjun-wadhwa/issue/ARJ-26/005a-wishlist-schema-grants-rls-and-tests)
  (this slice), child of tracker
  [ARJ-25](https://linear.app/arjun-wadhwa/issue/ARJ-25/005-persistent-wishlist-tracker).
- Phase 3 exit satisfied (ARJ-19 Done); identity schema (`profiles`, the
  004a trigger pattern) is the exemplar this slice mirrors.
- 005h merged (CI `database` job exists; PR #24): the pgTAP proof surface
  this slice's tests run in. **The repository brief governs if the Linear
  draft differs.**
- Downstream: 005b (display) reads this schema; 005c (manual CRUD)
  consumes the column-grant contract and bounds; 005d (reorder) consumes
  the sort-position representation; 005e/005f (extraction) consume the
  image/snapshot and extraction-status contract; 005g (prices) consumes
  the money representation.
- The schema contract may be planned in parallel with 005b and 005e, but
  implementation follows this brief's merge.

## Analytics, security, and privacy

None. No PostHog events are added or changed. Seed and test data are
synthetic only (`@example.invalid`, fixed UUIDs); no credentials, tokens,
or real personal data are committed; the fixture user exists only in
local/CI stacks. Anon and cross-user access to wishlists and items is
denied and tested; no group-member access exists before Phase 5.

## Planning status

Brief only. ARJ-26 stays in Backlog until this brief is approved at its
exact commit and linked there; implementation is authorized only after
that approval, on a branch cut from the brief's merged commit.
