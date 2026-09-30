# ARJ-27 independent rendered-image review

**Verdict: REQUEST_CHANGES**  
**Reviewer:** Codex independent visual-review agent (`/root/arj27_visual_review`)  
**Date:** 2026-09-30  
**Scope:** Recovered 005b empty and filled wishlist candidate images compared directly with the four pinned V18 images. This is a new image review, not a ratification of the earlier OCR/programmatic review.

## Method and limits

The `view_image` tool **successfully rendered all eight PNGs as image inputs**. I visually inspected the corresponding mobile/desktop and empty/filled pairs, including the complete full-page populated captures, at original image detail. The verdict below comes from seeing the images; OCR was not used as a substitute. I also read the complete 005b brief, `DESIGN.md`, and the ARJ-27 evidence README. Targeted source reads corroborated the visibly different heading sizes and the header layout.

Both sets use full-page captures at the named viewport widths; their PNG heights therefore differ. The wishlist visual specs explicitly request full-page capture. Different page heights from the accepted omissions and fixture content are not themselves failures. This review does not establish live interaction, keyboard, accessibility-test, authorization, persistence, or CI behavior. No application code, baseline, or manifest was changed.

## Blocking finding

### R1 : Desktop profile divider intersects the taste line (P2)

**Affected:** Both `wishlist-empty-desktop.png` and `wishlist-filled-desktop.png`.

The candidate profile card's coral/white divider at approximately **y=237** runs through the upper part of “currently in my tiny-luxuries era” (approximately x=306–575). The taste line straddles the two backgrounds, leaving a dark horizontal rule across the text. This visibly interrupts its readability and makes the header look misaligned. In both pinned desktop references, the equivalent taste line sits completely below the band divider at approximately y=153, with clear separation; the name may occupy the band, but the body text does not cross its edge.

This is not explained by omitted controls, coral instead of marigold, the shorter fixture name, or replacing the avatar image with initials. It is a geometry defect in the shared header. The implementation retains the negative top margin and bottom-aligned row while changing the avatar and display-type dimensions (`src/wishlist/wishlist-view.tsx:88` onward).

**Required:** Adjust the profile header's desktop layout so the entire taste line clears the divider, preserving the intended overlap of the avatar and the name/taste/count hierarchy. Recapture both desktop states and review the new hashes. Check both mobile states after the shared component changes.

## Additional typography difference requiring resolution

### R2 : Mobile display hierarchy is reduced beyond the accepted omissions (P2)

The candidate mobile profile name uses 24px display type where V18 uses 30px; the desktop profile name uses 32px where V18 uses 36px. Most visibly, the **empty-state mobile heading** uses 24px and becomes one compact line, whereas the pinned V18 heading is 30px and wraps into two prominent lines. This changes the empty-state hierarchy and panel rhythm even after accounting for removed navigation and actions. The face, weight character, and body-copy styling otherwise remain close.

Source corroboration: `src/wishlist/wishlist-view.tsx:99` and `src/wishlist/wishlist-card.tsx:172` use `text-display-sm` / `sm:text-display-md`; `app/tokens.css` defines those as 24px / 32px. The pinned `pages/Shelfie.tsx` uses `text-3xl` / `sm:text-4xl`, and `components/shelfie/ShelfieEmpty.tsx` uses `text-3xl` at both sizes.

**Required:** Restore the reference's display hierarchy using an appropriately scoped semantic style, or obtain and record a specific design acceptance for this typography change. The existing accepted-differences list does not cover it. Do not change shared tokens globally merely to fix this one surface.

## Pair-by-pair observations

