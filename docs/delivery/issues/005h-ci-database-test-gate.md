# 005h — CI database-test gate and delivery authorizations

## Outcome

Every pull request and push to `main` runs the pgTAP database suites and the
stack-dependent Playwright e2e suites against a real local Supabase stack in a
distinct CI job, so database behavior is proven on machines without a container
runtime and the Phase 4 wishlist slices have a binding machine-independent
proof surface; it also records the owner authorizations that change the
delivery gates for this mission. It excludes all application behavior: no
schema changes, no application code changes, no new npm dependencies, and no
changes to the existing `verify` job or the Railway preview contract.

## Scope

- **A distinct `database` job in `.github/workflows/ci.yml`**, running on
  `ubuntu-24.04` (same runner image as `verify`) on every pull request and
  push to `main`, in addition to — never instead of — the unchanged
  `Install and verify` job. Job steps:
  1. The same three SHA-pinned actions as `verify`
     (`actions/checkout`, `pnpm/action-setup`, `actions/setup-node` with
     `node-version-file: .nvmrc` and `cache: pnpm`), each with
     `persist-credentials: false` where applicable, then
     `pnpm install --frozen-lockfile`.
  2. Start the local Supabase stack with the repository's pinned CLI
     devDependency (`pnpm exec supabase start`, `supabase` 2.118.0 from
     `package.json`) and the committed `supabase/config.toml`; `supabase
     start` itself applies migrations and seed on a fresh runner, then
     `pnpm exec supabase db reset --local` is run deliberately as duplicate
     proof that the schema rebuilds from committed migrations and seed alone
     — it is not an optimization target and must not be dropped.
  3. `pnpm test:db` (pgTAP suites in `supabase/tests/`).
  4. Install the Chromium browser for the committed Playwright version:
     `pnpm exec playwright install --with-deps chromium` (a fresh runner has
     no browser cache; `verify` never installs browsers, and the repo README
     documents this as per-machine setup).
  5. The stack-dependent Playwright e2e suites: export the local-stack
     environment exactly the way `scripts/e2e-auth-local.sh` does (silent
     `supabase status -o json` parsing of the API URL, publishable key,
     Mailpit URL; per-run `AUTH_LINK_COOKIE_SECRET`), set
     `E2E_LOCAL_SUPABASE=1`, build the production bundle, and run the gated
     specs through the committed Playwright config. The env wiring must live
     in a committed script in `scripts/` mirroring `e2e-auth-local.sh`'s
     conventions (never printing or echoing any key material), not inline
     workflow YAML.
- **Gated-suite coverage decision — run exactly the gated specs, by explicit
  list.** The CI-facing script runs only the specs gated by
  `test.skip(!process.env.E2E_LOCAL_SUPABASE, ...)`, named as explicit
  Playwright paths (today `tests/e2e/auth-otp.spec.ts`), mirroring
  `e2e-auth-local.sh`. Running the whole `tests/e2e` directory under the gate
  was considered and rejected: `tests/e2e/auth.spec.ts` asserts behavior of a
  build *without* provider configuration (the missing-configuration failure
  path), which a build against the configured local stack cannot satisfy, so
  full-directory execution would redden the gate or force out-of-scope spec
  edits. The coupling rule that keeps the explicit list honest: **any PR
  adding a new E2E_LOCAL_SUPABASE-gated spec must add it to the CI script's
  list in the same PR**, and that PR's description cites the green
  `database` job. No CI check enforces the list-vs-guard coupling yet; a
  guard test comparing the script's list against the grep of the skip guard
  is a recognized future hardening, out of scope here. The fixture-only
  default (`pnpm test:e2e` with no gate set) stays untouched for local use.
- **Single-job decision — pgTAP and gated e2e share one `database` job.**
  Starting the stack once (~several minutes of image pulls) is the dominant
  cost; two parallel jobs would each pay it. The job MAY be split into two
  parallel jobs (pgTAP vs. gated e2e) later without a new brief only if the
  combined job exceeds its runtime bound (below); the split must keep the
  unchanged-`verify` requirement intact.
- **Runtime and resource bounds.** `timeout-minutes: 30` on the `database`
  job, matching the workflow's budget; every step carries a bounded
  `timeout-minutes` so a hang fails fast instead of consuming the budget
  (guides: install ≤ 5, stack start ≤ 10 (includes first-time service image
  pulls; the first measured pull time is recorded in the implementation PR),
  db reset + test:db ≤ 5, browser install ≤ 5, build ≤ 10, e2e ≤ 15; steps
  share the job budget, the bounds cap hangs). Anonymous Docker Hub rate
  limiting on GitHub-hosted runners is a known pull-failure source: a single
  clean re-run after a rate-limit failure is permitted without being counted
  against the bounds, and repeated failures trigger the revisit clause below.
  Observed job runtime is recorded in the implementation PR. The
  workflow-level `concurrency` group already cancels superseded pull-request
  runs and applies to both jobs.
