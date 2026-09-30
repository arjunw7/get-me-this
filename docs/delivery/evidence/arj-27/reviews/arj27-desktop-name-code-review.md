# ARJ-27 desktop name repair: independent source review

Reviewer: Codex `/root/arj27_desktop_name_code_review`. Date: 2026-10-01, Asia/Kolkata.

**SPEC: REQUEST_CHANGES. QUALITY: REQUEST_CHANGES.** One P2 regression introduced by this repair requires correction. This is a source/specification and implementation-quality verdict, not a new image approval or merge approval.

Reviewed commit range: `d95995c2e489fd2dd588b305e9d1234307203e12..5cbd9f4943aa626a1566810aa880d311d0f24da6`. The checkout was at the latter commit, and the full Git diff matches the supplied repair diff: only `src/wishlist/wishlist-view.tsx` and `tests/e2e/wishlist-local.spec.ts` change. Existing dirty evidence, baseline, and manifest files were excluded from candidate authority and left untouched.

## Blocking finding

### R4, P2: Allow a wrapped desktop owner name to expand without clipping its first line

Location: `src/wishlist/wishlist-view.tsx:100`, in the newly added absolute positioning; related containment is at lines 68 and 71. The new geometry check at `tests/e2e/wishlist-local.spec.ts:81-85` checks only the heading's bottom and does not catch this regression.

At the 640px desktop breakpoint, the name has 416px of available width. A valid 33-character display name such as `CHRISTOPHER MAXIMILIAN MONTGOMERY` wraps to three lines at the retained 36px display size. The form/server validator allows up to 40 characters and preserves the entered case (`src/profile/onboarding.ts:22,44-74`). `Montgomery Christopher Montgomery`, also 33 characters, reproduces the same wrapping.

The new `bottom: calc(100% + 0.75rem)` keeps the heading's lower edge 12px above the divider but makes those three lines extend upward beyond the fixed 112px coral band. The card's existing `overflow-hidden` clips the top. This is introduced by taking the name out of normal flow and anchoring its bottom; the prior source lets the same three-line heading extend downward within the card without top clipping.

A focused local Chromium probe used the actual before/after component source, current compiled CSS, and vendored Bricolage Grotesque font. At width 640, both valid names produced:

| Geometry, CSS pixels | Before | After |
| --- | ---: | ---: |
| Coral-band top / bottom | 26 / 138 | 26 / 138 |
| Name width | 416 | 416 |
| Name top / bottom | 106 / 218.3125 | 13.6875 / 126 |
| Name height, three lines | 112.3125 | 112.3125 |
| Name box above clipped band's top | 0 | 12.3125 |
| First line text-range top / bottom | 103 / 146 | 10.6875 / 53.6875 |

The new lower-edge assertion still passes for the broken after case: `126 <= 138 - 10`. Its accompanying `toBeVisible()` assertion does not establish full containment. The `Jaya` fixture does satisfy the requested descender coverage, but its single line cannot exercise this failure.

Required repair: retain independent name/taste placement and the approved type sizes while allowing the band/header geometry to contain supported wrapped names. Add a focused assertion for the name's top as well as its bottom with a valid wrapping fixture at the layout breakpoint. Preserve the mobile flow and avatar overlap. This request does not prescribe a redesign, smaller typography, a new name limit, or a new accepted visual exception.

## Finding dispositions and specification assessment

| Item | Disposition |
| --- | --- |
| R1, taste-line/divider collision | Preserved in source. The taste/count wrapper starts below the band, independently of the heading. The focused probe measured 10px taste clearance after the fix, including when the name wraps. New configured browser proof remains pending. |
| R2, display typography | Preserved. The typography module is unchanged: 30px mobile name, 36px desktop name, 30px empty heading. |
| R3, desktop name touches divider | Addressed for the one-line Ada/Jaya case by independent placement, with 12px heading-box clearance in the focused probe. The complete repair is not accepted because R4 violates the requirement to keep the full name inside the band. Actual new desktop-image approval remains pending independently. |
| Mobile flow and avatar | No changed unprefixed mobile layout rules. The focused probe at 390px produced identical name/taste/avatar boxes before and after for Jaya and two longer names. Avatar boxes also remained unchanged at 640, 768, and 1440px. This is geometry corroboration, not approval of new mobile screenshots. |
| Descender and geometry coverage | The new signed-in Jaya test uses the shared helper, which also strengthens existing empty/populated cases. Both configured projects execute this spec through the existing stack script. Add top-containment/wrapping coverage for R4. |
| Binding 005b scope | The repair does not alter data access, authorization, route behavior, product copy, accepted feature omissions, dependencies, or baselines. Full criteria 14, 15, and 18 remain subject to configured CI and hash-specific image review. |

