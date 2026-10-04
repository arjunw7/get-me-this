# Navigation loading polish

User acceptance criteria:

- [x] Home loading uses filled skeleton shapes instead of empty white panels; only placeholders pulse, and navigation remains readable and usable.
- [x] Groups has a route-level loading boundary so Next can prefetch loading feedback and transition before group data completes.
- [x] Wishlist retains its existing content skeleton and uses the same usable navigation during loading.
- [x] Reduced motion remains governed by the existing global motion rule.

Proof: `src/home/route-loading.test.tsx`, the existing wishlist route-state tests, and desktop/mobile app-navigation browser tests. `pnpm verify` passes (1,595 tests).

Screenshots use the production loading components, the same production CSS and vendored fonts, static animation, and matching 1440×1000 / 390×844 viewports. `before-home-*` renders the original Home loading component from main; `after-home-*` and `after-groups-*` render the changed components. Groups had no previous loading component; its prior behavior retained the preceding route while awaiting data. These captures review the loading state; the approved V18 baseline has no matching route-loading state, so no mismatched prototype comparison is claimed and no visual baseline was updated.

No schema changes or migration are needed. Rollback reverts this change. No Magic Patterns mock data, scaffolding, or editor artifacts were introduced.

Final browser result: 6/6 navigation and profile-parity tests passed across both approved viewports. The Groups navigation assertion requires the URL to change within one second.

Database result: 27 suites pass; the existing `supabase/tests/smoke.sql` fixture assumes exactly one auth user and fails at its scalar email subquery because the current seed contains multiple users (28 files, 1,877 assertions attempted). No schema or database writes are added. Local configuration overrides are not committed.
