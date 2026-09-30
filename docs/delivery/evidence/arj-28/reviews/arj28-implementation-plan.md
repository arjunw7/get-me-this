# 005c Manual Wishlist Item CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a complete-profile wishlist owner durable manual create, edit, and confirmed delete, with exact original money, bounded live-row create replay, and owner-only data access.

**Architecture:** Server Actions call the existing fresh session/profile gate, then a server-only wishlist write module using the authenticated public-key Supabase client and 005a RLS. Pure validation and currency modules share exact decimal-text contracts with the list display; a controlled client form retains drafts and an accessible dialog confirms hard deletion. A single forward migration adds the live-row submission key.

**Tech Stack:** Next.js 16 App Router, strict TypeScript, React `useActionState`, Supabase Auth/PostgREST/Postgres with pgTAP, Vitest/React Testing Library, Playwright, semantic Tailwind tokens. No new dependency.

**Spec:** `.superpowers/sdd/get-me-this-phase4-controller/arj28-binding-brief-draft.md`, transcribed from approved `.superpowers/sdd/get-me-this-phase4-controller/arj28-proposed-brief.md` SHA-256 `6b7888855f9e075030b49184eaaa788db80c4d2c93487ac3fb0b7e0c67b81dc6`.

## Global Constraints

- This is preparation only. Begin implementation after ARJ-27/005b merges and verify the actual 005c base, including `src/wishlist/data.ts` decimal-text select and `src/wishlist/display.ts` exact formatting. Reconcile paths/signatures against that merged commit before the formal plan PR.
- Preserve the full nonnegative Postgres signed `bigint` range, 0 through `9223372036854775807`, as canonical decimal strings; no JavaScript `number` transport or `Number.MAX_SAFE_INTEGER` cap.
- Pin supported currencies to active alphabetic codes with numeric minor digits in SIX ISO 4217 List One dated 2026-09-17; reject `N.A.` and unlisted codes for new/replacement amounts. One table drives validation, prefill, and display.
- Every create, edit, and delete action calls `requireCompleteProfile()` before any item read or write. Use only `createSupabaseServerClient()` in app code and existing owner RLS; service role is local fixture setup/teardown only.
- New manual items set `image_url` and `image_snapshot_path` null and `extraction_status` manual. Edit omits those fields. No extraction, upload, snapshot, remote server fetch, rate lookup, group claim, or new dependency.
- A submission UUID deduplicates only a surviving row for the same owner/key. A delayed retry after hard delete may insert. Never describe this as durable exactly-once or no-resurrection.
- A delete is newly successful only with one returned owner ID. A resolved transport error without affected-row evidence can still mean the DELETE committed; classify it as uncertain and reconcile by a fresh owner-scoped read. A proved SQL rejection is a different result.
- Candidate screenshots may contain named, non-sensitive deterministic fixture titles, URLs, and notes. They and all exported evidence exclude credentials, tokens, real user content, private paths, request bodies, cookies, auth material, and unsanitized provider failures.
- Match V18 manual form geometry and desire choices where state/fixture match; review new compositions independently at 390x844 and 1440x1000. Do not update a visual baseline without actual independent approval tied to screenshot hashes and implementation head. Record an AI reviewer as AI, never as an invented human approver.
- Existing applied migration and frozen route map are immutable. Production/staging resources are out of scope. No local Docker or system installation is required; the CI database job supplies local-stack proof if unavailable on the author host.

## Review Focus

1. A corrected create draft sent with the same key after a lost response must conflict against the live current row and retain the corrected fields. Task 3 tests the persistence result; Task 6 sends the real action.
2. A stored supported amount greater than `Number.MAX_SAFE_INTEGER`, including maximum bigint, must prefill, save unchanged, and display exactly. Tasks 2, 4, and 6 test this.
3. A stored unsupported currency must remain opaque and unchanged after an unrelated edit, with explicit clear/replacement only. Tasks 2, 4, and 6 test this.
4. An incomplete or expired session reaching a valid current-build Server Action must cause zero item mutations. Tasks 4 and 6 test this with before/after rows.
5. A committed delete whose response is lost must not be reported as a newly successful deletion; the UI must reconcile current owner-visible state. Tasks 5 and 6A test both network hops.

