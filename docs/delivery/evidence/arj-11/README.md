# ARJ-11 evidence — local Supabase foundation (002d)

Captured on the Droid Computer on 2026-09-27 (UTC) from the isolated worktree
`/home/factory-user/worktrees/arj-11` on branch
`foundation/arj-11-supabase-local-foundation`, branched from `main` at `ead32af`
and then merged with `main` at `08344e4` (the ARJ-10 test and visual harness).

The merge resolved `README.md`, `package.json`, and `pnpm-lock.yaml` so both
foundations survive: ARJ-10's component, unit, end-to-end, accessibility, and
visual commands and dependencies, and every ARJ-11 database command with the
exact `supabase@2.118.0` dependency. The lockfile was regenerated from the
combined `package.json`.

Every file here is an allowlisted summary. Supabase CLI output tables containing
local API credentials (project URL, publishable key, secret key, database
connection string) are filtered out of all captures, and `pnpm db:status` output
is never recorded. No API key, token, connection string, or password appears in
this directory. Values printed by the local stack are local-development-only
defaults, but they are still treated as non-committable.

## Files

| File | Contents |
| --- | --- |
| `cli-runtime.txt` | Pinned Supabase CLI version, Node, pnpm, Docker engine, local Postgres major version. |
| `environment-inventory.txt` | Every environment variable, classified browser-exposed or server-only. Names only, no values. |
| `stack-health.txt` | Container names, health, and published local ports after `pnpm db:start`. |
| `migration-baseline-reset.txt` | Two `pnpm db:reset` runs applying the committed baseline and seeding. |
| `seed-on-demand.txt` | `pnpm db:seed` applying the non-persistent seed to a running stack. |
| `container-selection.txt` | Proof that the seed selects only this project's database container and fails closed on zero, duplicate, or other-project matches. |
| `db-test-pass.txt` | `pnpm test:db` results from two independent cycles. |
| `db-test-failure-proof.txt` | The same command failing (exit 1) with one assertion deliberately broken, plus proof the edit was reverted. |
| `lifecycle-reproducibility.txt` | Full recorded stop/start/reset/seed/test lifecycle with per-step exit codes. |
| `degradation-without-stack.txt` | Behaviour of the database commands when Docker or the stack is unavailable. |
| `verify-without-supabase.txt` | `pnpm verify` passing with the local Supabase stack stopped. |

## Acceptance criteria coverage

- **A developer can start local Supabase, reset from committed migrations, apply
  synthetic seeds, and run database tests using documented commands.**
  `lifecycle-reproducibility.txt` (all exit 0), with commands documented in
  `README.md` and `supabase/README.md`.
- **The baseline is reproducible from an empty local database.**
  `migration-baseline-reset.txt` shows two resets each recreating the database
  from committed migrations; `db-test-pass.txt` shows the suite passing after
  each rebuild.
- **Browser-exposed configuration contains only values intended for public
  clients.** `environment-inventory.txt`; only `NEXT_PUBLIC_*` names are
  classified as browser-exposed, and `.env.example` holds no values.
- **The test command fails when its smoke assertion is intentionally broken.**
  `db-test-failure-proof.txt` (exit 1, failed test 3, reverted edit verified by
  checksum).
- **`pnpm verify` remains usable when local Supabase is not running; database
  verification has an explicit command.** `verify-without-supabase.txt` and
  `degradation-without-stack.txt`.

## Reproducing

```bash
pnpm install --frozen-lockfile
pnpm verify        # passes with Supabase stopped
pnpm test:e2e      # Playwright, mobile and desktop
pnpm test:visual   # screenshot comparison against committed baselines
pnpm db:start
pnpm db:reset
pnpm db:seed
pnpm test:db
pnpm db:stop
```

Docker is required for the `db:*` and `test:db` commands. Forward-only migration
and forward-fix guidance is in `supabase/README.md`.
