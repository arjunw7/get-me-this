# ARJ-27 R4 responsive owner-name containment: independent code review

Reviewer: Codex `/root/arj27_r4_code_review`. Date: 2026-10-01, Asia/Kolkata.

**SPEC: REQUEST_CHANGES. QUALITY: REQUEST_CHANGES.** The three-line vertical containment repair works, but the change introduces a P2 avatar occlusion regression at mobile and desktop widths. The broader stated requirement to contain every valid name up to 40 characters also remains unmet for unbroken names; that horizontal limitation predates this commit and is explicitly distinguished below. This is a source and implementation-quality review, not image, baseline, CI, publication, or merge approval.

## Reviewed scope

- Base: `5cbd9f4943aa626a1566810aa880d311d0f24da6`.
- Tip: `700b3db3157cb117ae455bda94a8ee6af797de0d`.
- Exact range: `5cbd9f4943aa626a1566810aa880d311d0f24da6..700b3db3157cb117ae455bda94a8ee6af797de0d`.
- The range contains one commit, `700b3db fix(wishlist): grow owner band for wrapped names`, and changes only `src/wishlist/wishlist-view.tsx`, `src/wishlist/wishlist-view.test.tsx`, and `tests/e2e/wishlist-local.spec.ts` (47 insertions, 12 deletions).
- HEAD matched the tip at initial and final verification. The inspected source/test paths had no worktree diff from HEAD. Existing dirty evidence, baseline PNGs, and the baseline manifest were excluded from candidate authority and left untouched.

I read the full requested diff, the governing `arj27-desktop-name-code-review.md`, and the complete `arj27-desktop-name-fix-report.md`, including its R4 addendum. I also inspected the actual component, typography module, existing 40-character validation, relevant test fixtures and geometry calls, Playwright configuration, and local-stack suite registration. The engineering code-review skill guided the correctness, coverage, security, performance, and maintainability assessment.

## Findings

### R5 — P2: Preserve the avatar's visible overlap when positioning the band

Location: `src/wishlist/wishlist-view.tsx:70` (new `relative` band), with the affected unpositioned avatar at lines 94–99 and removal of the desktop positioning context at line 93.

The coral band is now positioned with `relative`, while the following negative-margin avatar remains unpositioned. The positioned band's background paints above the avatar's overlapping upper portion. Its bounding box still overlaps the band by 48px, so a geometry-only assertion can report the expected avatar placement even though the overlap is covered by coral. This regresses the ordinary short-name case as well as long names, and affects mobile because `relative` is unprefixed.

A before/after Chromium probe rendered the actual component source from both reviewed SHAs with the production CSS and vendored fonts. For `Jaya`, I sampled an in-memory screenshot at the horizontal center of the avatar, 10px below its top. This point is inside the green disc, away from its border and initial. The result changed from the avatar's `#c6f062` to the band's `#ff5a36` at every checked width:

| Viewport width | Sample x, y | Before RGB | After RGB | Avatar y range, unchanged |
| --- | --- | --- | --- | --- |
| 390px | 74, 84 | 198, 240, 98 | 255, 90, 54 | 74–138 |
| 640px | 102, 100 | 198, 240, 98 | 255, 90, 54 | 90–170 |
| 1440px | 246, 116 | 198, 240, 98 | 255, 90, 54 | 106–186 |

At desktop widths, `elementFromPoint` also changes from the avatar `SPAN` to the decorative SVG. The pixel result is the decisive visual evidence; hit testing alone would be insufficient because the old mobile SVG can be hit-tested over a transparent area.

Required correction: keep the intrinsic-height band and name containment while ensuring the complete overlapping avatar paints in front at both responsive layouts. Verify the visible overlap, not only its bounding box, and retain the current name/taste clearance assertions. No typography reduction or name-limit change is needed to correct this regression.

### R6 — P2 specification gap, pre-existing: Valid unbroken names remain clipped horizontally

