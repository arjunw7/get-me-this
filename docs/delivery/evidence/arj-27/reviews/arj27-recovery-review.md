# ARJ-27 recovery review

Date: 2026-09-30. Reviewer: independent recovery code reviewer (`arj27_recovery_review`).

**Verdict: REQUEST_CHANGES. No code/spec signoff for the recovered tree.**

Reviewed base `f925e95` to recovered HEAD `8b40f4bc52947143b845fbf600b8ab969c62430f` plus the eight recovered uncommitted fixes, using `recovery-review.diff` and the current files. No code, index, branch, baseline, or external service was changed during this review. This report is the only repository write. The binding 005b brief governs the older human-only approval wording; independent AI visual approval is allowed. The separately assigned image reviewer owns visual image approval.

## Blocking findings

### R1 : P2: Valid currencies render the wrong original price

**Location:** `src/wishlist/display.ts:48-55` (fallback applied at lines 69-71).

The exception table includes only three zero-decimal and three three-decimal currencies, although the schema accepts any uppercase three-letter code and the brief requires truthful ISO minor-unit precision. For example, `3500` minor CLP or UGX currently becomes `35.00 CLP/UGX`, rather than `3500`; `1250` minor JOD or TND becomes `12.50`, rather than `1.250`. These are valid stored values, not unknown currency codes. The current unit tests only exercise entries already in the partial table, so they approve the error.

I independently read the current [SIX ISO 4217 List One XML](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), which gives CLP/UGX minor units 0 and JOD/TND minor units 3. Complete the pinned non-default digit table from an authoritative source, preserve the specified two-decimal fallback for unknown codes, and add representative tests for the omitted categories. This is 005b resolution 4 / criterion 7, not a request to implement conversions or locale formatting.

### R2 : P2: A saved source URL disappears when the optional retailer is absent

**Location:** `src/wishlist/wishlist-card.tsx:91-105`.

The outer `item.retailer !== null` branch suppresses the entire link even when `sourceUrl` is present. The 005a schema permits this combination; retailer and source URL are independently optional. An owner therefore loses access to a saved product link in a valid snapshot, contrary to the brief's requirement to display the source URL as a retailer link when present.

Render a source link whenever a source URL exists, using a safe hostname or another clear fallback label when retailer is null, and preserve `rel="noreferrer"`. Add the source-present/retailer-null case to component and relevant integration coverage.

### R3 : P2: The owner read silently truncates wishlists at the API row cap

**Location:** `src/wishlist/data.ts:69-80`; configured cap: `supabase/config.toml:18`.

The items query makes one unpaginated PostgREST request while this repository configures `max_rows = 1000`. A valid wishlist containing 1001 saved items is therefore rendered with only the first 1000, and the profile reports `1000 things` from the truncated array. No schema/product limit restricts owners to 1000 items, and the response is presented as a complete list without a continuation affordance.

Read successive server-side ranges using the existing deterministic `(sort_position, id)` order, or explicitly implement a reviewed bounded-list contract with an accurate count and continuation. For this slice, server-side pagination preserves the brief's single server-rendered document. Add focused coverage at the row-cap boundary and for tied sort positions.

### R4 : P1: The new diagnostic artifact upload can publish authentication secrets

**Location:** `.github/workflows/ci.yml:124-130`, specifically `path: test-results/`.

The step says it uploads failed screenshot actual/diff images, but it uploads every test result after any database-job failure. The same job runs `auth-otp.spec.ts`. Installed Playwright 1.63 writes `error-context.md` containing error messages and a page accessibility snapshot on failures (`playwright/lib/index.js:647-714`, `errorContext.js:49-84`). This happens independently of trace/screenshot configuration. OTP controls are ordinary text inputs, so an auth assertion failure can leave their values in the uploaded page snapshot. A failed magic-link navigation can also put its secret URL in the error details.

A bounded independent browser probe with **invented** digits confirmed that `page.ariaSnapshot({mode:"ai"})` includes all six textbox values. No real token or credential was used in the probe. The new upload breaches the 005h/005b artifact-hygiene contract even though the credentials belong to a local disposable stack.

Remove the temporary upload or restrict it to an explicit allowlist of the four wishlist screenshot actual/diff PNG outputs captured after sign-in. Do not upload general error-context files, auth screenshots, traces, or HTML reports. Verify the allowlist on a controlled failure without using real credentials.

### R5 : P2: The blanket 3% visual allowance does not enforce its stated guarantee

**Locations:** `tests/visual/wishlist-filled.visual.spec.ts:122-129` and `tests/visual/wishlist-empty.visual.spec.ts:69-76`.

The recovered fix changes the comparison to allow 3% of **the entire full-page image** to differ and claims that this still fails any real composition, layout, or copy change. The committed filled mobile image is 390×2470, permitting 28,899 changed pixels; filled desktop is 1440×1355, permitting 58,536. A complete desire-chip color change, a title-scale change in one card, or other localized approved styling can fit well within that allowance. The filled-state guards assert only Ada, `4 things`, and four articles, and the separate DOM tests do not pin those styles. Manifest hashes guard baseline changes, not this weakened comparison.

