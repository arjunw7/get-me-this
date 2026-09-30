# ARJ-27 independent actual-image re-review

**Overall verdict: REQUEST_CHANGES**

**Reviewer:** Codex independent AI visual-review agent `/root/arj27_visual_rereview`.
**Review date:** 2026-10-01, Asia/Kolkata.
**Candidate provenance supplied by the controller:** Linux CI run `36762403450`, artifact `11118599708`, application source head `b50a5b35f7aeee5500fca5608c617c8eb42b93eb`.
**Scope:** The four downloaded wishlist actual screenshots, their four old-production-baseline diff images, and the four immutable V18 reference screenshots identified by SHA-256 below.

This is an independent AI review under the explicit Phase 4 delegation in the binding 005b brief. It is not human approval. I did not author the application implementation or its previous repairs. The desktop name/divider finding was independently observed during image inspection; the controller subsequently raised the same observation without prescribing a verdict.

## Decision

The previous taste-line collision (R1) and undersized mobile/display typography (R2) are resolved in these images. Both mobile pairs are visually acceptable. One desktop header defect remains in both empty and populated states: the owner name now rests directly on the coral/white divider, with no visible space below its letters. The V18 desktop reference leaves clear space between the name and that divider. This is not an accepted shell, fixture, feature, or colour difference.

Repair that name/divider clearance while preserving the corrected taste-line clearance and display sizes, then capture and independently review the resulting images. No baseline or manifest changes are authorized by this report. The four-image set is not approved for baseline adoption.

## Method and evidence boundary

I read the complete `docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md`, `DESIGN.md`, `docs/delivery/evidence/arj-27/README.md`, and the prior controller-workspace `arj27-visual-review.md`. I applied the design-critique skill's first-impression, usability, hierarchy, consistency, and visual-accessibility framework.

The `view_image` tool successfully opened all twelve listed PNGs at original detail. I directly inspected each actual/reference/diff triple, including the entire long populated captures. The findings come from rendered images, not OCR or source-only inference. Targeted source reads then corroborated the new desktop finding and the restored typography. No alternative screenshots, synthetic browser renderings, OCR, or resized replacement images were used as evidence.

The screenshot viewports are 390 by 844 and 1440 by 1000. These are full-page captures, so image heights can exceed the viewport and differ between production and V18. The production filled state is the deterministic Ada fixture with four items; V18 has Aanya Mehta and its prototype products. Criterion 15 expressly requires comparison of structure, hierarchy, card design, typography, and accent usage rather than exact product pixels. The empty state is route-equivalent with zero items, the approved fixture identity substitution, and the documented omissions. Both sets show the starting page position. The V18 mobile full-page captures contain its fixed navigation and floating add control at the first viewport boundary; those reference obstructions are part of the approved shell omission, not defects that production must reproduce.

The four `-diff.png` files compare these actuals with the old production goldens. They are not V18 comparisons. They were inspected for unexpected changes and corroborate the header and vertical-flow changes; their large highlighted regions do not themselves establish either fidelity to V18 or approval. I compared the V18 PNGs directly for the design verdict.

The local checkout was at audit head `d95995c2e489fd2dd588b305e9d1234307203e12` during corroborating reads. A targeted `git diff` from the supplied CI source head returned no changes for the header, typography module, geometry helper, or the two visual specs read here. Existing dirty baseline/manifest files were not used as candidate authority and were not changed by this reviewer.

## Remaining finding

### R3, P2: Restore visible clearance between the desktop owner name and divider

**Affected:** `wishlist-empty-desktop-actual.png` and `wishlist-filled-desktop-actual.png`.

In both actual images, the coral/white rule is around y=236 to 238 and the visible bottom of `Ada` is directly against it at approximately x=306 to 372. The name looks attached to the heavy horizontal rule. Its text remains recognizable, but the line no longer reads as a clean boundary between the display name in the colour band and the supporting text below. The corresponding V18 name sits visibly above its divider, with roughly a mid-teens-pixel gap below the visible letter shapes. The candidate taste text is now safely below the rule, beginning around y=252; that part of the earlier repair works.