Location: `src/wishlist/wishlist-view.tsx:86–89`, the newly placed desktop heading; clipping occurs at the existing `overflow-hidden` card on line 68. The shared checks at `tests/e2e/wishlist-local.spec.ts:80–90` currently assert vertical containment only.

The stated review requirement covers valid names up to the existing 40-character product limit. `validateOnboardingInput` accepts any nonblank string of at most 40 UTF-16 code units and does not require spaces (`src/profile/onboarding.ts:22,50–54,74`). The heading permits ordinary word wrapping but has no fallback break opportunity for a long uninterrupted token. `min-w-0` shrinks the heading box; it does not make its text wrap. The card clips the overflowing text.

At 640px, the accepted 31-character `MontgomeryChristopherMontgomery` produces a 416px heading box with 630px scroll width. The text's right edge is x=791.953px while the card ends at x=608px. A valid 40-character `W` fixture produces 1413px scroll width at 640px and still exceeds the 928px heading width at 1440px (text right x=1719.438px, card right x=1264px). Both fixtures pass the new vertical bounds and font-size requirements despite this loss of visible text.

The same probes against the base commit reproduce the horizontal overflow: this is **not introduced by R4**, and it is not represented as a new regression. It is recorded as an unmet explicit containment requirement for this review. The concrete R5 regression independently requires changes even if the controller keeps this inherited horizontal issue outside the narrow repair scope. To claim full containment for the accepted input domain, support breaking long tokens without shrinking type, restricting names, or clipping, and exercise horizontal text containment with an accepted boundary fixture.

## What the repair does correctly

The desktop heading now contributes to the band's height, which resolves the governing R4 top-clipping example. At 640px, `CHRISTOPHER MAXIMILIAN MONTGOMERY` remains three lines at 36px. Its name box changes from y=13.6875–126 in the fixed y=26–138 band to y=38–150.3125 in the growing y=26–164.3125 band. The resulting clearances are 12px above the heading, 14px below it, and 10px from the band to the taste line. At 768px the same name is two lines and contained; at 1440px it is one line and contained.

The new real-browser fixture at `tests/e2e/wishlist-local.spec.ts:361–386` sets width 640px, waits for fonts, requires a heading height greater than 100px, and calls the shared helper, which now checks both top and bottom edges. The actual local fixture height was 112.3125px. The previous empty Ada, populated Ada, and Jaya descender cases still call that helper at lines 322, 398, and 357. Taste-line clearance, 36px desktop names, 30px mobile names, and the 30px empty-state heading checks remain present. Both projects remain registered; the new 640px case deliberately skips the mobile project.

The typography module and product validation are unchanged. The focused local before/after probe at 390px found identical name, taste, and avatar boxes for Jaya and the three-line fixture, with the expected 30px name type; this does not excuse R5's changed paint order. At desktop widths the avatar retains its 48px overlap relative to the divider, including when the band expands, but that overlapping portion must remain visible.

The responsive heading copies have mutually exclusive `display` rules. The local browser exposed one owner heading and one correctly named region at 390, 640, and 1440px; the decorative SVG remains `aria-hidden`. No accessibility regression was found in these semantics. Replacing the JSDOM heading assertion with the named region assertion is reasonable because that environment does not apply the responsive stylesheet; actual browser role selection still checks the visible heading. This is not a claim of a new full-route axe run.

## Verification performed and limits

All commands below were focused local checks, without provider access:

- `git diff --check 5cbd9f4943aa626a1566810aa880d311d0f24da6..700b3db3157cb117ae455bda94a8ee6af797de0d`: passed.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec vitest run src/wishlist/wishlist-view.test.tsx`: passed, 1 file / 6 tests, including empty, populated, and error state selection.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec playwright test tests/e2e/wishlist-local.spec.ts --list --reporter=list`: passed, 28 registered cases across mobile and desktop. Listing is not execution.
- Focused ESLint on the three changed paths: passed.
- Focused Prettier check on the three changed paths: passed.
- Isolated Chromium source-rendering probes at widths 390, 640, 768, and 1440, using before/after component source, the current production CSS, and embedded local fonts. These measured heading/text ranges, name typography, band/taste/avatar geometry, visible heading counts, and accepted long-token overflow. A follow-up used in-memory screenshots solely to sample avatar paint colors at 390, 640, and 1440. No screenshot files were saved or approved.

