# ARJ-27 independent recovery plan and scoped spec review

Date: 2026-09-30. Reviewer: independent agent `/root/arj27_plan_review`.

**SPEC CORRECTION: APPROVED**

**IMPLEMENTATION PLAN: REQUEST_CHANGES**

This is a pre-implementation review of `arj27-recovery-implementation-plan.md` and `arj27-recovery-author-report.md`. It is not implementation, baseline, CI, or merge approval. The only write is this report. No tests, subagents, commits, Docker, or external changes were performed.

## Scoped spec correction

The requested follow-up is addressed. `review-4f3ba3a..fdd69e9.diff` contains only the correction from "resolutions 1, 3, and 4" to "resolutions 1, 3, 4, and 8" in Required proof. The current binding brief now consistently requires the exact audience-sentence omission in resolution 8 (`docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md:218-226`), criterion 14 (`:356-365`), and Required proof (`:404-406`). Scope (`:81-85`) and criterion 5 (`:303-311`) contain the same owner-only paragraph. Decision attribution at `:138-141` and `:218-226` remains an agent decision under delegated authority. No new inconsistency was found in this scoped delta. `git diff --check 4f3ba3a..fdd69e9` passes.

The original spec finding and its Required proof follow-up are closed. This does not waive the existing code or image rejections.

## Blocking plan finding

### P1: Schedule the provider-disabled plain browser proof explicitly (P2)

Plan evidence: `arj27-recovery-implementation-plan.md:125-127` schedules the focused unit suite, local `pnpm verify`, and the CI `verify` and `database` checks. Line 127 then asks for CI counts for the plain wishlist spec. The ledger lists plain and stack proof at `:138-139`, but no task schedules a production build and browser run without provider configuration.

Why the listed runs are insufficient:

- `package.json:28` defines `pnpm verify` as formatting, lint, type-checking, Vitest, and build. It does not run Playwright.
- `.github/workflows/ci.yml:59-60` runs that same command in the verify job.
- `scripts/e2e-local-stack.sh:32-39` exports the Supabase provider configuration, `:59` sets `E2E_LOCAL_SUPABASE=1`, and `:76-81` then executes all listed specs, including the nominally plain `tests/e2e/wishlist.spec.ts`.
- `tests/e2e/wishlist.spec.ts:3-14` expressly defines the separate provider-disabled execution as the page-layer proof. The tests themselves do not clear provider configuration.

Consequently, green execution counts for this file in the database job establish the provider-configured path only. They do not prove criterion 2's page gate with the provider absent (`005b:285-295`). Criterion 3 also specifies a plain POST-denial run (`005b:296-299`). This matters because proxy protection can conceal a missing or broken page-level control.