The contrast between the two images is a real header-spacing defect, not a consequence of Ada being shorter than Aanya, replacing the avatar, omitting controls, or centring content after removing the sidebar. The header should preserve the same clean hierarchy regardless of which of those accepted differences applies.

Source corroboration: `src/wishlist/wishlist-view.tsx:97` gives the entire text block `sm:-mt-8`, while `src/wishlist/wishlist-typography.module.css:11` sets the desktop name to 36px with 1.04 line height. A roughly 37.44px name line pulled upward by 32px straddles the band boundary. This explains the observed baseline contact. It also implies a collision risk for descenders or a wrapped name; that extension is an inference from the geometry, not a separately captured visual failure. The present review does not claim to have rendered other names.

The existing `assertProfileGeometry` at `tests/e2e/wishlist-local.spec.ts:65` checks taste-line clearance and name/empty-heading font sizes. It does not check the owner heading's clearance from the divider. The reported passing geometry checks therefore do not contradict the visual finding.

**Required repair:** Position the desktop name fully within the coral band with visible bottom clearance, while keeping the taste line fully in the white area. Adjust their independent spacing or layout rather than shifting the entire block upward and reintroducing R1. Keep the current 36px desktop and 30px mobile profile sizes, the 30px empty heading, and the avatar overlap. Add a focused geometry assertion that protects both name and taste placement, including a representative name with descenders. Recapture both desktop states and check the shared header at mobile again. Any changed PNG needs review by its new hash.

This is the only remaining blocking visual finding from this image set.

## Previous findings

| Finding | Current evidence | Disposition |
| --- | --- | --- |
| R1: Desktop divider crossed the taste text | In both desktop actuals, the entire taste line is on white below the divider and has a readable separation from it. The supporting count remains below the taste line. | Resolved for the taste line. R3 separately identifies the remaining name placement. |
| R2: Profile and empty heading were too small | The mobile name has the intended 30px prominence; the empty mobile heading now wraps into two emphatic lines. Desktop owner type is 36px. Targeted source reads corroborate 30px empty headings at both widths. | Resolved. No additional size exception is needed. |

## Pair-by-pair verdicts

| Pair | Verdict | Concrete image observations |
| --- | --- | --- |
| Empty mobile | APPROVE for this exact image | The 20px gutter contains the full outlined profile card and dashed panel without clipping. The name, taste line, and `0 things` remain distinct. The restored two-line headline has appropriate emphasis after the stacked-card illustration. The required paragraph and `Add an item` CTA are readable and unobstructed. Tape, offset shadows, rounded forms, cream art, and coral action reproduce the reference's character. The lower panel edge fits the full-page image with deliberate surrounding space. |
| Empty desktop | REQUEST_CHANGES | Main content retains the reference's approximate width, chunky profile outline, dashed empty panel, centred card illustration, bold heading, readable paragraph, and dominant coral action. The shorter copy and CTA account for the more compact empty panel. R3 prevents approval of the desktop header. No other new empty-state defect was found. |
| Filled mobile | APPROVE for this exact image | All four items are visible in one complete column, with consistent gutters and separation. Large image fields, cream title placeholders, overlaid desire chips, 18px-style bold titles, retailer/price rows, and note bubbles preserve the reference hierarchy. The two placeholder titles are readable and wrap without clipping; there is no broken-image icon. Items lacking a note, price, or retailer do not show dummy content or awkward empty rows. The 4-things header is readable and the full page ends cleanly after the fourth card. |
| Filled desktop | REQUEST_CHANGES | Three columns, varied image heights, slight card rotations, offset shadows, and the fourth item below the right column follow the V18 arrangement. The two placeholder cards look intentional; photo and text fields have clear boundaries; note bubbles and source links remain legible. The lower-left detached tape mark is also present in the pinned V18 image. R3 affects this shared header as well. No new grid or card blocker was found. |

The pair approvals above apply only to the exact mobile hashes listed here. They do not approve a future recapture, waive the desktop finding, approve the complete baseline set, or imply green CI.