The probe transpiled the actual component source in memory and rendered it with React; unrelated empty/card content was stubbed. For the base rendering, it restored only the desktop positioning utilities absent from the new compiled CSS (`sm:relative`, `sm:absolute`, right/left/bottom). No application server, auth session, database, or external resource was used; requests were blocked. The valid runs explicitly checked 30px/36px computed typography and waited for fonts. An initial sandbox launch restriction was resolved by approved local diagnostic escalation. An early CSS-module adapter run produced 16px text and was excluded; a subsequent setup attempt failed before browser execution due to a Node argument error. Neither is claimed as valid evidence.

I did not rerun full `pnpm verify`, run the authenticated stack suite, capture the four configured Linux route images, or obtain new image approval. The implementation report's full verification results remain attributed author evidence. Exact-head configured browser execution, new approved-viewport captures, and independent hash-specific visual review remain separate gates.

## Quality assessment

| Dimension | Assessment |
| --- | --- |
| Correctness | REQUEST_CHANGES for the introduced R5 occlusion; R6 also prevents the broader full-name-containment claim. |
| Test coverage | The targeted vertical regression test is appropriate and prior geometry coverage is retained. It does not detect changed avatar paint order or horizontal clipping. |
| Accessibility | No new issue found in the inspected semantics and local browser role checks; full-route accessibility proof was not rerun. |
| Security | No new issue found. No data access, authorization, providers, or input validation changed. |
| Performance | No important issue found. The change adds one hidden responsive heading and no effects, requests, or dependencies. |
| Maintainability | The intrinsic-height band is understandable and localized. Responsive duplication is small and uses the same prop. Correct stacking and complete text containment still need resolution. |

No source, tracked evidence, baseline, manifest, branch, or index changes were made by this reviewer. No commit, push, external post, provider access, or subagent delegation occurred. Only this requested report was written.

## Input provenance

Paths are relative to the worktree root; controller reports are under `.superpowers/sdd/get-me-this-phase4-controller/`.

| Input | SHA-256 |
| --- | --- |
| `arj27-desktop-name-code-review.md` | `1a65c80fb39bede461d1d80bfba47b658fdd31816b4ff1d7c7d9fcf81a2e6708` |
| `arj27-desktop-name-fix-report.md` | `6f5fda8b0de3129d578fc9b238909bc610ec3a7dc159892f15b92600e5d82c0e` |
| `src/wishlist/wishlist-view.tsx` | `a0b4cdfb2d802240bef20315ea901f6fb979159758079d8eab9006be98453416` |
| `src/wishlist/wishlist-view.test.tsx` | `93e61d5e5a969e945b219c2bc79dd420376d3eae8cd7386ed7521acfe1c52798` |
| `tests/e2e/wishlist-local.spec.ts` | `02b5710a5b93d33842538b7a7fabf8b5756d379411c91ad8acc0e2e626e4ab8f` |
| `src/wishlist/wishlist-typography.module.css` | `0a050fe1f9de2592333ba8433a50f89238e9add19fbbb5b319e17bb0dbdabd9b` |
| `app/fonts/bricolage-grotesque-latin-variable.woff2` | `9fee080fcc2d2e0ea8c7ce2a58abaa8ba1f40c6e603643327cd5eb6f07db06a8` |
| `.next/static/chunks/43oudemb_dytf.css` | `0454fc4c1adafe9de144c439ddb555033bd19b400c18cd9ab7d46b58b4787cef` |
| `.next/static/chunks/3eioo0n9bs12o.css` | `12fe892af199b0e43b46962eed48692ee4a9749313969c47cfe7191eb47fa4d7` |
