# CI database job run — ARJ-26 (PR #26)

## Green run (binding proof)

- **Run**: https://github.com/arjunw7/get-me-this/actions/runs/36645542453
- **Job**: "Database and stack e2e" — job
  https://github.com/arjunw7/get-me-this/actions/runs/36645542453/job/109667522089
- **Head commit**: `0cb40f8` (the exact PR head when the checks were read green).
- **Result**: PASS, 5m28s. Both jobs green on the same head: "Install and verify"
  (1m34s) and "Database and stack e2e" (5m28s), plus the Railway preview check.

Log excerpts from the job (full log retained locally at capture time; excerpts are
sanitized — no key/secret material appears in any CI log):

```
Reset the local stack from committed migrations and seed
Applying migration 20260930000000_wishlists.sql...
Finished supabase db reset on branch wishlist/arj-26-wishlist-schema.

Run pgTAP database suites
> supabase test db --local
Connecting to local database...
supabase/tests/profiles-004e.sql .. ok
supabase/tests/profiles.sql ....... ok
supabase/tests/smoke.sql .......... ok
supabase/tests/wishlist.sql ....... ok
All tests successful.
Result: PASS
```

- `wishlist.sql`: 154/154 assertions (plan(154)) — the full allow/deny matrix of the
  brief's acceptance criteria 1–14.
- `smoke.sql`: 13/13 assertions (plan(13)) — the deliberately amended public-table
  inventory (exactly `profiles`, `wishlists`, `wishlist_items`) and the seeded-fixture
  assertions.
- The stack-gated e2e step in the same job passed (the gated specs still skip freely —
  no stack-dependent spec was added in this slice; the coupling rule of 005h is not
  triggered).

## Deliberate failing negative-test demonstration

- **Run**: https://github.com/arjunw7/get-me-this/actions/runs/36643594781
- **Job**: https://github.com/arjunw7/get-me-this/actions/runs/36643594781/job/109661306205
- **Head commit**: `a9fc672` — the failing-first TDD commit: `supabase/tests/wishlist.sql`
  and the amended `supabase/tests/smoke.sql` landed **before** the migration, so the
  `database` job ran the suites against a schema without the wishlists tables. The job
  went red on pgTAP assertion failures (not infrastructure errors), demonstrating the
  negative gate: a failing assertion fails the job and blocks the merge gate.
- Raw transcript: `negative-gate-failing-first-red.txt` (full job log; sanitized —
  contains no key material). Key excerpts:

```
supabase/tests/smoke.sql:119: ERROR:  relation "public.wishlists" does not exist
# Failed test 4: "only the reviewed public tables (profiles, wishlists, wishlist_items) exist in the public schema"
# Failed test 6: "public.wishlists is the reviewed 005a wishlist table"
...
supabase/tests/wishlist.sql:110: ERROR:  relation "public.wishlist_items" does not exist
# Failed test 1: "public.wishlists exists"
...
Failed 107/154 subtests
 ELIFECYCLE  Command failed with exit code 1.
```

The same job's "Install and verify" stayed green — only the database gate reacted.

## Iterative fixes observed in CI (all pgTAP-suite mechanical issues, no schema changes)

1. `a9fc672` → red (the deliberate failing-first demonstration above).
2. `07e4b95` (migration + seed) → red: `function is(name[], text[], unknown) does not
   exist` — the CHECK-inventory assertion aggregated `conname` (type `name`); fixed by
   casting to `text[]`.
3. `3c168a4` → red: `function is(bigint, integer, unknown)` — money round-trip literals
   needed `::bigint` casts for pgTAP's same-type `is()` overload.
4. `7317114` → red: the `wishlist_id` column-grant denial targeted `:'wid_b'` before
   that psql variable was set; the denial is value-independent, so a generated uuid
   target is used instead.
5. `0cb40f8` → green: `has_table_privilege` does not see column-only grants (INSERT/
   UPDATE), so those assertions use `has_any_column_privilege`; the INSERT column count
   corrected to 17 (20 columns minus `id`, `created_at`, `updated_at` — the migration's
   grant was already correct).

## Credential-hygiene log review

The job log was reviewed at capture time: the `supabase start` output table is written
to a temp file and never echoed (the workflow's committed behavior); the sanitized
status summary prints only non-key fields; no publishable key, service-role key, token,
or `.env.local` content appears anywhere in the run log, this evidence pack, or the PR.
