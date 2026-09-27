# Magic Patterns Version 18 export

This directory is an immutable, reference-only export of the approved Magic Patterns design.

## Identity

- Editor: `6mqikx9odrcmu2eke7g6bs`
- Approved version: `v18`
- Artifact ID: `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b`
- Version title: `Manual Edit`
- Exported: 2026-09-27
- Export method: Magic Patterns immutable artifact API

The Magic Patterns editor has since advanced to Versions 19 and 20. Its active artifact and the live deployment are therefore useful for comparison, but they are not the frozen V18 authority.

## Boundary

`source/` is a design specimen, not production code. It contains prototype routing, mock contexts, hard-coded data, remote images, and Vite/Tailwind scaffolding. Production code must not import anything from this directory.

The source is retained to document:

- Layout and component hierarchy.
- Responsive intent.
- Copy and terminology.
- Mock-state shapes.
- Designed interactions and visual states.
- Design tokens and asset references.

The production implementation must use the repository's architecture, security model, data layer, router, components, accessibility patterns, and semantic tokens.

## Export completeness

The artifact export contains 67 source files. `canvas.manifest.js` and `useScreenInit.js` exist in the newer active artifact but are absent from V18, which confirms that later editor plumbing was not folded into this snapshot.

See `artifact-manifest.json` for the complete inventory.

## Rendering

The baselines in `../baselines/v18/` were rendered from this exact source using a disposable Vite/Tailwind harness under `/private/tmp`. The harness and its installed packages are not part of the repository or production dependency graph.
