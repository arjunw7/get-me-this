# ARJ-27 implementation report

Implementation status: **DONE_WITH_CONCERNS** - scoped code, tests, CI hygiene, and truthful evidence text are committed and locally verified. Configured database/browser CI, strict Linux visual candidates, and independent final review are controller-owned outstanding gates.

Status on 2026-09-30: implementation code is in the relocated `codex/phase4-recovery` checkout; final independent code/image review and configured CI remain outstanding. Base revision was `fdd69e91b0ff48fb0f3b53f343379d8dd389cba1`; the controller's audit-only commit is `0c519fc`. This report is the implementation handoff, not a reviewer approval.

Implementation commits: `e5b1f77d9ca32db8abe46d020491919c746414be` (23 explicit paths) and `626aba6013576b04595f1e78fba5d4eb5d60967e` (one-line desktop clearance adjustment). They exclude the two inherited PNG candidates, `BASELINE-MANIFEST.json`, and the controller-owned review audit directory. Final committed head `626aba6` remained unchanged during the provider-disabled proof.

Provenance after proof: the controller subsequently committed audit documents only at `2baa795e1f77c1adc9867f930cfa6a60cd80b008`. The provider-disabled build/browser run occurred on code head `626aba6013576b04595f1e78fba5d4eb5d60967e`, before that audit commit; product code was unchanged by `2baa795`, and no rerun is claimed on the later HEAD. The final configured CI gate must run on the final exact head.

## Corrected implementation

- `src/wishlist/wishlist-card.tsx`, `wishlist-view.tsx`, and new `wishlist-typography.module.css`: exact amended empty paragraph; V18 30px empty heading, 30px mobile/36px desktop profile name; avatar-only overlap and desktop taste text below the divider; source link retained without retailer, with safe fallback label. Existing no-price/image fallback behavior retained.
- `src/wishlist/display.ts` and `data.ts`: complete non-default precision table from SIX List One published 2026-09-17, retrieved 2026-09-30; exact decimal-string original amounts through the PostgreSQL `bigint` maximum; explicit `original_amount_minor::text` PostgREST select; owner-only 500-row pages in total order; any page or shape failure returns the generic error path.
- `tests/helpers/local-stack.ts`, wishlist E2E and visual specs: loopback HTTP guard before service-role client creation; user/context registration immediately after creation; scoped cleanup attempts all steps, preserves setup failures, and runs after login, seed, and later-user creation failures. Stack fixture target remains local only.
- `tests/e2e/wishlist-local.spec.ts`: exact empty copy, geometry, source-without-retailer, 1001-row document, full-bigint wire/render, keyboard, axe, and private DOM/document/RSC assertions. The 28 targeted Playwright cases parse for mobile/desktop but are not yet executed against a local stack.
- `.github/workflows/ci.yml` and new `scripts/collect-wishlist-visual-evidence.mjs`: replaced general `test-results/` upload with image-only allowlist and removed both 3% visual tolerances. Controller still needs reviewed Linux PNGs before strict CI can pass.
- `src/analytics/sdk-import-boundary.test.ts`: one ESLint instance and a focused 15-second cold first test timeout. All six allow/deny assertions remain.
- `docs/delivery/evidence/arj-27/README.md` and `ci-database-job-run.md`: removed historical green/approval claims and recorded pending exact-head evidence. The inherited placeholder-tone, returning-user sign-in, and exact desire-chip corrections were retained.

## Decisions and rationale

