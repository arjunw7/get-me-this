# PR 78 CI repair evidence — 2026-10-04

Base head: `02b1557745f2571788bda840c8b45ac536ac2e28`.
Original run: https://github.com/arjunw7/get-me-this/actions/runs/37153322868

## Changes

- Reviewed public schema inventory now compares the exact 15 table names, including `public_wishlist_item_reactions`, rather than accepting an equal count with potentially different tables.
- Group Date selectors are exact, distinguishing the input from the accessible Choose date button.
- Enter on a closed currency combobox opens its choices instead of implicitly submitting the form. The real-form unit regression failed before the fix (one unexpected submit) and passes after it. Choosing the default never submits; explicit Save still does.
- Browser currency helper opens and selects an explicit option. The extraction helper no longer presses Enter when no currency was requested. Manual CRUD also checks default-INR keyboard confirmation leaves the unsaved form open.
- Newly exposed invitation logout selector now distinguishes Log out from Close log out confirmation. Broker lease, session preservation, and retry assertions are unchanged.
- Empty own wishlists retain the inline Add an item CTA and suppress its duplicate mobile floating button, clearing the heading. Filled wishlists retain their floating button; desktop sidebar action remains. Responsive navigation tests cover both states and navigation to item entry.
- Decorative tape is positioned at the start of its card and translated upward, avoiding CSS-column fragment duplication. Three-column masonry is preserved; the larger inline-block experiment was discarded.

No database schema, permissions, secrets, or prototype mock data changed. No golden image or pixel threshold was changed. Live port 3100 remained running and its build output was not touched.

## Validation

- Final isolated `pnpm verify`: PASS; 153 test files, 1,502 tests, format, lint, types, production build.
- Full existing local DB suite: 26 files / 1,811 executed assertions; six failures remain in tests that assume only seed records. `groups-008c`: two total-assignment assertions see 10 existing assignments; `groups`: three total-group assertions see 17 groups instead of one fixture; `smoke`: sees 157 auth users instead of one and then its unscoped scalar subquery aborts. Four planned smoke assertions are not reached. No review records were removed and no reset was run.
- Focused corrected table inventory + public wishlist access/privacy suite: **84/84 assertions passed**, rolled back.
- Standard stack-gated sweep: **236 passed, 6 skipped, 10 failed** (9.4 minutes). The failures were four wishlist screenshot expectations, four mobile create-group screenshot expectations, and two newly exposed Log out selector collisions. After correcting the selector and finalizing presentation, the focused harness passed **32/32** across both viewports (1.3 minutes): navigation, invitation/broker/Origin checks, manual CRUD/owner-denial/delete rejection, and four before/after capture journeys.
- A direct focused-run attempt lacked the required transport controller; its failures were infrastructure guards, not additional product defects. It was interrupted, its isolated server closed, and replaced by the successful complete-harness run above.
- All original Date/currency setup failures are cleared. Visual comparisons remain strict; no screenshot threshold was relaxed.

## Visual review

Matched final-build before/after fixture captures and hashes are committed alongside this README. See [comparison gallery](comparison.html) and [capture manifest](captures.json).
Both render the same Ada profile, zero/four deterministic products, closed overlays, initial scroll, desktop 1440×1000 and mobile 390×844 at DPR 1.

The existing four wishlist goldens predate the approved persistent navigation, saved Vibe, Share/Edit profile controls, image-corner edit controls and reaction summaries. Use exact-head **Linux CI** candidates for any replacement and obtain human design approval first. Local images are macOS review evidence, not Linux golden candidates. No cached pinned Linux Playwright image was available. Wishlist files to review:

- `tests/visual/baselines/wishlist-empty-desktop.png`
- `tests/visual/baselines/wishlist-empty-mobile.png`
- `tests/visual/baselines/wishlist-filled-desktop.png`
- `tests/visual/baselines/wishlist-filled-mobile.png`

The four additional local mobile create-group mismatches are **not proposed baseline updates**: empty, validation, pending, and conflict. Their baselines explicitly come from Ubuntu 24.04 and have known cross-platform line wrapping/native-control variance. The desktop versions all passed. Recheck them on Linux CI after the selector fix before classifying a regression; preserve their images and existing 3% threshold.

## Acceptance evidence

- [x] Prevent premature currency Enter submission: red/green real-form regression and passing browser manual CRUD keyboard assertion.
- [x] Restore exact group form selectors and reviewed schema inventory: passing group workflows and 84 focused database assertions.
- [x] Remove obvious mobile empty-state overlap without losing entry/navigation: desktop/mobile navigation checks and matched screenshots.
- [x] Keep decorative tape attached without changing three-column masonry: matched final desktop/mobile captures.
- [x] Preserve authorization, broker semantics, and source data: negative browser checks retained; no schema/RLS changes, reset, review-data cleanup, or new mock products in application code.
- [ ] Exact-head clean-stack/Linux CI confirmation and human approval for any required wishlist golden replacement remain pending.

No migration or rollback is needed for these application/test-only fixes. Reverting this scoped commit restores the prior behavior. The PR Railway status was green at base head; no new preview was published by this subtask.

## Explicit owner approval — 4 October 2026

The owner reviewed the consolidated six-image old/candidate/diff gallery and explicitly approved replacement. This PR replaces only the four wishlist goldens using the reviewed Ubuntu CI captures from source `6745d52`; subsequent `4881266` changed only the database race harness. [Approval and exact hashes](baseline-approval.json). No tolerances or group-creation goldens changed. The two landing candidates are applied separately in stacked PR79.

Current pre-replacement CI on `4881266`:26database files/1815assertions and all8configured race harnesses passed; fullstack242passed/6skipped, with only the four now-approved wishlist comparisons failing. All8group-creation screenshot states passed. New exact-head CI must complete after replacement before merge.