Required plan correction: add a concrete Task 7 step that builds the final application with provider configuration absent and runs `tests/e2e/wishlist.spec.ts` against that production build for both viewport projects. Explicitly keep `E2E_LOCAL_SUPABASE`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` absent during build and execution, and ensure no loaded local environment file restores them. Do not print environment values. Record the command, provider-disabled condition, exact revision, executed count, and result in the acceptance evidence. Preserve the separate provider-configured database-job run and its header assertions. A focused local provider-disabled run needs no Docker or new dependency; adding a permanent CI job is not required by this finding.

After this bounded correction, re-review the plan delta. No second human approval is required.

## Recorded blockers covered by the plan

| Finding | Concrete plan response | Assessment |
| --- | --- | --- |
| Spec copy contradiction | Exact amended paragraph and negative audience-sentence assertion, `:18`, `:60`, `:106` | Covered |
| Visual R1 divider collision | Scoped geometry correction and both-viewport bounding-box assertion, `:62-64` | Covered |
| Visual R2 reduced display hierarchy | Component-scoped 30px/36px profile name and 30px empty heading, `:61-64` | Covered without changing shared tokens |
| Recovery R1 money precision | Authoritative complete non-default currency table and representative omitted-code tests, `:70-75` | Covered |
| Recovery R2 source URL without retailer | Source-first link rendering, safe label fallback, all four combinations, `:73-75` | Covered |
| Recovery R3 API row cap | 500-row server ranges, consistent total order, boundary and later-page-error tests, 1001-item integration case, `:81-86` | Covered |
| Recovery R4 unsafe artifact upload | Remove general result upload; allowlisted wishlist actual/diff images only; invented-OTP exclusion probe, `:116` | Covered; no actual historical leak is asserted |
| Recovery R5 blanket 3% threshold | Remove both allowances, stabilize captures, use strict same-platform Linux comparisons, `:115-119` | Covered |
| Recovery R6 keyboard and payload proof | Keyboard reachability/visible focus/activation for named controls; DOM, document and relevant RSC scans including image URL, `:105-109` | Covered |
| Recovery R7 fixture setup cleanup | Immediate cleanup registration and all-settled teardown, injected failure tests, `:92-99` | Covered |
| Local-only fixture hardening | Loopback HTTP guard before service-role client construction, `:94`, `:98` | Covered |
| Loading/error evidence distinction | Mounted component tests, reset and generic-error assertions, reduced-motion proof, accurate evidence wording, `:108`, `:128` | Covered |
| Repeated cold ESLint timeout | Shared ESLint instance, focused bounded 15-second timeout, unchanged assertions/global default, repeated full-suite verification, `:125-126` | Covered |
| Missing or stale completion evidence | Actual CI counts, final facts, independent re-review, exact-head checks, `:127-129` | Covered except the provider-disabled run above |

## Acceptance-criteria coverage

All 18 criteria appear in the ledger (`:137-154`). Criteria 1 and 4 retain the proxy policy/header proof. Criteria 5-8 map to the exact copy, interim navigation, snapshot fields, original money, complete order and image-fallback proof. Criteria 9-11 retain reload, second-tab, cross-user and stale-session checks. Criteria 12-13 receive the specific missing keyboard, loading and error proof. Criteria 14-15 receive new captures and actual independent image approval. Criterion 16 gains document and RSC inspection. Criterion 17 retains final production-diff inspection. Criterion 18 retains explicit script-path execution and green required checks on the final head. Criteria 2-3 are named but need the provider-disabled execution step described in P1.

## Security, visual workflow, and scope assessment

The plan preserves server-only owner/RLS reads, explicit snapshot columns, deterministic order and no-store (`:15`, `:81-86`). It expressly excludes management, extraction, reorder, groups, sharing, reactions, migrations and dependencies (`:17`), forbids local Docker/system installation (`:20`), and forbids unapproved cloud mutations (`:21`). The source-link fallback does not introduce a new protocol policy: the existing schema constrains stored source URLs to HTTP(S) at `supabase/migrations/20260930000000_wishlists.sql:117-120`. No named recovery proposal requires weakened authorization.

Linux captures are required at `:117`. Under the controller's clarified CI/Linux contract, four approved Linux PNGs may replace the four current names. A second macOS baseline family is only needed if a supported macOS comparison is actually retained. The existing manifest script recursively hashes PNG files (`scripts/update-baseline-manifest.mjs:23-37`); additional platform filenames do not inherently require weakening its guard.

Actual independent image review precedes manifest approval and baseline commitment (`:23`, `:118-119`). It includes all candidates and pinned references, dimensions, hashes, accepted differences, and new review after changed pixels or rejection. The reviewer must inspect the actual final Linux candidates used by CI. Previous OCR approval is expressly excluded. The owner delegation in `005b:230-241` permits this independent AI approval; older human-only wording is not an extra gate.

The artifact fix and synthetic exclusion probe remain mandatory even though the controller's private scan did not identify an actual disclosure in the older artifact. Only after-sign-in wishlist image outputs may be transported. General error contexts, auth screenshots, traces and reports remain excluded (`:22`, `:116`).

The plan's final gate requires fresh independent code/security and image approvals plus green exact-head checks (`:129`). Plan approval, once the single proof gap is repaired, will authorize execution of the plan only. It will not approve the current rejected code or PNG hashes or establish any passing acceptance result.

## Review boundaries

Read in full: the implementation plan, author report, binding 005b brief, three original review reports, scoped spec re-review, and the final spec-correction diff. Targeted unchanged-file reads only checked the named workflow risks: whether the listed commands can establish provider-disabled proof, whether Linux filenames fit the manifest workflow, whether fixture setup exposes an unregistered partial user, whether the source-label change broadens URL protocols, and whether the proposed ESLint reuse matches the current helper. No duplicate broad code review was performed.