I did not receive reproducible paired Linux actual/diff evidence establishing the claimed ~1.4% anti-aliasing-only variance. Even if that observation is correct, it does not establish the stronger detection guarantee in the comments. Use independently reviewed Linux captures for the CI comparison, or demonstrate a narrowly bounded stabilization/threshold that accounts for the measured variance and still rejects representative local design regressions. Keep platform evidence and the accepted threshold in the evidence pack; remove the false guarantee.

### R6 : P2: Mandatory keyboard and private-payload proof is incomplete

**Locations:** `tests/e2e/wishlist-local.spec.ts:450-517` and `:530-542`; cross-user coverage at `:375-385`.

The test named “every interactive element” never opens or operates the account menu, the new My wishlist entry, or the wordmark. It programmatically focuses the add page's back link, which does not prove Tab reachability, and never checks the retailer's visible focus or activates it. An inaccessible shell control or retailer could ship while this test remains green. Criterion 12 explicitly requires those controls to be keyboard reachable and operable with visible focus.

The unknown-child test reads only body text; it never inspects the response/RSC payload demanded by criterion 16. The cross-user scan does inspect its document response, but omits image URLs from the required secret fields. Extend the existing focused tests to cover the specified controls and payload markers, using deterministic synthetic values. This is a proof gap; I did **not** observe an actual cross-user data leak in the production read path.

### R7 : P2: Fixture cleanup does not run when setup fails

**Locations:** `tests/e2e/wishlist-local.spec.ts:124-126`, callers such as `:161-169`, and cross-user setup `:344-354`.

`signedInFixture` creates a user and performs the whole sign-in before returning its ID, while callers enter their `try/finally` only after that helper returns. A sign-in timeout therefore leaks the user, profile, wishlist, and any later setup data. The cross-user test similarly creates/signs in/seeds A and creates B before entering its cleanup region; failure during that setup leaks A. Its serial cleanup also stops if deleting A throws, skipping B and both context closes. This contradicts the helper/evidence claim that every fixture is deleted in teardown, and the recovered sign-in hang is exactly such a failure path.

Register cleanup immediately after each successful creation using a Playwright fixture or a surrounding setup-and-test `try/finally`; ensure all independent cleanup operations are attempted even when one fails. A small injected-failure test/probe should show cleanup runs after sign-in and second-user-creation failures. Hard runner termination cannot be solved by in-process finally; the isolated disposable CI stack is the correct containment for that case.

## Positive findings and recovery-fix assessment

- The page and interim add page call `requireCompleteProfile()` before their reads/rendering. The proxy exact-path policy and final protected-response `no-store` policy match the brief. No new public read surface or per-item route was added.
- `data.ts` is server-only, uses the caller's server client and the existing owner-only RLS, explicitly selects the 13 snapshot columns, omits conversions, and orders by both required keys. A missing wishlist or read error becomes a generic error state rather than a fake empty list.
- Production code is bounded to this slice. No new dependency, schema change, service-role use in application code, Magic Patterns mock data, or item-management/extraction surface was found.
- Both new visual specs and the wishlist E2E specs are in the CI script's explicit path list. The script propagates build/test failures. Workflow concurrency cancels superseded PR runs and preserves main runs; the existing job/step time budgets remain in place. Actual runtime and execution counts still need fresh CI evidence.
- The recovered sign-in-helper change correctly accepts onboarding for new profiles and `/home` for returning complete profiles. It retains the real magic-link UI path. The exact desire-chip assertion fixes a genuine ambiguous matcher without weakening the expected value.
- The recovered placeholder contrast change is a substantive implementation change, not a scanner exclusion. Its image fidelity and final baseline approval are deferred to the independent visual reviewer.

## Additional hardening observations

- `tests/helpers/local-stack.ts:32-36` calls the supplied URL with a service-role key without enforcing a loopback/local-stack target. The script obtains a local URL, but the helper's documented direct-environment entry path can target staging/production. An explicit local-host guard would make its “local only” contract enforceable and prevent repeating the evidence pack's admitted staging fixture writes. No remote writes were performed in this review.
- The loading and route-error components were inspected, but the added unit suite tests the view's missing-row branch only; it does not mount `loading.tsx` or `error.tsx`. The evidence pack should describe that distinction accurately. The reduced-motion CSS and generic error/digest-only behavior are present by inspection.

## Evidence limits and final gate

This was an independent code/spec review, not a rerun of broad verification. `git diff --check` passed. The main agent's local verification was in progress; I did not reuse the committed historical `verify-pass.txt` as fresh proof. The recovered working tree was uncommitted, so an exact-head green check cannot cover those changes yet.

`docs/delivery/evidence/arj-27/README.md` claims green exact-head CI and a curated `ci-database-job-run.md`, but that file was absent at review time. The README's historical OCR/programmatic approvals are not image-review evidence and do not fulfill the current independent image gate on their own. The assigned visual reviewer can supply fresh approval under the owner's authorization.

Security assessment: production authorization approach is sound; failure-artifact hygiene requires a fix. Correctness assessment: changes required for currency precision, source links, and complete reads. Maintainability assessment: small and readable modules, but fixture lifecycle needs correction. Performance assessment: two server reads rather than per-item requests; complete-list handling needs an explicit strategy. Acceptance assessment: required keyboard/payload proof, trustworthy visual regression configuration, and fresh exact-head CI evidence remain outstanding.

**REQUEST_CHANGES. Re-review the fixes and the exact final tree, then obtain independent visual approval and green `verify` + `database` checks on that exact committed head before merge.**