- 2026-09-30, Ruling: follow the amended 005b brief's empty sentence exactly, omitting the V18 audience sentence; the brief governs this private owner view. Cost if wrong: a copy change and recapture.
- 2026-09-30, Ruling: use SIX's current List One 26 non-default codes and two decimal places for unknown codes, as the approved plan requires. Source: https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml (publication 2026-09-17, retrieved 2026-09-30). Cost if wrong: precision corrections and new visual review.
- 2026-09-30, Ruling: the independently approved money addendum (`arj27-money-addendum.md`, SHA-256 `68e3cd23f9a5f8877e45c34f320ff05dc84c30bceb85127fb29610eb1aa3f2c3`) supersedes the plan's number/`toFixed` interface. A red test observed `.91` instead of `.90` at a safe integer, and PostgreSQL `bigint` admits larger valid values. A read-time PostgREST `::text` cast plus canonical string validation/formatting is lossless without a migration or changed RLS. Cost if wrong: original prices could be misrepresented; CI's actual wire test and independent code review must check this.
- 2026-09-30, Ruling: leave the two inherited PNGs and baseline manifest unstaged. The independent actual-image review rejected their hashes; the controller will collect same-platform Linux candidates and obtain hash-specific approval. Cost if wrong: CI visual acceptance remains pending.
- 2026-09-30, Ruling: no local container installation or staging fixture fallback. The local stack is unavailable here, so browser and database proof belongs to the controller's configured CI job. Cost if wrong: implementation issues may surface in CI and require another fix/review cycle.

## Focused red/green evidence

- Empty paragraph, CLP/UGX/JOD/TND precision, source-without-retailer and malformed-label regressions: initial 3-file Vitest run failed 4/28 for the expected old behaviors; after implementation passed 28/28.
- Owner pagination tests for 0, 500, 1000, 1001 rows and second-page error: initial `data.test.ts` failed 5/5 against the unpaged query; after implementation passed 5/5. The later text-cast/fail-closed tests failed 6/7 against the old select/mapper and passed 7/7 after the cast and generic error behavior.
- Exact money boundary: old `toFixed` produced `90071992547409.91 INR` for `9007199254740990` (expected `.90`) and did not reject an unsafe parsed number. Subsequent addendum tests for exact full-bigint strings failed 2/15 against the number interface, then `display.test.ts` and `data.test.ts` passed 21/21 after string transport.
- Fixture host/lifecycle suite initially failed 10/10 because guard/scope were absent; passed 10/10 after implementation. The primary-error preservation and synchronous cleanup-throw tests each failed before their focused fixes; the suite later passed 12/12. The image-only collector probe initially failed because the script was absent, then passed 1/1 with an invented OTP in `error-context.md` excluded.
- Mounted loading/error tests passed 2/2. Full Vitest previously passed 423/423 across 51 files twice after money work, before the latest cleanup hardening. A final fresh full gate is recorded below.

## Required CI and review handoff

R1/R2 visual findings need new actual captures and independent review at exact hashes: desktop taste/divider clearance and mobile display hierarchy. R1-R7 code findings are addressed in source/tests: complete precision, source link, >1000 rows, artifact hygiene, strict screenshots, keyboard/private payloads, and fixture cleanup. Independent code/security re-review is still required and may reject the proposed fixes. The full-bigint addendum specifically requires actual owner-client PostgREST JSON and rendered UI results in CI.

Open reviewer concern: `navigateWithPayloads` checks each matching document/RSC response it captures, but the test currently requires only at least one matching response. A navigation that emits HTML only could pass without a separate RSC payload. Treat this as pending formal review rather than claiming complete RSC proof; a reviewer may require a forced RSC request or an assertion that a RSC response was observed.

The controller still must run the configured `database` job, record actual executed stack/axe/visual counts, review Linux candidate images against the four pinned V18 references, commit only approved PNG hashes and manifest, obtain final code/security and image approval, update the evidence ledger and PR description on the exact final head, and check green `verify` and `database` jobs. Failing old visual comparisons during candidate collection are expected and are not acceptance. No staging, production, push, merge, or baseline approval was performed by this implementer.

Provider-disabled proof on final committed `626aba6` passed: `.env.local`, `.env.production.local`, `.env.production`, and `.env` were absent; a fresh `pnpm build` with the four provider/stack variables explicitly unset exited 0; plain wishlist Playwright passed 6/6 at mobile and desktop. It verified signed-out GET redirects and zero wishlist markup for both protected routes, plus POST denial with and without the synthetic Server Action header. Exact commands and sanitized output are in `arj27-provider-disabled-proof.md` beside this report. This does not establish configured proxy or database-job success.

