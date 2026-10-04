# ARJ-27 money addendum review

Verdict: **APPROVED**

Date: 2026-09-30

Reviewed artifact: `.superpowers/sdd/get-me-this-phase4-controller/arj27-money-addendum.md`

Exact SHA-256: `68e3cd23f9a5f8877e45c34f320ff05dc84c30bceb85127fb29610eb1aa3f2c3`

This is an independent, scoped plan review. It approves this amendment's requirements and approach. It does not approve the ongoing implementation, establish passing CI, or close the later code review gate.

## Findings

No actionable plan findings remain. Both reported precision defects are addressed by concrete, attainable requirements without changing the stored schema, RLS, dependencies, or original-price product contract.

## Evidence and assessment

1. **The amendment resolves the approved plan's conflicting interface and arithmetic.** The recovery plan's Task 2, lines 70-72, pins a `number` interface and `toFixed`; addendum lines 3, 11, and 13 explicitly supersede those instructions with canonical decimal strings, exact formatting, and runtime validation. The binding 005b resolution 4, lines 189-200, requires truthful original minor-unit display and a currency-code suffix. The schema declares `original_amount_minor bigint` and constrains nonnegative amounts, paired nulls, and uppercase three-letter currency codes in `supabase/migrations/20260930000000_wishlists.sql`, lines 88-89 and 143-150. Accepting the complete nonnegative bigint domain is therefore required, not an optional expansion.

2. **The proposed cast precedes the precision-losing parse and is supported.** Addendum lines 9 and 15 require `original_amount_minor::text` with the existing response name and explicit selected fields. The installed `@supabase/postgrest-js` 2.117.2 parser recognizes and retains field casts at `src/select-query-parser/parser.ts`, lines 229-259; `result.ts`, lines 71-84, applies the cast type; and `types.ts`, lines 49 and 70-78, maps `text` to `string`. `src/PostgrestBuilder.ts`, lines 389-401, reads text and then calls ordinary `JSON.parse`. [PostgREST's casting documentation](https://postgrest.org/en/stable/references/api/tables_views.html#casting-columns) explicitly demonstrates a text cast returning a quoted string under the original field name. A SELECT cast needs no new schema object or privilege. The plan also requires runtime checking, so TypeScript inference or the current assertion cast cannot stand in for validation.

3. **Exact formatting and existing display behavior are preserved.** Addendum lines 11, 13, and 19 preserve the pinned currency table, default two-digit behavior for unknown codes, uppercase suffix, zero-digit formatting, and no price for the null pair. They require canonical strings bounded at `9223372036854775807`, with any BigInt confined to local arithmetic. A fresh read-only Node v24.21.0 probe reproduced `9007199254740990 / 100` formatting as `90071992547409.91`, `9007199254740991 / 1000` formatting as `9007199254740.990`, and parsing numeric JSON `9007199254740993` as `9007199254740992`. The corresponding quoted token preserved its digits. All seven planned exact-arithmetic expected values in line 19 were independently checked using integer quotient and remainder.

4. **Invalid wire types must fail before a successful wishlist display.** Addendum lines 13, 20, and 22 require rejection of numeric tokens, raw bigint, malformed and out-of-range strings, and mismatched null pairs, with the generic wishlist error behavior and no partial success. This is attainable through the existing server read and view contract: `src/wishlist/data.ts` returns `OwnWishlist | null`, and `src/wishlist/wishlist-view.tsx`, lines 28-29, routes null to the generic error state. The required render/read-boundary proof must reach that error behavior; a formatter throw assertion alone does not meet line 22.

5. **The regression requirements cross both the HTTP and rendering boundaries.** Addendum line 21 mandates decimal-string insertion of `9007199254740993` and `9223372036854775807`, authenticated cast reads, raw response confirmation that both values are quoted JSON strings, exact parsed values, a null-price row, and actual `/wishlist` rendering of both prices. It also retains cleanup and second-user isolation. This cannot be satisfied solely by mocked rows or a formatter unit test. `scripts/e2e-local-stack.sh`, lines 76-81, already includes the named spec; `.github/workflows/ci.yml`, lines 118-120, runs that script in the database job. Addendum line 24 and the approved plan's final gates require execution evidence on the final committed head, so mere inclusion or a skipped local run is insufficient.

## Review limits and handoff

The current source was inspected for feasibility while implementation edits were ongoing. This review did not run application suites, start a database, mutate fixtures, change git state, or approve code. The only checkout write is this report. The verification-before-completion skill was used to distinguish freshly checked feasibility evidence from implementation and CI claims.

Implement the approved addendum, then obtain the specified independent code review and actual final-head database and verification results. Any meaningful issue found at those gates still requires a fix and renewed affected verification; this approval does not waive it.
