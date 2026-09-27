# 003 — Implement the static fidelity pilot

## Outcome

Prove that the production stack can reproduce the approved product experience before authentication or backend complexity is introduced.

## Scope

- Responsive landing page.
- Static email-entry, OTP verification, magic-link confirmation/recovery, and onboarding screens.
- Production routing and accessible interactions using deterministic fixtures.
- Visual-regression coverage at 390px and 1440px.

## Non-goals

- No Supabase authentication or session behavior.
- No email sending.
- No analytics events that imply a real completed user action.
- No wishlist or group backend.

## Acceptance criteria

- Each implemented route matches the approved hierarchy, layout, responsive intent, and interaction states in the frozen reference.
- All controls are keyboard reachable, visibly focused, labelled, and usable with reduced motion.
- Loading, invalid/expired, and recovery states represented in the design are reachable through deterministic fixtures.
- No Magic Patterns scaffolding, mock data inside UI components, editor attributes, or prototype routing remains.
- Visual tests pass at both approved viewports with reviewed baselines.
- `pnpm verify` passes and a Railway preview is manually exercised.

## Required proof

- Side-by-side links for live prototype, frozen reference, and Railway preview at matching viewports and states.
- Automated accessibility and visual-test output.
- Human approval of the pilot before identity implementation begins.

## Analytics

No production events. The analytics adapter may be exercised only through its test sink.

