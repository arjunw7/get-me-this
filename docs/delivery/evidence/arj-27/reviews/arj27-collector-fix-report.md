# ARJ-27 visual evidence collector fix report

Date: 2026-10-01 IST. Base: `c71f69d35bbe01e6c9b2aa300d2fba800867ed28`. Narrow fix commit: `b50a5b35f7aeee5500fca5608c617c8eb42b93eb`. Status: locally verified collector correction; configured CI rerun and independent code/image review are pending. This report is not a visual baseline approval.

## Root cause and decision

Configured CI run 36759324856 passed `verify`, 233 database assertions, and 52 browser cases, including actual signed-in Flight, bigint, pagination, geometry, keyboard, and axe checks. Four visual comparisons failed against old golden images as expected, but the collector copied zero images and the artifact list was empty. The CI failure paths were `visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-{mobile,desktop}` and `visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-{mobile,desktop}`. The collector expected a `wishlist-<state>.visual...` directory prefix, so all four valid runner directories were rejected.

I inspected installed Playwright 1.63.0 at `node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/worker/workerProcessEntry.js`: its output directory is the sanitized relative spec path plus test title, trimmed to 60 characters with a five-character SHA-1 middle, then suffixed with project ID. The installed core bundle's `trimLongString` and `sanitizeForFilePath` generated all four observed CI names exactly from the two committed visual spec titles. This establishes the directory mismatch rather than guessing from the log shape.

Decision: accept only those four exact pinned runner directories at one level below `test-results`, with state and viewport matched to the existing exact `wishlist-(empty|filled)-(mobile|desktop)-(actual|diff).png` filename allowlist. Keep regular-file-only handling, duplicate-name refusal, and no general `test-results` upload. If runner naming, titles, or projects change, collection fails closed until reviewed.

## Red/green and local checks

- Before the script change, `pnpm exec vitest run src/visual-evidence-collector.test.ts` exited 1: the new fixture created all four actual CI directory names and eight actual/diff PNGs, but the collector printed `0 allowlisted PNGs` instead of eight. The symlink exclusion case passed. This was the intended behavior failure, not a compile/setup error.
- After changing only directory recognition, the same focused command exited 0: 2/2 tests passed. The fixture also contains wrong-suite, prefix-spoof, state/viewport-mismatch, nested duplicate-name, trace, report, and invented-OTP error-context files; the test checks the eight output names, their source contents, and no OTP in process output. A second test verifies a symlink with an allowed name in an otherwise valid directory is not copied.
- `pnpm exec prettier --check` on the two changed paths, focused ESLint, `git diff --check` on those paths, and direct `tsc --noEmit --incremental false` exited 0.
- Full `pnpm test` exited 0: 51 files, 426 tests. No new configured browser/visual CI run or image capture is claimed here.

Only `scripts/collect-wishlist-visual-evidence.mjs` and `src/visual-evidence-collector.test.ts` are implementation commit candidates. The inherited filled PNGs and baseline manifest, and controller-owned docs/reviews, remain untouched and uncommitted by this implementer. The controller must rerun the exact-head configured job, verify eight allowlisted images and actual artifact upload, independently review all four resulting Linux actual images against the pinned references at exact hashes, and only then decide baseline changes. No push, merge, external publication, local Docker, or baseline acceptance occurred here.
