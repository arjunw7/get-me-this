# ARJ-27 independent recovery implementation review

Date: 2026-09-30. Reviewer: `/root/arj27_implementation_review`.

**Spec verdict: REQUEST_CHANGES.** The implementation meets the production contracts inspected, but the required separate RSC privacy proof is still missing.

**Code quality verdict: REQUEST_CHANGES for the regression coverage finding below.** No additional unresolved production-code correctness or authorization defect was identified after the geometry follow-up.

**Ready to merge: No.** Fix and re-review the privacy test, then close the independent image and exact-head CI gates. This report is not image, database, staging, or merge approval.

## Scope and review basis

Reviewed the whole branch from `f925e95fc41c9f9a0af0d30c523bc8b5c655d240` through implementation commit `e5b1f77d9ca32db8abe46d020491919c746414be`, using `arj27-whole-branch-e5b1f77.diff`, its commit list and statistics, committed source and tests, and the approved requirements. Included the subsequent one-line geometry correction `626aba6013576b04595f1e78fba5d4eb5d60967e` and the audit-only addition `2baa795e1f77c1adc9867f930cfa6a60cd80b008`. The final reviewed head is **`2baa795e1f77c1adc9867f930cfa6a60cd80b008`**; its executable code is unchanged from `626aba6`.

Requirements: the amended 005b brief, `arj27-implementation-dispatch.md`, the approved recovery plan, and the approved money addendum. Also inspected the repository guide, design and wishlist contracts, permissions matrix, visual-baseline procedure, the earlier spec/plan/code/image reviews, the author report, and provider-disabled proof. Author and historical evidence were treated as claims, not reviewer approval.

The review used the requesting-code-review skill's reviewer criteria. It was read-only except for this report. No application code, index, HEAD, branch, baseline, external system, or fixture was changed. No subagents or broad test reruns were used. Existing working-tree PNGs and manifest were deliberately excluded from approval.

## Strengths

- The owner read remains server-only and uses a fresh caller-authenticated Supabase client. The page authenticates and completes the profile before reading. The owner wishlist filter and existing owner RLS policies remain intact. Every item request uses the same explicit 13-field selection, both ascending order keys, and a 500-row range. Converted money is absent.
- The monetary transport and formatter are coherent. The select contains `original_amount_minor::text`; the selected amount and snapshot are `string | null`; runtime validation rejects numeric and bigint values, noncanonical decimals, values beyond `9223372036854775807`, and mismatched null pairs. The formatter uses string padding and slicing, with no numeric conversion or raw bigint crossing React boundaries. A mapping failure returns the generic error view, rather than a partial list.
- The source URL now controls link rendering independently of retailer metadata. Hostname and generic fallback labels preserve valid source-only snapshots; `rel="noreferrer"` remains. Unit coverage includes linked retailer, unlinked retailer, source-only, absent metadata, and a failed label parse.
- Fixture users and independently created contexts are registered immediately. Cleanup attempts all registered operations, including synchronous failures, and preserves the primary failure when cleanup also fails. The loopback HTTP guard runs before service-role client construction. Application code contains no service-role access.
- Failure artifacts are now copied into a dedicated directory by exact wishlist actual/diff PNG basename and visual-suite directory checks. General result directories are no longer uploaded. The controlled exclusion test contains an invented OTP only and checks output names and absence of that value from process output.
- Scope remains bounded: no dependency, migration, management surface, conversion display, groups, sharing, extraction, or prototype mock data was added. The amended empty paragraph is exact. Loading and generic error states are mounted in tests; the error test checks digest-only logging and retry invocation.

## Important finding

### I1 / P2: The privacy helper can pass without testing an RSC response

**Location:** `tests/e2e/wishlist-local.spec.ts:87-109`, especially `:94-105`; used by the second-user check at `:565` and unknown-child check at `:783`.

`navigateWithPayloads` subscribes to responses whose content type is HTML **or** `text/x-component`, performs only `page.goto(path)`, and requires merely `payloads.length > 0`. A successful document navigation supplies an HTML response and satisfies that condition by itself. Neither caller requests a Flight response, triggers a client navigation that is required to obtain one, nor asserts that a `text/x-component` response was received. Consequently both tests can pass while the RSC-specific response path is untested. The labels saying "document/RSC" do not establish that both were inspected.

