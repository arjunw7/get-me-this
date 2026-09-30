# ARJ-27 Recovery Implementation Plan

> For agentic workers: use `superpowers:executing-plans` after the controller's independent plan review. Execute the checked tasks in order, with a fresh independent code and image review before final approval. This plan author does not implement or approve the resulting artifacts.

**Goal:** Deliver the owner-only wishlist in the amended 005b brief, correct the recovered defects, and prove all 18 acceptance criteria on the final committed head.

**Architecture:** Keep the existing server-rendered owner read and RLS boundary. Correct its complete-list and display behavior, repair the profile and empty-state presentation, and make the test and visual evidence trustworthy. The local Supabase stack remains the only fixture target; CI provides the database and Linux visual environment.

**Tech stack:** Next.js 16, React 19, strict TypeScript, Tailwind 4, Supabase, Vitest, Playwright, pnpm, Node 24.

**Spec:** `docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md`, last amended by commit `fdd69e9` on 2026-09-30. Read `AGENTS.md`, `DESIGN.md`, `docs/flows/wishlist.md`, `docs/architecture/permissions-matrix.md`, and `docs/delivery/visual-baselines.md` before execution.

## Global constraints

- Keep the owner-only RLS read, explicit snapshot columns, `(sort_position ASC, id ASC)` order, and the `Cache-Control: no-store` protection on every protected response.
- Render original money only, with ISO 4217 minor-unit precision and the uppercase code. Do not select or render converted money.
- No item management, extraction, reordering, groups, sharing, reactions, new migration, or new dependency in 005b.
- Preserve the amended exact empty copy: `Add the first thing you'd secretly love to unwrap. A candle, a camera, the hoodie you keep looking at.` The V18 final audience sentence is intentionally omitted.
- Preserve the existing eight recovered uncommitted file changes until each has been reviewed and incorporated. Do not restore or overwrite them wholesale.
- Use `PATH=/opt/homebrew/opt/node@24/bin:$PATH` for local Node commands. No local Docker or system installation is authorized.
- No staging or production writes, pushes, merges, or cloud configuration changes during implementation without the controller's separately established gate.
- Never print or upload credentials, OTPs, token-bearing URLs, raw error contexts, auth screenshots, traces, or HTML reports. Visual artifacts must be allowlisted wishlist images taken after sign-in.
- A baseline candidate needs an actual independent image review at the exact PNG hashes before its manifest approval and baseline commit. Historical OCR or code review is not image approval.

## Current evidence and open failures

`arj27-spec-review.md` identified the copy conflict, now corrected in the binding brief. `arj27-visual-review.md` rejected the recovered four images because the desktop taste line crosses the band divider and the display hierarchy is too small. `arj27-recovery-review.md` rejected seven code and proof issues: incomplete minor-unit mapping, missing source link without retailer, the 1000-row API cap, unsafe general test-result upload, blanket 3% screenshot allowance, incomplete keyboard/private-payload tests, and fixture cleanup after setup failure. Its local-only helper guard and loading/error evidence distinction also require attention.

Fresh `recovery-verify.txt` and `recovery-verify-warm.txt` each show 395 of 396 Vitest tests passing. The same first test in `src/analytics/sdk-import-boundary.test.ts` hit the default 5-second timeout twice (8.6 and 6.5 seconds under full-suite load); its isolated six tests passed. Those logs do not establish a green `pnpm verify` or the final head's CI state. The current evidence README refers to absent `ci-database-job-run.md` and historical non-image approval. Treat all former green claims as unverified until replaced by fresh evidence.

## File map