## File map and interfaces

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<CLI-generated>_wishlist_item_submission_id.sql` | Forward-only nullable UUID column, partial live-row uniqueness, INSERT-only column grant, documentation. The exact filename is returned by the pinned CLI at implementation. |
| `supabase/tests/wishlist.sql` | Extend 005a pgTAP assertions for 18 INSERT columns, 15 UPDATE columns, non-updatable key, same/different owner uniqueness and RLS. |
| `src/wishlist/currency-metadata.ts` | Frozen active-code to minor-digit table from pinned SIX List One, including quick choices and 0/2/3/4 precisions. |
| `src/wishlist/item-input.ts`, `.test.ts` | Create/edit draft types, closed edit price intent, normalization, URL/amount validation, exact prefill, unsupported stored-pair mode. No I/O. |
| `src/wishlist/display.ts`, `.test.ts`, `src/wishlist/wishlist-card.tsx` | Share metadata, exact supported/opaque legacy display, safe HTTP(S) navigation; retain 005b text reads. |
| `src/wishlist/item-write.ts`, `.test.ts` | Owner-scoped replay, append, create, atomic current-original-pair edit, affected-row delete, definite versus uncertain outcomes. Server only. |
| `src/wishlist/item-actions.ts`, `.test.ts` | `requireCompleteProfile()` first, parse trusted operation/route item ID and closed price intent, discard extra `FormData` keys, return safe action state or exact outcome. |
| `src/wishlist/item-form.tsx`, `.test.tsx` | Controlled create/edit form, field errors, draft retention, new UUID on Start over, photo placeholder, desire radios, responsive action bar. |
| `src/wishlist/delete-dialog.tsx`, `.test.tsx` | Owner-title confirmation, focus/Cancel/Escape, affected-row navigation, definite/uncertain/unavailable outcomes and explicit reconciliation. |
| `src/wishlist/delete-error-boundary.tsx`, `.test.tsx` | Scoped client fallback for a browser-to-Next action response loss: keeps the edit page recoverable and offers a full owner-scoped route read. Auth/framework redirects propagate through Next routing. |
| `app/wishlist/items/new/page.tsx`, `app/wishlist/items/[itemId]/edit/page.tsx` | Gated pages with shared shell; edit load returns data-free unavailable for malformed/foreign/missing ID and a separate generic retryable state after a failed owner read. |
| `app/test-support/wishlist-action-reference/page.tsx`, `src/wishlist/action-reference-fixture.tsx` | Loopback-only, explicitly enabled test fixture renders the actual current-build actions even without Supabase configuration; all actions retain their ordinary auth gates. |
| `src/auth/proxy-policy.ts`, `.test.ts`, `src/auth/proxy.test.ts` | Explicit canonical edit route and no-store envelope. |
| `src/wishlist/wishlist-card.tsx`, `wishlist-view.tsx`, associated tests | Owner edit and populated Add affordances, success notice; no group visibility copy. |
| `tests/e2e/wishlist-items-no-provider.spec.ts`, `tests/e2e/wishlist-items-local.spec.ts`, `tests/e2e/wishlist-items-races-local.spec.ts`, `tests/visual/wishlist-items.visual.spec.ts`, `tests/helpers/no-provider-env.test.ts` | Separate current-build no-provider action proof, synthetic dotenv isolation proof, local-stack CRUD/security, deterministic race and transport proof, two-viewport visual candidates. |
| `instrumentation.ts`, `src/wishlist/test-barrier.ts`, `tests/helpers/wishlist-test-control.mjs`, `tests/helpers/wishlist-test-participant.mjs`, `tests/helpers/wishlist-control-client.ts`, `tests/helpers/wishlist-test-control.test.ts` | Test-only guarded server outbound fetch observer, child-process arrival proof, and per-test named barriers. No app authorization bypass or mocked successful DB write. |
| `src/supabase/server.ts` | Only if the pinned client bypasses global instrumentation, pass the same guarded test-only fetch wrapper through its existing client options; normal public-key behavior remains unchanged. |
| `tests/helpers/local-stack.ts`, `scripts/e2e-local-stack.sh`, `scripts/e2e-no-provider-actions.sh` | Reuse local-only fixture administration; run distinct provider and no-provider test recipes. |
| `scripts/collect-arj28-candidates.mjs`, `src/arj28-candidate-collector.test.ts`, `.github/workflows/ci.yml` | Export allowlisted ARJ-28 candidate PNGs plus hash/head manifest on successful capture and relevant failures; retain old wishlist failure collector. |
| `docs/delivery/evidence/arj-28/README.md` | Acceptance-to-evidence map, screenshot hashes/reviews, migration/rollback, exact-head CI and preview. Create during implementation, after evidence exists. |

### Shared contracts

```ts
type ItemFields = { title: string; sourceUrl: string; retailer: string; amount: string; currency: string; note: string; desireLevel: string };
type CreateDraft = ItemFields & { submissionId: string };
type EditPriceIntent = "preserve" | "clear" | "replace";
type EditDraft = ItemFields & { priceIntent: EditPriceIntent };
type OriginalPair = { original_amount_minor: string | null; original_currency: string | null };
type ValidFields = { title: string; source_url: string | null; retailer: string | null; note: string | null; desire_level: "really_want" | "would_love" | "just_an_idea" };
type ValidItem = ValidFields & OriginalPair;
type ValidatedEdit = { fields: ValidFields; price: { kind: "preserve"; expected: OriginalPair } | { kind: "clear"; expected: OriginalPair } | { kind: "replace"; expected: OriginalPair; replacement: OriginalPair } };
type ItemFieldErrors = Partial<Record<keyof ItemFields | "priceIntent", "required" | "too-long" | "invalid" | "unsupported" | "overflow">>;
type CreateValidation = { ok: true; value: ValidItem } | { ok: false; errors: ItemFieldErrors };
type EditValidation = { ok: true; value: ValidatedEdit } | { ok: false; errors: ItemFieldErrors };
type SaveOutcome = { kind: "saved"; itemId: string } | { kind: "submission-conflict"; savedItemId: string } | { kind: "unavailable" } | { kind: "retry" } | { kind: "write-failure" };
type DeleteOutcome = { kind: "deleted" } | { kind: "unavailable" } | { kind: "definite-rejection" } | { kind: "uncertain" };
type ReconcileOutcome = { kind: "present" } | { kind: "absent" } | { kind: "uncertain" };
type DeleteActionState = { status: "idle" } | { status: DeleteOutcome["kind"] };
type ReconcileActionState = { status: "idle" } | { status: ReconcileOutcome["kind"] };
type ItemActionState = { status: "idle" } | { status: "error"; draft: CreateDraft | EditDraft; errors: ItemFieldErrors } | { status: "submission-conflict"; draft: CreateDraft; savedItemId: string } | { status: "unavailable"; draft: CreateDraft | EditDraft } | { status: "write-failure"; draft: CreateDraft | EditDraft };
```

The create action returns `{status:"error", draft, errors}` for validation, `{status:"submission-conflict", draft, savedItemId}` for changed replay, `{status:"unavailable", draft}` for missing/foreign, or `{status:"write-failure", draft}` for provider/retry failures. Create/edit success uses `revalidatePath("/wishlist")` and a fixed redirect to a fresh list with a closed success marker. Delete success instead returns `{status:"deleted"}` to the dialog; the client navigates only after that result. Auth/onboarding redirects from `requireCompleteProfile()` propagate as framework redirects and are never caught as delete transport errors. The delete action accepts only the route-bound ID. Create accepts the seven named fields plus its UUID. Edit accepts those fields plus the closed `priceIntent` value; posted owner, parent, row ID, opaque price, conversion, image, sort, status, and submission-key changes are ignored.

For an opaque stored original pair, `priceIntent="preserve"` is the initial edit mode. The server loads the owner row after the fresh profile gate, checks that its current pair is actually opaque, validates the five non-price fields, and derives `expected` solely from that row. It does not validate or write posted amount/currency in preserve mode. `clear` requires an empty amount and yields a null pair; `replace` requires a nonempty amount and a supported currency, validated exactly. Supported stored pairs initially use `replace` with exact prefill; an empty pair initially uses `clear`. For supported or empty initial pairs, editing amount to blank selects `clear`, and entering a nonblank amount selects `replace`; currency remains available for a nonblank replacement. Opaque `preserve` never switches modes from an amount keystroke: only its explicit Clear or Replace control changes intent. A missing, invalid, or tampered intent returns a `priceIntent` field error with the complete raw draft, never a default clear. Persistence re-reads the owner row, compares it with the server-derived expected pair, then uses the current pair as an atomic update predicate; a changed pair returns retry. The server computes the target original pair independently of the intent label and compares it to the current pair. Even `clear` on an already null/null pair is unchanged and omits all four conversion columns. A failed clear or replacement preserves entered fields and selected intent for correction.

The test fixtures for snippets below are a valid create draft `{ title:"Lamp", sourceUrl:"", retailer:"", amount:"", currency:"INR", note:"", desireLevel:"would_love", submissionId:"00000000-0000-4000-8000-000000000003" }`, its normalized item `{ title:"Lamp", source_url:null, retailer:null, note:null, desire_level:"would_love", original_amount_minor:null, original_currency:null }`, and UUIDs `ownerId="00000000-0000-4000-8000-000000000001"`, `savedId="00000000-0000-4000-8000-000000000002"`, `key="00000000-0000-4000-8000-000000000003"`. Define those constants in each owning test file, not in application code.

## Task 0: Rebase gate and precise contract audit

**Files:** Read only: `AGENTS.md`, approved proposal, 005a/005b briefs, `src/wishlist/data.ts`, `display.ts`, migration, stack runner, route policy.

**Interfaces:** Consumes merged 005b main commit; produces a recorded exact base SHA and source-interface map for Tasks 1–7.

- [ ] Verify 005b/ARJ-27 merge and identify the exact main SHA: `git fetch origin main` then `git rev-parse origin/main` and `git log -1 --format='%H %s' origin/main`. Do not start coding on the current dirty ARJ-27 worktree.
- [ ] Read the actual merged `src/wishlist/data.ts` and `display.ts`; assert that `original_amount_minor::text` selects a string and `formatMoneyMinor` performs string/integer formatting. Record deviations in a new reviewed plan revision; no silent approximation.
- [ ] Record the actual migration filename ordering, `pnpm` scripts, and the current `scripts/e2e-local-stack.sh` explicit list. Obtain formal binding-brief and planning review against this exact base before implementation.

## Task 1: Live-row submission key migration

**Files:** Create the CLI-generated `supabase/migrations/<timestamp>_wishlist_item_submission_id.sql`; modify `supabase/tests/wishlist.sql` only. Do not edit 005a migration.

**Interfaces:** Produces nullable `wishlist_items.client_submission_id uuid`, unique live `(owner_id, client_submission_id)`, authenticated INSERT grant only. Task 3 relies on Postgres SQLSTATE `23505` for duplicate owner/key.

- [ ] Add failing pgTAP assertions to the existing suite and increase its `plan()` count by the exact number added. The critical assertions are:

```sql
select has_column('public', 'wishlist_items', 'client_submission_id', 'submission key exists');
select is((select count(*)::int from information_schema.role_column_grants where grantee='authenticated' and table_schema='public' and table_name='wishlist_items' and privilege_type='INSERT'), 18, 'exactly 18 INSERT columns');
select is((select count(*)::int from information_schema.role_column_grants where grantee='authenticated' and table_schema='public' and table_name='wishlist_items' and privilege_type='UPDATE'), 15, 'exactly 15 UPDATE columns');
select ok(has_column_privilege('authenticated','public.wishlist_items','client_submission_id','INSERT') and not has_column_privilege('authenticated','public.wishlist_items','client_submission_id','UPDATE'), 'submission key is INSERT only');
select has_index('public','wishlist_items','wishlist_items_owner_submission_live_key','owner/key uniqueness index exists');
```

Add transaction-isolated `set_config('request.jwt.claim.sub', ...)` cases using the suite's `uid_a`/`uid_b` fixtures: same owner/key duplicate gives `23505`, different owner/same key inserts, own SELECT sees only own key, foreign update/delete remains denied. Assert null keys remain allowed on older rows. Update the existing 17-column message as well as expected count.
- [ ] Run `pnpm test:db`; expected RED because column/index/grant are absent. If local Docker is unavailable, record that precise check as pending CI instead of installing it.
- [ ] Discover the pinned CLI contract with `pnpm exec supabase migration --help` and `pnpm exec supabase migration new --help`. Then run `pnpm exec supabase migration new wishlist_item_submission_id` once, record the actual returned path, and verify its generated timestamp sorts after every migration on the actual merged base. Do not use an invented filename or generate this file during the preparation review.
- [ ] Implement only:

```sql
alter table public.wishlist_items add column client_submission_id uuid;
comment on column public.wishlist_items.client_submission_id is 'Owner-scoped live-row manual create key; hard deletion removes its replay protection.';
create unique index wishlist_items_owner_submission_live_key
  on public.wishlist_items (owner_id, client_submission_id)
  where client_submission_id is not null;
grant insert (client_submission_id) on public.wishlist_items to authenticated;
```

- [ ] Run `pnpm test:db` locally if available; otherwise use the CI `database` job after PR creation. Expected GREEN for all existing and new pgTAP assertions. Commit migration and pgTAP change as one independently reviewable deliverable.

## Task 2: Exact input and display contract

**Files:** Create `src/wishlist/currency-metadata.ts`, `item-input.ts`, `item-input.test.ts`; modify `display.ts`, `display.test.ts`, `wishlist-card.tsx`, its test.

**Interfaces:** `validateCreateDraft(draft:CreateDraft):CreateValidation`; `validateEditDraft(draft:EditDraft,current:OriginalPair):EditValidation`; `prefillOriginal(pair:OriginalPair): { mode:"supported"; amount:string; currency:string } | { mode:"opaque"; rawMinor:string; currency:string } | { mode:"empty" }`; `currencyMinorDigits(code:string):number|null`; `formatMoneyMinor(amountMinor:string,currency:string):string`. Task 3 consumes `ValidItem` for create and `ValidatedEdit` for edit.

- [ ] Freeze the complete active alphabetic/numeric-precision table from the dated SIX List One in source, with source URL/date in a comment. Include all supported codes, not just V18 quick choices or the exceptional-precision list currently in 005b. Do not download metadata at runtime. Tests pin representative `JPY:0`, `INR:2`, `KWD:3`, `CLF:4`, a supported code outside V18 choices, `N.A.` entries excluded, and unknown codes rejected.
- [ ] Write failing pure tests for exact money and normalization. Critical test code:

```ts
const max = "9223372036854775807";
for (const [currency, amount, minor] of [
  ["JPY", max, max],
  ["INR", "92233720368547758.07", max],
  ["KWD", "9223372036854775.807", max],
  ["CLF", "922337203685477.5807", max],
] as const) {
  it(`round-trips ${currency} exactly`, () => {
    const result = validateCreateDraft({ ...validDraft, amount, currency });
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (result.ok) expect(result.value.original_amount_minor).toBe(minor);
    expect(prefillOriginal({ original_amount_minor: minor, original_currency: currency }))
      .toEqual({ mode: "supported", amount, currency });
    expect(formatMoneyMinor(minor, currency)).toBe(`${amount} ${currency}`);
  });
}
expect(validateCreateDraft({ ...validDraft, amount: "92233720368547758.08", currency: "INR" }))
  .toEqual(expect.objectContaining({ ok: false }));
