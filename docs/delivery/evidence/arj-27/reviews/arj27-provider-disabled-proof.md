# Provider-disabled plain wishlist browser proof

Date: 2026-09-30. Final committed revision: `626aba6013576b04595f1e78fba5d4eb5d60967e` on `codex/phase4-recovery`. This repeats and supersedes the earlier `e5b1f77` proof after the one-line geometry adjustment.

Read-only preflight confirmed `.env.local`, `.env.production.local`, `.env.production`, and `.env` absent. Port 3100 had no listener before the run. Both commands explicitly unset `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `E2E_LOCAL_SUPABASE`; no values were printed or loaded from the original checkout.

Build command (exit 0):

```bash
env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -u SUPABASE_SERVICE_ROLE_KEY -u E2E_LOCAL_SUPABASE \
  PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm build
```

```text
> get-me-this@0.1.0 build /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> next build

▲ Next.js 16.3.6 (Turbopack)
✓ Running next.config.mjs took 44ms
  Creating an optimized production build ...
✓ Compiled successfully in 447ms
  Running TypeScript ...
  Finished TypeScript in 1293ms ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/12) ...
  Generating static pages using 11 workers (3/12)
  Generating static pages using 11 workers (6/12)
  Generating static pages using 11 workers (9/12)
✓ Generating static pages using 11 workers (12/12) in 173ms
  Finalizing page optimization ...
Route (app): /wishlist and /wishlist/items/new generated; proxy included.
```

Plain browser command (exit 0):

```bash
env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  -u SUPABASE_SERVICE_ROLE_KEY -u E2E_LOCAL_SUPABASE \
  PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm exec playwright test \
  tests/e2e/wishlist.spec.ts --project=mobile --project=desktop
```

```text
Running 6 tests using 6 workers
✓ desktop signed-out POST denial (including synthetic invalid Server Action header)
✓ mobile signed-out POST denial (including synthetic invalid Server Action header)
✓ desktop signed-out GET /wishlist → /auth with zero wishlist markup
✓ mobile signed-out GET /wishlist/items/new → /auth with zero wishlist markup
✓ desktop signed-out GET /wishlist/items/new → /auth with zero wishlist markup
✓ mobile signed-out GET /wishlist → /auth with zero wishlist markup
6 passed (2.9s)
```

The runner also emitted expected Next.js diagnostics for the test's deliberately invalid `not-a-real-action` Server Reference ID, plus Node `NO_COLOR`/`FORCE_COLOR` warnings. Neither was a test failure. This proves the page-level signed-out GET/POST behavior without a configured provider. The configured proxy envelope, owner reads, database tests, and visual comparisons still require the CI `database` job.