| Responsibility | Exact files |
| --- | --- |
| Empty copy and display geometry | `src/wishlist/wishlist-card.tsx`, `src/wishlist/wishlist-view.tsx`, new `src/wishlist/wishlist-typography.module.css`, `src/wishlist/wishlist-view.test.tsx`, `tests/e2e/wishlist-local.spec.ts` |
| Money and source link | `src/wishlist/display.ts`, `src/wishlist/display.test.ts`, `src/wishlist/wishlist-card.tsx`, `src/wishlist/wishlist-card.test.tsx`, `tests/e2e/wishlist-local.spec.ts` |
| Complete owner read | `src/wishlist/data.ts`, new `src/wishlist/data.test.ts`, `tests/e2e/wishlist-local.spec.ts` |
| Fixture lifecycle and local target guard | `tests/helpers/local-stack.ts`, new `tests/helpers/local-stack.test.ts`, `vitest.config.ts`, `tests/e2e/wishlist-local.spec.ts`, `tests/visual/wishlist-empty.visual.spec.ts`, `tests/visual/wishlist-filled.visual.spec.ts` |
| Loading and error states | `app/wishlist/loading.tsx`, `app/wishlist/error.tsx`, new `src/wishlist/route-states.test.tsx` |
| Focused full-suite timeout | `src/analytics/sdk-import-boundary.test.ts` |
| Visual and artifact gates | `tests/visual/wishlist-empty.visual.spec.ts`, `tests/visual/wishlist-filled.visual.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, optional new `scripts/collect-wishlist-visual-evidence.mjs` and its test, `tests/visual/baselines/BASELINE-MANIFEST.json`, four current wishlist PNGs plus four Linux PNGs if distinct platform baselines are needed |
| Acceptance evidence | `docs/delivery/evidence/arj-27/README.md`, `docs/delivery/evidence/arj-27/ci-database-job-run.md`, curated visual comparison images and notes under `docs/delivery/evidence/arj-27/` |

## Review focus

These five valid input or failure cases need direct tests, not only implementation review:

1. A supported non-default currency omitted by the partial table must display at its true precision (Task 2).
2. A stored source URL without retailer metadata must remain available as a labeled link (Task 2).
3. A wishlist with 1001 rows and tied sort positions must display all rows and an accurate count (Task 3).
4. Sign-in or second-user setup failure must still delete every created fixture and close every created context (Task 4).
5. A not-found or second-user document and RSC response must contain no first-user image URL or other item field (Task 5).

## Task 1: Correct copy and V18 presentation

**Files:** Modify `src/wishlist/wishlist-card.tsx`, `src/wishlist/wishlist-view.tsx`, `src/wishlist/wishlist-view.test.tsx`, and `tests/e2e/wishlist-local.spec.ts`; create `src/wishlist/wishlist-typography.module.css`.

**Interface:** The two UI components continue to receive `OwnWishlist` and `WishlistItemSnapshot`; no new data access or shared design-token value is introduced.

- [ ] Pin the exact amended empty paragraph in the component and its unit and browser assertions. Assert the DOM has no `Your friends will take it from there.` in the empty state. Keep the heading and `Add an item` CTA unchanged.
- [ ] Add component-scoped semantic classes in the CSS module: profile name at `1.875rem` on mobile and `2.25rem` from the desktop breakpoint, and empty heading at `1.875rem` at both viewports. Keep display font, weight, and responsive line height. The shared `text-display-sm` and `text-display-md` tokens remain available to other screens.
- [ ] Move the negative top offset from the whole profile row to the avatar and, if needed, the name block. The avatar retains its band overlap. Position the desktop name to match V18 while the entire taste-line bounding box clears the divider by at least 4 CSS pixels. Keep the count below the taste line and verify mobile layout after the shared change.
- [ ] Add a deterministic browser geometry assertion for both viewport projects: the taste line's top is at least the profile band's bottom plus 4 pixels. Assert the empty heading's computed font size is 30px and the name is 30px mobile or 36px desktop. These are targeted V18 hierarchy checks, not screenshot replacements.
- [ ] Run the focused component tests and the local-stack empty/filled e2e tests in the available CI stack. Recapture all four wishlist states only after the layout is stable. Do not update manifest approval at this stage.

## Task 2: Correct original money and source links

**Files:** Modify `src/wishlist/display.ts`, `src/wishlist/display.test.ts`, `src/wishlist/wishlist-card.tsx`, `src/wishlist/wishlist-card.test.tsx`, and `tests/e2e/wishlist-local.spec.ts`.

**Interface:** Keep `formatMoneyMinor(amountMinor: number, currency: string): string` and the existing card props. Keep the default two-decimal behavior for unknown three-letter codes.

- [ ] Replace the six-entry exception set with a pinned complete set of supported ISO 4217 non-two-decimal codes, sourced from the current SIX List One minor-unit column. Store the source URL and retrieval date beside the table or in its test. Explicitly cover `CLP` and `UGX` as zero-decimal, `JOD` and `TND` as three-decimal, existing `JPY`, `KWD`, `INR`, and the unknown-code fallback. Keep `toFixed(digits)` and the code suffix; no symbol or conversion.
- [ ] In the card, branch first on `sourceUrl`. If present, render an anchor with `href={item.sourceUrl}`, `rel="noreferrer"`, and text `item.retailer ?? new URL(item.sourceUrl).hostname` through a small safe-label helper. If URL parsing fails, use `Source link` without exposing an exception. If `sourceUrl` is absent, render a plain retailer name only when provided.
- [ ] Test the four combinations of source URL and retailer in the component. Seed an e2e item with source URL and no retailer, and assert its link label, URL, `rel`, and keyboard focus. Keep the no-price and original-price tests.
- [ ] Run `pnpm exec vitest run src/wishlist/display.test.ts src/wishlist/wishlist-card.test.tsx` and the focused stack-gated populated spec in CI. Record the authoritative currency-list source in review evidence.

## Task 3: Read past the PostgREST row cap

**Files:** Modify `src/wishlist/data.ts`; create `src/wishlist/data.test.ts`; extend `tests/e2e/wishlist-local.spec.ts`.

**Interface:** `getOwnWishlist(userId): Promise<OwnWishlist | null>` stays server-only and returns all selected items in the existing total order. Any page error produces the designed error path rather than a partial list.

- [ ] Add a bounded `PAGE_SIZE = 500` range loop under the configured `max_rows = 1000`. Apply the same explicit 13-column select, owner wishlist filter, `sort_position` then `id` ascending order, and `.range(offset, offset + PAGE_SIZE - 1)` on every request. Append each returned page. Stop only when a page contains fewer than 500 rows; an exact 500-row page requires another request. Return `null` on any page error.
- [ ] Test zero rows, 500 rows, 1000 rows, 1001 rows, tied `sort_position` values across the page boundary, and a second-page error with a mocked server client. Assert the complete result and count, the exact range calls, both order calls on each page, and no partial success on error.
- [ ] Add one bounded local-stack integration case with 1001 synthetic items and equal sort positions at the 500/501 boundary. Assert `1001 things` and first/last unique titles in the rendered document, then delete the fixture. Keep this separate from the four-item visual fixture.
- [ ] Run focused data tests and the large-list stack-gated test. Inspect server memory and CI duration; preserve the single server-rendered document contract.

## Task 4: Make fixture cleanup reliable and local-only

**Files:** Modify `tests/helpers/local-stack.ts`, `vitest.config.ts`, `tests/e2e/wishlist-local.spec.ts`, both wishlist visual specs; create `tests/helpers/local-stack.test.ts`.

**Interface:** Fixture creation must register cleanup as soon as an ID exists. The test scope owns created users and browser contexts until its finalizer runs. All finalizer operations are attempted even if one fails.

- [ ] Guard `stackAdminClient()` before `createClient`: parse `NEXT_PUBLIC_SUPABASE_URL` and accept only `http:` with hostname `127.0.0.1`, `localhost`, or `[::1]`. Throw before constructing the service-role client for staging and production hosts. Do not print the URL or key in errors.
- [ ] Replace `signedInFixture`'s create-then-return pattern with a scoped helper that registers `deleteFixtureUser` immediately after `createFixtureUser` returns. On sign-in failure, its own `catch` invokes cleanup before rethrowing; on success, callers invoke cleanup in `finally`.
- [ ] In the two-user case, register A's context and user before sign-in or seeding A, and register B's context and user as each is created. Use `Promise.allSettled` or equivalent finalization so failure deleting A cannot skip B or either context. Keep the first failure visible while reporting cleanup failures without credential data.
- [ ] Apply the same immediate registration rule to both visual specs. A failed login or failed seed must not leave a synthetic user. Do not take screenshots until the auth redirect has completed.
- [ ] Unit-test the local-host guard and injected sign-in, second-user-creation, and first-delete failures with fake operations. Assert every registered deletion and close was attempted. A hard runner kill remains contained by the disposable CI stack.
- [ ] Add `tests/helpers/*.test.ts` to Vitest's explicit `include` list so the fixture lifecycle test actually runs in `pnpm test`; verify its count appears in the suite output.

## Task 5: Complete keyboard and privacy proof

**Files:** Modify `tests/e2e/wishlist-local.spec.ts` and, if a control actually fails, its owning component under `src/wishlist/` or `src/home/account-menu.tsx`; create `src/wishlist/route-states.test.tsx` for the existing `app/wishlist/loading.tsx` and `app/wishlist/error.tsx` components.

- [ ] Extend the empty and populated keyboard test to Tab through the wordmark, account trigger, opened menu entries including `My wishlist`, empty CTA, interim back link, and retailer link. For each, assert `document.activeElement`, a visible `:focus-visible` outline, and Enter or Space behavior appropriate to the control. Use keyboard input to open and close the menu; do not substitute `.focus()` for reachability.
- [ ] Assert the amended full empty paragraph, including absence of the V18 audience sentence, and retain axe WCAG A/AA scans for both states.
- [ ] Extend cross-user and unknown-child checks to inspect the document response body and relevant RSC/network response payloads as well as DOM text. Use synthetic title, note, retailer, amount, wishlist ID, and image URL markers. Filter to the target navigation and response types so a test fixture request by A is not mistaken for a B leak. Assert the negative markers in each surface.
- [ ] Mount the existing loading and route-error components in the new unit test. Assert skeleton geometry and a status announcement without fake item titles, the reduced-motion CSS rule by source or computed style, generic error copy without the injected raw error, and that the retry button calls `reset`. Retain the missing-wishlist view-branch test.
- [ ] Run the focused local-stack e2e suite in CI and record actual executed test counts and results. If a test exposes a product issue, fix that owning component and repeat the test; an expanded test alone is not proof of behavior.

## Task 6: Tighten visual and artifact gates

**Files:** Modify both wishlist visual specs, `playwright.config.ts` if a platform-specific path is necessary, `.github/workflows/ci.yml`, `tests/visual/baselines/BASELINE-MANIFEST.json`, the candidate PNGs, and `docs/delivery/evidence/arj-27/README.md`. Create an image collector only if CI image transport needs it.

- [ ] Remove both `maxDiffPixelRatio: 0.03` allowances and the false guarantee that 3% catches all design changes. Freeze the approved viewport, local vendored images, local fonts, Chromium version, animations, caret, route, fixture, and scroll state. Use strict same-platform pixel comparison. If macOS and Linux rasterization remain distinct, use separate explicitly named Linux snapshot baselines at 390x844 and 1440x1000, captured on the CI runner image. Do not relax the whole-image threshold to absorb glyph variation.
- [ ] Remove `.github/workflows/ci.yml`'s general `test-results/` upload. If CI must transport candidate actual/diff images for review, collect only filenames matching the four wishlist state and viewport names with `-actual.png` or `-diff.png` from the wishlist visual spec result directories into a dedicated image-only directory. The upload step may target that directory only. A controlled fake failure containing an invented OTP in `error-context.md` must demonstrate that no markdown, auth screenshot, trace, or report enters the artifact. Do not upload a real auth failure for the probe.
- [ ] Recapture the four product candidates after Tasks 1-5. Generate same-platform Linux candidates in CI for its strict comparisons. Compare each new image directly with its pinned V18 counterpart, at identical viewport and state; review desktop divider clearance, mobile display hierarchy, copy, card design, placeholder contrast, and known scope omissions. Record dimensions, SHA-256, and exact accepted differences, including the final V18 audience sentence and the desktop sidebar shell omission.
- [ ] Obtain an independent reviewer who actually opens all candidate images and pinned references. A `REQUEST_CHANGES` verdict requires fixes, fresh captures, new hashes, and another independent image review. The author does not approve their own captures.
- [ ] Only after actual image approval, run `node scripts/update-baseline-manifest.mjs`, enter the independent reviewer reference and date in `approvedBy` and `approvedDate`, run the guard test, and commit the exact approved PNGs and manifest. Approval is hash-specific; any later pixel change restarts review. Update the evidence README's former OCR-only approval narrative to describe the actual final review accurately.

## Task 7: Repair focused suite timing and close every proof gate

**Files:** Modify `src/analytics/sdk-import-boundary.test.ts`, `docs/delivery/evidence/arj-27/README.md`, and create `docs/delivery/evidence/arj-27/ci-database-job-run.md`. Update the implementation PR description and exact-head CI evidence when authorized.

- [ ] Reuse one `ESLint` instance for the six import-boundary assertions and give the first cold lint test a focused 15-second timeout. The full-suite failures measured 6.5 to 8.6 seconds for the first config load; 15 seconds gives bounded headroom. Keep all six import allow/deny assertions and the global 5-second default for other tests. Run the isolated six tests, then the full Vitest suite twice under load.
- [ ] Run local `pnpm verify` on the final code and record each command result. Do not cite the historical `verify-pass.txt` or the two failed recovery logs as final proof. Resolve failures, then repeat `pnpm verify` on the final working tree.
- [ ] Prove the page-level signed-out gate without a provider, separately from stack-enabled CI. On the final committed revision in the recovered checkout, assert that no Next production environment file is present and do not source or copy the original checkout's file. Build a fresh production bundle with the repository's two relevant `NEXT_PUBLIC_SUPABASE_*` variables, the service-role key, and the local-stack gate explicitly unset. Run only the plain wishlist Playwright spec against that fresh build in both configured viewport projects, preserving the same unset environment for Playwright's production web server:

  ```bash
  test ! -e .env.local
  test ! -e .env.production.local
  test ! -e .env.production
  test ! -e .env
  git rev-parse HEAD
  env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    -u SUPABASE_SERVICE_ROLE_KEY -u E2E_LOCAL_SUPABASE \
    PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm build
  env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    -u SUPABASE_SERVICE_ROLE_KEY -u E2E_LOCAL_SUPABASE \
    PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm exec playwright test \
    tests/e2e/wishlist.spec.ts --project=mobile --project=desktop
  ```

  Record the exact revision, commands and explicitly absent provider names, sanitized executed counts, and the AC2/AC3 redirect, zero-markup, and POST-denial results. Do not print environment values. If either run fails, repair and repeat the fresh build and plain suite. This proof does not stand in for the provider-enabled proxy-envelope tests or the `database` job.
- [ ] On the implementation PR's exact committed head, require green `verify` and `database` jobs via `gh pr checks`. Extract short CI lines showing the wishlist plain, stack-gated, axe, and visual specs actually executed, their counts, and strict screenshot results. Confirm the job runs the explicit paths in `scripts/e2e-local-stack.sh`. If checks fail or head changes, repair, obtain new review where the changed area warrants it, and rerun checks on the new exact head.
- [ ] Replace every evidence README assertion that names old commit, branch, screenshots, reviewer approval, or green CI with the final exact facts. Include the Railway preview URL if available, before/after visual pairs, accepted differences, no-migration rollback note, no prototype mock data, and a sanitization statement. State which loading/error behaviors were proven by mounted tests and which by source review; do not claim unit coverage that did not run.
- [ ] Obtain independent code and security re-review of every R1-R7 fix and the final diff. For each rejection, fix it and repeat the affected tests, images, and review. Merge only after the independent code and image verdicts are approvals and all required checks are green on the exact final head under the existing owner gate.

## Acceptance evidence ledger

This table is a checklist of required final evidence. It does not claim any item has passed in the recovered tree. Fill it with actual run references and reviewed hashes before completion.

| 005b criterion | Required final proof |
| --- | --- |
| 1 Proxy exact paths | `src/auth/proxy-policy.test.ts` positive and negative results on final head |
| 2 Signed-out GET | Fresh provider-disabled production build and plain wishlist Playwright results at both viewports for redirect and zero markup; separate provider-enabled CI proxy-header proof |
| 3 Signed-out POST | Same fresh provider-disabled plain suite for POST denial with and without Server Action header; separate provider-enabled CI POST envelope proof |
| 4 No-store document | Signed-in document header assertion plus proxy unit proof |
| 5 Empty state | Exact amended paragraph, heading, count, CTA, no audience language or fake items |
| 6 CTA route | Keyboard and click navigation to protected honest interim page and back |
| 7 Populated fields | Snapshot fields, full original prices, source-without-retailer link, total order |
| 8 Image fallback | No URL, snapshot-only, and runtime failure tests; reviewed placeholder images |
| 9 Persistence | Full reload and second tab with same four saved rows |
| 10 Cross-user deny | B DOM, document and RSC payload scans including A image URLs and known ID |
| 11 Stale session | Dead cookie redirects safely and re-sign-in restores items |
| 12 Keyboard and axe | Tab, focus, and activation for every named control; two axe scans |
| 13 Loading and error | Mounted component tests, reduced-motion review, and missing-row branch test |
| 14 Empty visuals | New 390x844 and 1440x1000 PNG hashes, V18 pairs, independent image approval |
| 15 Filled visuals | New 390x844 and 1440x1000 PNG hashes, V18 pairs, independent image approval |
| 16 Unknown child | 404 with no A item marker in DOM, document, or relevant RSC payload |
| 17 No mock shipment | Final production diff inspection for prototype data and scaffolding |
| 18 CI wiring | Script paths, executed test counts, green `verify` and `database` on exact PR head |

## Self-review and handoff

Every 005b criterion maps to a task and ledger row. Review focus cases map to Tasks 2-5. The known final code and image review findings map to Tasks 1-7. No historical approval or absent CI excerpt is counted as acceptance evidence. The controller obtains independent plan review before code implementation and owns the later execution and review gates.
