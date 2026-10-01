# ARJ-28 implementation evidence

## Binding and implementation commits

- Binding brief and plan revision: `ce053ee6cd3b83573836a6150d3169b852b89b1a`; implementation base is `ada6db0ff1ee498514f46c013d570a46823e1cb4`.
- Live submission-key migration and pgTAP: `5c44e18cf106fb4999623c729b386045de5c8b7e`.
- Exact input, currency metadata, and opaque display: `24ba0355304cdfe39e206d9a242da6321a3a039d`.
- Owner-scoped persistence: `7b87cdc4b025d8e0c7305e5a3d74b1eb97e805c7`.
- Actions, protected routes, manual form, and list entry points: `b09f784b9ea6caee986478e96f40f3e1ecf6012a`.
- Fail-closed read-error correction: `3e8a0dd80738d006e0db8a25501c15bf2585f8d6`.
- Delete confirmation and reconciliation: `b6f298918b44f3191ee73425f1e4fb6a82f4b44f`.
- Verified upstream PR #29 merge included on the branch: `7eb9a78`.
- pgTAP owner-row count correction after adding live-key coverage: `47f1d7925541fad97b434452d96dec56e46468d6`.

## Executed proof

- `pnpm verify`: passed before Task 6A/7 extension (format check, lint, typecheck, 57 Vitest files/464 tests, and production build).
- Current local `pnpm verify`: passed (format check, lint, typecheck, 59 Vitest files/474 tests, and production build). Lint has one unrelated pre-existing warning in `src/analytics/event-definitions.test.ts`.
- Focused Task 6A controller, sanitized transport observer, pinned Supabase `AbortError`, candidate collector, and action regressions: 17 tests passed.
- Current correction revision: 59 Vitest files and 479 tests passed using the bundled Node 24.19 runtime; TypeScript checking passed; ESLint passed with its existing unused-type warning; changed-file Prettier checks, shell syntax, and both JSON manifests passed; local production build passed. The runtime is below the package's required Node 24.21, so these direct-tool local checks are supporting evidence, not a substitute for exact-head `pnpm verify`.
- `pnpm lint`: passed with one pre-existing unused-type warning in `src/analytics/event-definitions.test.ts`.
- `pnpm exec vitest run tests/helpers/no-provider-env.test.ts`: passed; explicitly empty variables remain empty despite synthetic dotenv values.
- `bash scripts/e2e-no-provider-actions.sh`: passed production build plus create/edit/delete Server Action submissions on desktop and mobile. All Supabase, service-role, Mailpit, and test-control values were explicitly empty; all actions returned to `/auth` and were non-cacheable.
- `pnpm test:db`: local Supabase was unavailable (`127.0.0.1:54322` refused the connection). No container was installed or started; CI database proof is pending.
- `tests/e2e/wishlist-items-local.spec.ts`, `tests/e2e/wishlist-items-races-local.spec.ts`, and `tests/visual/wishlist-items.visual.spec.ts` are explicitly wired into `scripts/e2e-local-stack.sh`; local execution remains unavailable because no Supabase stack is running.
- Exact-head CI run `36784414410` passed pgTAP (242 assertions) but its browser suite reported 54 passed and 8 failed across both viewports: stale empty-form copy assertions, keyboard focus targeting the removed interim link, delete-success navigation not completing after the edit row was removed, and the existing filled-wishlist baseline diff from newly approved edit controls/card height. The owner-count pgTAP regression is corrected in `47f1d79`; the other code/test root causes are corrected in the current unpushed extension. No visual baseline was changed.
- Exact-head run `36788648401` at `366af132662b8dc16984580fbab1109e8e0d9fa3` passed verify, no-provider actions, stack reset, and pgTAP; its browser job had 62 passed and 14 failed. Failures exposed a stale `Back to your wishlist` expectation, duplicate Next route-announcer `role=alert` matches, one-shot transport injections incorrectly waiting for a barrier release, a transient tied-order DOM assertion, and a target-size helper counting native radio widgets instead of their 44px labels. The intended wishlist-filled baseline diff remained unchanged. This failed run is retained as regression evidence; fixes are being validated on the next head.
- Exact-head run `36790495061` at `07f083661c41c56bb30b88b3528ff3452e8803f6` passed verification, no-provider actions, stack reset, and 242 pgTAP assertions; its browser job had 67 passed and 9 failed. The remaining regressions were mobile-only CRUD and response-loss tests that hit the full two-minute timeout, the desktop retryable edit-read assertion receiving the owner-unavailable state instead of the intended injected read failure, duplicate `role=alert` matching the Next route announcer in the candidate spec, and unchanged wishlist-empty/wishlist-filled baseline differences. The candidate collector consequently had no complete viewport/state set. The current focused fix records the same-participant consumed-probe regression, recognizes RSC item-edit requests for one-shot read injection, asserts the recovery link’s rendered 44px target, scopes alert text selectors, and sets bounded page-action/navigation timeouts so future mobile stalls report their exact call site. Existing screenshot baselines remain untouched.
- Exact-head run `36792415929` at `d0e906bbbf961f21b6d86ac936ea8a6080f18db7` passed verification, no-provider actions, stack reset, and 242 pgTAP assertions; its browser job had 69 passed and 7 failed. The mobile manual CRUD and response-loss tests both showed the fixed bottom Save/Cancel bar intercepting pointer events on the Delete item opener; both desktop equivalents passed. The candidate flow passed on desktop but reached its timeout on mobile before evidence export. The focused correction gives the mobile opener reserved scroll space above the fixed bar and bounds candidate page action/navigation waits. The empty baseline differences (173 mobile / 173 desktop pixels) and filled-card geometry changes remain intentional candidates awaiting visual review; no baseline was modified.
- Exact-head run `36794452226` at PR head `3e3562d21f45ccdac2eb7f499958b48ac2eb5aa0` passed verification, no-provider actions, stack reset, and 242 pgTAP assertions; the stack browser job had 72 passed and only the four existing empty/filled wishlist baseline diffs. Its candidate test and upload steps passed, but the exported manual-clean and post-delete success captures were loading skeletons because the test captured before the destination UI rendered. That packet was rejected for visual review; no baseline was modified.
- Exact-head run `36796826965` at PR head `c6056324836a9c06b85034f52648911e2a4a50af` passed verify, no-provider actions, stack reset, pgTAP (242 assertions), and 72 browser tests; the four existing empty/filled wishlist baseline comparisons differed. Its [18-image candidate packet](https://github.com/arjunw7/get-me-this/actions/runs/36796826965/artifacts/11134466010) is approved by independent AI reviewer `/root/arj28_final_visual_review`, who inspected original-resolution images across nine states/two viewports. The packet manifest SHA-256 is `25c87ae6dfa5cec565dd460b904f1bea71d91143d5e138d5b6903dbc4d26440a`; each candidate digest is recorded in the source manifest at `/tmp/arj28-run-36796826965/arj28-responsive-candidates/manifest.json`. Desktop and mobile axe evidence report zero violations across the nine states. This approval is tied to `c605632` and does not cover the changed-payload conflict UI now being revised.
- The only approved wishlist baseline replacements from run `36796826965` are now adopted and hash-verified: empty mobile `d6be52365b2de8001f53eb91e6545ea82ed8564e2f8eef513d5e413ea5e79ba0`, empty desktop `92eb523e95288ad878af6713ab88f1cac6fe97357645c7535a9d294367536b2e`, filled mobile `ef1ad35f37172faf9b74246537d2187564d769cedb3d58c9df22badba72fd043`, filled desktop `ee61134abad81c2d2010c26b6a82149731e92dd3d00981dbbf531200b64c18c4`. Reference/diff images were not copied or approved. Review identity, route/state/viewport map, and hashes are recorded in the review manifest; the conflict-state candidate must be recaptured and reviewed after its UI correction.
- The current correction revision is not yet covered by exact-head CI. It adds current-build tests for incomplete and expired create/edit/delete actions with zero mutation, same-key hard-delete/reinsert, genuine PostgreSQL delete rejection via a disposable local-only trigger, concurrent deletes, browser-to-Next committed-response loss, and failed reconciliation-read followed by successful retry. Do not describe these cases as proven until the exact-head stack suite passes.
- Independent code/security review and the fresh formal planning review remain open. No staging migration has been applied.

## Acceptance map and remaining gates

1. Fresh complete-profile gates are exercised in action unit tests; signed-out current-build create/edit/delete requests are covered by no-provider browser proof. Exact current-build incomplete-profile and expired-session mutation checks across create/edit/delete remain open.
2. The manual create/edit/delete full-stack spec asserts owner/wishlist and price-pair persistence. A captured edit action replayed under a second complete profile and pgTAP cross-user RLS assertions have passed in earlier exact-head CI. Re-run these with the corrected exact head.
3. Pure tests cover decimal syntax, bigint maximum and overflow, 0/2/3/4 precisions, Unicode bounds, blank values, desires, safe URL cases, opaque stored codes, and zero remote fetch calls.
4. Migration pgTAP covers submission-key schema/grants/RLS. Existing deterministic schedules cover same-key concurrency, conflict-then-missing, distinct-key ties, pair-update races, and PostgREST-to-app delete response loss. Same-key reinsert after hard delete and two concurrent deletes still need explicit current-build proof.
5. Persistence tests cover pair-conditioned updates, conversion tuple preservation/clearing, stale-pair retry, and uncertain outcomes. The current correction adds top-level PostgREST status handling with SQLSTATE validation; real SQL rejection, browser-to-Next response loss, and failed-reconciliation-read then successful retry remain unproven until exact-head stack execution.
6. A new item uses the branded placeholder and source URLs are never server-fetched in unit tests. The local-only transport wrapper records only safe classifications/digests and rejects unobserved control failures; exact-head observer proof passed.
7. Form controls have persistent labels, associated field errors, opaque-price actions, keyboard-operable confirmation with focus restoration, and minimum touch-height classes. Nine-state two-viewport candidates and zero-violation axe evidence were approved at `c605632`; the conflict candidate needs a fresh capture/review because its copy and recovery links changed. Only the four specifically hashed wishlist-empty/filled actuals are approved for baseline replacement.
8. `pnpm verify` and no-provider actions passed on prior exact heads. Re-run exact-head verification after the pending fixes. Railway preview and independent code/security review remain gates. PR #31 is still a draft.

No staging migration was applied. The migration is forward-only; dropping its index and column during rollback would discard live submission keys and remove duplicate-live-row protection. Prefer a forward correction after deployment. No Magic Patterns mock data or editor artifacts were added; application wishlist writes use the authenticated public-key client, not the service-role client.

## Changed paths

Binding artifacts:

- `docs/delivery/issues/005c-manual-wishlist-item-crud.md`
- `docs/delivery/evidence/arj-28/reviews/arj28-implementation-plan.md`
- `docs/delivery/evidence/arj-28/reviews/arj28-visual-review.md`
- `docs/delivery/evidence/arj-28/reviews/arj28-visual-review-manifest.json`

Schema and database proof:

- `supabase/migrations/20260930210754_wishlist_item_submission_id.sql`
- `supabase/tests/wishlist.sql`

Application and tests:

- `app/wishlist/page.tsx`
- `app/wishlist/items/new/page.tsx`
- `app/wishlist/items/[itemId]/edit/page.tsx`
- `app/test-support/wishlist-action-reference/page.tsx`
- `src/auth/proxy-policy.ts`
- `src/auth/proxy-policy.test.ts`
- `src/auth/proxy.test.ts`
- `src/wishlist/action-reference-fixture.tsx`
- `src/wishlist/currency-metadata.ts`
- `src/wishlist/display.ts`
- `src/wishlist/display.test.ts`
- `src/wishlist/item-input.ts`
- `src/wishlist/item-input.test.ts`
- `src/wishlist/item-write.ts`
- `src/wishlist/item-write.test.ts`
- `src/wishlist/item-actions.ts`
- `src/wishlist/item-actions.test.ts`
- `src/wishlist/item-drafts.ts`
- `src/wishlist/item-form.tsx`
- `src/wishlist/item-form.test.tsx`
- `src/wishlist/delete-dialog.tsx`
- `src/wishlist/delete-dialog.test.tsx`
- `src/wishlist/delete-error-boundary.tsx`
- `src/wishlist/wishlist-card.tsx`
- `src/wishlist/wishlist-card.test.tsx`
- `src/wishlist/wishlist-view.tsx`
- `src/wishlist/wishlist-view.test.tsx`
- `src/wishlist/test-barrier.ts`
- `instrumentation.ts`
- `src/arj28-candidate-collector.test.ts`

Test infrastructure:

- `tests/helpers/no-provider-env.test.ts`
- `tests/e2e/wishlist-items-no-provider.spec.ts`
- `tests/e2e/wishlist-items-local.spec.ts`
- `tests/e2e/wishlist-items-races-local.spec.ts`
- `tests/fixtures/arj28-delete-rejection-function.sql`
- `tests/fixtures/arj28-delete-rejection-trigger.sql`
- `tests/visual/wishlist-items.visual.spec.ts`
- `tests/visual/baselines/BASELINE-MANIFEST.json`
- `tests/visual/baselines/wishlist-empty-desktop.png`
- `tests/visual/baselines/wishlist-empty-mobile.png`
- `tests/visual/baselines/wishlist-filled-desktop.png`
- `tests/visual/baselines/wishlist-filled-mobile.png`
- `tests/helpers/wishlist-control-client.ts`
- `tests/helpers/wishlist-test-control.mjs`
- `tests/helpers/wishlist-test-control.d.mts`
- `tests/helpers/wishlist-test-control.test.ts`
- `tests/helpers/wishlist-test-participant.mjs`
- `scripts/e2e-no-provider-actions.sh`
- `scripts/e2e-local-stack.sh`
- `scripts/collect-arj28-candidates.mjs`
- `scripts/collect-arj28-candidates.d.mts`
- `.github/workflows/ci.yml`
- `package.json`