After the one-line geometry adjustment, full `pnpm verify` exited 0 again (51 files, 425 tests, production build) before commit `626aba6`; the adjusted code was the only staged path in that commit. The desktop taste-line top is expected to clear the profile band's bottom by about 7.4 CSS pixels from the declared line-height and spacing, and the stack browser geometry assertion remains the authoritative check.

## Self-review

The owner read still uses the caller's server client and RLS, fixed 13-column snapshot, no converted tuple, stable `(sort_position, id)` order, and no-store protected response. The text cast changes the amount's JSON type only; runtime validation rejects a numeric token, malformed decimal, null-pair mismatch, or value beyond PostgreSQL `bigint`. Source URLs are linked only from stored rows (the 005a database CHECK admits HTTP(S)). The collector traverses only regular files and copies only exact wishlist actual/diff PNG names from wishlist visual output directories. No new dependency, migration, item management, or cross-user surface was added.

## Final working-tree verification transcript

Command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm verify` (exit 1)

```text

> get-me-this@0.1.0 verify /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build


> get-me-this@0.1.0 format:check /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> prettier --check --ignore-unknown .env.example .gitignore .nvmrc .prettierignore .railway README.md app eslint.config.mjs instrumentation-client.ts next.config.mjs package.json postcss.config.mjs proxy.ts scripts src supabase tests vitest.config.ts playwright.config.ts tsconfig.json && git diff --check

Checking formatting...
[warn] tests/helpers/local-stack.test.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
 ELIFECYCLE  Command failed with exit code 1.
 ELIFECYCLE  Command failed with exit code 1.
```

## Verification repeat after formatting correction

Second full-suite run after this gate: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm test` exited 0 at 23:44 UTC; 51 files and 425 tests passed (7.37 s). The gate transcript below is the first of the two final 425-test runs.

Command: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm verify` (exit 0)

```text

> get-me-this@0.1.0 verify /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build


> get-me-this@0.1.0 format:check /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> prettier --check --ignore-unknown .env.example .gitignore .nvmrc .prettierignore .railway README.md app eslint.config.mjs instrumentation-client.ts next.config.mjs package.json postcss.config.mjs proxy.ts scripts src supabase tests vitest.config.ts playwright.config.ts tsconfig.json && git diff --check

Checking formatting...
All matched files use Prettier code style!

> get-me-this@0.1.0 lint /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> eslint .


/Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery/src/analytics/event-definitions.test.ts
  11:15  warning  'AnalyticsEventName' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (0 errors, 1 warning)


> get-me-this@0.1.0 typecheck /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully

> get-me-this@0.1.0 test /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> vitest run


 RUN  v5.0.2 /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery


 Test Files  51 passed (51)
      Tests  425 passed (425)
   Start at  23:43:37
   Duration  6.71s (environment 32%, tests 32%, setup 21%, transform 10%, import 5%, worker 1%)

    Isolate  51 workers spawned · ~530ms startup each (spawn + environment, per file)
             at least ~1.93s faster with isolate: false - reuses workers across files instead of one per file


> get-me-this@0.1.0 build /Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery
> next build

▲ Next.js 16.3.6 (Turbopack)
✓ Running next.config.mjs took 22ms

  Creating an optimized production build ...
✓ Compiled successfully in 1161ms
  Running TypeScript ...
  Finished TypeScript in 1850ms ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/12) ...
  Generating static pages using 11 workers (3/12) 
  Generating static pages using 11 workers (6/12) 
  Generating static pages using 11 workers (9/12) 
✓ Generating static pages using 11 workers (12/12) in 175ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /auth
├ ○ /auth/confirm
├ ○ /auth/link
├ ƒ /auth/verify
├ ○ /design-foundation
├ ƒ /health
├ ○ /home
├ ƒ /onboarding
├ ○ /wishlist
└ ○ /wishlist/items/new


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
