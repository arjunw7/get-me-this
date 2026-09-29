# CI `database` job run evidence — PR #24

- Run: https://github.com/arjunw7/get-me-this/actions/runs/36636862499
- Job: "Database and stack e2e" —
  https://github.com/arjunw7/get-me-this/actions/runs/36636862499/job/109639531137
- Head at this run: `65a26e2` on `ci/arj-33-ci-database-gate` (first fully green
  `database` job; the commits after it are docs-only evidence-pack fixes).
  The binding green-on-exact-head evidence for criterion 2 is `gh pr checks` on the
  merged PR: both jobs run on every PR and push to `main` and are green on every
  commit of this PR, including the exact merge head. Also recorded: run 36637921203
  (head `7a082cc`, `Database and stack e2e` pass 5m11s, `Install and verify` pass
  1m41s).
- Result: **pass**, job wall time **5m21s** (bound: ≤ 25 min, 30-min timeout).
- Companion job "Install and verify" (unchanged `verify` job): **pass**, 1m12s —
  https://github.com/arjunw7/get-me-this/actions/runs/36636862499/job/109639530930

## Observed timing breakdown (bounds in parentheses)

| Step | Observed | Bound |
| --- | --- | --- |
| Install dependencies (frozen lockfile) | ~4 s | ≤ 5 min |
| Start the local Supabase stack (incl. first-time service image pulls) | ~2 m 16 s | ≤ 10 min |
| Reset the local stack (`supabase db reset --local`) | ~35 s | ≤ 5 min (shared with test:db) |
| Run pgTAP database suites (`pnpm test:db`) | ~4 s | ≤ 5 min (shared with reset) |
| Install the Playwright Chromium browser | ~1 m 55 s | ≤ 5 min |
| Build and run the stack-gated e2e suites (`scripts/e2e-local-stack.sh`) | ~54 s build + 54.5 s tests | ≤ 25 min (build ≤ 10 + e2e ≤ 15 combined) |
| **Job total** | **5 m 21 s** | ≤ 30 min |

First measured stack-start time (dominated by image pulls on a fresh runner):
~2 m 16 s — well inside its 10-minute bound, so the brief's job-split and
service-trimming latitude clauses were not invoked.

## Log excerpts (key material filtered independently; see hygiene note)

Stack start (applies committed migrations and seed), then sanitized summary:

```
Stopped services: [supabase_imgproxy_get-me-this supabase_pooler_get-me-this]
API_URL: http://127.0.0.1:54321
DB_URL: ***127.0.0.1:54322/postgres
FUNCTIONS_URL: http://127.0.0.1:54321/functions/v1
GRAPHQL_URL: http://127.0.0.1:54321/graphql/v1
INBUCKET_URL: http://127.0.0.1:54324
```

Deliberate duplicate-proof reset from committed sources:

```
Seeding globals from roles.sql...
Applying migration 20260927000000_baseline.sql...
Applying migration 20260928090000_profiles.sql...
Applying migration 20260929000000_profiles_taste_line.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch ci/arj-33-ci-database-gate.
```

pgTAP gate (`pnpm test:db` → `supabase test db --local`):

```
supabase/tests/profiles-004e.sql .. ok
supabase/tests/profiles.sql ....... ok
supabase/tests/smoke.sql .......... ok
All tests successful.
Files=3, Tests=73,  0 wallclock secs
Result: PASS
```

Stack-gated e2e (`E2E_LOCAL_SUPABASE=1`, via `scripts/e2e-local-stack.sh`,
production build against the local stack):

```
22 passed (54.5s)
```

## Credential-hygiene log review

- The local-stack fixture keys appear nowhere in the job log: they are written
  to temp files (`/tmp/gmt-supabase-start.txt`, `/tmp/gmt-supabase-status.json`)
  and never echoed; the printed summary is filtered through a node check that
  drops any field whose name matches `key|secret|password|token`.
- The only occurrence of the literal `eyJ` in the log is the diagnostic
  grep pattern inside the echoed step source (line 271), not a JWT value.
- The publishable-key prefix `sb_publishable` appears 0 times; GitHub's own
  masking additionally redacted the local DB password in `DB_URL`.
- No step summaries or artifacts are uploaded by the job.
