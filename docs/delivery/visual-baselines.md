# Visual baseline workflow

This document defines how visual-regression baselines for the Get Me This
repository are created, reviewed, and updated. It applies to every
contributor, human or agent.

## Where things live

- Screenshots are captured by Playwright from the spec files in
  [`tests/visual/`](../../tests/visual/).
- Committed baselines live under
  [`tests/visual/baselines/`](../../tests/visual/baselines/), organized by
  project (`mobile` = 390×844, `desktop` = 1440×1000).
- `tests/visual/baselines/BASELINE-MANIFEST.json` records the SHA-256 of every
  committed baseline plus the human approval that accepted it.
- `src/visual-baseline-manifest.test.ts` fails when a baseline changes without
  the manifest, or when the manifest lacks approval metadata.

## Running the visual tests

```bash
pnpm exec playwright install chromium   # once per machine
pnpm test:visual                        # builds, starts the prod server on :3100, compares
```

The comparison is a full-page capture of the deterministic design foundation
fixture with animations disabled and the caret hidden, at both approved
viewports.

## Creating baselines (first run, or a new screen)

1. Generate candidate screenshots:
   ```bash
   pnpm exec playwright test tests/visual --update-snapshots
   ```
2. **Pause.** Present the candidate images (mobile and desktop) to the human
   product/design reviewer. Candidates are never committed before approval.
3. After approval, the **human reviewer** (not an agent) fills in
   `approvedBy` and `approvedDate` in `BASELINE-MANIFEST.json`, then:
   ```bash
   node scripts/update-baseline-manifest.mjs
   ```
   to regenerate the hashes. The script never writes approval fields.
4. Commit the baselines, the manifest, and the manifest guard test together in
   one reviewable commit.

## Updating baselines after an approved change

1. Make the change through its own reviewed issue.
2. Generate new candidates with `--update-snapshots`.
3. Present the old and new images to the human reviewer at the same viewport,
   route, and fixture state.
4. On approval, the human fills in the approval fields, the hashes are
   regenerated with the script, and the diff (image and manifest) is committed
   and reviewed.

## What agents may not do

- Never update a baseline merely to make a test, CI, or `pnpm verify` pass.
- Never fill in `approvedBy` or `approvedDate` on behalf of a reviewer.
- Never commit candidate baselines before explicit human approval.
- Never style production code to make screenshots pass; screenshot-only
  stabilization must use Playwright's test-only `style` option and be
  documented in the spec.

## Honest limits of the mechanism

The hash manifest makes every baseline change loud: an updated PNG cannot be
committed without a matching manifest edit, and the manifest cannot be
committed without approval metadata. That improves review visibility, but it
is not an authorization mechanism. Real approval is the human review of the
image diff in the pull request, exactly as required by `AGENTS.md` and
`DESIGN.md`. Pixel similarity alone never proves correct behavior or
accessibility; review both the diff and the rendered interaction.