expect(prefillOriginal({ original_amount_minor: "9007199254740993", original_currency: "ZZZ" }))
  .toEqual({ mode: "opaque", rawMinor: "9007199254740993", currency: "ZZZ" });
const opaque = { original_amount_minor: "9007199254740993", original_currency: "ZZZ" };
const preserved = validateEditDraft({ ...validDraft, priceIntent: "preserve", amount: "", currency: "INR" }, opaque);
expect(preserved).toEqual(expect.objectContaining({ ok: true }));
if (preserved.ok) expect(preserved.value.price).toEqual({ kind: "preserve", expected: opaque });
expect(validateEditDraft({ ...validDraft, priceIntent: "replace", amount: "1.2", currency: "ZZZ" }, opaque))
  .toEqual(expect.objectContaining({ ok: false }));
expect(validateEditDraft({ ...validDraft, priceIntent: "bad" as EditPriceIntent }, opaque))
  .toEqual({ ok: false, errors: expect.objectContaining({ priceIntent: "invalid" }) });
const empty: OriginalPair = { original_amount_minor: null, original_currency: null };
expect(validateEditDraft({ ...validDraft, amount: "", currency: "INR", priceIntent: "clear" }, empty))
  .toEqual(expect.objectContaining({ ok: true }));
expect(validateEditDraft({ ...validDraft, amount: "24.99", currency: "INR", priceIntent: "replace" }, empty))
  .toEqual(expect.objectContaining({ ok: true }));
expect(validateEditDraft({ ...validDraft, amount: "", currency: "INR", priceIntent: "clear" },
  { original_amount_minor: "2499", original_currency: "INR" }))
  .toEqual(expect.objectContaining({ ok: true }));
