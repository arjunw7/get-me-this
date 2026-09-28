# ARJ-18 (003b) evidence — static auth and onboarding routes

Branch `fidelity/003b-auth-onboarding` (off `main` at the ARJ-16 merge).
No visual baselines are committed on this branch: the 18 candidate PNGs
live only in the pull-request review (presented as attachments from the
untracked `tests/visual/baselines/` artifacts) and land in
`tests/visual/baselines/` only after owner approval, together with the
regenerated `BASELINE-MANIFEST.json` (owner-filled) — exactly the 003a
workflow.

## Contents

- `verify-pass.txt` — full `pnpm verify` transcript on the final tree
  (format, lint, typecheck, 177/177 unit tests, production build). One
  pre-existing lint warning (`src/analytics/event-definitions.test.ts:11`,
  unused import) is unrelated and untouched.
- `unit-tests.txt` — 177/177 passing, including the new auth suites.
- `e2e-axe.txt` — 43 passed / 1 pre-existing skip: full flow traversal by
  click-through, OTP keyboard contract, axe scans of every route/state at
  both viewports.
- `reference-captures/` — the six pinned V18 reference images for the
  three states with no distinct frozen screenshot (confirm success,
  confirm recovery, onboarding validation), rendered from the immutable
  artifact `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b` (version v18) at
  390×844 and 1440×1000 with the same capture contract as
  `docs/design-reference/baselines/v18/` (see `CAPTURE-NOTES.md` and
  `SHA256SUMS`). These are reference evidence, not production baselines.
- `asset-provenance.md` — the rights conclusion for this slice's imagery.

## Designed decisions recorded from the owner

1. The route map's "avatar selected" onboarding state is out of scope for
   the pilot (owner decision, 2026-09-27): the frozen V18 onboarding
   screen has no avatar control and none was invented. The route map is
   unchanged.
2. The frozen `confirm-valid`/`confirm-expired` PNGs are byte-identical
   (both captured the loading frame). The success and recovery states are
   implemented from the V18 source and reviewed against the pinned
   reference captures above (owner decision, 2026-09-27).
3. The confirm fixtures render their final states directly from the URL;
   the loading frame is a separate `?state=loading` fixture with no
   baseline family (owner clarification rev 2, 2026-09-27).
4. **Plan amendment (owner-approved, 2026-09-28):** the addendum's
   "controlled-time loading→final transition test" is deferred to Phase 3,
   where a real link-check exists and the transition has a genuine
   outcome. The 003b confirm screen has no transition: final states render
   directly from their URL fixtures, the loading frame is provably stable
   across controlled time (fake-timer test), and no fake sign-in timer was
   added to satisfy the earlier wording.
5. **Honesty review (owner findings, 2026-09-28):** V18's
   delivery-promising copy — "We'll send you a fresh one" (verify expired
   panel), "Send a new code" (verify expired primary and elapsed resend
   link), and "Send a new email" / "We'll send a new one" (confirm
   recovery) — is replaced with honest wording ("Start a new code", "Try
   again with a new code", "In the real product, …"), because the preview
   only resets a fixture or navigates and never delivers. Regression tests
   forbid the promise patterns in every rendered state, and the preview
   notice stays in the same frame.
6. Visual captures freeze JavaScript timers with Playwright's documented
   "pause time" mechanism — `page.clock.pauseAt()` at a fixed instant
   before navigation (install() alone does not hold timers; a review
   finding, 2026-09-28, corrected). A regression check proves the
   countdown still displays its deterministic initial value after more
   than one second of real elapsed time; the ticking behavior stays
   covered by fake-timer unit tests and e2e, never by screenshots.

## Pending owner approvals in this pull request

- The 18 candidate baselines (9 families × 2 viewports), packaged for
  review outside this repository.
- The "You're in." + preview-notice copy combination on the confirm
  success frame — explicitly unapproved until seen in candidate review.
