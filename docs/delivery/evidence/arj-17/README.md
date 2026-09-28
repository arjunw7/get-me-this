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

All 24 committed PNGs in `tests/visual/baselines/` were re-hashed with
SHA-256 on the audited tree; every hash matches
`BASELINE-MANIFEST.json` byte-for-byte. The approval fields are
owner-filled; no agent modified them. Out-of-scope route-map families
(`invite-*`, home/wishlist/groups/gifting/account) are Phase 3+ and
correctly absent.

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
