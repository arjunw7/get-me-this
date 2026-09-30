# ARJ-28 implementation evidence

## Binding and implementation commits

- Binding brief and reviewed plan: `c81a40a961d20fd1290eed6e81a43eb99cdac41b`.
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
- `pnpm lint`: passed with one pre-existing unused-type warning in `src/analytics/event-definitions.test.ts`.
- `pnpm exec vitest run tests/helpers/no-provider-env.test.ts`: passed; explicitly empty variables remain empty despite synthetic dotenv values.
- `bash scripts/e2e-no-provider-actions.sh`: passed production build plus create/edit/delete Server Action submissions on desktop and mobile. All Supabase, service-role, Mailpit, and test-control values were explicitly empty; all actions returned to `/auth` and were non-cacheable.
- `pnpm test:db`: local Supabase was unavailable (`127.0.0.1:54322` refused the connection). No container was installed or started; CI database proof is pending.
- `tests/e2e/wishlist-items-local.spec.ts`, `tests/e2e/wishlist-items-races-local.spec.ts`, and `tests/visual/wishlist-items.visual.spec.ts` are explicitly wired into `scripts/e2e-local-stack.sh`; local execution remains unavailable because no Supabase stack is running.
- Exact-head CI run `36784414410` passed pgTAP (242 assertions) but its browser suite reported 54 passed and 8 failed across both viewports: stale empty-form copy assertions, keyboard focus targeting the removed interim link, delete-success navigation not completing after the edit row was removed, and the existing filled-wishlist baseline diff from newly approved edit controls/card height. The owner-count pgTAP regression is corrected in `47f1d79`; the other code/test root causes are corrected in the current unpushed extension. No visual baseline was changed.
- Exact-head run `36788648401` at `366af132662b8dc16984580fbab1109e8e0d9fa3` passed verify, no-provider actions, stack reset, and pgTAP; its browser job had 62 passed and 14 failed. Failures exposed a stale `Back to your wishlist` expectation, duplicate Next route-announcer `role=alert` matches, one-shot transport injections incorrectly waiting for a barrier release, a transient tied-order DOM assertion, and a target-size helper counting native radio widgets instead of their 44px labels. The intended wishlist-filled baseline diff remained unchanged. This failed run is retained as regression evidence; fixes are being validated on the next head.
- Exact-head run `36790495061` at `07f083661c41c56bb30b88b3528ff3452e8803f6` passed verification, no-provider actions, stack reset, and 242 pgTAP assertions; its browser job had 67 passed and 9 failed. The remaining regressions were mobile-only CRUD and response-loss tests that hit the full two-minute timeout, the desktop retryable edit-read assertion receiving the owner-unavailable state instead of the intended injected read failure, duplicate `role=alert` matching the Next route announcer in the candidate spec, and unchanged wishlist-empty/wishlist-filled baseline differences. The candidate collector consequently had no complete viewport/state set. The current focused fix records the same-participant consumed-probe regression, recognizes RSC item-edit requests for one-shot read injection, asserts the recovery link’s rendered 44px target, scopes alert text selectors, and sets bounded page-action/navigation timeouts so future mobile stalls report their exact call site. Existing screenshot baselines remain untouched.
- Exact-head run `36792415929` at `d0e906bbbf961f21b6d86ac936ea8a6080f18db7` passed verification, no-provider actions, stack reset, and 242 pgTAP assertions; its browser job had 69 passed and 7 failed. The mobile manual CRUD and response-loss tests both showed the fixed bottom Save/Cancel bar intercepting pointer events on the Delete item opener; both desktop equivalents passed. The candidate flow passed on desktop but reached its timeout on mobile before evidence export. The focused correction gives the mobile opener reserved scroll space above the fixed bar and bounds candidate page action/navigation waits. The empty baseline differences (173 mobile / 173 desktop pixels) and filled-card geometry changes remain intentional candidates awaiting visual review; no baseline was modified.
- Matched candidate screenshots and their hash manifest have not yet been captured. Independent code/security and visual review are open.

## Acceptance map and remaining gates

1. Fresh complete-profile gates are exercised in action unit tests; signed-out current-build create/edit/delete requests are covered by the passing no-provider browser proof. Incomplete and expired-session browser cases remain pending the local-stack CI run.
2. The manual create/edit/delete full-stack spec asserts exact owner/wishlist and price-pair persistence. A new spec replays a captured current-build edit action under a second complete profile and verifies no owner row changes. pgTAP covers cross-user RLS; exact-head stack re-execution is pending.
3. Pure tests cover decimal syntax, bigint maximum and overflow, 0/2/3/4 precisions, Unicode bounds, blank values, desires, safe URL cases, opaque stored codes, and zero remote fetch calls.
4. Migration pgTAP covers the submission-key schema/grants/RLS. A deterministic controller now coordinates same-key duplicate, conflict-then-missing, distinct-key position ties, pair-update races, and delete/read transport failures; exact-head local-stack execution is pending.
5. Persistence tests cover pair-conditioned updates, preservation/clearing of all four conversion fields, stale pair retry, and definite/uncertain delete outcomes. New stack schedules assert that current conversion values survive a raced edit and lost delete responses remain uncertain until owner-read reconciliation.
6. A new item uses the branded placeholder and source URLs are never server-fetched in unit tests. The local-only transport wrapper records only safe classifications/digests and rejects unobserved control failures. Exact-head observer proof remains pending.
7. Form controls have persistent labels, associated field errors, opaque-price actions, keyboard-operable confirmation with focus restoration, and minimum touch-height classes. A new two-viewport spec captures the nine approved states and per-state axe/target-size evidence; CI candidate collection, hashes, and independent product/design review remain pending. No visual baselines were changed.
8. Local `pnpm verify` is green. The no-provider action CI job passed on prior head `88111c6`; exact-head CI on the current extension, Railway preview, and final independent code/security review remain gates. The draft PR is #31.

No staging migration was applied. The migration is forward-only; dropping its index and column during rollback would discard live submission keys and remove duplicate-live-row protection. Prefer a forward correction after deployment. No Magic Patterns mock data or editor artifacts were added; application wishlist writes use the authenticated public-key client, not the service-role client.

## Changed paths

Binding artifacts:

- `docs/delivery/issues/005c-manual-wishlist-item-crud.md`
- `docs/delivery/evidence/arj-28/reviews/arj28-implementation-plan.md`

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
- `tests/visual/wishlist-items.visual.spec.ts`
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
