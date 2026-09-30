# ARJ-27 evidence — protected owner wishlist (005b)

Status on 2026-09-30: recovery implementation is under review. This file records the evidence still required for the final PR head; historical `verify-pass.txt`, OCR, and earlier green CI claims do not prove the amended brief or the recovered tree. The binding 005b brief is committed at `fdd69e91b0ff48fb0f3b53f343379d8dd389cba1`. Implementation PR: [#28](https://github.com/arjunw7/get-me-this/pull/28). The review and decision log is in [`reviews/`](reviews/).

## Current implementation and evidence boundary

The page and interim add route retain the exact-path proxy gate, signed-in page gate, owner-only RLS read, and protected-response `Cache-Control: no-store`. The display read selects explicit snapshot fields, pages in the `(sort_position ASC, id ASC)` total order, and renders original money from a text-cast amount. The UI has the exact amended empty paragraph, V18-sized display hierarchy, source links even when retailer metadata is absent, image fallback, loading/error states, and no item-management or group surface.

Recovery regression work covers the complete currency exception table from [SIX ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), published 2026-09-17 and retrieved 2026-09-30. The `original_amount_minor::text` read and decimal-string formatter preserve the full PostgreSQL `bigint` range without JavaScript numeric rounding. The helper prevents service-role fixture clients from targeting non-loopback hosts and registers cleanup immediately after each created user or browser context.

The local implementation report under `.superpowers/sdd/get-me-this-phase4-controller/arj27-implementation-report.md` records exact commands and red/green outcomes. The CI database run, signed-in browser tests, and strict Linux image comparison remain pending until the controller runs them on the committed implementation head. [`ci-database-job-run.md`](ci-database-job-run.md) is a pending ledger, not a green-check claim.

## Acceptance evidence ledger

| 005b criterion | Required final evidence and current status |
| --- | --- |
| 1 Proxy exact paths | Existing positive and negative proxy-policy unit tests; rerun on final head. |
| 2 Signed-out GET | Fresh provider-disabled production build and plain wishlist Playwright at both viewports; configured CI proxy-envelope result. Pending. |
| 3 Signed-out POST | Same fresh plain suite for plain and Server Action shaped POST; configured CI envelope result. Pending. |
| 4 No-store document | Signed-in document header and proxy unit results. CI pending. |
| 5 Empty state | Exact amended paragraph, heading, count, CTA, absent audience sentence and mock rows. Component regression passed locally; browser pending. |
| 6 CTA route | Keyboard/click path to honest protected interim route and back. Browser pending. |
| 7 Populated fields | Snapshot fields, original prices through full `bigint`, source without retailer, complete order and 1001-row count. Unit regressions passed locally; actual owner API wire/render proof pending CI. |
| 8 Image fallback | No URL, snapshot-only, runtime failure, and reviewed placeholder image. Unit coverage passed locally; browser/image review pending. |
| 9 Persistence | Reload and same-browser second tab with four saved rows. Browser pending. |
| 10 Cross-user denial | B DOM, document, and relevant RSC payload scans including A image URLs and wishlist ID. Browser pending. |
| 11 Stale session | Dead cookie safe redirect and re-sign-in recovery. Browser pending. |
| 12 Keyboard and axe | Wordmark, account menu, CTA, back link, retailer Tab/focus/activation and both axe scans. Browser pending. |
| 13 Loading/error | Mounted skeleton/status and generic retry tests passed locally; reduced-motion CSS source review and missing-row branch retained. Browser state capture not claimed. |
| 14 Empty visuals | New 390×844 and 1440×1000 candidate hashes, V18 pairs, and independent actual-image approval. Pending. |
| 15 Filled visuals | Same for filled states and Linux strict comparison. Pending. |
| 16 Unknown child | 404 with no owner markers in DOM/document/relevant RSC payload. Browser pending. |
| 17 No mocks shipped | Final production diff inspection pending independent code review. |
| 18 CI wiring | Explicit spec list in `scripts/e2e-local-stack.sh`; executed counts and green `verify`/`database` checks on exact PR head pending. |

## Visual comparison and accepted scope differences

The independent image review in [`reviews/`](reviews/) rejected the recovered candidate hashes: desktop taste text crossed the profile divider and mobile display typography was too small. The recovered PNGs and manifest remain unapproved candidates and are excluded from the implementation commit. New captures require direct comparison at identical viewport and state with the four pinned V18 references, then independent review of the exact hashes. The general 3% screenshot allowance was removed; CI needs independently reviewed Linux baselines for strict same-platform comparison. No candidate or manifest approval is implied here.

The amended 005b brief intentionally omits V18's final “Your friends will take it from there.” sentence. Other accepted slice differences are the “Add an item” CTA without icon, default coral profile band and initials avatar, original code-suffixed prices without conversion, and omitted Share/Edit profile, group visibility, reactions, reorder, privacy toolbar, populated add affordance, prototype desktop sidebar, and mobile bottom navigation. The app retains its existing wordmark/account header shell. Fixture imagery uses vendored product photos or the branded cream placeholder. The inherited placeholder contrast correction uses `text-content-primary/55` for readable title echoes; its final image fidelity and axe results still require CI/review. The inherited sign-in helper accepts both onboarding and `/home` for returning profiles, and the desire-chip assertion uses an exact text match.

## Migration, rollback, and artifact hygiene

No migration or dependency is added in 005b. Revert the implementation PR to remove this slice's page, read, and proxy additions; the already merged 005a data remains. No Magic Patterns mock rows or editor scaffolding are in application code. Synthetic fixtures are limited to the disposable local/CI stack and deleted by scoped teardown. The CI failure artifact collector copies only allowlisted wishlist actual/diff PNGs after sign-in; a controlled test with an invented OTP in `error-context.md` proves markdown, auth images, traces, and reports are excluded. Do not upload raw error context, token-bearing URLs, auth screenshots, traces, or HTML reports.