The HTML body does contain the initial document's serialized component data, so this is a remaining proof gap, not an observed data leak. It does not establish the separately requested response path. Recovery plan Task 5 explicitly requires a not-found or second-user **document and RSC response** free of the first owner's image URL and other markers. This is the unclosed part of recovery R6 and the proof for criteria 10 and 16.

**Required change:** retain the document check, then deliberately obtain a real Flight response for each target using the appropriate authenticated browser context. Assert the actual `text/x-component` content type and a nonempty collected body separately from the HTML response. Apply the same title, note, retailer, amount, count, wishlist ID, and image URL denials to each surface. Keep collection limited to the target navigation and to user B for the cross-user case. Run the affected cases in configured CI and record their executed results. A mock or another HTML-only request cannot close this finding.

## Finding resolved during this review

### I2 / P2 at e5b1f77: Desktop taste-line clearance was below its new minimum

At `src/wishlist/wishlist-view.tsx:97`, the original `sm:-mt-9` offset was minus 36px. With the 36px profile name at line-height 1.04 and the taste paragraph's 2px top margin, the intended single-line desktop name left approximately `37.44 - 36 + 2 = 3.44px` below the band. The new browser assertion at `tests/e2e/wishlist-local.spec.ts:75` requires at least 4px, so the committed geometry contradicted its own acceptance assertion.

The author independently identified the same issue and committed `626aba6`, changing only this offset to `sm:-mt-8` (minus 32px). This gives approximately 7.44px under the same layout assumptions. The source defect is **addressed in the final reviewed head**. Actual configured-browser geometry and the visual appearance still require their scheduled execution and independent image review. This source calculation is not an image approval.

## Disposition of prior findings

| Prior finding | Code and test disposition | Remaining gate |
| --- | --- | --- |
| R1, incomplete ISO precision table | Addressed. The pinned 26-entry nondefault table includes the omitted zero-, three-, and four-digit cases. Representative tests include CLP, UGX, JOD, TND, JPY, KWD, INR, and unknown-code fallback. | Final configured rendering evidence. Fresh source XML retrieval was unavailable in this review, as recorded below. |
| R2, source URL hidden without retailer | Addressed. Source-first rendering and safe label fallback are implemented and tested. | Execute the source-only browser and keyboard assertions. |
| R3, 1000-row truncation | Addressed. 500-row pages continue after a full page, preserve the owner filter and total order, and fail the whole read on a later-page error. Unit cases cover 0, 500, 1000, and 1001 rows; the integration case seeds tied-boundary rows and asserts the total plus first/last titles. | Execute the 1001-row case in the configured database job. |
| R4, general result artifact upload | Addressed. Only the dedicated collector output is uploaded; allowed basenames, suite directories, and regular files restrict collection. The exclusion test rejects markdown, traces, and auth-suite outputs. | Actual CI artifact review remains limited to the allowlisted images. |
| R5, blanket 3% visual tolerance | Addressed in configuration. Both per-image allowances are removed; no replacement whole-image ratio is present. | Strict Linux captures, direct image review at exact hashes, approved manifest, and green comparison remain pending. |
| R6, incomplete keyboard and private payload proof | Partially addressed. Tab reachability, active focus, visible outline, wordmark and menu operation, CTA, back navigation, source-only activation, axe scans, HTML checks, and image markers are substantially expanded. The independent RSC response requirement remains I1. | Fix I1 and execute the affected browser suite. |
| R7, cleanup after setup failure | Addressed. Immediate registration, sign-in failure cleanup, scope finalization, all-settled cleanup, and preserved primary errors are implemented. Injected tests cover sign-in, second-user creation, deletion, and synchronous cleanup failure. | Execute normal configured fixture workflows; hard process termination remains contained by the disposable CI stack. |
| Additional local-only helper observation | Addressed. Only HTTP loopback hosts are accepted before creating a service-role client; rejection messages omit URL and key. | None beyond configured integration execution. |
| Additional loading/error evidence observation | Addressed. Mounted tests now cover skeleton/status, generic copy, digest-only logging, and retry. The missing-row branch remains separately tested. | Reduced motion is supported by the existing global rule and source inspection; no new reduced-motion browser execution is claimed. |
| Visual R1 and R2 | Scoped typography and avatar/name geometry changes address the source causes. The sub-four-pixel follow-up is resolved by 626aba6. | Both visual findings remain subject to the separate reviewer opening all four new Linux candidates and their pinned references. |
| Numeric precision addendum | Addressed in source and regression design. The exact cast, canonical runtime validation, null pair, exact string formatting, full-bigint values, and generic failure path were inspected. The integration test inserts decimal strings, uses an authenticated owner client, inspects raw quoted JSON values and null, and checks both rendered large prices. | The real PostgREST wire/render case must execute in the named database job on the final head. |

