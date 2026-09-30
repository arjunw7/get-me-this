# ARJ-27 evidence: protected owner wishlist (005b)

Status on 2026-10-01: the consolidated responsive source correction at `0cd11a2` passed scoped independent review. Configured CI at the earlier `b50a5b3` passed 233 database assertions and 52 browser cases, but four old-baseline comparisons failed. Final-head configured CI, new Linux captures, exact-hash image approval, baseline adoption, an actual successful Railway deployment, and final review remain open. This is not merge approval. Historical `verify-pass.txt`, OCR, and earlier green CI claims do not prove the amended brief or the recovered tree. The binding 005b brief is committed at `fdd69e91b0ff48fb0f3b53f343379d8dd389cba1`. Implementation PR: [#28](https://github.com/arjunw7/get-me-this/pull/28). Detailed reviews are indexed in [`reviews/`](reviews/); external updates summarize major gates rather than each review round.

## Current implementation and evidence boundary

The page and interim add route retain the exact-path proxy gate, signed-in page gate, owner-only RLS read, and protected-response `Cache-Control: no-store`. The display read selects explicit snapshot fields, pages in the `(sort_position ASC, id ASC)` total order, and renders original money from a text-cast amount. The UI has the exact amended empty paragraph, V18-sized display hierarchy, source links even when retailer metadata is absent, image fallback, loading/error states, and no item-management or group surface.

Recovery regression work covers the complete currency exception table from [SIX ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), published 2026-09-17 and retrieved 2026-09-30. The `original_amount_minor::text` read and decimal-string formatter preserve the full PostgreSQL `bigint` range without JavaScript numeric rounding. The helper prevents service-role fixture clients from targeting non-loopback hosts and registers cleanup immediately after each created user or browser context.

The [implementation report](reviews/arj27-implementation-report.md) records exact commands and red/green outcomes. The [configured CI report](ci-b50a5b3.md) records the executed database, signed-in browser, strict Linux image comparisons, artifact hashes, and retained warnings at `b50a5b3`. Its actual Actions merge checkout has the same Git tree as that source head. [`ci-database-job-run.md`](ci-database-job-run.md) is the older pending ledger, not a green-check claim. Every relevant check must pass again on the final PR head after the remaining correction and independently approved baseline adoption.

The Railway GitHub check reported success for `b50a5b3`, but Railway's deployment record was `SKIPPED`. The last successfully deployed PR preview remained `8b40f4b`. Availability of that URL is not evidence that the recovered head is deployed; the final preview gate requires an actual successful deployment of the reviewed revision.

## Acceptance evidence ledger

| 005b criterion | Required final evidence and current status |
| --- | --- |
| 1 Proxy exact paths | Positive/negative policy tests passed in the b50a5b3 verification job; final-head rerun required. |
| 2 Signed-out GET | [Provider-disabled proof](reviews/arj27-provider-disabled-proof.md) at 626aba6 and configured b50a5b3 cases passed at both viewports; final-head rerun required. |
| 3 Signed-out POST | The same provider-disabled proof and configured b50a5b3 POST cases passed; final-head rerun required. |
| 4 No-store document | Signed-in document-header cases passed at b50a5b3 at both viewports; final-head rerun required. |
| 5 Empty state | Exact paragraph, heading, count, CTA and absence checks passed in the b50a5b3 browser run; image-set approval remains open. |
| 6 CTA route | Keyboard/click path to the honest protected interim route and back passed at b50a5b3; final-head rerun required. |
| 7 Populated fields | Snapshot, complete ordering, 1001-row count and full-bigint owner API wire/render cases passed at b50a5b3; final-head rerun required. |
| 8 Image fallback | No URL, snapshot-only and runtime-failure coverage passed; the placeholder was directly reviewed in the mobile and desktop images. The complete visual gate is still open. |
| 9 Persistence | Reload and same-browser second-tab cases passed at b50a5b3; final-head rerun required. |
| 10 Cross-user denial | Separate DOM, HTML-document and real Flight scans passed at both viewports at b50a5b3, including private image URLs and wishlist ID; final-head rerun required. |
| 11 Stale session | Dead-cookie recovery and re-sign-in cases passed at b50a5b3; final-head rerun required. |
| 12 Keyboard and axe | Keyboard/focus/activation and both axe states passed at b50a5b3. Two destination-stream-closed warnings are retained in the CI report, not silently omitted. |
| 13 Loading/error | Mounted skeleton/status and generic retry unit tests passed; reduced-motion CSS source review and missing-row branch retained. Browser state capture is not claimed. |
| 14 Empty visuals | Source correction approved; fresh mobile and desktop captures plus full-set exact-hash approval pending. |
| 15 Filled visuals | Source correction approved; fresh mobile and desktop captures plus full-set exact-hash approval pending. |
| 16 Unknown child | Not-found and zero owner-marker DOM/document/Flight cases passed at both viewports at b50a5b3; final-head rerun required. |
| 17 No mocks shipped | Covered by the independent source review; final diff inspection still required before merge. |
| 18 CI wiring | Explicit stack spec list executed 233 database assertions and 56 browser/image cases. Verify passed, but four old-baseline comparisons failed. Green final-head verify and database jobs remain mandatory. |

## Visual comparison and accepted scope differences

The original independent image review rejected the recovered candidate hashes: desktop taste text crossed the profile divider and mobile display typography was too small. The [direct re-review](reviews/arj27-visual-rereview.md) of four real CI actual images resolved those two findings and approved the two mobile images by hash. It found a desktop owner-name/divider collision in both desktop states. The consolidated source correction and its avatar and long-name regressions passed [scoped independent re-review](reviews/arj27-r5-r6-rereview.md). The complete four-image set and existing dirty manifest are not approved for adoption. Fresh captures require direct comparison at identical viewport and state with the four pinned V18 references, then independent review of their exact hashes. The general 3% screenshot allowance was removed; CI needs independently reviewed Linux baselines for strict same-platform comparison.

The amended 005b brief intentionally omits V18's final “Your friends will take it from there.” sentence. Other accepted slice differences are the “Add an item” CTA without icon, default coral profile band and initials avatar, original code-suffixed prices without conversion, and omitted Share/Edit profile, group visibility, reactions, reorder, privacy toolbar, populated add affordance, prototype desktop sidebar, and mobile bottom navigation. The app retains its existing wordmark/account header shell. Fixture imagery uses vendored product photos or the branded cream placeholder. The inherited placeholder contrast correction uses `text-content-primary/55` for readable title echoes; its final image fidelity and axe results still require CI/review. The inherited sign-in helper accepts both onboarding and `/home` for returning profiles, and the desire-chip assertion uses an exact text match.

## Migration, rollback, and artifact hygiene

No migration or dependency is added in 005b. Revert the implementation PR to remove this slice's page, read, and proxy additions; the already merged 005a data remains. No Magic Patterns mock rows or editor scaffolding are in application code. Synthetic fixtures are limited to the disposable local/CI stack and deleted by scoped teardown. The CI failure artifact collector copies only allowlisted wishlist actual/diff PNGs after sign-in; a controlled test with an invented OTP in `error-context.md` proves markdown, auth images, traces, and reports are excluded. Do not upload raw error context, token-bearing URLs, auth screenshots, traces, or HTML reports.