| Pair | Observed result |
| --- | --- |
| Empty mobile | Warm off-white canvas, outlined profile card, coral band, dotted doodle, initials disc, dashed white empty panel, stacked cream cards, tape, faint decorative question mark, readable body copy, and coral CTA are all present. Content fits the horizontal gutter without clipping. The smaller empty heading is R2. The shorter header and absence of fixed navigation/actions are consistent with the slice's shell/feature omissions. |
| Empty desktop | The centered content retains approximately the reference content width, rounded outlines, offset shadows, and generous empty-panel spacing. Empty art, centered copy, and CTA form a clear hierarchy. The smaller CTA width follows the approved shorter label and omitted icon. The profile text/divider collision is R1. |
| Filled mobile | Four cards form a single readable column with large image or cream placeholder fields, overlaid desire chips, bold titles, retailer/price rows, and note bubbles only where notes exist. The two placeholder titles wrap and remain legible; no broken-image icon or blank browser fallback is visible. Card radii, outlines, shadows, tape, and image aspect variation reproduce the reference treatment. The smaller profile-name typography is R2. |
| Filled desktop | Three columns preserve the reference's varied card heights, slight rotations, image-heavy composition, and fourth card placement in the right column. Both placeholder fields are deliberate and readable. Price strings retain currency codes and linked retailers are visibly underlined. The profile collision is R1. A detached tape mark is visible near the page bottom, but the pinned reference contains the same artifact; this review does not introduce it as a new divergence. |

## Accepted differences applied to this review

I did not count the following as failures: coral default profile band; initials-avatar treatment; different deterministic product fixtures and vendored imagery; the stronger cream-placeholder title tone documented by round 3; code-suffixed original amounts without conversions; “Add an item” replacing “Add from a link” and its icon; omitted Share/Edit profile controls, group visibility/theme copy, reactions, Reorder/privacy toolbar, and populated add affordance. The brief explicitly requires the existing `/home` wordmark/account header shell, so the absence of the prototype desktop sidebar and mobile bottom navigation is treated as a shell exception under the brief's precedence. The evidence README currently names only the mobile navigation omission; it would be clearer to name the desktop sidebar omission too.

The candidate placeholder treatment is visibly stronger than the faint V18 art and is appropriate for readable item titles. Screenshot inspection alone is not a numerical contrast certification; the README's axe/contrast claims were not independently rerun here.

## Exact reviewed candidate files

Paths below are relative to `/private/tmp/get-me-this-codex-phase4`.

| Candidate | PNG dimensions | SHA-256 |
| --- | --- | --- |
| `tests/visual/baselines/wishlist-empty-mobile.png` | 390 × 939 | `c9834fab031e633e60151460af297c40453bd033f061332427fbc12e17742d2f` |
| `tests/visual/baselines/wishlist-empty-desktop.png` | 1440 × 1000 | `2e3c1f0fbbbf67be5b58f6b2c2e893dbc57afef89287eb9b79bcb9f0f4731c12` |
| `tests/visual/baselines/wishlist-filled-mobile.png` | 390 × 2470 | `88580e758d3d9f8beb9f9a3583150d6d7607c2d296775030eae3500934f88be9` |
| `tests/visual/baselines/wishlist-filled-desktop.png` | 1440 × 1355 | `be66a367736aa85c8aae54a8f640e1f3023807caf8f5d94b37bee8ff5e50ebba` |

## Exact pinned references viewed

| Reference | PNG dimensions | SHA-256 |
| --- | --- | --- |
| `docs/design-reference/baselines/v18/wishlist-empty--mobile-390x844.png` | 390 × 1166 | `f594fbff645bd837e286210d421511f2cbe5037022c0844840e8047d3c60896f` |
| `docs/design-reference/baselines/v18/wishlist-empty--desktop-1440x1000.png` | 1440 × 1000 | `80357939feb29152f96327a7f111796533acb0b1f4cab8a429040b2f47364a06` |
| `docs/design-reference/baselines/v18/wishlist-filled--mobile-390x844.png` | 390 × 3246 | `13400a9a946547cb06a371b8d296d03bec4e31d478f80fffe5d7a140e76a1adb` |
| `docs/design-reference/baselines/v18/wishlist-filled--desktop-1440x1000.png` | 1440 × 1588 | `207bd416c0d2ba7043db268a6d3d123e78c258886844a637d0e5235dc9c494db` |

**No visual SIGNOFF is granted to these hashes.** The prior approval metadata should not be represented as this review's approval. Re-review the resulting candidate images after R1 and R2 are resolved; any later approval applies only to the hashes actually viewed at that time.

