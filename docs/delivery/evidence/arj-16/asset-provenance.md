# ARJ-16 asset provenance and rights review

Every image rendered by the static fidelity landing slice (003a). Compiled
2026-09-27 for the product owner's rights review. The Magic Patterns CDN
path and visual characteristics are treated as **clues, not proof**; the
rights basis below rests on the documented Magic Patterns ownership terms
and the artifact chain, with the owner's review as the confirming gate.

## Method and limitations

- Bytes fetched once from the recorded source URL and vendored
  byte-identical into `public/assets/landing/` (SHA-256 recorded per asset).
- The implementing agent **could not visually inspect the images** in this
  environment (no image-input capability). Visual inspection therefore
  devolves to the product owner, who created and reviewed the V18
  prototype; copies of all seven assets are attached to the draft pull
  request for that review. No image is treated as cleared on inspection
  the agent did not perform.
- Metadata inspection (`file`, JFIF structure): all seven files are
  baseline JPEG, 928x1152, JFIF 1.01, no EXIF/XMP segments, no embedded
  software or authorship markers.

## Rights chain

1. **Source tool**: Magic Patterns (North Park Labs, Inc.), the approved
   design tool for this project (DESIGN.md; artifact
   `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b`, version label `v18`, exported
   via the Magic Patterns immutable artifact API — see
   `docs/design-reference/magic-patterns-v18/README.md` and
   `artifact-manifest.json`).
2. **Terms of Service** (Magic Patterns, last updated 2025-04-01,
   https://www.magicpatterns.com/docs/documentation/legal/terms, section
   "Ownership"): "all content, including but not limited to designs, code,
   and user interfaces, generated through the use of the Services ('User
   Generated Content') shall be the sole and exclusive property of the user
   who created it. Magic Patterns shall not claim any ownership rights over
   such User Generated Content. Magic Patterns hereby assigns all of its
   right, title and interest to your User Generated Content to you, subject
   to your compliance with these Terms."
3. **Application**: the images were generated within the owner's Magic
   Patterns project as part of the approved V18 design. Under the Terms,
   ownership of that generated content vests in the creating user (the
   product owner), who directs its use in this repository's product.
   Corroborating clues (not the basis): the CDN path
   `cdn.magicpatterns.com/patterns/generated-images/`, uniform 928x1152
   pipeline dimensions across all seven assets, and absence of embedded
   authorship metadata.

## Per-asset record

| Asset | Used in | Source URL (UUID) | SHA-256 (first 16) | Status |
|---|---|---|---|---|
| `a-matcha.jpg` | Hero collage card, auth collage | `b9cf499a-a106-4370-b988-9f0494586410.jpg` | `0689782d7c3a0dec` | **Owner-approved for production use, 2026-09-27** |
| `k-kettle.jpg` | Hero collage card, group demo tile | `c95a8163-5b1a-4c93-9062-83e11cbc06ab.jpg` | `d1a0087b7560fbf5` | **Owner-approved for production use, 2026-09-27** |
| `z-camera.jpg` | Hero collage card, group demo tile, auth collage | `2aa7cbd5-f5fd-40e8-ac01-1b15a8a939cd.jpg` | `02dd3848a9e125f7` | **Owner-approved for production use, 2026-09-27** |
| `k-vinyl.jpg` | Group demo tile | `45dfaa57-6767-40ff-a34c-f97e4563c212.jpg` | `fadc67bb780c8647` | **Owner-approved for production use, 2026-09-27** |
| `k-bonsai.jpg` | Group demo tile | `b647a4fc-156e-4d7c-a708-060b07d3fe25.jpg` | `e05f561595f8055c` | **Owner-approved for production use, 2026-09-27** |
| `z-claws.jpg` | Group demo tile | `ae6e201a-9b27-482a-a17b-1eac61375046.jpg` | `11e470760e172964` | **Owner-approved for production use, 2026-09-27** |
| `r-cups.jpg` | Group demo tile | `d5330ec6-2a81-43dc-be3c-a0be1353f8c6.jpg` | `23ce11b6a658646f` | **Owner-approved for production use, 2026-09-27** |

Full SHA-256 hashes match `sha256sum public/assets/landing/*.jpg` on the
pull-request head; the bytes are identical to the source fetch.

## Status: rights review concluded — owner-approved, 2026-09-27

These seven images are in production use on this slice: they are committed
on the pull-request branch and served by its public Railway preview and by
any local run. On 2026-09-27 the product owner reviewed the rights
decision checklist (issued after the recorded visual approval of the four
baseline candidate/reference pairs) and answered **"approve all"**, which
is recorded as:

1. **Per-image production-use approval for all seven assets** — explicit
   and separate from the visual approval of the baseline pairs; not
   inferred from it.
2. **Attribution clause accepted as-is** — the Terms' Free Plan clause
   permitting Magic Patterns to append "Built with Magic Patterns"
   attribution to public-facing designs is accepted for this project.
3. **Non-exclusivity accepted** — similar inputs may produce similar
   generated content for other users; ownership is not exclusivity, and
   the owner accepts this.

The decisions were recorded on PR #10 and ARJ-16 at the time they were
made. Any future change to these images (replacement or re-vendor) starts
a new rights review; this approval covers the seven files at the recorded
hashes only.
