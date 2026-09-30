# ARJ-27 collector correction: independent re-review

Date: 2026-10-01 IST.

SPEC: PASS for the bounded collector correction.

QUALITY: PASS. No actionable defect or regression found in the reviewed change. Configured CI execution, artifact delivery, and visual acceptance remain pending and are not implied by either verdict.

## Review identity and scope

- Base: `c71f69d35bbe01e6c9b2aa300d2fba800867ed28`.
- Head: `b50a5b35f7aeee5500fca5608c617c8eb42b93eb`.
- Full supplied packet: `arj27-collector-b50a5b3.diff`, SHA-256 `6bef0c4dc3ef372bc689e6566c7d6a96cf3d84264f7e856a9297e6410267f93a`.
- Reviewed both changed files in full and checked the actual Git diff between those commits. HEAD matched the requested head; both reviewed working files matched it. The commit changes only `scripts/collect-wishlist-visual-evidence.mjs` and `src/visual-evidence-collector.test.ts`.
- Read the repository instructions, `arj27-ci-c71f69d.md`, and `arj27-collector-fix-report.md`. Applied the engineering code-review skill's security, correctness, performance, and maintainability dimensions. Reviewed the relevant workflow, runner configuration, stack command, visual specs, pinned dependency, and installed runner implementation.

## Addressed finding

The finding in `arj27-ci-c71f69d.md:10-16` is resolved at the code level. The old directory-prefix predicate rejects all four real directories listed at lines 21-28. The new closed mapping at `scripts/collect-wishlist-visual-evidence.mjs:12-15`, combined with the direct-child and exact state/viewport comparison at lines 30-35, accepts those same four directories without admitting other suite names or nested results.

Independent naming evidence: Playwright is pinned to 1.63.0 in `package.json:42` and the lockfile. Its installed `workerProcessEntry.js:900-911` forms the directory from the relative spec path and sanitized test title, trims to the 60-character limit defined at line 72, and appends the project ID. I executed a read-only calculation using the installed core bundle's `trimLongString` and `sanitizeForFilePath`, extracting titles from the actual committed visual specs. It produced exactly:

```text
visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile
visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-desktop
visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-mobile
visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-desktop
```

The configuration sets `testDir: "tests"` at `playwright.config.ts:19` and the two named projects at lines 45-53. The configured stack command includes both visual specs at `scripts/e2e-local-stack.sh:76-81` and supplies no retry or repeat override. The specs name the screenshots using the matching state and project at `tests/visual/wishlist-empty.visual.spec.ts:66-72` and `tests/visual/wishlist-filled.visual.spec.ts:119-125`.

## Binding restrictions and quality assessment

| Dimension | Rating | Evidence |
| --- | --- | --- |
| Specification and correctness | PASS | The exact filename expression at collector lines 6-7 permits only empty/filled, mobile/desktop, actual/diff PNG names. Lines 30-35 bind each name to its matching direct-child run directory. The regression fixture uses all four observed directories at test lines 36-58, asserts the eight exact output names at lines 87-100, and checks copied contents at lines 101-104. |
| Security | PASS within the configured CI use | Collector lines 21-27 retain Dirent-based traversal and regular-file-only copying, so encountered file and directory symlinks are not followed. Lines 28-35 reject contexts, traces, reports, auth captures, mismatched state/viewport files, spoofed directory suffixes, and nested images. Test lines 61-85 include negative fixtures; lines 108-125 explicitly cover an allowed filename that is a symlink. Workflow lines 124-134 still upload only `wishlist-visual-evidence/`, with no general results upload added. |
| Performance | PASS | The change adds constant-time string comparisons to the existing traversal. It adds no dependency, network access, new traversal, or screenshot processing. |
| Maintainability | PASS | Collector lines 8-15 document the intentional Playwright/spec-title coupling. Unknown names fail closed. The tests now reproduce the recorded runner output and verify both filenames and content, addressing the earlier invented-fixture weakness. |

The duplicate-name refusal at collector lines 36-37 and aggregate-only success output at lines 44-46 remain unchanged. No baseline files, workflow, application behavior, or dependency versions are changed by this commit.

## Verification and evidence limits

- Independently completed: full diff and surrounding-source review, confirmation of the requested head and changed-file contents, installed-runner directory reconstruction, and `git diff --check` for the reviewed commit. These checks passed.
- The author's reported red/green collector regression, 2 focused tests, 426 unit tests, formatting, lint, and TypeScript checks are recorded in `arj27-collector-fix-report.md:15-18`. I did not rerun them; source review and the independent name reconstruction raised no concrete doubt requiring another focused run. No broad suite was rerun.
- The test fixtures contain representative text under PNG filenames. They prove selection and copying, not image validity, visual fidelity, or GitHub artifact upload.
- The naming mapping intentionally depends on the pinned version, titles, test directory, and project IDs. A later naming change or retry/repeat suffix requires a separately reviewed update; the current configured invocation does not introduce those suffixes.
- This review does not establish that the new head has executed successfully in configured CI. The controller still needs an exact-head run, an artifact containing precisely eight permitted PNGs, and independent review of the four actual images and four diffs against the pinned references at recorded hashes.
- Existing dirty baseline images and manifest, plus unrelated evidence files, were observed and left untouched. No source, index, branch, baseline, or external state was changed during this review. This report is the sole intended write. Neither verdict authorizes baseline acceptance or claims whole-job success.
