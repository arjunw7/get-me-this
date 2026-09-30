# ARJ-27 R5/R6 scoped independent re-review

Reviewer: Codex `/root/arj27_r4_code_review`. Date: 2026-10-01, Asia/Kolkata.

**SPEC: APPROVE. QUALITY: APPROVE.** Both prior P2 findings are closed by the reviewed delta. No new blocking or important regression was found within this scoped re-review. This approves the source/specification repair of R5 and R6; it is not configured CI, route-image, baseline, publication, or merge approval.

## Exact scope and inputs

- Base: `700b3db3157cb117ae455bda94a8ee6af797de0d`.
- Tip: `0cd11a23d78cf2c0b16794fcb6eaac5e017bdbcb`.
- Reviewed range: `700b3db3157cb117ae455bda94a8ee6af797de0d..0cd11a23d78cf2c0b16794fcb6eaac5e017bdbcb`.
- One commit: `0cd11a2 fix(wishlist): preserve avatar and wrap long names`.
- Exactly three changed paths: `src/wishlist/wishlist-view.tsx`, `src/wishlist/wishlist-typography.module.css`, and `tests/e2e/wishlist-local.spec.ts` (73 insertions, 5 deletions).

HEAD matched the requested tip at initial and final verification; the three inspected paths had no worktree diff from HEAD. I read the complete prior `arj27-r4-code-review.md` and the updated implementation report, including the R5/R6 section. The prior report is preserved with its original SHA-256. Existing dirty evidence, PNG, and manifest files were left untouched and are not approval evidence. Closed areas were checked only where the two-line production delta and added assertions could directly affect them.

## Finding dispositions

### R5 — prior P2, CLOSED: visible avatar overlap restored

Repair: `src/wishlist/wishlist-view.tsx:96` adds `relative z-10` to the avatar. The size, negative margin, flex behavior, and content are unchanged. The avatar now paints above the positioned band.

Regression assertion: `tests/e2e/wishlist-local.spec.ts:79–95` checks both the green background and whether the avatar is the topmost element 10px below its top, at the horizontal center of the overlapping disc. This checks the rendered stacking defect that the old bounding-box test missed. I extracted and executed this exact updated helper against source-rendered headers from both reviewed commits. It rejects the base at every tested width with the expected covered-avatar failure and passes the repaired source.

An independent pixel check using in-memory screenshots also confirms visible paint. For `Jaya`, the sampled points changed from coral to fresh green while all avatar geometry remained identical:

| Width | Avatar sample x, y | Base RGB | Tip RGB | Avatar top/bottom |
| --- | --- | --- | --- | --- |
| 390px | 74, 84 | 255, 90, 54 | 198, 240, 98 | 74–138 |
| 640px | 102, 100 | 255, 90, 54 | 198, 240, 98 | 90–170 |
| 1440px | 246, 116 | 255, 90, 54 | 198, 240, 98 | 106–186 |

The stacking helper also passed for the three-line and both unbroken-name fixtures at all three widths. Avatar overlap remains 48px relative to the band's bottom when the band grows.

### R6 — prior P2 specification gap, CLOSED: unbroken accepted names fit

Repair: `src/wishlist/wishlist-typography.module.css:4` adds `overflow-wrap: anywhere` to the shared owner-name class. It permits an otherwise overflowing token to break without changing the existing 30px mobile or 36px desktop type, clipping it, or narrowing accepted input. The intrinsic-height desktop band continues to expand for additional lines; the mobile name remains in its normal flow below the band.

Regression assertion: `tests/e2e/wishlist-local.spec.ts:115–143` measures the actual text range, rather than only its constrained heading box, and asserts all four edges inside the card. The new signed-in fixture at lines 433–453 uses exactly 40 `W` characters and visits 390, 640, and 1440px; at each it runs text containment plus the existing typography, taste clearance, desktop top/bottom, and new avatar stacking checks.

I executed the exact new text-containment helper against the source-rendered base and tip. It rejects the base's 40-character overflow at each requested width and passes the repaired source. The tip also contains the prior 31-character reproducer `MontgomeryChristopherMontgomery` at every width. In every repaired fixture, heading `scrollWidth` equals `clientWidth`.

| Width | 40-character text x range | Card x range | Heading y range | Band y range | Name type |
| --- | --- | --- | --- | --- | --- |
| 390px | 42–338 | 20–370 | 150–279.5625 | 26–122 | 30px |
| 640px | 162–549.9375 | 32–608 | 38–187.75 | 26–201.75 | 36px |
| 1440px | 306–1224.375 | 176–1264 | 65.125–140 | 42–154 | 36px |

The actual text's vertical ranges are also within the card at all widths and within the band at desktop widths. At 640px, the 40-character name retains 12px heading-box clearance above, 14px below, and 10px between the divider and taste line. The 1440px case also retains 14px lower heading clearance and 10px taste clearance. The 390px case grows in mobile flow without horizontal clipping.

