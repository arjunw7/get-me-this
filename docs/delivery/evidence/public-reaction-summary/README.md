# Public wishlist compact reactions

Approved October 7, 2026: only the actual public wishlist changes to three compact colored glyph/count pairs. Group member wishlists keep their Stamp Counter treatment. This proposal is stacked on wishlist action PR #107, which depends on Stamp Counter PR #106.

## Acceptance evidence

- Compact sparkle, question and heart counts, without a visible total, people names or a modal: `PublicReactionRow` and public view component tests.
- Signed-in visitors retain the three existing choices, confirmed select/switch/remove, full accessible names and count descriptions: component tests and the existing fresh/returning Mailpit public wishlist browser journeys.
- Pending saves disable every choice; failed or mismatched responses preserve confirmed state and show recovery copy: component tests.
- Owners and anonymous visitors receive read-only counts, with an empty summary quiet: component tests and public browser privacy checks.
- Group Stamp Counter UI and all data access remain unchanged: public-only call sites; existing full test suite.

## Verification

The implementation-only `pnpm verify` passed: 184 files / 1,803 tests, production build, formatting, lint, TypeScript and browser worker checks. One existing lint warning remains in `src/wishlist/redraw-section.test.tsx` for unused `_formData`.

The new component test failed before implementation because the component did not yet exist; focused component/view tests passed afterward. Store-label assertions also failed before implementation; all 13 focused public tests passed with the latest labels. Browser evidence is captured using local production builds, synthetic accounts, matching public route/item/selection state and desktop 1440×1000 or mobile 390×844 viewports. Capability URLs are excluded from screenshot content; sharing inputs are masked. No visual baselines are updated.

An earlier PR #107 workflow could not start because of the account billing/spending-limit condition: “The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings”. No billing settings were changed or unavailable jobs rerun. PR #108 subsequently started normally; its initial triage, install/verify, populated-state upgrade and no-provider gate jobs succeeded while stack/database suites were running. Railway previews are not configured in current PR checks.

No schema, migrations, RLS, dependencies, production resources, Magic Patterns mock data or editor artifacts changed. Rollback: revert this proposal. Independent review and human merge approval remain required.

After stacking on final CTA `4843071`, combined `pnpm verify` passed: 185 files / 1,811 tests and production build, with the same single existing lint warning.

The four fresh/returning Mailpit journeys passed on desktop and mobile in 26.5 seconds after stacking onto final CTA `4843071`. They verify explicit reaction after authentication, persistence on reload, switching, removal, no automatic reaction, owner read-only controls, no group membership side effects, no private gifting data, 44px targets and zero Axe violations in the compact reaction row.

## Matched screenshots

Before and after use the same synthetic public wishlist route, item, authoritative selected heart/count state, account and viewport. The before server is CTA PR #107 head `4843071`; this changes no public UI relative to its original base. Tokens never appear in the captured page content. Owner read-only pairs use the same nonzero reaction count.

| State | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | --- | --- | --- | --- |
| Visitor selected heart | [Before](public-reaction-before-mobile.png) | [After](public-reaction-after-mobile.png) | [Before](public-reaction-before-desktop.png) | [After](public-reaction-after-desktop.png) |
| Owner read-only | [Before](public-owner-before-mobile.png) | [After](public-owner-after-mobile.png) | [Before](public-owner-before-desktop.png) | [After](public-owner-after-desktop.png) |

The public store link follows the final approved wording: `Open on <saved retailer> ↗`, otherwise `Open link ↗`, without inferring a website name. Its accessible name also contains the item title and new-tab warning; secure external-link attributes remain. Final browser proof asserts the visible saved-retailer label and URL/target/rel. The first PR #108 CI stack failure was a stale group-copy focus expectation inherited from CTA #107; that test was corrected in the dependency to assert the persistent Copy Cat state, reload behavior and authoritative single copied row. No baseline change was involved.