```

Also test zero; empty amount null pair; exponent/negative/separator/symbol/excess precision rejection; all desire levels; every 26 blank code points; non-BMP character bounds using `[...value].length`; optional blank-to-null; raw draft retention; URL malformed, credentials, controls, non-default ports, `localhost`, decimal/octal/hex IPv4, mapped IPv6, public HTTP(S), and zero calls to a spied `fetch`. Test opaque preserve ignores posted raw amount/currency, clear requires empty amount, replacement requires supported nonempty pair, and missing/invalid intent returns a field error without dropping raw draft fields.
- [ ] Run `pnpm exec vitest run src/wishlist/item-input.test.ts src/wishlist/display.test.ts src/wishlist/wishlist-card.test.tsx`; expected RED for the new contract.
- [ ] Implement `BigInt`/string decimal parsing and rendering. Only accept `/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/`, with fractional length at most currency precision; pad the fraction to precision, compare minor value to bigint max, and return `.toString()`. Validate canonical `new URL` host after parsing, rejecting localhost, private/loopback IP literal variants and non-default ports without DNS or `fetch`. For unsupported stored code, display raw minor units plus code and unavailable-price explanation; never call the default-two-decimal formatter on it. Keep supported edit prefill exact.
- [ ] Run the same focused Vitest command; expected GREEN. Review code search for `Number(`, `parseFloat`, `/ 10 **`, `toFixed`, and unsafe bigint JSON transport in the new money path. Commit this focused deliverable.

## Task 3: Owner-scoped persistence and live replay

**Files:** Create `src/wishlist/item-write.ts` and `.test.ts`; consume migration and Task 2 validator.

**Interfaces:** `saveReviewedItem(userId:string,operation:{kind:"create";submissionId:string},value:ValidItem):Promise<SaveOutcome>` or `saveReviewedItem(userId:string,operation:{kind:"edit";itemId:string},value:ValidatedEdit):Promise<SaveOutcome>`; `deleteOwnItem(userId:string,itemId:string):Promise<DeleteOutcome>`; `reconcileOwnItem(userId:string,itemId:string):Promise<ReconcileOutcome>`; `loadOwnItemForEdit(userId:string,itemId:string):Promise<EditItem|null>`; `classifyReplay(current:ValidItem,submitted:ValidItem):"match"|"conflict"`. `EditItem` includes seven editable fields, exact original pair selected as decimal text, and current conversion tuple only for server comparison; foreign data is never returned. Task 4 wraps these after the session gate.

- [ ] Write mock-query tests that assert exact selected columns and filters, not only return codes. Critical replay cases:

```ts
const old: ValidItem = { title: "old", source_url: null, retailer: null, note: null, desire_level: "would_love", original_amount_minor: "9007199254740993", original_currency: "INR" };
const corrected: ValidItem = { ...old, title: "corrected" };
expect(classifyReplay(old, old)).toBe("match");
expect(classifyReplay(old, corrected)).toBe("conflict");
expect(classifyReplay(old, { ...old, original_amount_minor: "9007199254740994" })).toBe("conflict");
```

Add mocked Supabase query-chain tests with exact `.eq("owner_id", ownerId)` assertions and call order: live-key lookup must occur before sort maximum; a changed current payload returns `{ kind:"submission-conflict", savedItemId:savedId }` with zero maximum reads/inserts. A `.delete().select("id")` returning `[]` produces unavailable; one matching ID produces deleted; a known SQLSTATE rejection with nonzero response status produces `definite-rejection`; a `status:0` fetch or response-read failure and an ambiguous 5xx produce `uncertain`. Keep the query mock local to `item-write.test.ts`, using `vi.mock("@/src/supabase/server", ...)`, rather than adding a production repository framework. Add tests for exact live replay, 23505 then matching current row, 23505 then vanished row, same key different owner, distinct keys, hard-delete/retry new insert, max finite sort plus one, unadvanceable maximum, and distinct-key equal-sort stability via the existing read order.
- [ ] Run `pnpm exec vitest run src/wishlist/item-write.test.ts`; expected RED.
- [ ] Implement `createSupabaseServerClient()` use behind a narrow optional test seam, explicit column selects, `.eq("owner_id", userId)` for every item read/update/delete, and derived wishlist ID from the owner's `wishlists` row. For create, lookup the live key before maximum; compare all seven normalized editable fields including exact original pair. Insert only owner/parent, seven validated fields, `manual`, null image fields, finite sort, and key. On `23505`, owner-scope lookup and compare again. Do not treat all database errors as duplicates.
- [ ] For edit, load the current owner row immediately before building the update. Check the server-derived `ValidatedEdit.price.expected` pair against this current row; if different, return retry without a write. Derive `targetPair` as current for `preserve`, `{original_amount_minor:null,original_currency:null}` for `clear`, or the validated replacement for `replace`. Compute `pairChanged` by comparing both exact nullable strings in `targetPair` against the current pair, independent of the intent label. If `pairChanged` is false, omit both original columns and all four conversion columns; this includes `clear` on null/null and replacement with an equal pair. If true, write both target originals and null all four conversion columns in the same update. Make the owner-filtered UPDATE predicate atomically match both current original columns using `.eq("original_amount_minor", currentMinor)` and `.eq("original_currency", currentCurrency)`, or `.is(column, null)` for each null value. Decimal minor text is passed unchanged to PostgREST; never convert it through `Number`. This conditional write, not `updated_at`, is the correctness guard. A concurrent price edit between read and UPDATE yields zero rows; re-read owner scope to distinguish absent from present/retry. A concurrent conversion-only update with the same original pair is preserved on an unchanged-price edit because conversion columns are omitted, and cleared together on changed-price edit. Add a forced null/null read-then-conversion-only competing-write stack test in Task 6A. `updated_at` can be read as raw text for diagnostics but is not a unique version token.
- [ ] For delete, `.delete().eq("owner_id",userId).eq("id",itemId).select("id")`; exactly one returned owner ID means `deleted`, zero rows means `unavailable`. Only a proved PostgreSQL rejected statement with a nonzero HTTP status is `definite-rejection`; connection, fetch, response-body, status-zero, ambiguous 5xx, or unknown errors are `uncertain` because the DELETE may have committed. Never infer row presence from an ambiguous error. `reconcileOwnItem` uses a fresh owner-filtered SELECT and returns `present`, `absent`, or `uncertain` if that read fails, with no title or ownership hint. Do not log provider objects, URL, title, note, or tokens.
- [ ] Run focused Vitest; expected GREEN. Check application imports contain no service-role key and run `pnpm typecheck`. Commit persistence deliverable.

## Task 4: Real Server Actions, routes, and item form

**Files:** Create `src/wishlist/item-actions.ts`, `.test.ts`, `item-form.tsx`, `.test.tsx`, `app/wishlist/items/[itemId]/edit/page.tsx`; modify new page, proxy policy/tests, card/view tests.

**Interfaces:** `createItemAction(previous:ItemActionState,data:FormData):Promise<ItemActionState>`; `editItemAction(itemId:string,previous:ItemActionState,data:FormData):Promise<ItemActionState>`; `deleteItemAction(itemId:string,previous:DeleteActionState,data:FormData):Promise<DeleteActionState>`; `reconcileDeleteAction(itemId:string,previous:ReconcileActionState,data:FormData):Promise<ReconcileActionState>`. Pages bind only their route-derived `itemId` to edit/delete/reconcile. `ItemActionState` carries the complete raw `CreateDraft` or `EditDraft` and safe field errors. No delete success redirect occurs inside the action.

- [ ] Write failing action tests with fresh-gate spies and before/after persistence calls:

```ts
const mocks = vi.hoisted(() => ({ gate: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/src/profile/session", () => ({ requireCompleteProfile: mocks.gate }));
vi.mock("./item-write", () => ({ saveReviewedItem: mocks.save, deleteOwnItem: mocks.remove }));
const data = new FormData();
data.set("title", "Lamp");
data.set("sourceUrl", "");
data.set("retailer", "");
data.set("amount", "");
data.set("currency", "INR");
data.set("note", "");
data.set("desireLevel", "would_love");
data.set("submissionId", "00000000-0000-4000-8000-000000000003");
it("gates create before item I/O", async () => {
  mocks.gate.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/onboarding"));
  await expect(createItemAction({ status: "idle" }, data)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("ignores forged metadata", async () => {
  mocks.gate.mockResolvedValueOnce({ userId: "00000000-0000-4000-8000-000000000001", email: null, profile: { displayName: "Ada", tasteLine: null } });
  mocks.save.mockResolvedValueOnce({ kind: "write-failure" });
  for (const [key, value] of Object.entries({ owner_id: foreignId, wishlist_id: foreignWishlistId, image_url: "https://attacker.invalid/i", converted_amount_minor: "9", sort_position: "-1", extraction_status: "extracted" })) data.set(key, value);
  await createItemAction({ status: "idle" }, data);
  expect(mocks.save.mock.calls[0][2]).toEqual({ title: "Lamp", source_url: null, retailer: null, note: null, desire_level: "would_love", original_amount_minor: null, original_currency: null });
});
```

Set `foreignId` and `foreignWishlistId` to distinct fixed UUIDs in the test file. Repeat the first gate assertion for `editItemAction`, `deleteItemAction`, and `reconcileDeleteAction`; `mocks.save` and `mocks.remove` must stay uncalled. Add an edit test that posts `priceIntent="preserve"` with forged `amount="999"` and `currency="ZZZ"` for an owner-scoped opaque row; assert the validated persistence value has `{kind:"preserve", expected:{original_amount_minor:"9007199254740993",original_currency:"ZZZ"}}` from the read row and no posted pair. Missing or invalid intent must return `priceIntent:"invalid"`, retain the complete raw draft, and call no write. Add real-action tests in Task 6 for opaque unrelated edit, clear, supported replacement, failed replacement retention, and intent tampering with before/after originals and all four conversion fields. Also test no-store route policy for `/wishlist/items/<uuid>/edit`, malformed UUID and unknown child behavior, fresh UUID on Start over, all desire controls, provider failure and same-key conflict focus. Never impose `maxLength` as a substitute for server rejection; a pasted overlong value must be retained and surfaced.
- [ ] Run `pnpm exec vitest run src/wishlist/item-actions.test.ts src/wishlist/item-form.test.tsx src/auth/proxy-policy.test.ts src/auth/proxy.test.ts`; expected RED.
- [ ] Implement actions with `"use server"`, `requireCompleteProfile()` as their first I/O step, and explicit `FormData.get` calls for only approved field names plus edit `priceIntent`. Validate create UUID with a UUID parser/regular expression before saving. Use route-bound item ID, reject malformed IDs before any item query after the gate, and return the same unavailable state for malformed/missing/foreign IDs. `loadOwnItemForEdit` returns null only for a successful absent owner read; a failed provider read throws a generic internal error without provider details. The edit page calls the fresh gate outside any catch, then catches only the owner-load failure and renders a data-free retryable error with a normal full-route retry link; it must not call `notFound()` or imply absence. The edit action loads the owner row before `validateEditDraft`, then persistence re-loads the current pair before conditional UPDATE. Missing/invalid intent returns a field error and raw draft. A successful create/edit calls `revalidatePath("/wishlist")` and redirects to a fixed `/wishlist` success marker. Delete and reconcile return typed outcomes; they never redirect for success, while framework auth/onboarding redirects propagate untouched. Render success marker copy from a closed enum only and load the list afresh; no title or URL in query parameters. Avoid exposing provider errors.
- [ ] Implement the form from V18 manual source using semantic tokens: persistent labels, associated error IDs, title/shop/price/link/note/desire, four quick currencies plus the supported list, noninteractive photo placeholder, mobile sticky action bar, controlled fields and `useActionState`. Create Start over restores defaults and a new `crypto.randomUUID()`, staying on manual entry. For supported existing price, prefill exactly and submit `priceIntent="replace"`; for no price, default `clear`; for opaque existing price, show its raw units/code and unavailable-price explanation and default to `preserve`, with explicit Clear and Replace controls. On supported or empty initial pairs, blanking the amount selects `clear` and entering a nonblank amount selects `replace`; on opaque preserve, amount editing is unavailable until explicit Replace and Clear is explicit. A rejected replacement retains its entered amount, currency, intent, and other raw fields. Add component tests that inspect submitted `FormData` and retained state for supported amount to blank, null pair to supported amount, opaque preserve to explicit clear/replacement, and failed replacement; these must assert intent values, not merely visible labels. Edit uses Cancel/back. Add owner edit link to each card and populated Add link; do not claim group visibility.

```tsx
// In item-form.test.tsx, with editItemAction mocked to record its FormData.
render(<ItemForm mode="edit" item={supportedPriceFixture} />);
fireEvent.change(screen.getByLabelText("Price"), { target: { value: "" } });
fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
await waitFor(() => expect(editItemActionMock).toHaveBeenCalled());
expect(editItemActionMock.mock.lastCall?.[2].get("priceIntent")).toBe("clear");
cleanup();
render(<ItemForm mode="edit" item={emptyPriceFixture} />);
fireEvent.change(screen.getByLabelText("Price"), { target: { value: "24.99" } });
fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
await waitFor(() => expect(editItemActionMock).toHaveBeenCalledTimes(2));
expect(editItemActionMock.mock.lastCall?.[2].get("priceIntent")).toBe("replace");
expect(editItemActionMock.mock.lastCall?.[2].get("amount")).toBe("24.99");
```
- [ ] Run the focused Vitest command and `pnpm typecheck`; expected GREEN. Commit action/routes/form deliverable.

## Task 5: Confirmation and complete delete reconciliation

**Files:** Create `src/wishlist/delete-dialog.tsx`, `.test.tsx`, `src/wishlist/delete-error-boundary.tsx`, `.test.tsx`; modify edit page and action tests.

**Interfaces:** `DeleteDialog({itemId,title}: {itemId:string;title:string})` renders a confirm form bound to `deleteItemAction(itemId,previous,formData)` with `useActionState`. A separate Check status form binds `reconcileDeleteAction(itemId,previous,formData)`. `DeleteErrorBoundary` encloses only this UI; a browser-to-Next lost response renders a Check item link that performs a full GET of the owner-scoped edit route. No client catches framework redirects and reclassifies them as transport failures.

- [ ] Write failing component/action tests. Cancel and Escape make zero action calls; opening moves focus into the dialog; close restores focus; confirm disables duplicate presses. `{status:"deleted"}` is the only result that navigates to the fixed list success marker. `{status:"unavailable"}` hides owner title and shows generic unavailable; `{status:"definite-rejection"}` keeps the item and offers retry. `{status:"uncertain"}` says the result is unknown and exposes Check status, which gives three complete outcomes: `present` resets pending and permits Retry delete; `absent` forces a full edit-route GET that renders generic unavailable, with no new-delete success claim; `uncertain` retains Check status and retry without claiming presence. The separate `DeleteErrorBoundary` fallback handles a rejected browser action promise by showing a regular link to the edit route for a fresh owner-scoped GET; if that GET fails, the route's generic error state remains retryable. Test actual Next redirect/bailout signals through the mounted boundary, not only a synthetic ordinary Error. Critical unit assertions:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
expect(deleteItemActionMock).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
deleteItemActionMock.mockResolvedValueOnce({ status: "uncertain" });
fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete item" }));
await screen.findByRole("button", { name: "Check status" });
reconcileDeleteActionMock.mockResolvedValueOnce({ status: "present" });
fireEvent.click(screen.getByRole("button", { name: "Check status" }));
await screen.findByRole("button", { name: "Retry delete" });
expect(routerReplaceMock).not.toHaveBeenCalledWith("/wishlist?notice=deleted");
```

Use the matching `absent` and `uncertain` branches in the same test file, and a boundary test that throws an action response error and checks the full-GET link. A real Next auth/onboarding redirect test must land on `/auth` or `/onboarding`, not the boundary's uncertainty copy.
- [ ] Run `pnpm exec vitest run src/wishlist/delete-dialog.test.tsx src/wishlist/delete-error-boundary.test.tsx src/wishlist/item-actions.test.ts`; expected RED.
- [ ] Implement the accessible dialog with `role="dialog"`, `aria-modal`, owner title only after successful owner-scoped page read, initial focus on Cancel, Escape/Cancel close, focus restoration, 44px controls, and safe operational copy. Bind confirmation and reconciliation as separate Server Action forms. In `DeleteErrorBoundary.getDerivedStateFromError(error)`, call the pinned public `unstable_rethrow(error)` from `next/navigation` before setting ordinary fallback state; do not catch its rethrow or inspect/log the raw error. Its pinned Next 16.3.6 browser implementation passes router redirect and CSR bailout signals through, including nested `cause`. This API is unstable, so a Next upgrade requires a focused retest/review; if it is removed, use a framework-managed boundary arrangement rather than a catch-all fallback. Test the branch with framework signals and with real action redirects. On returned `uncertain`, reconcile explicitly; on browser-to-Next rejection, the scoped boundary offers a full navigation to the owner-scoped edit page. A surviving row permits retry; an absent row displays generic unavailable; a failed read remains uncertain. Never rely on `router.refresh()` alone to reset client state.

```tsx
import { unstable_rethrow } from "next/navigation";
static getDerivedStateFromError(error: unknown) {
  unstable_rethrow(error);
  return { failed: true }; // Ordinary rejected action response only.
}
```
- [ ] Run focused Vitest; expected GREEN. Commit delete outcome deliverable.

## Task 6: Executable no-provider and local-stack action proof

**Files:** Create `app/test-support/wishlist-action-reference/page.tsx`, `src/wishlist/action-reference-fixture.tsx`, `scripts/e2e-no-provider-actions.sh`, `tests/e2e/wishlist-items-no-provider.spec.ts`, `tests/e2e/wishlist-items-local.spec.ts`; extend `tests/helpers/local-stack.ts` only for local-only fixtures; modify `scripts/e2e-local-stack.sh` explicit list and add a separate no-provider CI job in `.github/workflows/ci.yml`.

**Interfaces:** The no-provider fixture page exists in the production build but returns `notFound()` unless `E2E_ACTION_REFERENCE=1`, `E2E_NO_PROVIDER=1`, the request Host is loopback (`127.0.0.1`, `localhost`, or `[::1]`), and `getSupabasePublicConfig() === null` in that server process. On successful guard it renders a test-only `data-no-provider-config="true"` marker and actual current-build create, edit, and delete Server Action forms bound exactly as product forms, with fixed synthetic route IDs; no auth bypass exists in any action. The no-provider script exports both public provider variables as present empty strings for build and start, so Next cannot fill them from any dotenv file. It also exports empty fixture/control secrets and forbids a provider-backed local stack. The stack suite uses ordinary signed-in pages and real actions. Both run in existing `mobile` 390x844 and `desktop` 1440x1000 Playwright projects.

- [ ] Write the no-provider route test with actual form submission. Its test-only route should import the production action exports so Next emits fresh references from that same build. The fixture uses a small client component with `useActionState(createItemAction, {status:"idle"})`, `useActionState(editItemAction.bind(null, fixedSyntheticId), ...)`, and `useActionState(deleteItemAction.bind(null, fixedSyntheticId), {status:"idle"})`. Each form has a named submit button. For each of create, edit, and delete, the test newly visits `/test-support/wishlist-action-reference`, asserts `[data-no-provider-config="true"]` is rendered by that server process, submits the form, observes the current-build action request and `/auth` response, and asserts `Cache-Control: no-store` with no item data. Revisit between cases because a successful gate redirects away from the fixture. Treat a missing marker or a provider-backed route as test failure, not a skipped case. The form's actual browser encoding/action identifier are produced by React from this build; no hard-coded `Next-Action`, copied manifest ID, empty POST, or signed-in fixture is used. A separate GET of `/wishlist/items/new` and `/wishlist/items/<uuid>/edit` verifies signed-out behavior; malformed and unknown paths reveal no data. When test flags are unset, the support route is 404.
- [ ] Implement `scripts/e2e-no-provider-actions.sh` by exporting `NEXT_PUBLIC_SUPABASE_URL=''`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=''`, `SUPABASE_SERVICE_ROLE_KEY=''`, `E2E_LOCAL_SUPABASE=''`, `E2E_WISHLIST_CONTROL_URL=''`, and `E2E_WISHLIST_CONTROL_TOKEN=''`, plus `E2E_ACTION_REFERENCE=1` and `E2E_NO_PROVIDER=1`, before `pnpm build` and `pnpm exec playwright test tests/e2e/wishlist-items-no-provider.spec.ts`. The Playwright webServer starts `next start` with inherited explicit empty values from the same script; do not unset those keys or launch a preexisting server. The route checks effective server configuration before rendering any fixture and therefore fails closed even if env loading changes. Add `tests/helpers/no-provider-env.test.ts` that creates a temporary `.env` containing non-secret synthetic public URL/key values, sets the two process variables to empty strings, invokes pinned Next `@next/env` `loadEnvConfig` resolved through `createRequire(require.resolve('next/package.json'))`, and asserts the process values remain empty and `getSupabasePublicConfig()` remains null. The test restores environment and removes only its own temporary directory in `finally`, and prints no values. Run `pnpm exec vitest run tests/helpers/no-provider-env.test.ts`; expected RED before the proof, GREEN after. Add a separate `no-provider-actions` CI job that installs pinned Node/pnpm dependencies and Chromium, runs this focused test and script, and has a bounded timeout; the database job cannot substitute because it builds with a provider. `pnpm verify` does not run Playwright. Run the script locally only if Chromium is available; otherwise the exact-head CI job is its proof.

```ts
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSupabasePublicConfig } from "../../src/supabase/config";
const fromTest = createRequire(import.meta.url);
const fromNext = createRequire(fromTest.resolve("next/package.json"));
const { loadEnvConfig } = fromNext("@next/env");
const tempDir = mkdtempSync(join(tmpdir(), "arj28-no-provider-"));
const names = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "AUTH_LINK_COOKIE_SECRET", "E2E_MAILPIT_URL",
  "E2E_LOCAL_SUPABASE", "E2E_WISHLIST_CONTROL_URL", "E2E_WISHLIST_CONTROL_TOKEN",
] as const;
const old = new Map(names.map((name) => [name, process.env[name]]));
try {
  writeFileSync(join(tempDir, ".env"),
    names.map((name) => `${name}=synthetic-fixture-value`).join("\n") + "\n");
  for (const name of names) process.env[name] = "";
  loadEnvConfig(tempDir, true, undefined, true);
  for (const name of names) expect(process.env[name]).toBe("");
  expect(getSupabasePublicConfig()).toBeNull();
} finally {
  for (const name of names) {
    const prior = old.get(name);
    if (prior === undefined) delete process.env[name];
    else process.env[name] = prior;
  }
  rmSync(tempDir, { recursive: true, force: true });
}
```
- [ ] Write stack tests using `createSignedInFixture`, `stackAdminClient`, and exact before/after row selects. Obtain current-build action encoding by intercepting the signed-in browser's actual form submission, then replay that request only in the local test process with a second, incomplete, signed-out, or expired cookie jar; never print/store cookies, body, or action ID in evidence. Direct RLS API denial uses a public-key authenticated second-user client, while service role remains fixture-only. A core test:

```ts
const before = await admin.from("wishlist_items").select("id,title").eq("owner_id", victimId);
await page.getByLabel("What is it?").fill("Mushroom ceramic lamp");
await page.getByRole("button", { name: "Add item" }).click();
await expect(page).toHaveURL(/\/wishlist(?:\?|$)/);
const after = await admin.from("wishlist_items").select("id,title,original_amount_minor::text,original_currency").eq("owner_id", victimId);
expect(after.error).toBeNull();
expect(after.data).toHaveLength((before.data?.length ?? 0) + 1);
await page.reload();
await expect(page.getByRole("heading", { name: "Mushroom ceramic lamp" })).toBeVisible();
```

Cover valid action invocations for create/edit/delete under incomplete, expired, and foreign sessions with exact unchanged database rows. Forge owner/parent/ID/image/conversion/sort/extraction fields, assert no unauthorized changes or foreign content. Include all money precisions and above-safe-integer/maximum values. For opaque legacy rows, use the real edit action to assert unrelated `preserve` leaves original and conversion columns exact, `clear` nulls all six related columns, supported `replace` writes exact original and clears four converted columns, failed replacement retains draft and leaves row unchanged, and tampered/missing `priceIntent` is rejected before write. Add real form-action before/after cases for a supported amount erased to blank, a null pair entered as supported amount, and an unchanged null/null pair whose existing complete conversion tuple survives an unrelated edit. The last case is legal under 005a's independent original-pair and conversion-tuple constraints. Assert both original columns and all four conversion columns, not only visible list copy. No source/image sentinel may trigger remote server fetch, proved by Task 6A's outbound observer.
- [ ] Run `pnpm exec playwright test tests/e2e/wishlist-items-local.spec.ts` on a local stack where available; otherwise rely on the exact-head CI `database` job. Add this gated path to `scripts/e2e-local-stack.sh` in the same PR, alongside Task 6A race and Task 7 visual paths. Keep no-provider spec outside that provider runner. Run `pnpm verify` separately; report any exact unavailable check. Commit the executable action proof and runner wiring together.

The no-provider script also exports `AUTH_LINK_COOKIE_SECRET=''` and `E2E_MAILPIT_URL=''` so local fixture/control values cannot be reintroduced through dotenv. Its synthetic dotenv test must include those names and the service-role/control names with non-secret sentinels, then assert each remains explicitly empty; the route and test must never print any value. This environment contract applies to build and server start, while ordinary auth and action gates remain unchanged.

## Task 6A: Deterministic server transport and concurrency proof

**Files:** Create `instrumentation.ts`, `src/wishlist/test-barrier.ts`, `tests/helpers/wishlist-test-control.mjs`, `tests/helpers/wishlist-test-participant.mjs`, `tests/helpers/wishlist-control-client.ts`, `tests/helpers/wishlist-test-control.test.ts`, `tests/e2e/wishlist-items-races-local.spec.ts`; modify `scripts/e2e-local-stack.sh` and `package.json` formatting paths only as required so `instrumentation.ts` participates in format checks.

**Interfaces:** `wishlistTestBarrier(stage:Stage):Promise<void>` is a no-op unless `E2E_LOCAL_SUPABASE=1`, `E2E_WISHLIST_CONTROL_URL` is loopback, and a per-run control token is set. `Stage` is the closed union `"after-live-key-before-insert" | "after-unique-conflict-before-lookup" | "after-max-before-insert" | "after-edit-read-before-update" | "postgrest-delete-response-loss" | "postgrest-delete-pre-dispatch-failure" | "postgrest-reconcile-read-failure" | "postgrest-edit-read-failure"`. The first four are barriers; the last four are one-shot transport injections. The two owner-read stages inject a non-retried `AbortError` before dispatch as specified below. The barrier reads a synthetic `x-arj28-case` UUID and `x-arj28-participant` (`first` or `second`) from `next/headers` only for test coordination, never authorization. Every attributed request has both valid headers. An ordinary request without either header is uninstrumented; a partial or malformed pair under the local guard fails the harness.

The loopback controller exposes token-protected `POST /case`, `POST /arm`, `POST /arrive`, `GET /wait`, `POST /release`, `POST /observe`, `GET /events`, and `POST /clear`. `/case {caseId}` registers an empty case for observation-only or browser-response-loss schedules; registering an already active case is an idempotent 200. `/arm {caseId,stage,arrivals,targetId?,oneShot?}` also creates the case on its first arm, then registers at most one arm per stage for that case; replacement/rearming is 409, so each independent schedule uses a fresh case UUID. Neither operation can reopen a cleared case. Barrier arms require `arrivals` 1 or 2, no target, and `oneShot:false` (default). Injection arms require `arrivals:1`, a synthetic item UUID `targetId`, and `oneShot:true`; invalid combinations fail 400. The case remains registered after its arms are consumed, so later stages and user retries can probe safely. Register or arm before sending any attributed application request.

`/arrive` is the complete server-side probe/claim operation; no separate discovery read is needed. It sends `{caseId,stage,participant,probeId,targetId?}`, with a fresh UUID `probeId` per invocation. For injections, the wrapper supplies only the canonical synthetic item UUID extracted from an exact local `wishlist_items` request with an `id=eq.<uuid>` filter, never a raw URL/query. It probes delete stages only for DELETE and read stages only for GET; nonmatching methods/resources do not probe. Read stage identity is selected by which arm matches; probe reconcile then edit in that fixed order and stop after a released injection (the schedule arms at most one read-injection stage for a target). Targetless collection/auth requests receive ordinary observation and cannot consume an item injection. Barrier probes omit `targetId`.

After authenticating and validating case/stage/participant/probe/target shape, the single controller process performs selection and reservation synchronously, with no `await` between checking and recording the claim. A known unarmed stage, mismatched valid target, or consumed arm returns immediate HTTP 200 `{decision:"noop",reason:"unarmed"|"target-mismatch"|"consumed"}`; it records only a sanitized probe result, never an arrival, and does not consume a slot. A matching arm reserves a unique participant slot, records its arrival and probe ID, and holds that HTTP response until release. A one-shot arm becomes consumed at reservation, before waiting or dispatch: simultaneous other probes get `consumed`, even while the winner is held. After release the winner alone receives HTTP 200 `{decision:"released",effect:"continue"|"delete-response-loss"|"delete-pre-dispatch-failure"|"owner-read-abort"}` derived from the stage. The helper validates this closed response: `noop` continues the original operation, `released/continue` returns from the barrier, and only a matching released injection authorizes the wrapper's named failure. There is no automatic control-request retry. Repeated `probeId` is 409; repeated participant on a still-accepting barrier is 409. Once all declared slots are reserved, later fresh probes return `consumed`. Retrying the same application operation after one-shot use creates a new probe and runs normally.

`/wait` returns only after the declared distinct arrivals are recorded. `/release` releases all currently held arrivals or one named held participant; it rejects release of an unarmed/unarrived participant, and never pre-releases a future arrival. `/observe` ingests `{caseId,participant,kind,phase,outcome?,targetId?,injected?}`, with `kind` in `local-auth|local-rest|external-host-digest`, `phase` in `attempt|settled`, and settled `outcome` in `response|network-error`. `injected:true` is allowed only for a settled network error after a released injection; no raw URL, headers, body, credentials, or provider error is accepted. `/events` returns sanitized probes, claims/arrivals, releases, observations, and a sticky case-failed flag. Tests require that flag false before cleanup. Invalid token is 401, unknown stage/malformed fields 400, unknown case 404, duplicate claim/probe 409, cleared case 410, and expired hold/wait 504; none becomes a no-op or an authorized injection. Authenticated valid-case protocol errors and expired waits/holds mark the case failed. Controller I/O failure, invalid response, or timeout rejects the helper and fails the test even if an application catch renders recoverable UI; successful UI alone cannot count as injection evidence. Every control request/hold/wait is bounded at 15 seconds with cancellation, and a failed/disconnected claim is never rearmed automatically. `clear(caseId)` rejects held arrivals/waits with 410, discards only that case's arms/events, and retains a cleared-ID tombstone until runner exit so late requests cannot resurrect it. Every test clears in `finally`.

`tests/helpers/wishlist-control-client.ts` exposes `register(caseId)` for `/case`, `arm(caseId,stage,arrivals,targetId?,oneShot?)`, `wait(caseId,stage)`, `release(caseId,stage)`, `releaseOne(caseId,stage,participant)`, `events(caseId)`, and `clear(caseId)` with the same 15-second bound. In `test-barrier.ts`, `probeWishlistStage({caseId,stage,participant,probeId,targetId?}):Promise<ProbeDecision>` uses captured original fetch for `/arrive` and validates the response; the barrier and fetch wrapper both use it. `ProbeDecision` is the closed union shown below. The plain Node `.mjs` participant independently uses the same HTTP contract without importing Next request APIs. The harness holds no DB credentials and logs only stage names/counts; control tokens and request material are never exported.

```ts
type ProbeDecision =
  | { decision: "noop"; reason: "unarmed" | "target-mismatch" | "consumed" }
  | { decision: "released"; effect: "continue" | "delete-response-loss" | "delete-pre-dispatch-failure" | "owner-read-abort" };
```

- [ ] Write controller tests that arm/wait/release two independent case UUIDs, make a real server-side `POST /arrive` remain pending until the test-side `wait` sees it and `releaseOne` names its participant, reject duplicate arrivals and unknown stages, enforce the 15-second timeout, deny non-loopback bind/configuration, redact event records, and prove `clear` rejects only that case's held requests. Add a reporter test that sends an `attempt` observation, simulates an outbound transport throw, sends `settled/network-error`, and proves the other case has no observations and control traffic creates no recursive observations. A concrete cross-process assertion is:

```ts
await control.arm(caseA, "after-max-before-insert", 1);
const held = spawn(process.execPath, [participantScript], {
  env: { ...process.env, ARJ28_CASE: caseA, ARJ28_STAGE: "after-max-before-insert", ARJ28_PARTICIPANT: "first" },
  stdio: "ignore",
});
await control.wait(caseA, "after-max-before-insert");
expect(held.exitCode).toBeNull();
const exit = once(held, "exit");
await control.releaseOne(caseA, "after-max-before-insert", "first");
expect((await exit)[0]).toBe(0);
expect((await control.events(caseB)).observations).toEqual([]);
```

`participantScript` resolves to `tests/helpers/wishlist-test-participant.mjs`; that child sends the same authenticated `/arrive` payload as `probeWishlistStage`, creates a fresh probe UUID, exits 0 only for a validated `released` response, exits 10 for a validated `noop`, and exits 1 for any protocol/control failure. It reads optional `ARJ28_TARGET` for injection probes and never logs the token. `spawn` and `once` are Node built-ins. Extend the same cross-process test with the following proof before cleanup; the first arm above keeps case A registered. This proves no-op without any release, target isolation, and exactly one reservation under overlap:

```ts
function childProbe(stage: Stage, participant: "first" | "second", targetId?: string) {
  const child = spawn(process.execPath, [participantScript], {
    env: { ...process.env, ARJ28_CASE: caseA, ARJ28_STAGE: stage,
      ARJ28_PARTICIPANT: participant, ARJ28_TARGET: targetId ?? "" },
    stdio: "ignore",
  });
  return once(child, "exit").then(([code]) => code);
}
expect(await childProbe("after-edit-read-before-update", "first")).toBe(10);
const readStage = "postgrest-reconcile-read-failure";
await control.arm(caseA, readStage, 1, savedId, true);
expect(await childProbe(readStage, "first", foreignId)).toBe(10);
expect((await control.events(caseA)).arrivals.filter(e => e.stage === readStage)).toHaveLength(0);
const contenders = [childProbe(readStage, "first", savedId), childProbe(readStage, "second", savedId)];
await control.wait(caseA, readStage);
const beforeRelease = await control.events(caseA);
expect(beforeRelease.arrivals.filter(e => e.stage === readStage)).toHaveLength(1);
expect(await Promise.race(contenders)).toBe(10); // Loser is a no-op while winner remains held.
await control.release(caseA, readStage);
expect((await Promise.all(contenders)).sort()).toEqual([0, 10]);
expect(await childProbe(readStage, "first", savedId)).toBe(10);
expect((await control.events(caseA)).arrivals.filter(e => e.stage === readStage)).toHaveLength(1);
expect((await control.events(caseA)).failed).toBe(false);
```

Define `savedId` and `foreignId` as different fixed synthetic UUIDs in this test; here `foreignId` means only an unmatched test target, not an authorization bypass. Assert the probe reasons are respectively unarmed, target-mismatch, and consumed, and the released effect is `owner-read-abort`. Also test empty-case registration accepts observations and known unarmed probes without blocking; malformed/unknown stages, invalid tokens, unknown/cleared cases, duplicate probe IDs, invalid arm combinations, disconnected held claims, and timeouts cannot release an injection or satisfy an expected arrival. Child and parent obey the same bounded HTTP contract; retain the two-case isolation/cleanup and failed-fetch observation tests above. The controller supplies ordering without sleeps. Run `pnpm exec vitest run tests/helpers/wishlist-test-control.test.ts`; expected RED, then GREEN after implementation. Start the controller in `scripts/e2e-local-stack.sh` after `pnpm build`, bound to `127.0.0.1`, with a fresh per-run token parsed only into environment variables; trap exit to stop it. Export the E2E control URL/token only for the Playwright/`next start` process. `playwright.config.ts` starts that server with inherited env and never reuses another process.
- [ ] Under those guards only, `instrumentation.ts` captures `const originalFetch = globalThis.fetch.bind(globalThis)` before installing a Node-side wrapper and passes that captured function to `test-barrier.ts` for all `/arrive` and `/observe` control requests. The wrapper itself uses `originalFetch` for control traffic and explicitly excludes the loopback controller origin from observations, so reporting cannot recurse. For each other attributed outbound request, record a sanitized `attempt` before probing or dispatching, then a sanitized `settled/response` or `settled/network-error`; failures remain in the evidence. Record `injected:true` only when executing a validated released injection, never for controller failure. If the controller cannot accept an observation, fail the test rather than claiming zero fetches. Classify only local Supabase auth/REST or external host digest, never raw URL/query/header/body. Verify this wrapper observes a real server-client PostgREST call before relying on it; if the pinned client captures fetch earlier, inject the same guarded wrapper through the existing `createSupabaseServerClient()` client options and retain the global wrapper for non-Supabase fetches without double-wrapping the same call. A submitted synthetic source/image URL (`https://arj28-<case>.invalid/...`) must yield zero external-host `attempt` observations; a real owner action must yield case-specific local REST attempt/settled observations, proving the observer was active.

For each exact target DELETE, first probe `postgrest-delete-pre-dispatch-failure`: a released effect throws a generic transport error before dispatch; a no-op dispatches the real DELETE. After a real response completes, consume a clone and probe `postgrest-delete-response-loss`; a released effect throws a transport error, while a no-op returns the untouched real response. Thus the latter stage's arrival proves response completion, and separate admin reads still prove the committed deletion. For an exact owner GET, probe the two read stages as defined above; after no-ops dispatch the real request, or after `owner-read-abort` release throw `new DOMException("Injected owner read failure", "AbortError")` before dispatch. Do not abort the browser action, the Next request, or any shared signal. No successful DB response is synthesized and auth/RLS decisions remain unchanged.

- [ ] Pin the read-failure mechanism with an actual installed Supabase-client unit regression before relying on the browser schedule. The [v2.117.2 retry implementation](https://github.com/supabase/supabase-js/blob/v2.117.2/packages/core/postgrest-js/src/fetchWithRetry.ts#L95-L113) immediately rethrows `AbortError`; ordinary rejected GET fetches retry. The [pinned PostgrestBuilder](https://github.com/supabase/supabase-js/blob/v2.117.2/packages/core/postgrest-js/src/PostgrestBuilder.ts#L258-L336) converts this rejection to an error result with status zero when `throwOnError` is unused. Keep default retries enabled. In `wishlist-test-control.test.ts`, import `createClient` from the installed `@supabase/supabase-js`, use a non-secret synthetic local URL/key with auth persistence/refresh disabled, and this isolated fake transport to prove the pinned client branch (this unit fixture is not stack evidence):

```ts
const transport = vi.fn(async () => {
  throw new DOMException("Injected owner read failure", "AbortError");
});
const client = createClient("http://127.0.0.1:54321", "synthetic-test-key", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: transport },
});
const result = await client.from("wishlist_items").select("id")
  .eq("owner_id", ownerId).eq("id", savedId).maybeSingle();
expect(transport).toHaveBeenCalledTimes(1);
expect(result.status).toBe(0);
expect(result.error).not.toBeNull();
expect(result.data).toBeNull();
```

Pair this with the real guarded-wrapper/controller test that releases `owner-read-abort` and asserts the thrown error's name, exactly one injected settled observation, and zero underlying provider dispatches. Its next fresh probe must be `consumed` and dispatch the supplied underlying fetch normally. The two browser schedules below supply the real RLS/DB success proof after this failed logical read; unit responses cannot replace them. No retry override, dependency change, or extra logical-read tracking is needed. A pinned-client upgrade requires revisiting this source check and regression.

- [ ] Add named test barriers in `item-write.ts` after owner-key lookup/before insert, after 23505/before conflict lookup, after reading append maximum/before insert, and after current edit row read/before filtered UPDATE. `wishlistTestBarrier` reads the case and participant from test-only request headers, generates its probe UUID, and uses `probeWishlistStage`: `noop` returns immediately, `released/continue` returns after release, and all failures reject. In the 23505-then-missing schedule the first create therefore passes its known but unarmed after-maximum barrier and can commit. The case key is test coordination only; the helper is a no-op outside the guarded local stack. Each Playwright test generates a unique case UUID and synthetic users/items, adds only those two test headers to its actual action requests or targeted full GET, and uses its own controller key. Both viewport projects can run in parallel without touching each other's barrier. Tests clear state in `finally`; the runner stops the controller on exit.
- [ ] In `tests/e2e/wishlist-items-races-local.spec.ts`, use a bounded wait for each exact barrier event, then release by case key. Schedules and required postconditions are: (a) two same-owner/key actions both pause after their live-key lookup and before insert, release both, exactly one surviving row; (b) pause both after their empty live-key lookups, release the first and wait for its committed row, release the second so its insert gets 23505, pause it again before conflict lookup, fixture admin deletes the first row, release lookup, second returns generic unavailable and does not claim save; (c) two distinct-key actions pause after reading the same maximum, release both, each creates a row at equal position, list orders them by ID; (d) edit pauses after reading current original, fixture admin changes original and conversion tuple or deletes row, release, conditional pair update returns retry or unavailable with no stale conversion write; repeat with a null/null original and complete conversion tuple, fixture admin changes only conversion tuple before release, then assert the action's unrelated edit preserves all four newly written conversion values; (e) real DELETE commits and outbound response is dropped after body-read, separate admin read proves absence, action returns uncertain, reconcile returns absent, UI never claims newly successful removal. Also run a browser-to-Next case: intercept the real action POST with Playwright, let `route.fetch()` finish the commit, prove absence by separate admin read, then `route.abort()` the browser response; the scoped fallback's full GET yields unavailable, not a new-delete notice. A known SQLSTATE rejection is tested as a definite unchanged-row branch, while ambiguous status-zero/5xx stays uncertain. Tests must fail if an expected barrier is not reached; no sleeps or probabilistic concurrency claims.
- [ ] Complete the real browser reconciliation matrix with distinct deterministic schedules using current-build forms and action references. For **uncertain then present**, arm `postgrest-delete-pre-dispatch-failure` with `(caseId,stage,1,targetId,true)`, submit the mounted dialog's real Delete item form, wait for the attempted DELETE observation and stage arrival, release the injected failure, separately read the row as fixture admin to prove it still exists, then submit the real Check status action and assert `Retry delete` is usable and no deleted notice appears.

For **uncertain then failed read**, repeat that pre-dispatch failure in a fresh case, then arm `postgrest-reconcile-read-failure` with `(caseId,stage,1,targetId,true)` before submitting the real Check status form. Wait for the matching owner GET arrival, release `owner-read-abort`, and wait for that action to settle. First assert the read-failure copy, usable Check status, no `Retry delete` presence claim, and no success notice; the preexisting uncertain-delete UI before action completion is not proof. Require exactly one target GET attempt for this submission, its `settled/network-error/injected:true`, one released read claim, and no failed controller state. The pinned non-retried abort makes this a failed logical read. Only after those assertions click Check status again, using the same case and a fresh probe; assert a real owner GET `settled/response`, `present` UI with usable Retry delete, and no second injected event. A separate admin read confirms the row survives. Keep the consumed arm in place until final cleanup, so the successful user retry also proves its no-op behavior.

For **failed full-route GET**, register a fresh case before the browser-to-Next committed-delete response-loss schedule, complete that schedule, and separately prove row absence. Before clicking the fallback Check item link, arm `postgrest-edit-read-failure` with `(caseId,stage,1,targetId,true)` and install the case/participant headers on that exact navigation GET. Then click, wait for its owner-read arrival, release `owner-read-abort`, and wait for navigation to finish. Assert the route's generic retryable read error and full-route retry control, with no item data, unavailable/absence claim, or new-delete notice; also require one target GET attempt and one injected settled failure. Only after these assertions follow the full-route retry with the same case attribution. Its consumed-arm probe must run a real owner-scoped GET, yield a settled response, and render generic unavailable for the already absent row, with no second injected failure. Never arm after starting the navigation or mistake the initial boundary fallback for a failed route read.

For **framework navigation**, mount the same boundary on a complete owner's edit page, then expire the session before a real Delete item action and assert `/auth`; repeat after fixture administration makes that owner profile incomplete and assert `/onboarding`. The boundary must not render uncertainty in either redirect case. All waits remain bounded; control failures fail the test and are not substitute read-failure evidence. Do not use mocked action results or `router.replace()` alone for these browser proofs. Keep both committed-delete response-loss hops separately.
- [ ] Implement one critical race test using the control client and real action requests, with a bounded controller wait rather than elapsed time. For the 23505-then-missing case, the exact call order is:

```ts
const caseId = randomUUID();
await control.arm(caseId, "after-live-key-before-insert", 2);
await control.arm(caseId, "after-unique-conflict-before-lookup", 1);
try {
  const first = submitActualCreateAction(ownerPageA, { caseId, participant: "first", submissionId: key });
  const second = submitActualCreateAction(ownerPageB, { caseId, participant: "second", submissionId: key });
  await control.wait(caseId, "after-live-key-before-insert");
  await control.releaseOne(caseId, "after-live-key-before-insert", "first");
  await expect(first).resolves.toMatchObject({ saved: true });
  await control.release(caseId, "after-live-key-before-insert");
  await control.wait(caseId, "after-unique-conflict-before-lookup");
  await admin.from("wishlist_items").delete().eq("owner_id", ownerId).eq("client_submission_id", key);
  await control.release(caseId, "after-unique-conflict-before-lookup");
  await expect(second).resolves.toMatchObject({ unavailable: true });
  const rows = await admin.from("wishlist_items").select("id").eq("owner_id", ownerId).eq("client_submission_id", key);
  expect(rows.data).toEqual([]);
} finally { await control.clear(caseId); }
```

`submitActualCreateAction` is a test helper that submits the rendered signed-in form while Playwright adds `x-arj28-case` and `x-arj28-participant` to only that action POST; it returns only a safe outcome enum, never captures body/cookies in evidence. `releaseOne` releases the named arrival while the other remains held and has the same 15-second bound. Define these test-client methods in `wishlist-control-client.ts` and controller unit tests before running the race suite.
- [ ] Run `pnpm exec playwright test tests/e2e/wishlist-items-races-local.spec.ts` in the local stack or exact-head CI `database` job. Add this gated path explicitly to `scripts/e2e-local-stack.sh` in the same PR. Confirm the observer sees expected local Supabase calls and zero attempted external requests for unique source/image sentinels. Commit the harness and deterministic stack tests as one independently reviewable deliverable.

- [ ] In the fetch wrapper, obtain the case UUID and participant from the active request's `await headers()` only under the local test guard, immediately before classifying each non-control outbound call. Calls outside a Next request context or with neither test header get no case attribution; they cannot satisfy an armed test's expected observations. A partial or malformed header pair under the local guard fails the harness as specified above. Do not copy cookies, authorization, raw target URLs, or request bodies into the controller. The action and route stack tests must assert their own case-specific local REST observations exist before accepting a zero-external-fetch result. In the controller unit test, exercise the actual guarded fetch reporter with a failing synthetic outbound request: install the wrapper with a fake underlying fetch that rejects only the synthetic external URL, call the wrapped fetch under one case/participant context, and assert exactly one `external-host-digest/attempt` and one `external-host-digest/settled/network-error` record. Assert zero observations for a second case and zero records for the wrapper's own `/observe` and `/arrive` requests. This unit test may fake transport failure, but no stack test may fake a successful database response. Re-run `pnpm exec vitest run tests/helpers/wishlist-test-control.test.ts` after the wrapper exists.

## Task 7: Responsive candidates, safe CI export, and final gate

**Files:** Create `tests/visual/wishlist-items.visual.spec.ts`, `scripts/collect-arj28-candidates.mjs`, `src/arj28-candidate-collector.test.ts`, `docs/delivery/evidence/arj-28/README.md`; modify `.github/workflows/ci.yml` and add visual spec path to `scripts/e2e-local-stack.sh`. Modify production visual baselines only after independent approval.

**Interfaces:** The visual spec uses ordinary `page.screenshot({ path })`, not `toHaveScreenshot`, to write candidates in `test-results/arj28-candidates/`. The filename allowlist is exactly `arj28-(manual-prefilled|manual-clean|validation|submission-conflict|save-failure|edit|delete-confirm|delete-uncertain|success)-(mobile|desktop).png`. The collector reads only that directory, copies only regular allowlisted PNGs with valid PNG signature, rejects symlinks and duplicate state/viewport names, and writes a manifest containing SHA-256 of every candidate plus exact `git rev-parse HEAD`, state, viewport, and synthetic fixture label. No auth screenshot, error context, trace, report, request body, cookie, token, private path, raw provider failure, or real user content enters the upload.

- [ ] Write failing collector tests in `src/arj28-candidate-collector.test.ts` with one valid synthetic PNG per state/viewport and decoys named `auth-mobile.png`, `trace.zip`, `error-context.md`, and a valid-looking filename from a directory outside `test-results/arj28-candidates/`. Assert only the allowlisted PNG is exported, its digest matches, manifest head equals the test HEAD, duplicate names and symlinks fail closed, and stdout/stderr contain no decoy contents. Run `pnpm exec vitest run src/arj28-candidate-collector.test.ts`; expected RED then GREEN after collector implementation. Keep the older wishlist failure collector unchanged.
- [ ] Capture deterministic synthetic states at both viewports, including named non-sensitive title, shop, source URL, and note where needed to prove matching fixture and retained values. For manual prefilled geometry compare only against the frozen `add-manual-fallback` references with matched scroll/focus; the failure banner in that frozen capture is not a 005c element. Never use frozen `add-initial` or `add-empty-error` as manual-validation baselines. For list success compare the underlying list against matching empty/filled fixture, then review the notice as a new composition. Candidate capture happens before any baseline commit and cannot fail merely because no golden image exists.
- [ ] Add a CI collection step after stack Playwright that runs with `if: always()` and calls `node scripts/collect-arj28-candidates.mjs test-results/arj28-candidates arj28-candidate-export`; the collector sets a safe `count` output through `GITHUB_OUTPUT`. Add a separate pinned `actions/upload-artifact` step with `if: always() && steps.arj28_candidates.outputs.count != '0'` and `path: arj28-candidate-export/`. This exports approved-path candidates and manifest on a successful capture as well as relevant test failures; it does not upload the whole Playwright output tree. Keep the existing wishlist failure-only collector. Download the resulting CI artifact, verify its manifest SHA and candidate digests against the exact implementation head, and give those candidates to the independent reviewer before baseline approval.
- [ ] Run axe, keyboard and 44px target checks on all interactive states. Critical assertions include label association, error `aria-describedby`, visible focus, dialog initial/restored focus and Escape/Cancel, and retained draft after rejection. Run `pnpm exec playwright test tests/visual/wishlist-items.visual.spec.ts` locally if the stack exists; otherwise rely on exact-head CI `database` job after explicit runner wiring. The visual candidate path must appear in `scripts/e2e-local-stack.sh` in the same PR.
- [ ] Seek actual independent product/design review of candidate hashes and exact implementation head. Record reviewer identity accurately, including an AI reviewer as AI. Apply requested UI corrections and recapture; only after approval may reviewed baseline files and manifest change be committed. Rerun `pnpm test:visual` and exact-final-head CI after any baseline commit. The 005h authorization permits AI visual review for Phase 4 baseline commits; it does not approve the candidates in advance.
- [ ] Build the evidence README with acceptance criteria 1–8 mapped to executed unit, pgTAP, real-action, full-reload, race/transport, accessibility, and visual results. Include the sanitized candidate manifest, independent visual decision, forward migration and destructive rollback note, `pnpm verify` result, exact-head `database` and `no-provider-actions` job URLs/status, and actual Railway preview URL if available. Evidence logs and artifacts exclude request bodies, cookies, auth material, unsanitized provider errors, real user content, and private paths; candidate PNGs may contain only named non-sensitive deterministic fixture values. Confirm no Magic Patterns mocks or editor artifacts ship.
- [ ] Request fresh independent code/security review of the final implementation and evidence. Fix findings and rerun relevant checks on the exact final PR head. The applicable owner authorization in `docs/delivery/issues/005h-ci-database-test-gate.md:123-135` supersedes older human-only wording for Phase 4: AI reviewer signoff plus green checks authorizes merge, and AI visual review may approve baseline commits. Record the actual reviewer identity and decision. This plan neither merges a PR nor approves a baseline now.

## Self-review checklist for planning review

- [ ] Map every acceptance criterion in the binding brief to Tasks 1–7, including Task 6A, and evidence. In particular, action-level complete-profile tests, exact bigint read and display, changed-key replay, hard-delete retry, conversion tuple, and both delete uncertainty hops must each have a concrete test.
- [ ] Confirm all 005b interfaces and migration ordering against the actual merged base; the currently observed ARJ-27 worktree is not a substitute.
- [ ] Search the plan for placeholders and inconsistent type/field names. Recheck source-provenance table completeness and the precise local-stack script paths before formalizing the plan.

## Proposed implementation interpretation requiring review

The null-safe original-pair predicate in Task 3 is a proposed implementation detail for the approved requirement to compare the current owner row at save time under concurrent edits. It avoids relying on `updated_at` as a unique version. The distinct `uncertain` delete outcome, owner-scoped reconciliation action, and scoped error boundary are proposed mechanisms for the approved lost-response behavior. The loopback-only action-reference and transport harnesses are proposed test infrastructure, not product routes or auth bypasses. Review these concrete mechanisms with the binding plan; none is presented as a previously approved product decision.
