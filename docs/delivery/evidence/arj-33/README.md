# Evidence pack — ARJ-33 (005h: CI database-test gate and delivery authorizations)

- **Issue**: [ARJ-33](https://linear.app/arjun-wadhwa/issue/ARJ-33/005h-ci-database-test-gate-and-delivery-authorizations), child of tracker ARJ-25.
- **Binding brief**: [`docs/delivery/issues/005h-ci-database-test-gate.md`](https://github.com/arjunw7/get-me-this/blob/3e2c8ee25a16d1d23695c1cfa0a0997664dd7ee4/docs/delivery/issues/005h-ci-database-test-gate.md) at its exact merged main commit `3e2c8ee` (merged to `main` by `c51a43d`, PR #23).
- **Branch**: `ci/arj-33-ci-database-gate`, cut from `main` at `c51a43d76155b9ad55de1dc1163c1071dea50ec8`.
- **Pull request**: PR #24 — https://github.com/arjunw7/get-me-this/pull/24

## What shipped

1. `.github/workflows/ci.yml` — a distinct `database` job ("Database and stack e2e")
   alongside the unchanged `Install and verify` job, running on `ubuntu-24.04` with
   `timeout-minutes: 30` on every pull request and push to `main`. Steps (each with a
   bounded `timeout-minutes`): install (5), `pnpm exec supabase start` with the
   repository's `supabase` 2.118.0 devDependency against the committed
   `supabase/config.toml` (10; the key-bearing start table is written to a temp file
   and never echoed), a deliberate `pnpm exec supabase db reset --local` proving the
   schema rebuilds from committed migrations and seed alone (5), `pnpm test:db` for the
   pgTAP suites in `supabase/tests/` (5), `pnpm exec playwright install --with-deps
   chromium` (5), and one step running `scripts/e2e-local-stack.sh` — silent
   local-stack environment wiring, production build, and the `E2E_LOCAL_SUPABASE`-gated
   specs (25 = build ≤ 10 + e2e ≤ 15 guide budgets combined). The sanitized status
   summary is printed from `supabase status -o json` through a node filter that drops
   key/secret material. The header comment now describes the two-job contract and
   cites the 2026-09-30 owner merge-gate authorization recorded in the brief.
2. `scripts/e2e-local-stack.sh` — the CI-facing runner required by the brief: parses
   `supabase status -o json` silently through node, exports the API URL, publishable
   key, and Mailpit URL, generates a per-run `AUTH_LINK_COOKIE_SECRET`, sets
   `E2E_LOCAL_SUPABASE=1`, builds the production bundle, and runs only the gated specs
   named as explicit Playwright paths (today `tests/e2e/auth-otp.spec.ts`), mirroring
   `scripts/e2e-auth-local.sh`'s conventions. Credential material is never printed.

The `verify` job's steps, name, and timeout are untouched; `package.json` and
`pnpm-lock.yaml` have no diff in this slice.

## Acceptance criteria cross-check

| # | Brief criterion | Evidence |
| --- | --- | --- |
| 1 | Distinct `database` job; `verify` untouched | PR diff (only the header comment plus the new job in `ci.yml`; the `verify` job block is byte-identical); reviewer confirmation in the PR review rounds |
| 2 | Trigger parity; both jobs green on this PR and subsequent PRs/pushes to main | `gh pr checks` on this PR (both jobs green on the exact head); recorded in `ci-database-job-run.md` |
| 3 | Stack from committed sources | CI log of the `database` job: `supabase start` (migrations + seed applied) and `supabase db reset --local` output — linked in `ci-database-job-run.md` |
| 4 | pgTAP gate passes; failures fail the job | CI log excerpt in `ci-database-job-run.md`; the pgTAP runner (`supabase test db`) exits non-zero on a failing assertion (documented CLI behavior), and the job step has no `|| true` or swallowed exit codes, so a red suite fails the job |
| 5 | Gated e2e runs green in the job; self-skips without the gate | CI log excerpt in `ci-database-job-run.md`; gate-free demonstration in `gated-spec-skip-gate-free.txt` (all 22 tests skipped across both projects, exit 0, produced against a production build, no stack needed) |
| 6 | Credential hygiene | Local-stack fixture keys are parsed silently through node and exported only; `supabase start` output is filtered through a key/secret/token-name filter before printing; log review noted in `ci-database-job-run.md` |
| 7 | Bounds met | Observed step timings recorded in `ci-database-job-run.md` (job ≤ 25 min, 30-min timeout; stack start within its 10-min bound) |
| 8 | Least privilege | No new actions beyond the same three SHA-pinned actions; no new secrets; the job inherits the workflow-level `permissions: contents: read` |
| 9 | No dependency or lockfile drift | PR diff shows empty `package.json` / `pnpm-lock.yaml` changes |
| 10 | Documentation parity | `ci.yml` header comment describes the two-job contract and cites the 2026-09-30 owner merge-gate authorization in the brief |
| 11 | Brief linkage | Linear ARJ-33 comments link the brief at `3e2c8ee` and this PR; the issue moves to Done after merge |

## Transcripts

- `verify-pass.txt` — full local `pnpm verify` (format, lint, typecheck, 367 unit
  tests, build) passing before the PR was opened.
- `gated-spec-skip-gate-free.txt` — acceptance criterion 5's gate-free demonstration:
  `pnpm exec playwright test tests/e2e/auth-otp.spec.ts` without
  `E2E_LOCAL_SUPABASE`, every test skipped, exit 0.
- `ci-database-job-run.md` — the `database` job's Actions run link, log excerpts
  (stack start, reset, pgTAP results, gated e2e results, timings), and the
  credential-hygiene log review, added once the PR's checks completed.

## Out-of-scope confirmations

- No Magic Patterns mock data or editor artifacts shipped.
- No new dependencies; no lockfile drift.
- No schema, migration, or application-behavior changes; no rollback notes required —
  the workflow change is reverted by reverting this single PR.

## Sanitization statement

No credentials, tokens, OTPs, `.env.local` content, or local-stack key material
appears in this pack, the PR, or the CI logs. The local stack's publishable key is a
development fixture and is treated as secret anyway (parsed silently, never echoed).
