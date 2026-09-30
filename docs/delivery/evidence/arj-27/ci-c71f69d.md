# ARJ-27 configured CI round 1: real tests pass, visual export defect found

Head `c71f69d35bbe01e6c9b2aa300d2fba800867ed28`; [run 36759324856](https://github.com/arjunw7/get-me-this/actions/runs/36759324856), database job `110037536188`, verify job `110037536517`.

- Install and verify: success.
- Fresh CI Supabase start and reset from committed migrations: completed successfully.
- Database suites: 233 assertions in 4 files, PASS.
- Browser suite: 52 passed, 4 failed. All 4 failures are old-baseline screenshot comparisons. The user-B and unknown-child document/Flight tests, 1001-row read, exact PostgREST bigint wire/render proof, geometry, keyboard and axe cases executed successfully at both viewports.
- No whole-job success or visual approval is claimed. A Next destination-stream-closed warning occurred during desktop keyboard navigation; the test itself passed. It is retained as a runtime observation, not hidden as a failure-free log.
- Artifact collector reported 0 allowlisted PNGs; GitHub artifact API returned an empty list. Therefore no new candidate image can yet be independently reviewed.

## New finding and controller decision

Systematic-debugging inspection traced the export failure to a mismatch between actual Playwright output directories (`visual-wishlist-empty.visu-...` / `visual-wishlist-filled.vis-...`) and the collector's assumed `wishlist-<state>.visual...` prefix. Its unit test invented the assumed directory instead of using the real runner shape. This is an evidence-delivery defect missed by source-only review.

Ruling: reproduce the observed paths in a failing collector regression first, then repair only the closed suite/state/viewport directory recognition. Retain exact actual/diff PNG filename restrictions and exclusion of auth captures, contexts, traces, reports, symlinks and unrelated results. Independently re-review the correction and rerun the cloud job to obtain the images. Cost if wrong: another bounded collector fix/run; never broaden to a general test-results upload. Keep the PR draft, no merge or baseline commit.

## Observed output paths

```text
2026-09-30T18:39:00.7735442Z     Received: test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile/wishlist-empty-mobile-actual.png
2026-09-30T18:39:00.7737652Z     Diff:     test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile/wishlist-empty-mobile-diff.png
2026-09-30T18:39:00.7773459Z     Received: test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-mobile/wishlist-filled-mobile-actual.png
2026-09-30T18:39:00.7775267Z     Diff:     test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-mobile/wishlist-filled-mobile-diff.png
2026-09-30T18:39:00.7805672Z     Received: test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-desktop/wishlist-empty-desktop-actual.png
2026-09-30T18:39:00.7809127Z     Diff:     test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-desktop/wishlist-empty-desktop-diff.png
2026-09-30T18:39:00.7864782Z     Received: test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-desktop/wishlist-filled-desktop-actual.png
2026-09-30T18:39:00.7866759Z     Diff:     test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-desktop/wishlist-filled-desktop-diff.png
```

## Allowlisted execution excerpt

This excerpt includes only database result lines and named wishlist case/results. Raw auth logs, environment values, cookies and response payloads are not republished.

```text
2026-09-30T18:35:54.2452974Z /home/runner/work/get-me-this/get-me-this/supabase/tests/profiles-004e.sql .. ok
2026-09-30T18:35:54.3401437Z /home/runner/work/get-me-this/get-me-this/supabase/tests/profiles.sql ....... ok
2026-09-30T18:35:54.3891960Z /home/runner/work/get-me-this/get-me-this/supabase/tests/smoke.sql .......... ok
2026-09-30T18:35:54.6907585Z /home/runner/work/get-me-this/get-me-this/supabase/tests/wishlist.sql ....... ok
2026-09-30T18:35:54.6927628Z All tests successful.
2026-09-30T18:35:54.6937522Z Files=4, Tests=233,  0 wallclock secs ( 0.05 usr  0.01 sys +  0.05 cusr  0.03 csys =  0.14 CPU)
2026-09-30T18:35:54.6947050Z Result: PASS
2026-09-30T18:36:48.6724637Z ✓ Compiled successfully in 12.6s
2026-09-30T18:37:25.4060654Z   ✓  12 [mobile] › tests/e2e/wishlist-local.spec.ts:232:5 › the signed-out proxy envelope for the wishlist routes is 302 with no-store and no-referrer (23ms)
2026-09-30T18:37:25.4347636Z   ✓  13 [mobile] › tests/e2e/wishlist-local.spec.ts:244:5 › a signed-out POST to /wishlist is redirected by the proxy, never executed (15ms)
2026-09-30T18:37:26.9409009Z   ✓  14 [mobile] › tests/e2e/wishlist-local.spec.ts:257:5 › the signed-in rendered /wishlist document is non-cacheable (1.5s)
2026-09-30T18:37:29.8745842Z   ✓  15 [mobile] › tests/e2e/wishlist-local.spec.ts:268:5 › a fresh owner with zero items sees the V18 empty composition and its CTA navigates honestly (2.9s)
2026-09-30T18:37:32.0710239Z   ✓  16 [mobile] › tests/e2e/wishlist-local.spec.ts:328:5 › the populated view renders every snapshot field in the pinned read order, with the branded placeholder and runtime fallback (2.2s)
2026-09-30T18:37:35.2399607Z   ✓  17 [mobile] › tests/e2e/wishlist-local.spec.ts:412:5 › populated items persist across a full reload and a same-browser new tab (3.1s)
2026-09-30T18:37:37.5048480Z   ✓  18 [mobile] › tests/e2e/wishlist-local.spec.ts:444:5 › 1001 tied-boundary items are all present in the owner document (2.2s)
2026-09-30T18:37:39.3908662Z   ✓  19 [mobile] › tests/e2e/wishlist-local.spec.ts:465:5 › PostgREST transports full bigint originals as strings and the owner sees exact prices (1.9s)
2026-09-30T18:37:42.6203241Z   ✓  20 [mobile] › tests/e2e/wishlist-local.spec.ts:558:5 › a second user's wishlist reveals nothing about the first user's rows (3.2s)
2026-09-30T18:37:45.5445118Z   ✓  21 [mobile] › tests/e2e/wishlist-local.spec.ts:621:5 › a stale session cookie recovers to the auth flow with no leak, and re-signing in restores the wishlist (2.9s)
2026-09-30T18:37:52.4043971Z   ✓  22 [mobile] › tests/e2e/wishlist-local.spec.ts:668:5 › every interactive element is keyboard-operable with visible focus, and both states axe clean (6.8s)
2026-09-30T18:37:53.8854262Z   ✓  23 [mobile] › tests/e2e/wishlist-local.spec.ts:796:5 › an unknown /wishlist child path renders not-found with no wishlist data (1.5s)
2026-09-30T18:37:54.2062206Z   ✓  24 [mobile] › tests/e2e/wishlist.spec.ts:25:5 › a signed-out GET of /wishlist is redirected with zero wishlist markup (295ms)
2026-09-30T18:37:54.5070895Z   ✓  25 [mobile] › tests/e2e/wishlist.spec.ts:42:5 › a signed-out GET of /wishlist/items/new is redirected with zero wishlist markup (287ms)
2026-09-30T18:37:54.8105323Z   ✓  26 [mobile] › tests/e2e/wishlist.spec.ts:57:5 › a signed-out POST to /wishlist does not execute wishlist behavior (285ms)
2026-09-30T18:37:57.3000462Z   ✘  27 [mobile] › tests/visual/wishlist-empty.visual.spec.ts:33:5 › the signed-in empty wishlist matches the pinned V18 empty composition (2.4s)
2026-09-30T18:38:01.0190922Z   ✘  28 [mobile] › tests/visual/wishlist-filled.visual.spec.ts:43:5 › the signed-in populated wishlist matches the pinned V18 filled composition (3.0s)
2026-09-30T18:38:24.5951007Z   ✓  40 [desktop] › tests/e2e/wishlist-local.spec.ts:232:5 › the signed-out proxy envelope for the wishlist routes is 302 with no-store and no-referrer (20ms)
2026-09-30T18:38:24.6104897Z   ✓  41 [desktop] › tests/e2e/wishlist-local.spec.ts:244:5 › a signed-out POST to /wishlist is redirected by the proxy, never executed (8ms)
2026-09-30T18:38:26.0720479Z   ✓  42 [desktop] › tests/e2e/wishlist-local.spec.ts:257:5 › the signed-in rendered /wishlist document is non-cacheable (1.4s)
2026-09-30T18:38:28.8630454Z   ✓  43 [desktop] › tests/e2e/wishlist-local.spec.ts:268:5 › a fresh owner with zero items sees the V18 empty composition and its CTA navigates honestly (2.8s)
2026-09-30T18:38:30.8039323Z   ✓  44 [desktop] › tests/e2e/wishlist-local.spec.ts:328:5 › the populated view renders every snapshot field in the pinned read order, with the branded placeholder and runtime fallback (1.9s)
2026-09-30T18:38:33.7308513Z   ✓  45 [desktop] › tests/e2e/wishlist-local.spec.ts:412:5 › populated items persist across a full reload and a same-browser new tab (2.9s)
2026-09-30T18:38:35.7922939Z   ✓  46 [desktop] › tests/e2e/wishlist-local.spec.ts:444:5 › 1001 tied-boundary items are all present in the owner document (2.0s)
2026-09-30T18:38:37.9337424Z   ✓  47 [desktop] › tests/e2e/wishlist-local.spec.ts:465:5 › PostgREST transports full bigint originals as strings and the owner sees exact prices (2.1s)
2026-09-30T18:38:40.9536657Z   ✓  48 [desktop] › tests/e2e/wishlist-local.spec.ts:558:5 › a second user's wishlist reveals nothing about the first user's rows (3.0s)
2026-09-30T18:38:43.7478489Z   ✓  49 [desktop] › tests/e2e/wishlist-local.spec.ts:621:5 › a stale session cookie recovers to the auth flow with no leak, and re-signing in restores the wishlist (2.8s)
2026-09-30T18:38:50.5402026Z   ✓  50 [desktop] › tests/e2e/wishlist-local.spec.ts:668:5 › every interactive element is keyboard-operable with visible focus, and both states axe clean (6.8s)
2026-09-30T18:38:52.0264149Z   ✓  51 [desktop] › tests/e2e/wishlist-local.spec.ts:796:5 › an unknown /wishlist child path renders not-found with no wishlist data (1.5s)
2026-09-30T18:38:52.3560487Z   ✓  52 [desktop] › tests/e2e/wishlist.spec.ts:25:5 › a signed-out GET of /wishlist is redirected with zero wishlist markup (295ms)
2026-09-30T18:38:52.6511734Z   ✓  53 [desktop] › tests/e2e/wishlist.spec.ts:42:5 › a signed-out GET of /wishlist/items/new is redirected with zero wishlist markup (278ms)
2026-09-30T18:38:53.0871059Z   ✓  54 [desktop] › tests/e2e/wishlist.spec.ts:57:5 › a signed-out POST to /wishlist does not execute wishlist behavior (421ms)
2026-09-30T18:38:55.9249007Z   ✘  55 [desktop] › tests/visual/wishlist-empty.visual.spec.ts:33:5 › the signed-in empty wishlist matches the pinned V18 empty composition (2.8s)
2026-09-30T18:39:00.6792680Z   ✘  56 [desktop] › tests/visual/wishlist-filled.visual.spec.ts:43:5 › the signed-in populated wishlist matches the pinned V18 filled composition (3.9s)
2026-09-30T18:39:00.7672166Z       Expected an image 390px by 939px, received 390px by 957px. 21878 pixels (ratio 0.06 of all image pixels) are different.
2026-09-30T18:39:00.7680542Z       Snapshot: wishlist-empty-mobile.png
2026-09-30T18:39:00.7688034Z       - Expected an image 390px by 939px, received 390px by 957px. 21878 pixels (ratio 0.06 of all image pixels) are different.
2026-09-30T18:39:00.7692269Z       - Expected an image 390px by 939px, received 390px by 957px. 21878 pixels (ratio 0.06 of all image pixels) are different.
2026-09-30T18:39:00.7724426Z     attachment #1: wishlist-empty-mobile (image/png) ───────────────────────────────────────────────
2026-09-30T18:39:00.7749341Z       Expected an image 390px by 2470px, received 390px by 2475px. 65236 pixels (ratio 0.07 of all image pixels) are different.
2026-09-30T18:39:00.7750454Z       Snapshot: wishlist-filled-mobile.png
2026-09-30T18:39:00.7755956Z       - Expected an image 390px by 2470px, received 390px by 2475px. 65233 pixels (ratio 0.07 of all image pixels) are different.
2026-09-30T18:39:00.7760908Z       - Expected an image 390px by 2470px, received 390px by 2475px. 65236 pixels (ratio 0.07 of all image pixels) are different.
2026-09-30T18:39:00.7771070Z     attachment #1: wishlist-filled-mobile (image/png) ──────────────────────────────────────────────
2026-09-30T18:39:00.7783261Z       37248 pixels (ratio 0.03 of all image pixels) are different.
2026-09-30T18:39:00.7784002Z       Snapshot: wishlist-empty-desktop.png
2026-09-30T18:39:00.7789281Z       - 37248 pixels (ratio 0.03 of all image pixels) are different.
2026-09-30T18:39:00.7793322Z       - 37248 pixels (ratio 0.03 of all image pixels) are different.
2026-09-30T18:39:00.7803249Z     attachment #1: wishlist-empty-desktop (image/png) ──────────────────────────────────────────────
2026-09-30T18:39:00.7817232Z       Expected an image 1440px by 1355px, received 1440px by 1374px. 118436 pixels (ratio 0.06 of all image pixels) are different.
2026-09-30T18:39:00.7818325Z       Snapshot: wishlist-filled-desktop.png
2026-09-30T18:39:00.7823879Z       - Expected an image 1440px by 1355px, received 1440px by 1374px. 118436 pixels (ratio 0.06 of all image pixels) are different.
2026-09-30T18:39:00.7829120Z       - Expected an image 1440px by 1355px, received 1440px by 1374px. 118436 pixels (ratio 0.06 of all image pixels) are different.
2026-09-30T18:39:00.7862450Z     attachment #1: wishlist-filled-desktop (image/png) ─────────────────────────────────────────────
2026-09-30T18:39:00.7871055Z   4 failed
2026-09-30T18:39:00.7880774Z   52 passed (2.0m)
2026-09-30T18:39:01.0907626Z wishlist image evidence: 0 allowlisted PNGs
2026-09-30T18:39:01.4313125Z No files were found with the provided path: wishlist-visual-evidence/. No artifacts will be uploaded.
```
