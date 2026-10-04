# ARJ-27 I1 scoped independent re-review

**I1 / P2: Privacy helper can pass with HTML alone: ADDRESSED in source and regression design.** `tests/e2e/wishlist-local.spec.ts:87-115` now independently requires a target HTML document and an authenticated target Flight response. Actual configured execution remains pending and is not established by this verdict.

Date: 2026-10-01. Reviewer: `/root/arj27_i1_rereview`.

**Spec verdict: APPROVE for this scoped implementation fix, with runtime acceptance still pending. Code quality verdict: APPROVE for this fix diff.** No new Critical or Important breakage identified. This report grants neither merge nor image approval.

## Scope and review basis

- Fix base: `2baa795e1f77c1adc9867f930cfa6a60cd80b008`.
- Reviewed head: `22d8199224b5aa52aef494509362dd56f56703e0`.
- Read the complete prepared `arj27-i1-fix-22d8199.diff` in bounded passes, including the intervening audit-only documents. Read the original I1 finding, binding implementation dispatch and recovery plan, relevant 005b acceptance criteria, and final Round 1 section of the author report. Applied the requesting-code-review reviewer criteria and scoped re-review instructions.
- The only executable change in this range is `tests/e2e/wishlist-local.spec.ts`. Production code, dependencies, CI wiring, and baseline images are unchanged by the fix. Existing uncommitted PNGs and manifest are outside this review.
- Read-only inspection, except this report. No test-suite rerun, fixture creation, server execution, subagent, index, branch, baseline, or external-system mutation was performed.

## Finding evidence and strengths

1. **Distinct document proof.** At `tests/e2e/wishlist-local.spec.ts:88-99`, the helper obtains the actual `page.goto` response, rejects a missing response, checks the target pathname, requires `text/html`, and requires a nonempty document body. The Flight request cannot stand in for this document check.
2. **Distinct authenticated Flight proof.** At `:105-113`, the helper deliberately sends `RSC: 1` and `Accept: text/x-component` through `page.context().request`. It checks the final target pathname, requires `text/x-component`, then separately requires a nonempty Flight body. HTML-only success no longer satisfies the helper. There is no mock response, combined payload count, opportunistic response listener, or HTML fallback.
3. **Correct user and target.** The cross-user case retains independently created A and B browser contexts at `:565-590` and calls the helper with `pageB` at `:593-596`. The unknown-child case calls it with the signed-in fixture page and `/wishlist/not-a-real-item` at `:799-805`, retaining document 404 and visible not-found assertions at `:806-807`. The helper obtains only the requested target responses, so it does not ingest A's fixture requests as B's evidence.
4. **Same denials per surface.** `privateItemMarkers` at `:192-211` contains every seeded title and non-null note/retailer, raw amounts and relevant formatted amounts, `4 things`, the private wishlist ID, and both image URLs. Both callers iterate this same list independently over DOM text, document body, and Flight body at `:605-617` and `:808-820`. Each failure identifies its surface and marker index through a boolean assertion, avoiding full private response output in the assertion diff.

## Installed-library checks

Inspected the installed versions used by this checkout, Next `16.3.6` and Playwright `1.63.0`, to resolve the concrete question of whether this request actually selects Flight while retaining browser authentication:

- Next's `dist/server/lib/is-rsc-request.js` accepts the literal header value `1`. Its `app-render/app-render.js:195-206` recognizes that request and `:1703-1719` selects Flight rendering. `parse-and-validate-flight-router-state.js:15-17` explicitly permits an absent router-state header. `flight-render-result.js` supplies the Flight content type.
- Next's `dist/server/base-server.js:1253-1288` may redirect a request without the appropriate `_rsc` query value to the same public pathname with that cache-busting query. Its not-found handling selects the App Router not-found entry. The helper permits the query redirect while verifying the pathname and actual final response type.
- Playwright's installed `types/types.d.ts:19500-19520` describes the context request's shared cookie jar. Its `lib/coreBundle.js:26462-26471` populates request cookies; `:26599-26648` preserves other headers through redirects and refreshes cookies for the new request; `:26818-26856` obtains cookies from the associated browser context. Thus the chosen API is a real same-context authenticated HTTP request, not an isolated unauthenticated request client.

These source checks support the test's design. They do not prove the configured application returned a successful Flight payload in either affected case.

## New breakage in the fix diff

None identified. The test change removes the original HTML-only pass condition and preserves the existing document, empty-state, user-identity, not-found, cleanup, and private-field checks. The audit-only additions preserve the earlier findings and pending gates rather than claiming this fix executed successfully.

## Verification evidence and limits

- Focused reviewer diagnostic: `git diff --check 2baa795e1f77c1adc9867f930cfa6a60cd80b008 22d8199224b5aa52aef494509362dd56f56703e0 -- tests/e2e/wishlist-local.spec.ts` exited 0. No browser or unit tests were rerun.
- The final author-report section names direct TypeScript, focused formatting/lint checks, Playwright listing, and 425 unit tests. It reports the app-only probe failed to bind and expressly states the real user-B and unknown-child Flight cases were not executed. The section supplies summarized results rather than raw focused transcripts; these are author claims, not independent execution evidence.
- TypeScript's missing-property red/green establishes a harness interface change only. A test listing proves discovery only. Neither it nor the unit count establishes authenticated Next/Supabase/Flight behavior.
- Existing `scripts/e2e-local-stack.sh:76-81` includes `tests/e2e/wishlist-local.spec.ts`; the unchanged Playwright configuration includes mobile and desktop projects. The configured job must actually execute both affected cases in both projects and retain sanitized results. No skipped/listed case may be counted as a pass.

## Out-of-scope observations and declined judgments

- No new out-of-scope code defect identified.
- Final configured database, full-bigint wire/render, and browser success: not judged without actual execution evidence. These remain existing acceptance gates.
- Linux image appearance, candidate hashes, and baseline approval: assigned to the independent actual-image review; no image approval is inferred from this source review.
- Unchanged production behavior and prior resolved findings: not reopened in this scoped re-review.
- Staging, production, and merge readiness: not evaluated or approved here.

## Verdict

**Fix round: all listed code findings addressed, no new Critical or Important breakage.** I1's specific helper defect no longer exists in the reviewed source. No further source correction is requested by this review.

**Acceptance proof remains open:** execute and record the affected configured cases, satisfy green `verify` and `database` checks on the exact final PR head, and complete the already required fresh actual-image review at the final hashes. The existing owner delegation remains in force; this report introduces no additional human approval gate and grants no merge approval.