## Accepted differences and explicit design decisions

These decisions record why visible differences are acceptable for 005b. They do not convert R3 into an accepted exception.

1. **Application shell and placement: accepted under the binding shell scope.** Production retains the existing wordmark/account header and omits V18's desktop sidebar, fixed mobile bottom navigation, and floating add control. The desktop content is centred at about x=176 to 1264 rather than shifted to x=304 to 1392 by a sidebar. Its usable width is essentially retained. Mobile content begins lower because the existing top shell has different vertical spacing. This changes the page origin without reducing the content gutter or creating obstruction. The visible `Account` label and larger wordmark are part of the retained shell.
2. **Profile controls and identity treatment: accepted under resolution 3, with explicit scale decision.** The default coral band replaces the user theme, and the lime single-initial disc replaces the prototype avatar/AM disc. The reviewed disc is smaller, about 64px on mobile and 80px on desktop versus roughly 96px in V18. I accept that scale for this slice: it remains an obvious overlapping identity marker, visually matches the existing account-avatar treatment, and lets the owner's name carry the primary hierarchy. The omission of Edit profile, Share, theme text, and group visibility makes the mobile profile card shorter and simplifies its count row. The remaining identity information stays clear. None of these decisions permits the desktop name to touch the divider.
3. **Deferred group and management affordances: accepted under resolution 3.** Share, group visibility, reactions, reorder controls, the reservation/privacy toolbar, and a populated-state add affordance are absent. Their removal shortens cards and removes the toolbar gap, but the images still clearly communicate a saved owner wishlist. Reintroducing those prototype features would exceed 005b or imply unavailable behavior.
4. **Empty action and paragraph: accepted under resolutions 1 and 8 and the evidence README.** `Add an item` replaces `Add from a link`, without its link icon. The smaller button width follows its shorter label while retaining a clear coral shape and adequate visible height. The paragraph omits exactly `Your friends will take it from there.` The required remaining copy is visible and the shorter paragraph naturally reduces panel height. The empty state remains understandable and does not imply an audience.
5. **Fixture products, prices, and absent fields: accepted under criterion 15 and resolution 4.** Ada, the two vendored photos, two missing-image placeholders, different titles/retailers/notes, and different amounts intentionally differ from the prototype fixture. The reviewed four cards show `2499.00 INR`, `132000 JPY`, no price for the keycaps, and `4200.00 INR`. Currency codes remain legible, JPY has no fractional digits, and no approximate converted tuple appears. These images establish the specified visual treatment, not every numeric-formatting edge case. The cups photo accompanying the synthetic matcha fixture is accepted as test content under design comparison, not as evidence of a real product's image accuracy.
6. **Source-link and chip treatment: explicitly accepted.** Underlined retailer text in the two linked cards is more explicit than V18's retailer styling. It appropriately identifies the real source-link affordance required by the brief and remains subordinate to the title. The title-case desire labels reproduce the binding mapping in resolution 5 even though V18's screenshot uses lowercase. Their coral, pale-cream, and dashed-white distinctions remain consistent and readable. Modest platform font-rasterization differences in the diff files are not treated as a design change; the actuals retain the intended faces and hierarchy.
7. **Placeholder text contrast: explicitly accepted.** The cream fields' visible title echoes are stronger than the faint/blank placeholder treatment visible in the frozen reference. That difference is recorded in the evidence README and provides a useful identity for missing imagery. The title echoes are secondary to the dark card titles, fit their fields, and do not compete with desire chips. I accept the stronger visual treatment for legibility. This is a visual judgment, not a fresh numerical contrast certification.
8. **Full-page lengths, whitespace, and decoration: explicitly accepted.** The shorter content and removed rows explain the different page heights. The desktop grid's fourth-item placement and broad unused lower-left area are also present in V18's arrangement, so they are not new layout failures. The detached tape near the bottom-left of the populated desktop image is inherited from the immutable reference; it is decorative and nonblocking in this narrowly scoped fidelity review. No claim is made that it would be the preferred treatment in a future redesign. Mobile has no corresponding stray mark in the reviewed output.