## Direct regression checks

- The existing spaced fixture `CHRISTOPHER MAXIMILIAN MONTGOMERY` remains three lines at 640px: height 112.3125px, heading y=38–150.3125, band y=26–164.3125, 12px/14px top/bottom heading clearances, and 10px taste clearance. The existing height-greater-than-100 assertion and both desktop edge assertions are retained at `tests/e2e/wishlist-local.spec.ts:406–430,97–105`.
- For Jaya and the spaced fixture, automated before/after comparisons found identical card, band, heading, avatar, taste, and text-range geometry at all three widths. This confirms ordinary wrapping and the mobile layout are preserved by the delta; only the intended avatar paint changes.
- Browser role checks found exactly one accessible owner heading and one correctly named region for each fixture at every width. The delta changes no markup semantics or responsive visibility. The decorative avatar remains `aria-hidden`; no direct accessibility regression was found.
- Existing empty and populated cases retain calls to the strengthened helper at lines 367 and 465; the Jaya case remains at lines 389–404. The focused component suite passes all six empty/populated/error-state tests. No branch or state-selection logic changed.
- No security, data access, provider, validation-limit, dependency, or request behavior changed. The production change is limited to avatar paint order and the name's overflow wrapping.

## Independently executed checks

- `git diff --check 700b3db3157cb117ae455bda94a8ee6af797de0d..0cd11a23d78cf2c0b16794fcb6eaac5e017bdbcb`: passed.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec vitest run src/wishlist/wishlist-view.test.tsx`: passed, 1 file / 6 tests.
- `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec playwright test tests/e2e/wishlist-local.spec.ts --list --reporter=list`: passed, 30 registered cases. The new three-width fixture skips the mobile project at runtime and itself visits all three widths in the desktop project. Listing is not signed-in execution.
- Focused ESLint on the changed TSX/spec paths: passed. Focused Prettier check on all three changed paths: passed.
- One isolated Chromium before/after probe: passed. It used actual component source from the reviewed commits, production compiled CSS, embedded vendored fonts, the exact new geometry/text helper functions extracted from the spec, and in-memory avatar pixel sampling. It asserted expected failures on the base, success on the tip, computed type sizes, one heading/region, no repaired horizontal scroll overflow, and unchanged ordinary-name geometry.

The probe ran with approved local diagnostic escalation, blocked requests, and used no server, auth session, database, or provider. React rendered the actual header source in memory. Unrelated empty/card content was stubbed; a minimal empty-state heading supplied the helper's unchanged 30px expectation, so this is not claimed as a full empty-route rendering. The component unit suite separately exercised actual empty/populated/error selection. For the base comparison, the probe overrode only the new `overflow-wrap` declaration back to `normal`, matching the sole stylesheet delta; the base component supplied its original avatar classes. Fonts were awaited and 30px/36px computed sizes asserted. No screenshot or probe files were saved.

The implementer's reported full `pnpm verify` result is attributed author evidence; I did not rerun that broader gate. Exact-head configured signed-in tests, four fresh Linux route captures, and independent hash-specific visual approval remain separate required gates. No baseline or manifest is approved here.

Only this requested re-review report was written. No code, previous report, baseline, evidence, branch, or index was edited; no commit, push, external post, provider access, or subagent delegation occurred.

## Input provenance

Paths are relative to the worktree root; controller reports are under `.superpowers/sdd/get-me-this-phase4-controller/`.

| Input | SHA-256 |
| --- | --- |
| `arj27-r4-code-review.md` | `8793131e12e10c9afcb6e3a68adf5d12f33c415becd4d963c609dd47fdc25346` |
| `arj27-desktop-name-fix-report.md` | `ff8eb29b19de2b3cb9ebbf9177a3e07e073a860ea39bbc0c013318f16bf1a95f` |
| `src/wishlist/wishlist-view.tsx` | `f680973b58e5f036f04c37e3d9d97c278345f59d876940ccde2bf4970a9b40ed` |
| `src/wishlist/wishlist-typography.module.css` | `8781156ebabca41834660fb2656ea2092f13e348836fbda8862568be04e64db9` |
| `tests/e2e/wishlist-local.spec.ts` | `deaffc579c87ab3ba96e73a10acd9703ffe4f53258c5d23de0ea73771d7b864e` |
| `.next/static/chunks/43oudemb_dytf.css` | `0454fc4c1adafe9de144c439ddb555033bd19b400c18cd9ab7d46b58b4787cef` |
| `.next/static/chunks/0qbbfkqhalbce.css` | `acf5550c7a6485655b0ab5e5401fc65205614eb79329112a8f47d2c3d6c3eced` |
| `app/fonts/bricolage-grotesque-latin-variable.woff2` | `9fee080fcc2d2e0ea8c7ce2a58abaa8ba1f40c6e603643327cd5eb6f07db06a8` |