## Security and assertion-depth assessment

The proxy's exact protected routes and final `Cache-Control: no-store` application are preserved. Signed-out redirects also retain `Referrer-Policy: no-referrer`. Both new pages call `requireCompleteProfile` before any owner read or protected content. Unknown child routes gain no wishlist loader or data surface. The existing schema's owner relationship and RLS policies support the query filter without privileged application reads. No concrete cross-user leakage was identified by source review.

The money unit tests check exact values and invalid transport types, rather than only checking types or implementation names. The server read tests verify the exact select, filters, both orders, range calls, and no partial result on failure. The full-bigint browser test's raw response checks distinguish quoted strings from rounded JSON numbers. PostgreSQL/Supabase execution remains a separate evidence gate, not something these mocks can prove.

The screenshot setup uses fixed viewports, Chromium from the existing pinned dependency tree, local fonts and vendored images, deterministic fixture values, disabled animations, and hidden caret. Capture guards occur after sign-in and target navigation. Removing the percentage allowance restores the configured screenshot comparator, but only real Linux execution and hash-specific review can accept final images.

## Verification evidence and limits

- The author supplied a successful local 425-test verification/build transcript and a six-case provider-disabled browser proof for `e5b1f77`. I inspected their stated commands and assertions; I did not rerun broad suites. Those historical results do not alone establish the final head's checks. The controller reports a fresh provider-disabled repeat for the geometry follow-up is in progress.
- The configured database job, owner PostgREST JSON boundary, signed-in browser/axe cases, and strict final Linux comparisons have no completed final-head result in the evidence reviewed here. The committed pending ledgers appropriately avoid claiming a pass.
- The committed manifest still contains the historical OCR-based approval record. The evidence README expressly rejects that as current approval. It must be replaced through the already authorized hash-specific image-review workflow before merge; neither it nor uncommitted PNGs is accepted by this report.
- A full-range `git diff --check f925e95 2baa795` reports inherited whitespace in historical audit/OCR/transcript files, including Markdown hard-break spaces and captured terminal carriage returns. No application-source whitespace finding was reported. These archival formatting details are not a new functional blocker and were not silently called a passing check.
- The official PostgREST casting documentation was consulted and supports text casting under the original response field name: <https://postgrest.org/en/stable/references/api/tables_views.html#casting-columns>. The SIX source URL could not be independently re-fetched here: the browser tool rejected its XML content type and the shell environment could not resolve the host. I reviewed the pinned table and approved source record without claiming a fresh authoritative-list download.

## Declined to judge

- Approval of candidate or historical PNGs: assigned to the independent rendered-image reviewer, and the current working-tree files have no accepted hashes in this code review.
- Success, duration, or infrastructure reliability of the configured database/visual job: no completed final-head execution was supplied; source wiring is reviewed only.
- Staging or production acceptance and preview behavior: no remote fixture writes or staging testing were authorized for this review.
- Wishlist mutation, concurrent mutation consistency across pages, extraction, Storage snapshot resolution, conversion, groups, reservations, and sharing: explicitly owned by later slices. The current display read's order, ownership, pagination, and null behavior were reviewed.
- Unrelated inherited account/auth implementation and historical audit formatting: inspected where they interact with this slice; no broad refactor or unrelated feature review is implied.

## Assessment

**Spec compliance: changes required for I1. Code quality: changes required for I1; no additional unresolved production-code defect identified. Ready to merge: No.**

Resolve the genuine RSC-response proof gap, obtain the renewed affected review, then require green `verify` and `database` checks on the exact final PR head, executed wishlist counts, the full-bigint wire/render result, and actual independent approval of all four final Linux image hashes. Update the evidence ledger and manifest with those results. The existing owner authorization applies; this review introduces no new human-approval gate.