## Exact images reviewed

Repository root for every path below:

`/Users/loop/Projects/get-me-this/.superpowers/worktrees/phase4-recovery`

Actuals and diffs are in:

`.superpowers/sdd/get-me-this-phase4-controller/artifacts/run-36762403450/`

### Actual candidate files

| Filename | PNG dimensions | SHA-256 |
| --- | --- | --- |
| `wishlist-empty-mobile-actual.png` | 390 x 957 | `be8d3592c4f572f82119fe270531919c95bd1308f30abc303fc323d954d1d01b` |
| `wishlist-empty-desktop-actual.png` | 1440 x 1000 | `b9ee33574fea4c272478d08fdb4adbf93948b82b8045bb8f732cc0fa4313bf70` |
| `wishlist-filled-mobile-actual.png` | 390 x 2475 | `b2227bf31903c4362ac4e65298d3cc6ee67cd84d75c35d38245f910b50146988` |
| `wishlist-filled-desktop-actual.png` | 1440 x 1374 | `d27d79f90da3c09a7d4520bbcce12692c13db7b781f01a217777d2ab5d92b730` |

### Old-production-baseline diff files

| Filename | PNG dimensions | SHA-256 |
| --- | --- | --- |
| `wishlist-empty-mobile-diff.png` | 390 x 957 | `40d95d1393b41a02f5e7e2f0d7f0006b07562cfd4a3ee0f340a6ec8cfd7238cb` |
| `wishlist-empty-desktop-diff.png` | 1440 x 1000 | `1897af107718fcb71880184909df67c8ccc1746fb620a691b3692ffb28862ba4` |
| `wishlist-filled-mobile-diff.png` | 390 x 2475 | `c03d33689e06e06364fddbc142063593db2bc79dadbba96c8a102b35e4d7faae` |
| `wishlist-filled-desktop-diff.png` | 1440 x 1374 | `8c9d49f6f897c78c1c9990bfbe83d97e517e587679981c1c7ad97787aa505bbd` |

### Immutable V18 references

All four reference filenames are relative to `docs/design-reference/baselines/v18/`.

| Filename | PNG dimensions | SHA-256 |
| --- | --- | --- |
| `wishlist-empty--mobile-390x844.png` | 390 x 1166 | `f594fbff645bd837e286210d421511f2cbe5037022c0844840e8047d3c60896f` |
| `wishlist-empty--desktop-1440x1000.png` | 1440 x 1000 | `80357939feb29152f96327a7f111796533acb0b1f4cab8a429040b2f47364a06` |
| `wishlist-filled--mobile-390x844.png` | 390 x 3246 | `13400a9a946547cb06a371b8d296d03bec4e31d478f80fffe5d7a140e76a1adb` |
| `wishlist-filled--desktop-1440x1000.png` | 1440 x 1588 | `207bd416c0d2ba7043db268a6d3d123e78c258886844a637d0e5235dc9c494db` |

## CI, accessibility, and operational limitations

The controller reports 233 passing database assertions and 52 passing browser tests, including geometry, keyboard, and axe, for this source run; four comparisons with the old production screenshot baselines failed. I verified the local controller ledger records those results, but did not independently fetch GitHub or rerun the tests. The source behavior has a separate independent review. Neither those passing tests nor this image review means the complete CI run is green, and this report supplies no merge approval.

The screenshots show readable text, clear visible actions, distinct card boundaries, and no obvious clipping at the two captured widths. They do not establish numerical contrast, keyboard focus, screen-reader semantics, actual target bounds, live navigation, authorization, persistence, or dynamic image-failure handling. The reported keyboard/axe checks remain separate evidence. Loading, error, interim-add, account-menu-open, alternate-name, and intermediate-viewport states are outside this twelve-image review.

This reviewer changed only this report. No application source, index, baseline, manifest, branch, external service, or provider state was changed. Approval must be reconsidered for any later image hashes. The next visual gate is the narrow desktop header repair and direct review of its real captures.
