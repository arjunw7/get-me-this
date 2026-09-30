# ARJ-27 configured CI and image acquisition at b50a5b3

Run: [36762403450](https://github.com/arjunw7/get-me-this/actions/runs/36762403450), PR source head `b50a5b35f7aeee5500fca5608c617c8eb42b93eb`. This run is not green: verification passed, database 233 assertions passed, browser 52 passed, and four strict screenshot comparisons failed against previous baselines. No skipped test is counted as executed proof.

Actual Actions checkout: synthetic PR merge commit `c66a684b0dd746f1d96145548fc01786f9e6c10b`, parents `f925e95fc41c9f9a0af0d30c523bc8b5c655d240` and the source head above. GitHub commit metadata and local Git independently show both the merge checkout and source head have the identical tree `f334d3dcfa717a21921e558417507d2be5dc0d01`. The source head is therefore not being misrepresented as the checkout SHA, and no different source tree was tested.

The corrected collector exported exactly eight PNGs. Artifact `11118599708`, `wishlist-visual-evidence`, 1,087,302 bytes, belongs to that run and source head. Downloaded contents were exactly four actual and four diff PNGs, with no HTML, contexts, traces, or auth screenshots. PNG signatures and dimensions were independently checked. Actual images are candidates, not approved baselines. Diffs compare against prior production goldens; design review compares the actual images against pinned V18 references separately.

Two destination-stream-closed warnings occurred during keyboard navigation, one at each viewport. Both tests and their accessibility assertions passed. Installed Next/React source associates this message with destination close cancellation; the exact initiating navigation is not proven by this log, so no warning-free or fully diagnosed claim is made.

## Candidate hashes

| Candidate | SHA-256 |
| --- | --- |
| Empty desktop | `b9ee33574fea4c272478d08fdb4adbf93948b82b8045bb8f732cc0fa4313bf70` |
| Empty mobile | `be8d3592c4f572f82119fe270531919c95bd1308f30abc303fc323d954d1d01b` |
| Filled desktop | `d27d79f90da3c09a7d4520bbcce12692c13db7b781f01a217777d2ab5d92b730` |
| Filled mobile | `b2227bf31903c4362ac4e65298d3cc6ee67cd84d75c35d38245f910b50146988` |

## Sanitized executed-case excerpt

The following allowlisted excerpt retains test names, pass/fail counts, screenshot paths, and collector/upload outcome. Raw auth logs are not retained in the repository.

```text
Database and stack e2e	Run pgTAP database suites	2026-09-30T19:02:06.4930329Z Files=4, Tests=233,  0 wallclock secs ( 0.04 usr  0.01 sys +  0.04 cusr  0.03 csys =  0.12 CPU)
Database and stack e2e	Run pgTAP database suites	2026-09-30T19:02:06.4931169Z Result: PASS
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:02:37.2274791Z ✓ Running next.config.mjs took 15ms
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:02:53.9559112Z ✓ Compiled successfully in 15.8s
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:02.5174979Z ✓ Generating static pages using 1 worker (12/12) in 251ms
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:11.5336296Z   ✓   1 [mobile] › tests/e2e/auth-otp.spec.ts:140:5 › a fresh user signs in, completes onboarding, lands on /home, and confirmed logout clears the session (4.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:14.8864602Z   ✓   2 [mobile] › tests/e2e/auth-otp.spec.ts:223:5 › a returning user with a complete profile goes straight to their destination and never repeats onboarding (3.3s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:16.5281804Z   ✓   3 [mobile] › tests/e2e/auth-otp.spec.ts:257:5 › a link GET is non-consuming: the choice state renders and the code still verifies (1.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:18.4299723Z   ✓   4 [mobile] › tests/e2e/auth-otp.spec.ts:299:5 › a link click completes sign-in only through the explicit action, with an equivalent session (1.9s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:19.5253959Z   ✓   5 [mobile] › tests/e2e/auth-otp.spec.ts:341:5 › the six-digit code no longer verifies after a successful link verification (1.1s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:21.5041432Z   ✓   6 [mobile] › tests/e2e/auth-otp.spec.ts:375:5 › a replayed link (double-click or back button) finds no second session (1.9s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:22.3953127Z   ✓   7 [mobile] › tests/e2e/auth-otp.spec.ts:408:5 › a malformed link lands on the honest recovery with no session created (838ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:23.4957424Z   ✓   8 [mobile] › tests/e2e/auth-otp.spec.ts:439:5 › a wrong code recovers safely with no session (1.1s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:26.7049022Z   ✓   9 [mobile] › tests/e2e/auth-otp.spec.ts:459:5 › a superseded code fails safely and the current code still verifies (3.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:29.3190347Z   ✓  10 [mobile] › tests/e2e/auth-otp.spec.ts:495:5 › a too-early resend renders the over-limit recovery whatever the clock says (2.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:31.6773334Z   ✓  11 [mobile] › tests/e2e/auth-otp.spec.ts:533:5 › the real verify screens stay accessible (2.3s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:31.7495037Z   ✓  12 [mobile] › tests/e2e/wishlist-local.spec.ts:232:5 › the signed-out proxy envelope for the wishlist routes is 302 with no-store and no-referrer (21ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:31.7690414Z   ✓  13 [mobile] › tests/e2e/wishlist-local.spec.ts:244:5 › a signed-out POST to /wishlist is redirected by the proxy, never executed (9ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:33.3005291Z   ✓  14 [mobile] › tests/e2e/wishlist-local.spec.ts:257:5 › the signed-in rendered /wishlist document is non-cacheable (1.5s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:36.2037843Z   ✓  15 [mobile] › tests/e2e/wishlist-local.spec.ts:268:5 › a fresh owner with zero items sees the V18 empty composition and its CTA navigates honestly (2.9s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:38.3557116Z   ✓  16 [mobile] › tests/e2e/wishlist-local.spec.ts:328:5 › the populated view renders every snapshot field in the pinned read order, with the branded placeholder and runtime fallback (2.1s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:41.5285449Z   ✓  17 [mobile] › tests/e2e/wishlist-local.spec.ts:412:5 › populated items persist across a full reload and a same-browser new tab (3.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:43.8914240Z   ✓  18 [mobile] › tests/e2e/wishlist-local.spec.ts:444:5 › 1001 tied-boundary items are all present in the owner document (2.3s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:45.8933098Z   ✓  19 [mobile] › tests/e2e/wishlist-local.spec.ts:465:5 › PostgREST transports full bigint originals as strings and the owner sees exact prices (2.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:49.1460526Z   ✓  20 [mobile] › tests/e2e/wishlist-local.spec.ts:558:5 › a second user's wishlist reveals nothing about the first user's rows (3.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:52.1535754Z   ✓  21 [mobile] › tests/e2e/wishlist-local.spec.ts:621:5 › a stale session cookie recovers to the auth flow with no leak, and re-signing in restores the wishlist (3.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:55.8208275Z [WebServer] ⨯ Error: The destination stream closed early.
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:03:59.0588864Z   ✓  22 [mobile] › tests/e2e/wishlist-local.spec.ts:668:5 › every interactive element is keyboard-operable with visible focus, and both states axe clean (6.9s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:00.6744219Z   ✓  23 [mobile] › tests/e2e/wishlist-local.spec.ts:796:5 › an unknown /wishlist child path renders not-found with no wishlist data (1.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:01.0231681Z   ✓  24 [mobile] › tests/e2e/wishlist.spec.ts:25:5 › a signed-out GET of /wishlist is redirected with zero wishlist markup (325ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:01.3089187Z   ✓  25 [mobile] › tests/e2e/wishlist.spec.ts:42:5 › a signed-out GET of /wishlist/items/new is redirected with zero wishlist markup (269ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:01.8330242Z   ✓  26 [mobile] › tests/e2e/wishlist.spec.ts:57:5 › a signed-out POST to /wishlist does not execute wishlist behavior (499ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:04.3246750Z   ✘  27 [mobile] › tests/visual/wishlist-empty.visual.spec.ts:33:5 › the signed-in empty wishlist matches the pinned V18 empty composition (2.4s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:08.3165608Z   ✘  28 [mobile] › tests/visual/wishlist-filled.visual.spec.ts:43:5 › the signed-in populated wishlist matches the pinned V18 filled composition (3.3s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:12.6726760Z   ✓  29 [desktop] › tests/e2e/auth-otp.spec.ts:140:5 › a fresh user signs in, completes onboarding, lands on /home, and confirmed logout clears the session (3.7s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:16.0784279Z   ✓  30 [desktop] › tests/e2e/auth-otp.spec.ts:223:5 › a returning user with a complete profile goes straight to their destination and never repeats onboarding (3.4s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:17.6856544Z   ✓  31 [desktop] › tests/e2e/auth-otp.spec.ts:257:5 › a link GET is non-consuming: the choice state renders and the code still verifies (1.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:19.5614999Z   ✓  32 [desktop] › tests/e2e/auth-otp.spec.ts:299:5 › a link click completes sign-in only through the explicit action, with an equivalent session (1.8s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:20.7662257Z   ✓  33 [desktop] › tests/e2e/auth-otp.spec.ts:341:5 › the six-digit code no longer verifies after a successful link verification (1.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:23.2850041Z   ✓  34 [desktop] › tests/e2e/auth-otp.spec.ts:375:5 › a replayed link (double-click or back button) finds no second session (2.5s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:24.2239355Z   ✓  35 [desktop] › tests/e2e/auth-otp.spec.ts:408:5 › a malformed link lands on the honest recovery with no session created (915ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:25.2863611Z   ✓  36 [desktop] › tests/e2e/auth-otp.spec.ts:439:5 › a wrong code recovers safely with no session (1.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:28.5421916Z   ✓  37 [desktop] › tests/e2e/auth-otp.spec.ts:459:5 › a superseded code fails safely and the current code still verifies (3.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:31.1525947Z   ✓  38 [desktop] › tests/e2e/auth-otp.spec.ts:495:5 › a too-early resend renders the over-limit recovery whatever the clock says (2.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:33.6031972Z   ✓  39 [desktop] › tests/e2e/auth-otp.spec.ts:533:5 › the real verify screens stay accessible (2.4s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:33.6781953Z   ✓  40 [desktop] › tests/e2e/wishlist-local.spec.ts:232:5 › the signed-out proxy envelope for the wishlist routes is 302 with no-store and no-referrer (23ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:33.6995320Z   ✓  41 [desktop] › tests/e2e/wishlist-local.spec.ts:244:5 › a signed-out POST to /wishlist is redirected by the proxy, never executed (10ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:35.2920831Z   ✓  42 [desktop] › tests/e2e/wishlist-local.spec.ts:257:5 › the signed-in rendered /wishlist document is non-cacheable (1.6s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:38.3012805Z   ✓  43 [desktop] › tests/e2e/wishlist-local.spec.ts:268:5 › a fresh owner with zero items sees the V18 empty composition and its CTA navigates honestly (3.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:40.2720371Z   ✓  44 [desktop] › tests/e2e/wishlist-local.spec.ts:328:5 › the populated view renders every snapshot field in the pinned read order, with the branded placeholder and runtime fallback (1.9s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:43.4550603Z   ✓  45 [desktop] › tests/e2e/wishlist-local.spec.ts:412:5 › populated items persist across a full reload and a same-browser new tab (3.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:45.6465255Z   ✓  46 [desktop] › tests/e2e/wishlist-local.spec.ts:444:5 › 1001 tied-boundary items are all present in the owner document (2.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:47.7469141Z   ✓  47 [desktop] › tests/e2e/wishlist-local.spec.ts:465:5 › PostgREST transports full bigint originals as strings and the owner sees exact prices (2.1s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:50.9639111Z   ✓  48 [desktop] › tests/e2e/wishlist-local.spec.ts:558:5 › a second user's wishlist reveals nothing about the first user's rows (3.2s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:53.9539668Z   ✓  49 [desktop] › tests/e2e/wishlist-local.spec.ts:621:5 › a stale session cookie recovers to the auth flow with no leak, and re-signing in restores the wishlist (3.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:04:57.4939092Z [WebServer] ⨯ Error: The destination stream closed early.
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:00.7268320Z   ✓  50 [desktop] › tests/e2e/wishlist-local.spec.ts:668:5 › every interactive element is keyboard-operable with visible focus, and both states axe clean (6.8s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:02.2933539Z   ✓  51 [desktop] › tests/e2e/wishlist-local.spec.ts:796:5 › an unknown /wishlist child path renders not-found with no wishlist data (1.5s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:02.5988644Z   ✓  52 [desktop] › tests/e2e/wishlist.spec.ts:25:5 › a signed-out GET of /wishlist is redirected with zero wishlist markup (284ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:02.8831710Z   ✓  53 [desktop] › tests/e2e/wishlist.spec.ts:42:5 › a signed-out GET of /wishlist/items/new is redirected with zero wishlist markup (269ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:03.3187973Z   ✓  54 [desktop] › tests/e2e/wishlist.spec.ts:57:5 › a signed-out POST to /wishlist does not execute wishlist behavior (417ms)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:06.3543166Z   ✘  55 [desktop] › tests/visual/wishlist-empty.visual.spec.ts:33:5 › the signed-in empty wishlist matches the pinned V18 empty composition (3.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.1610220Z   ✘  56 [desktop] › tests/visual/wishlist-filled.visual.spec.ts:43:5 › the signed-in populated wishlist matches the pinned V18 filled composition (4.0s)
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2358474Z     Error: expect(page).toHaveScreenshot(expected) failed
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2395048Z     Received: test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile/wishlist-empty-mobile-actual.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2397694Z     Diff:     test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile/wishlist-empty-mobile-diff.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2405867Z     Error: expect(page).toHaveScreenshot(expected) failed
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2470427Z     Received: test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-mobile/wishlist-filled-mobile-actual.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2472431Z     Diff:     test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-mobile/wishlist-filled-mobile-diff.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2481298Z     Error: expect(page).toHaveScreenshot(expected) failed
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2521175Z     Received: test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-desktop/wishlist-empty-desktop-actual.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2523550Z     Diff:     test-results/visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-desktop/wishlist-empty-desktop-diff.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2531709Z     Error: expect(page).toHaveScreenshot(expected) failed
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2563890Z     Received: test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-desktop/wishlist-filled-desktop-actual.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2570397Z     Diff:     test-results/visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-desktop/wishlist-filled-desktop-diff.png
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2574925Z   4 failed
Database and stack e2e	Build and run the stack-gated e2e suites	2026-09-30T19:05:11.2600450Z   52 passed (2.1m)
Database and stack e2e	Collect wishlist visual evidence	2026-09-30T19:05:11.4581725Z wishlist image evidence: 8 allowlisted PNGs
Database and stack e2e	Upload wishlist visual evidence	2026-09-30T19:05:12.8204721Z Artifact wishlist-visual-evidence has been successfully uploaded! Final size is 1087302 bytes. Artifact ID is 11118599708
```
