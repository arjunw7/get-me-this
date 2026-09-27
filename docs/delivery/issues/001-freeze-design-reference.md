# 001 — Freeze the approved design reference

## Outcome

Create an immutable, reviewable visual reference for Magic Patterns Version 18 so later pull requests can be compared apple to apple even if the live prototype changes.

## Scope

- Export Version 18 into a reference-only location outside the production import graph.
- Capture approved desktop and mobile screenshots for every route and material state in `docs/design-reference/route-map.md`.
- Record fonts, image sources/licences, viewport, fixture identity, and interaction state.
- Commit approved deterministic assets and screenshots.

## Non-goals

- No production React code.
- No pixel-by-pixel port of generated Magic Patterns code.
- No redesign or new product decisions.

## Acceptance criteria

- Every route/state in the route map has a 390px and 1440px reference or an explicit not-applicable reason.
- Modal, sheet, empty, loading, error, confirmation, and destructive states are included where designed.
- The export is clearly marked reference-only and cannot be imported by production code.
- Remote placeholder images are replaced or documented with a deterministic licensed source.
- A reviewer can reproduce an equivalent screenshot from the recorded fixture and state.

## Required proof

- Link to the live prototype and approved Magic Patterns version.
- Screenshot inventory diff.
- Completed route-map checklist.
- Human design approval recorded in the pull request and Linear issue.

## Analytics

None.