- **Image-pull caching resolution — evaluated, rejected as impractical.**
  Caching the Supabase service images via `docker save`/`docker load` behind
  `actions/cache` was considered and rejected: the images total multiple
  gigabytes, so cache save + restore approximates or exceeds the direct pull
  on GitHub runners, the 10 GB per-repository cache limit shared across all
  branches would be dominated by one image set, and a partially restored
  cache introduces flakiness into the very job that is supposed to be the
  stable gate. The existing pnpm store cache (via `actions/setup-node`) is
  retained. Revisit only if measured stack-start time breaches its 10-minute
  bound; any such revisit is recorded as a dated amendment to this brief.
- **Service trimming latitude.** If the measured bounds above require it,
  the job MAY exclude services no suite uses (e.g. Studio) via documented CLI
  flags, provided every pgTAP suite and every gated e2e spec still passes
  against the same committed `config.toml`. The committed `config.toml` itself
  is not changed.
- **Least privilege and hygiene.** Workflow-level `permissions: contents:
  read` already covers the new job (no job-level escalation, no new secrets,
  no workflow-scoped tokens). GitHub Actions remain pinned to full commit
  SHAs. The header comment in `ci.yml` is amended in the same change to
  describe the two-job contract and to point at the owner merge-gate
  authorization recorded below, so the workflow file no longer contradicts
  the recorded authorization.
- **Credential hygiene.** The local stack's publishable key is a development
  fixture, but the job treats it as secret anyway: parsed silently through
  node, exported, never echoed into logs, PR bodies, or artifacts. No
  repository or environment secrets are added; no `.env.local` content is
  involved.
- **Negative-gate behavior.** A failing pgTAP suite or a failing gated e2e
  spec fails the `database` job (step exit codes propagate; no `|| true`,
  no swallowed failures), and a red `database` job blocks the Phase 4 merge
  gate exactly like a red `verify` job.

### Owner authorizations recorded here (all dated 2026-09-30, auditable)

1. **Database tests run in CI, not locally.** The owner's machine has no
   container runtime; the owner approved extending the CI contract instead of
   requiring local Docker. `pnpm test:db`, `db:start`/`db:reset`, and the
   stack-dependent e2e remain valid locally wherever Docker exists, but their
   binding proof for Phase 4 is the green `database` job. Rejected
   alternatives: installing Docker/colima locally (violates the mission
   boundary), or dropping pgTAP/gated-e2e proof (weakens the migration+RLS
   test rule).