## Quality assessment and evidence limits

Security and performance: no new issue found in this two-file diff. There are no new data reads, permissions, effects, dependencies, or client requests. Maintainability: the independent heading placement is locally understandable and the parameterized fixture reuses existing cleanup. Correctness: request changes for R4. Test quality: rendered geometry is appropriate, but checking only the lower edge leaves the new fixed-band containment behavior unprotected. No untouched observation is raised as a final-review blocker.

I read the complete binding 005b brief, previous visual re-review, author repair report, and full repair diff, and used the engineering code-review skill. I inspected the relevant component, typography module, profile validation, fixture helper usage, Playwright projects, and stack-suite registration. `git diff --check` passed for the reviewed range. The author's report records 6 focused units, 26 registered browser cases, and full verification with 426 units/build passing. Those are attributed author results; I did not rerun that suite or independently certify those execution counts.

The isolated geometry probe was run only to resolve the specific new wrapping concern. It rendered the actual component with unrelated empty/card content stubbed, local compiled CSS and fonts, and no signed-in application, network service, or provider. The before rendering additionally restored the removed `sm:-mt-8` utility, which the current build no longer emits. The valid probe checked the expected 30px/36px sizes and awaited font loading. An earlier setup attempt had an incorrect CSS-module adapter and is excluded from evidence. A sandbox browser-launch restriction was resolved through the approved local diagnostic escalation. No screenshot was captured or approved, and no probe file was saved.

Configured signed-in execution, new Linux empty/populated captures at both approved viewports, hash-specific visual approval, and exact-head CI checks remain outstanding. This report authorizes no baseline/manifest update, publication, push, merge, branch/index edit, or provider mutation. Only this report was written by this reviewer.

## SHA-256 provenance

Paths are relative to the repository root; controller files are under `.superpowers/sdd/get-me-this-phase4-controller/`.

| Input | SHA-256 |
| --- | --- |
| `arj27-visual-rereview.md` | `9a3e10f4a9a2210ec5c8a9a4f1ccaf8a47e7961fa9f1172953ef8cb0884cf00e` |
| `docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md` | `7801abc0e91c4f4169ece6f1b70c43a94c8ca500dfd003081061bd8b572cac09` |
| `arj27-desktop-name-fix-report.md` | `292bd4a28e3ca9e4377f6289515231290d4d2f7f4c008cdb3245ca6469536fee` |
| `arj27-desktop-name-fix.diff` | `4e160df008298e89e1624916f49bdf4ef9b2d5482ba0afa3fe54aeaaaa1deb1f` |
| `src/wishlist/wishlist-view.tsx` | `d390b0421828b76f92010f52781aeb6f55f0c8ebf9c74bd3ae048ba4cce55463` |
| `tests/e2e/wishlist-local.spec.ts` | `aaf1865afbfa99ea13bb90af165a9d958cd73d9e4362c779bca73482f6d8be15` |
| `src/wishlist/wishlist-typography.module.css` | `0a050fe1f9de2592333ba8433a50f89238e9add19fbbb5b319e17bb0dbdabd9b` |
| `app/fonts/bricolage-grotesque-latin-variable.woff2` | `9fee080fcc2d2e0ea8c7ce2a58abaa8ba1f40c6e603643327cd5eb6f07db06a8` |
| `.next/static/chunks/2lrfpb-pbs2io.css` | `7748698ee7af67f63815fa3c5ef883fb739d27d40b203c375449d96cbbfee1b9` |
| `.next/static/chunks/3eioo0n9bs12o.css` | `12fe892af199b0e43b46962eed48692ee4a9749313969c47cfe7191eb47fa4d7` |
