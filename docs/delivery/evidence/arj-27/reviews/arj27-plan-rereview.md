# ARJ-27 scoped plan re-review

Date: 2026-09-30. Reviewer: independent agent `/root/arj27_plan_rereview`.

**PREVIOUS FINDING P1: ADDRESSED**

**IMPLEMENTATION PLAN: APPROVED**

## Reviewed artifact and scope

This review addresses only the provider-disabled browser-proof blocker in `arj27-plan-review.md`. The prior review's remaining assessments carry forward. This is plan approval only, not code, image, acceptance-test, CI, or merge approval.

Reviewed plan: `arj27-recovery-implementation-plan.md`, SHA-256 `93d83c2dc56720b4640dce2f9b4d8cdf9312bb64e94d5f77eae20d722944ce03`. Checkout HEAD at review: `fdd69e91b0ff48fb0f3b53f343379d8dd389cba1`.

The current plan differs from the dispatch fingerprint `d51305ccc09478f05be34cc56f418c44898156c503088b44f276d2012f9e500d`. The current source includes additional environment-file checks and explicit revision/evidence recording. `arj27-plan-current.diff` is a full ignored-plan artifact and contains the earlier wording; it was not treated as a commit delta or as the authoritative current source. This verdict is pinned to the observed current plan hash above.

## Finding assessment

Task 7 now explicitly schedules the missing proof at lines 127-144:

- It requires the final committed revision and a fresh production build, with `git rev-parse HEAD` included in the commands.
- It asserts the absence of `.env.local`, `.env.production.local`, `.env.production`, and `.env`, and prohibits sourcing or copying the original checkout's environment file. These checks are prerequisites to running the proof.
- Both build and Playwright commands explicitly unset `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `E2E_LOCAL_SUPABASE`, preserving the provider-disabled condition for the production web server.
- It names `tests/e2e/wishlist.spec.ts` and both configured projects, `mobile` and `desktop`.
- It requires the exact revision, commands, absent provider names, executed counts, and AC2/AC3 redirect, zero-markup, and POST-denial results, with no environment values printed. A failure requires repair and a repeated fresh build and plain suite.

Targeted source checks support the proposed procedure. `src/supabase/config.ts:18-22` reads only the two named public provider variables and returns no provider configuration when either is absent. `playwright.config.ts:37-42` starts the production application and disables reuse of an existing server. Its two named projects at lines 45-53 match the plan command. The plain wishlist spec contains signed-out GET checks for both protected pages and a POST test covering requests with and without the Server Action header.

The separate configured proof is preserved. Task 7 line 144 explicitly says this run does not replace provider-enabled proxy-envelope tests or the `database` job. Line 145 still requires green `verify` and `database` jobs, actual execution counts, and the explicit local-stack script paths on the exact committed PR head. The existing local-stack script exports provider configuration and runs the plain and stack-gated wishlist specs. Acceptance ledger rows 2 and 3 at lines 156-157 now distinguish the provider-disabled page/POST proof from the configured CI header/envelope proof.

The sole prior blocking plan finding is closed. No remaining blocker was found within this scoped re-review.

## Review boundaries

Read the prior plan review and current implementation plan, inspected the relevant full-artifact diff section, and checked only the provider configuration, plain wishlist spec, Playwright server/projects, and existing CI/local-stack wiring needed to assess this finding. No tests or implementation were performed. No files were relocated. The only write is this report. No code, branch, commit, external action, or subagent was created.