2. **AI reviewer signoff plus green required checks authorize merging Phase 4
   pull requests.** The repo rule "do not merge to `main` without explicit
   human approval" is superseded for this mission's slices and recorded here;
   where repo documents written before this date (including `AGENTS.md` and
   `docs/delivery/definition-of-done.md`'s human-approval wording) conflict
   with this authorization for Phase 4 slices, this authorization governs,
   mirroring the brief-governs-over-Linear rule. Green CI is still mandatory,
   and the GitHub-required-check limitation (403 on branch protection) is
   unchanged.
3. **AI review is the only approval needed for Phase 4 visual baseline
   commits.** The manifest + guard-test workflow
   (`scripts/update-baseline-manifest.mjs`, `BASELINE-MANIFEST.json`,
   same-viewport V18 comparison discipline) still applies unchanged.

## Non-goals

- No application-behavior, schema, migration, or dependency changes (the
  pnpm-lock's `supabase` version is the pin already in place).
- No changes to the `verify` job's steps, name, or timeout; no changes to
  Railway preview configuration; no branch-protection or required-status-check
  configuration (403 today; revisit when available).
- No production or staging Supabase/Railway changes; the job uses only the
  local stack inside CI.
- No macOS/Windows runner matrix, self-hosted runners, or container-job
  wrappers.
- No new caching infrastructure beyond the existing pnpm store cache.
- No new pgTAP suites or e2e specs in this slice (005a adds the first
  wishlist pgTAP suite; this gate only guarantees they will run).

## Acceptance criteria

1. **Distinct job, unchanged verify.** `.github/workflows/ci.yml` defines a
   `database` job alongside `verify`; the diff shows `verify`'s steps
   untouched (evidence: PR diff review; test type: review + CI run).
2. **Trigger parity.** `verify` is green on the planning PR (which contains
   only this brief); both `verify` and `database` are green on the 005h
   implementation PR and on every subsequent pull request and push to `main`
   (evidence: `gh pr checks`; test type: CI run).
3. **Stack from committed sources.** CI logs show the stack started with the
   repo's CLI devDependency and `supabase db reset --local` applying committed
   migrations and seed only (evidence: CI logs; test type: CI run).
4. **pgTAP gate.** `pnpm test:db` passes in the `database` job, and its
   failures would fail the job (evidence: CI logs; negative case: a forced
   failing assertion demonstrated once during implementation, or the pgTAP
   runner's documented non-zero exit on failure cited in the PR; test type:
   CI run + evidence note).
5. **Gated-e2e gate.** With `E2E_LOCAL_SUPABASE=1`, every spec in the CI
   script's explicit list (currently `tests/e2e/auth-otp.spec.ts`, the only
   gated spec) runs and passes in the job (evidence: CI logs; test type: CI
   run). The same spec self-skips without the variable; no CI job executes
   the gate-free path, so the evidence is the spec's skip guard in
   `tests/e2e/auth-otp.spec.ts` plus a gate-free `pnpm exec playwright test
   tests/e2e/auth-otp.spec.ts` run, pasted into the implementation PR showing
   every test skipped (Playwright reports each project's tests as skipped and
   exits 0; no Docker or Supabase stack is required, but a production build
   must exist because Playwright still starts the configured `next start`
   webServer — run `pnpm build` first or produce the evidence on a machine
   with an existing `.next`) — this may be produced on any machine with such
   a build (test type: review + evidence note).
6. **Credential hygiene.** CI logs, step summaries, and artifacts contain no
   publishable key, secret, or cookie material (evidence: log review noted in
   the PR; test type: manual log inspection).
7. **Bounds met.** `database` job runtime observed ≤ 25 minutes with the 30
   -minute timeout, per-step timeouts present, stack start within its 10-minute
   bound (evidence: CI timing in the PR; test type: CI run measurement).
8. **Least privilege.** No new actions beyond the existing three unless
   SHA-pinned with justification in the PR; no new secrets; job runs under the
   workflow's `contents: read` (evidence: PR diff; test type: review).
9. **No dependency or lockfile drift.** `pnpm-lock.yaml` and `package.json`
   diffs are empty for this slice (evidence: PR diff; test type: review).
10. **Documentation parity.** The `ci.yml` header comment describes the
    two-job contract and cites the 2026-09-30 owner merge-gate authorization
    recorded in this brief (evidence: PR diff; test type: review).
11. **Brief linkage.** This brief is linked at its exact merged `main` commit
    on Linear ARJ-33 (evidence: Linear comment; test type: process check).

## Required proof

- Green `gh pr checks` on the planning PR (`verify` green; the `database` job
  does not exist yet at that point) and on the 005h implementation PR showing
  both `verify` and `database` jobs green on the exact merge head.
- CI log excerpts for the `database` job: install, stack start, db reset,
  pgTAP results, e2e results, and timing — with any key material absent.
- The gate-free skip output for the gated spec (every test skipped, exit 0)
  pasted in the implementation PR per acceptance criterion 5.
- The observed runtime breakdown (steps and total) recorded in the
  implementation PR against the bounds above.
- "No Magic Patterns mock data shipped" and "no new dependencies" 
  confirmations in the implementation PR.
- No migration/rollback notes are required (no schema changes); the workflow
  change is reverted by reverting the single PR.

## Dependencies

- Linear ARJ-33 (this slice), child of tracker
  [ARJ-25](https://linear.app/arjun-wadhwa/issue/ARJ-25/005-persistent-wishlist-tracker);
  Phase 3 exit satisfied (ARJ-19 Done).
- Downstream: 005a–005g pgTAP and stack-dependent e2e proof runs in the
  `database` job this slice creates; the Phase 4 merge gate (criterion 2 of
  the authorizations) is recorded here and referenced by every later brief.
- The repository brief governs if the Linear draft differs.

## Analytics, security, and privacy

None. No PostHog events are added or changed. The job runs against an
ephemeral local stack with fixture credentials only; synthetic data only; no
credentials, tokens, or personal data in commits, logs, or artifacts.

## Planning status

Brief only. The slice stays in Backlog until this brief is approved at its
exact commit and linked on ARJ-33; implementation of the `database` job is
authorized only after that approval, on a branch cut from the brief's merged
commit.
