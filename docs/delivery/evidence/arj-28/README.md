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

## Executed proof

- `pnpm verify`: passed (format check, lint, typecheck, 57 Vitest files/464 tests, and production build).
- `pnpm lint`: passed with one pre-existing unused-type warning in `src/analytics/event-definitions.test.ts`.
- `pnpm exec vitest run tests/helpers/no-provider-env.test.ts`: passed; explicitly empty variables remain empty despite synthetic dotenv values.
- `bash scripts/e2e-no-provider-actions.sh`: passed production build plus create/edit/delete Server Action submissions on desktop and mobile. All Supabase, service-role, Mailpit, and test-control values were explicitly empty; all actions returned to `/auth` and were non-cacheable.
- `pnpm test:db`: local Supabase was unavailable (`127.0.0.1:54322` refused the connection). No container was installed or started; CI database proof is pending.
- `tests/e2e/wishlist-items-local.spec.ts` and its explicit `scripts/e2e-local-stack.sh` entry are committed but not executed locally because the Supabase stack is unavailable.

## Acceptance map and remaining gates

1. Fresh complete-profile gates are exercised in action unit tests; signed-out current-build create/edit/delete requests are covered by the passing no-provider browser proof. Incomplete and expired-session browser cases remain pending the local-stack CI run.
2. The manual create/edit/delete full-stack spec asserts exact owner/wishlist and price-pair persistence. Cross-user real-action and direct authenticated RLS API attempts remain pending stack coverage; migration pgTAP was not run locally.
3. Pure tests cover decimal syntax, bigint maximum and overflow, 0/2/3/4 precisions, Unicode bounds, blank values, desires, safe URL cases, opaque stored codes, and zero remote fetch calls.
4. Migration pgTAP covers the submission-key schema/grants/RLS. Simultaneous create, key conflict followed by deletion, hard-delete/retry, and multi-session races remain open; a deterministic Task 6A transport controller/observer has not been implemented.
5. Persistence tests cover pair-conditioned updates, preservation/clearing of all four conversion fields, stale pair retry, and definite/uncertain delete outcomes. Real conversion and lost-response stack interleavings remain pending.
6. A new item uses the branded placeholder and source URLs are never server-fetched in unit tests. Server transport observation and existing remote-image browser evidence remain pending Task 6A/CI.
7. Form controls have persistent labels, associated field errors, opaque-price actions, keyboard-operable confirmation with focus restoration, and minimum touch-height classes. Axe runs, matched 390×844 and 1440×1000 screenshot candidates, and independent product/design review are still required. No visual baselines were changed.
8. Local `pnpm verify` is green. Exact-head CI, preview deployment, and final independent code/security review remain gates. No pull request was opened by this task.

No staging migration was applied. The migration is forward-only; dropping its index and column during rollback would discard live submission keys and remove duplicate-live-row protection. Prefer a forward correction after deployment. No Magic Patterns mock data or editor artifacts were added; application wishlist writes use the authenticated public-key client, not the service-role client.

## Changed paths

Binding artifacts:

- `docs/delivery/issues/005c-manual-wishlist-item-crud.md`
- `docs/delivery/evidence/arj-28/reviews/arj28-implementation-plan.md`

Schema and database proof:

- `supabase/migrations/20260930210754_wishlist_item_submission_id.sql`
- `supabase/tests/005a_wishlist_rls.test.sql`

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

Test infrastructure:

- `tests/helpers/no-provider-env.test.ts`
- `tests/e2e/wishlist-items-no-provider.spec.ts`
- `tests/e2e/wishlist-items-local.spec.ts`
- `scripts/e2e-no-provider-actions.sh`
- `scripts/e2e-local-stack.sh`
- `.github/workflows/ci.yml`
