# ARJ-27 I1 fix and cloud evidence collection decision

Fix commit: `22d8199224b5aa52aef494509362dd56f56703e0`. Author: `/root/arj27_recovery_implementation`. Fresh independent re-review assigned to `/root/arj27_i1_rereview`, gpt-6-astra ultra; verdict pending at this checkpoint.

Controller ruling: push the reviewed recovery changes plus this narrow test fix to the existing draft PR branch to execute the configured cloud gates and acquire image candidates. This is evidence collection, not final acceptance or permission to merge a red check. Prior review found no unresolved production authorization defect; its remaining I1 proof must now run and be re-reviewed. The artifact collector was independently reviewed as image-only. Old visual comparisons may fail because approved replacement images are not committed yet; any other failure must be investigated. Cost if wrong: another review/test iteration, not a waived gate.

Before push, verify the remote remains at `8b40f4bc52947143b845fbf600b8ab969c62430f` and use a normal fast-forward push. No forced update. No unapproved PNG or manifest changes are included. Draft status remains until code review, real configured execution, direct image review and exact-final-head checks all pass.

## Fix report and timestamp correction

## Round 1 independent review follow-up (I1)

Narrow test-only commit: `22d8199224b5aa52aef494509362dd56f56703e0`, based on controller audit head `d2f21a803322d8182586044d3d341c6fe2c7baa3`. Its explicit commit path is only `tests/e2e/wishlist-local.spec.ts`; the inherited PNGs/manifest and controller-owned review documents remain outside the index and commit.

Correction logged 2026-09-30: The earlier statement “second full-suite run ... at 23:44 UTC” used the wrong zone label. The test runner's `23:44` was host-local Asia/Kolkata time (UTC+05:30), approximately **18:14 UTC**. The original wording remains above for auditability; the 425/425 result and command are unchanged.

The independent review at `2baa795` requested one change: the prior `page.goto`/combined-response helper could pass with only HTML. In `tests/e2e/wishlist-local.spec.ts`, each cross-user and unknown-child case now navigates to collect the actual HTML document, then makes a fresh `RSC: 1` request through that page's own browser context (the same authenticated cookies). The helper asserts the target path, HTML versus `text/x-component` content types, and a nonempty body for each independently. Both tests inspect DOM, document, and Flight bodies separately against the same full title, note, retailer, raw/rendered amount, count, wishlist-ID, and image-URL markers. Privacy assertions reduce each search to a boolean so a failure reports a marker index/surface, not response body or auth material. This is test-only; production source is unchanged.

Test-harness red/green: after the callers required `documentBody` and `flightBody`, direct `tsc --noEmit --incremental false` failed on four missing properties of the old combined-payload helper; after the helper change, it exited 0. `pnpm typecheck` initially stopped before TypeScript with sandbox `EPERM` while Next tried to rewrite `.next/types/routes.d.ts`, so it is not claimed as a red test. Post-fix `prettier --check` on the changed spec, focused ESLint, `git diff --check` on the spec, direct TypeScript, and Playwright `--list` all exited 0; the list contains both affected cases in mobile and desktop (24 total local-stack cases). A full `pnpm test` run also exited 0, 51 files/425 tests. A local app-only server probe could not bind its port under this sandbox (`listen EPERM`); no Flight or authenticated-stack result is claimed from it.

The real user-B and unknown-child Flight paths remain **unexecuted here** because the local Supabase stack is unavailable. The controller must run them in the configured `database` CI job on the exact new head, inspect the executed test count and absence of leaks, and obtain renewed independent code review. This follow-up does not resolve the separate Linux image/hash, strict visual, configured database, or final exact-head CI gates by assertion alone.
