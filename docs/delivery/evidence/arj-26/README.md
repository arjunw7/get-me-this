# Evidence pack — ARJ-26 (005a: wishlist schema, grants, RLS, and tests)

- **Issue**: [ARJ-26](https://linear.app/arjun-wadhwa/issue/ARJ-26/005a-wishlist-schema-grants-rls-and-tests), child of tracker ARJ-25.
- **Binding brief**: [`docs/delivery/issues/005a-wishlist-schema-grants-rls-and-tests.md`](https://github.com/arjunw7/get-me-this/blob/251d5741dc0cc6df8c9ac95d6209b9da6df187a6/docs/delivery/issues/005a-wishlist-schema-grants-rls-and-tests.md) at its exact merged main commit `251d574` (merge of PR #25).
- **Branch**: `wishlist/arj-26-wishlist-schema`, cut from `main` at `251d574`.
- **Pull request**: PR #26 — https://github.com/arjunw7/get-me-this/pull/26

## What shipped

1. `supabase/migrations/20260930000000_wishlists.sql` — forward-only migration in the
   004a style: header naming the subtask and brief (planning commit `251d574`) with
   enumerated guarantees; `comment on` documentation for both tables and every new
   column; the `wishlist_item_desire_level` and `wishlist_item_extraction_status` enum
   types; `public.wishlists` (`owner_id` UNIQUE → `auth.users` ON DELETE CASCADE — the
   one-wishlist-per-owner enforcement point — plus `unique (id, owner_id)` as the FK
   target); `public.wishlist_items` with the composite FK
   `(wishlist_id, owner_id) → wishlists(id, owner_id) ON DELETE CASCADE` as the only
   parent link (redundant `owner_id` kept consistent by the database), the integer
   minor-units + ISO 4217 money pair with all-or-nothing CHECKs, the all-or-nothing
   converted tuple with rate provenance, the finite `sort_position` CHECK, and the
   004e canonical blank-set field bounds; the `SECURITY DEFINER` signup trigger
   (`handle_new_user_wishlist` / `on_auth_user_wishlist_created`, empty `search_path`)
   with the idempotent backfill; `updated_at` BEFORE UPDATE triggers using
   `clock_timestamp()`; REVOKE-then-minimal-GRANT (anon: nothing; authenticated:
   SELECT-only on `wishlists`, SELECT + 17-column INSERT + 15-column UPDATE + DELETE on
   `wishlist_items`); EXECUTE revoked from PUBLIC/anon/authenticated on all three new
   functions; owner-only RLS policies `wishlists_select_own` and
   `wishlist_items_{select,insert,update,delete}_own`; rollback/forward-fix notes.
2. `supabase/tests/wishlist.sql` — new 154-assertion pgTAP allow/deny suite mirroring
   `profiles.sql`'s structure (synthetic `auth.users`, `set local role authenticated`
   with simulated JWT claims, `throws_ok` with SQLSTATE, `finish()` + `rollback`).
3. `supabase/tests/smoke.sql` — the deliberately reviewed amendment: public-table
   inventory 1 → 3 (`profiles`, `wishlists`, `wishlist_items`, each `has_table`-
   asserted), the seeded-data assertion changed from "no user rows" to exactly the one
   `.invalid` fixture user with its trigger-created profile, wishlist, and three
   fixture items; header prose and `plan()` updated in the same reviewed edit (13).
4. `supabase/seed.sql` — owned by this slice: one deterministic synthetic fixture user
   (`wishlist-fixture@example.invalid`, fixed UUID) whose insert fires the real
   profile and wishlist signup triggers, plus three fixture items resolved to the
   trigger-generated wishlist by `owner_id` (never hard-coded); every statement
   idempotent (`on conflict do nothing` on fixed UUIDs); no credentials, tokens, or
   real personal data; exists only in local/CI stacks.

## Acceptance criteria cross-check

| # | Brief criterion | Evidence |
| --- | --- | --- |
| 1 | Schema shape | `wishlist.sql` §1 — green in the CI database job (`ci-database-job-run.md`) |
| 2 | Auto-creation and backfill | `wishlist.sql` §2, §3, §15 |
| 3 | Owner allow — read | `wishlist.sql` §5 (exactly one wishlist; exactly own items) |
| 4 | Owner allow — write | `wishlist.sql` §4 (full/extracted/minimal inserts, update through every granted column), §10 (owner delete) |
| 5 | Grant/RLS inventory | `wishlist.sql` §11 (anon zero privileges; SELECT-only wishlists; 17-column INSERT / 15-column UPDATE grants; no client EXECUTE; owner-only policies) |
| 6 | Signed-out deny | `wishlist.sql` §12 (anon 42501 × 8) |
| 7 | Cross-user enumeration deny | `wishlist.sql` §13 |
| 8 | Cross-user mutation deny | `wishlist.sql` §13 (zero-row UPDATE/DELETE, 42501 WITH CHECK, 23503 composite FK, wishlist-row denials) |
| 9 | Uniqueness | `wishlist.sql` §14 (23505 as the table owner in-transaction) |
| 10 | Timestamps | `wishlist.sql` §9 (clock_timestamp() bounds, monotone edits, column-grant 42501s) |
| 11 | Money integrity | `wishlist.sql` §6 (pair CHECK, non-negativity, ISO regex, INR/JPY round-trips, four partial converted tuples, complete tuple round-trip) |
| 12 | Enum and bound rejections | `wishlist.sql` §7 (22P02 × 2, 23514 × 12) |
| 13 | Sort position semantics | `wishlist.sql` §8 (shared positions allowed; deterministic (sort_position, id) order) |
| 14 | Cascade | `wishlist.sql` §16 (wishlist delete cascades items; user delete cascades both; no orphans) |
| 15 | Smoke inventory | amended `smoke.sql` green (13/13) in the CI database job |
| 16 | Seed hygiene | `supabase/seed.sql` review; idempotency via fixed-UUID conflicts; no credentials/real data |
| 17 | CI proof | green `database` job on PR head `0cb40f8` (`ci-database-job-run.md`); the deliberate failing negative-test demonstration is the red job on `a9fc672` |
| 18 | Forward-only discipline | the migration was never edited after its first application; the pgTAP suite (not the migration) carried every fix; rollback notes in the PR and below |

## Transcripts

- `verify-pass.txt` — full local `pnpm verify` (format, lint, typecheck, 367 unit
  tests, build) passing before/at the PR.
- `ci-database-job-run.md` — the green `database` job run link, log excerpts, the
  negative-gate demonstration run link, the iteration log, and the credential-hygiene
  log review.
- `negative-gate-failing-first-red.txt` — raw log of the deliberately red `database`
  job at the failing-first commit `a9fc672` (pgTAP assertion failures against the
  missing schema; `verify` stayed green in the same run).

## Migration and rollback notes

- Forward-only: `20260930000000_wishlists.sql` is never edited after application; any
  correction ships as a new migration (this PR's fixes were all test-side, so none was
  needed).
- Rollback path (dependency order): drop the `on_auth_user_wishlist_created` trigger,
  the two `*_set_updated_at` triggers, the three functions, the five RLS policies,
  `public.wishlist_items`, `public.wishlists`, then the two enum types. Reverting is
  data-destroying (hard delete; no soft-delete column in Phase 4).
- Backfill figure: local/CI = 0 rows (the seed runs after migrations, so no user
  predates the wishlist trigger there). The staging figure (non-zero for existing
  staging users) is recorded when the separate owner-approved staging gate applies the
  migration, mirroring 004a.

## Out-of-scope confirmations

- No Magic Patterns mock data or editor artifacts shipped.
- **No before/after screenshots or Railway preview URL apply** — schema-only slice; no
  UI change exists (the PR's Railway check is incidental and carries no UI diff).
- No new npm dependencies; no lockfile drift.
- No staging or production Supabase mutation; the staging gate is a separate
  owner-approved step.
- No group-member grants or policies; no reactions/reservations/sharing structures.

## Sanitization statement

No credentials, tokens, OTPs, `.env.local` content, or local-stack key material appears
in this pack, the PR, or the CI logs.
