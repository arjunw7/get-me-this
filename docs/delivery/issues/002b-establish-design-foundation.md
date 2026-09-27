# 002b — Establish the design foundation

## Outcome

Create the semantic visual and interaction primitives needed to reproduce the frozen V18 experience without coupling production components to the prototype export.

## Scope

- Local font loading and documented fallbacks.
- Semantic color, spacing, radius, typography, elevation, and motion tokens.
- Accessible base layout plus the smallest reusable button, input, link, surface, and focus-treatment primitives needed by the static pilot.
- Reduced-motion behavior and responsive foundations.
- A deterministic component fixture showing supported states.

## Non-goals

- No complete product page or prototype routing.
- No wholesale component library.
- No authentication or data behavior.
- No direct import from the Magic Patterns reference source.

## Acceptance criteria

- Tokens use semantic names rather than route- or color-specific names.
- Interactive primitives support keyboard operation, visible focus, disabled state, error association, and reduced motion as applicable.
- Mobile and desktop component fixtures are deterministic and visually comparable.
- Production source contains no Magic Patterns editor attributes or runtime dependency on the frozen export.
- `pnpm verify` passes.

## Required proof

- Mobile and desktop fixture screenshots.
- Keyboard and reduced-motion verification notes.
- A token-to-V18-reference rationale in the pull request.

## Dependencies

- `002a-scaffold-application-command-surface.md`.

## Analytics, security, and privacy

- Emit no events and collect no data.
- Components must not accept or render unsafe HTML.
