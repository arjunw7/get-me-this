# ARJ-27 configured CI and final candidate images at `9ed952a`

Source head: `9ed952ac1b238ff04044088309f7cdd12b1196c7`

GitHub Actions run: [36772630851](https://github.com/arjunw7/get-me-this/actions/runs/36772630851)

- `Install and verify`: passed in 1 minute 30 seconds. The existing unused-type lint warning was retained.
- Fresh local Supabase start and reset: passed.
- pgTAP: 4 files, 233 assertions, all successful.
- Stack-gated Playwright: 56 passed, 2 viewport-specific cases skipped by design, and 4 visual comparisons failed only because the committed baselines were the earlier image set.
- Evidence collection and upload: passed. Artifact `11123954240` contained exactly the four actual PNGs and four diff PNGs.
- Railway preview deployment `f466a089-c571-4b4d-95df-32df484beab4`: `SUCCESS` for this exact source commit.

The four actual PNGs were reviewed directly against the pinned V18 references and documented accepted differences. The independent AI reviewer approved the exact complete set in [`reviews/arj27-final-visual-review.md`](reviews/arj27-final-visual-review.md). Their hashes are:

- Empty desktop: `cb61600cc5a64862e4a516184d5d2b86a3b742da8d8b3d792c34f1c5f0d8c843`
- Empty mobile: `b201fe0a0ca73fc9236b5031dc5c4a163a57abed132e4f884ae3ee82cb2c937b`
- Filled desktop: `53ecd4e5bf8637bef5177742eb9fb0c6ce279bc0f1a250fee5776835fb08cbe1`
- Filled mobile: `44faef7da2f98404337ac5f4f36141af96cd4d475d3234823432a3ca2275379f`

This run proves the product, database, browser, artifact, image-review, and preview gates for the source tree. It is not the final green run because the approved PNGs and refreshed manifest were not yet committed. The baseline-adoption commit must rerun CI with zero visual failures before merge.
