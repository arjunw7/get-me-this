# ARJ-17 (003c) evidence — reviewed production visual baselines

Audit and evidence task only: no product code changes, no new screens, no
frozen-reference changes, no regenerated baselines, no approval fields
filled by an agent. Branch `audit/arj-17-visual-baselines`, cut from
`main` at the post-ARJ-18 merge.

## Gate verification (ARJ-18 / PR #11)

- PR #11 ("003b — Static auth and onboarding routes (ARJ-18)") state:
  MERGED into `main` at 2026-09-28T06:20:35Z, merge commit
  `b512dd0f2dca938e963205eed71cc9c633aba0db` — the current `main` HEAD.
- ARJ-18 state: Done (completed 2026-09-28).
- Approved baselines committed in `d9518b8` ("test: commit approved ARJ-18
  visual baselines") with the owner-filled approval:
  `BASELINE-MANIFEST.json` → `approvedBy: arjunw7@gmail.com`,
  `approvedDate: 2026-09-28`.
- Copy decision recorded: honesty amendments replacing V18
  delivery-promising wording (see ARJ-18 evidence, finding 5), plus the
  owner-approved "You're in." + preview-notice confirm-success copy.

## Route-map audit — 12 expected families × 2 viewports

Every family in the audit scope has exactly one committed PNG per
viewport (24 files, no extras, none missing):

| Family (baseline prefix) | Mobile 390×844 | Desktop 1440×1000 | Manifest entry | SHA-256 |
| --- | --- | --- | --- | --- |
| `fixture` (design-foundation fixture) | ✅ | ✅ | ✅ | ✅ match |
| `landing` | ✅ | ✅ | ✅ | ✅ match |
| `auth-home` | ✅ | ✅ | ✅ | ✅ match |
| `auth-wishlist` | ✅ | ✅ | ✅ | ✅ match |
| `auth-create-group` | ✅ | ✅ | ✅ | ✅ match |
| `verify-default` | ✅ | ✅ | ✅ | ✅ match |
| `verify-error` | ✅ | ✅ | ✅ | ✅ match |
| `verify-expired` | ✅ | ✅ | ✅ | ✅ match |
| `confirm-valid` | ✅ | ✅ | ✅ | ✅ match |
| `confirm-expired` | ✅ | ✅ | ✅ | ✅ match |
| `onboarding` | ✅ | ✅ | ✅ | ✅ match |
| `onboarding-validation` | ✅ | ✅ | ✅ | ✅ match |

## Reference matrix — all 12 families × both viewports

Reference conventions:

- **Frozen V18 reference:** images under `docs/design-reference/baselines/v18/`, rendered from the pinned Magic Patterns artifact `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b` (version v18), NOT from the mutable live deployment.
- **Pinned artifact reference:** images under `docs/delivery/evidence/arj-18/reference-captures/` — later captures of the same pinned artifact for the three states with no distinct frozen screenshot. Reference evidence, not production baselines.
- **Production baseline:** images under `tests/visual/baselines/`.
- **Railway preview:** every route cell links its full PR #12 Railway preview URL: https://get-me-this-get-me-this-pr-12.up.railway.app.
- **Live prototype:** the mutable live Magic Patterns deployment (`https://project-agile-otter-357.magicpatterns.app/`) is **supplementary only**. The pinned V18 reference (frozen screenshots and pinned artifact captures) is authoritative; where the live deployment and the pinned V18 reference differ, the V18 reference wins until the owner approves a newer version.
- **Matched capture state (all rows):** full-page capture (scroll top, entire page), no open UI beyond the rendered fixture state (no sheets, menus, dialogs, focus, or hover), animations disabled, caret hidden, device pixel ratio 1, page clock paused at `2026-01-01T00:00:00Z` before navigation (countdown pinned at its deterministic initial value 0:30). The prototype and production routes carry the same deterministic fixture via the shared `?intent=`/`?state=` convention.

| Family | Route/fixture (production = prototype) | Frozen V18 or pinned reference | Production baseline | Matched state |
| --- | --- | --- | --- | --- |
| `landing` | [`/`](https://get-me-this-get-me-this-pr-12.up.railway.app/) | [mobile](docs/design-reference/baselines/v18/landing--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/landing--desktop-1440x1000.png) | [mobile](tests/visual/baselines/landing-mobile.png) · [desktop](tests/visual/baselines/landing-desktop.png) | Full page, top, no open UI |
| `auth-home` | [`/auth?intent=home`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth?intent=home) | [mobile](docs/design-reference/baselines/v18/auth-home--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/auth-home--desktop-1440x1000.png) | [mobile](tests/visual/baselines/auth-home-mobile.png) · [desktop](tests/visual/baselines/auth-home-desktop.png) | Email entry default, empty field, no focus/caret |
| `auth-wishlist` | [`/auth?intent=wishlist`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth?intent=wishlist) | [mobile](docs/design-reference/baselines/v18/auth-wishlist--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/auth-wishlist--desktop-1440x1000.png) | [mobile](tests/visual/baselines/auth-wishlist-mobile.png) · [desktop](tests/visual/baselines/auth-wishlist-desktop.png) | Intent helper copy rendered |
| `auth-create-group` | [`/auth?intent=create-group`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth?intent=create-group) | [mobile](docs/design-reference/baselines/v18/auth-create-group--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/auth-create-group--desktop-1440x1000.png) | [mobile](tests/visual/baselines/auth-create-group-mobile.png) · [desktop](tests/visual/baselines/auth-create-group-desktop.png) | Intent helper copy rendered |
| `verify-default` | [`/auth/verify`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth/verify) | [mobile](docs/design-reference/baselines/v18/verify-default--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/verify-default--desktop-1440x1000.png) | [mobile](tests/visual/baselines/verify-default-mobile.png) · [desktop](tests/visual/baselines/verify-default-desktop.png) | Clock paused; countdown pinned at 0:30 |
| `verify-error` | [`/auth/verify?state=error`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth/verify?state=error) | [mobile](docs/design-reference/baselines/v18/verify-error--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/verify-error--desktop-1440x1000.png) | [mobile](tests/visual/baselines/verify-error-mobile.png) · [desktop](tests/visual/baselines/verify-error-desktop.png) | Inline `role="alert"` error visible; clock paused at 0:30 |
| `verify-expired` | [`/auth/verify?state=expired`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth/verify?state=expired) | [mobile](docs/design-reference/baselines/v18/verify-expired--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/verify-expired--desktop-1440x1000.png) | [mobile](tests/visual/baselines/verify-expired-mobile.png) · [desktop](tests/visual/baselines/verify-expired-desktop.png) | Expired panel + honest resend copy; clock paused at 0:30 |
| `confirm-valid` (final) | [`/auth/confirm?state=valid`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth/confirm?state=valid) | Pinned artifact (frozen `confirm-valid--*.png` is the loading frame): [mobile](docs/delivery/evidence/arj-18/reference-captures/confirm-valid-final--mobile-390x844.png) · [desktop](docs/delivery/evidence/arj-18/reference-captures/confirm-valid-final--desktop-1440x1000.png) | [mobile](tests/visual/baselines/confirm-valid-mobile.png) · [desktop](tests/visual/baselines/confirm-valid-desktop.png) | Final state rendered directly from fixture, no transition |
| `confirm-expired` (final) | [`/auth/confirm?state=expired`](https://get-me-this-get-me-this-pr-12.up.railway.app/auth/confirm?state=expired) | Pinned artifact (frozen `confirm-expired--*.png` is the loading frame): [mobile](docs/delivery/evidence/arj-18/reference-captures/confirm-expired-final--mobile-390x844.png) · [desktop](docs/delivery/evidence/arj-18/reference-captures/confirm-expired-final--desktop-1440x1000.png) | [mobile](tests/visual/baselines/confirm-expired-mobile.png) · [desktop](tests/visual/baselines/confirm-expired-desktop.png) | Recovery panel + honest copy rendered directly |
| `onboarding` | [`/onboarding`](https://get-me-this-get-me-this-pr-12.up.railway.app/onboarding) | [mobile](docs/design-reference/baselines/v18/onboarding--mobile-390x844.png) · [desktop](docs/design-reference/baselines/v18/onboarding--desktop-1440x1000.png) | [mobile](tests/visual/baselines/onboarding-mobile.png) · [desktop](tests/visual/baselines/onboarding-desktop.png) | Empty form; no avatar control (deferred state — see exceptions) |
| `onboarding-validation` | [`/onboarding?state=validation`](https://get-me-this-get-me-this-pr-12.up.railway.app/onboarding?state=validation) | Pinned artifact: [mobile](docs/delivery/evidence/arj-18/reference-captures/onboarding-validation--mobile-390x844.png) · [desktop](docs/delivery/evidence/arj-18/reference-captures/onboarding-validation--desktop-1440x1000.png) | [mobile](tests/visual/baselines/onboarding-validation-mobile.png) · [desktop](tests/visual/baselines/onboarding-validation-desktop.png) | Required-field error visible |
### Design-foundation fixture — separate explanation

The `fixture` family has **no V18 prototype screen** and therefore no frozen reference image. It is the repository's own token-and-primitive fixture (ARJ-9) at [`/design-foundation`](https://get-me-this-get-me-this-pr-12.up.railway.app/design-foundation): a static page rendering the semantic tokens from `app/tokens.css` and the `src/ui` primitives against the deterministic mock data embedded in the pinned V18 artifact (`docs/design-reference/magic-patterns-v18/`), as required by the route map's "Fixture" definition. Its committed baselines pin the production rendering of those tokens and primitives so that later slices inherit a stable comparison point; the review target is the pinned V18 artifact's styling (tokens/typography), not a prototype screenshot. It is captured with the identical contract as every other family (full page, both viewports, animations disabled, caret hidden).

Production baselines: [mobile](tests/visual/baselines/fixture-mobile.png) · [desktop](tests/visual/baselines/fixture-desktop.png).

## Agreed exceptions — explicit, not silently counted

1. **Deferred avatar-selection state.** The route map's onboarding
   "avatar selected" state remains deferred by the owner's recorded
   decision (2026-09-27, ARJ-18 evidence, decision 1): the frozen V18
   onboarding screen has no avatar control. There is NO approved
   final-state baseline for an avatar-selected state; `onboarding` and
   `onboarding-validation` cover only the display-name/taste-line
   screen. The route map is unedited.
2. **Confirm loading frame.** The frozen `confirm-valid`/`confirm-expired`
   PNGs are byte-identical captures of the loading frame (ARJ-18
   evidence, decision 2). They are NOT final-state baselines: the final
   success and recovery states were implemented from the V18 source and
   reviewed against the pinned reference captures in
   `docs/delivery/evidence/arj-18/reference-captures/`. The loading
   frame has its own `?state=loading` fixture with no baseline family
   (decision 3), and the controlled-time loading→final transition test
   is deferred to Phase 3 (decision 4).

## Evidence pack — V18 reference vs. Railway preview

Per the route map's apple-to-apple procedure, at matched route, state,
viewport, fixture, scroll position (full-page), and open UI state:

- **Frozen screenshots** (`docs/design-reference/baselines/v18/`, V18
  artifact `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b`): exist for `landing`,
  `auth-home`, `auth-wishlist`, `auth-create-group`, `verify-default`,
  `verify-error`, `verify-expired`, `confirm-valid`,
  `confirm-expired`, and `onboarding` — the immutable comparison
  targets. `confirm-valid`/`confirm-expired` are the loading-frame
  exception above.
- **Later pinned artifact captures** (`docs/delivery/evidence/arj-18/
  reference-captures/`, same artifact and capture contract): the three
  states with no distinct frozen screenshot — confirm success
  (`confirm-valid` final state), confirm recovery (`confirm-expired`
  final state), and onboarding validation. These are reference
  evidence, not production baselines.
- **Railway preview:** PR #11's Railway preview was the reviewed build;
  `main` at `b512dd0` contains the same tree (no commits after the
  merge), so the review comparison remains valid for this audit. The
  production implementation reproduces each state via the same
  deterministic URL fixtures as the prototype (`?intent=`, `?state=`),
  so the live prototype (`https://project-agile-otter-357.magicpatterns.app/`),
  the frozen/pinned references, and the preview were compared at
  390×844 and 1440×1000 with animations disabled and the caret hidden.
- **Approved differences:** the honesty copy amendments listed above
  (verified/expired/confirm recovery wording) and production
  accessibility requirements (`role="alert"`/`aria-live` inline
  messaging instead of any toast) are accepted, owner-approved
  differences, documented in ARJ-18 evidence findings 5 and the PR
  review.

## Final checks on post-ARJ-18 `main`

Exact commit: `b512dd0f2dca938e963205eed71cc9c633aba0db`
(branch `audit/arj-17-visual-baselines`, identical tree to `main`).

- `pnpm verify`: **pass** (exit 0) — format, lint, typecheck, unit
  tests, production build.
- `pnpm test:visual`: **26 passed / 0 failed** (9.1s) — the 24 baseline
  comparisons across all 12 families at both viewports plus the 2
  paused-clock countdown-hold regression checks. No visual divergence
  found; no baseline was updated.

No missing or divergent state was found, so no baseline update was
requested or made.

## Pilot approval

The explicit static-pilot approval that gates Phase 3 identity work is
recorded on the ARJ-7 tracker after the owner's decision; the decision
is pending at the time of this audit. No Phase 3 identity work has been
created or started.
