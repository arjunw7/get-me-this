# 005g / ARJ-32 — Original and approximate price presentation

## Outcome

Wishlist prices remain truthful across original currencies and optional
conversion. The owner's wishlist always shows the retailer's original
amount and ISO 4217 currency, stored and rendered as integer minor units
with no floating-point math anywhere in the path. If an approximate
conversion exists, it is clearly labelled approximate with its rate
source and captured-at timestamp; if conversion is unavailable, the
original price still displays and nothing blocks creation or reading.
This is [ARJ-32](https://linear.app/arjun-wadhwa/issue/ARJ-32/) and
backlog slice 21 ("Implement original and approximate converted price
presentation"). The repository brief governs implementation if the
Linear draft differs.

> **Binding decision requiring owner approval before implementation.**
> This brief pins **dormant conversion** for V1: the repository ships
> original-price display plus the complete approximate-conversion
> display contract, but **no exchange-rate provider, no rates table, no
> outbound rate network call, and no new dependency**. The alternative
> — integrating a named provider now — is rejected below. Implementing
> this slice constitutes owner acceptance of the dormant decision and
> of the documented Version 18 deviation in
> [Honest omissions from Version 18](#honest-omissions-from-version-18).

## Dependency contract

### Phase 4 wishlist exit

- 005a supplies the money schema exactly as it exists in migration
  `20260930000000_wishlists.sql`: `original_amount_minor bigint` with
  `original_currency char(3)` CHECK-constrained to `^[A-Z]{3}$`, the
  all-or-nothing original pair, and the optional four-column converted
  tuple `converted_amount_minor bigint`, `converted_currency char(3)`,
  `conversion_rate_source text` (≤ 200 characters),
  `conversion_rate_at timestamptz` under the all-or-nothing
  `wishlist_items_converted_money_tuple` CHECK. Authenticated INSERT and
  UPDATE grants already include all four converted columns; owner-only
  RLS is unchanged.
- 005b supplies the protected read and the pinned minor-unit display
  format (its resolution 4), implemented as `formatMoneyMinor` in
  `src/wishlist/display.ts` over `currencyMinorDigits` from
  `src/wishlist/currency-metadata.ts` (frozen SIX ISO 4217 List One,
  2026-09-17, entries without numeric minor digits excluded). Its
  read path deliberately omits the converted tuple because "005g owns
  that contract"; this slice claims it.
- 005c supplies manual CRUD with exact decimal-text price entry,
  the supported-currency table, opaque-price handling for unsupported
  stored codes, and the edit rule that all four converted columns are
  atomically cleared when the original pair changes and never accepted
  from posted input. This slice preserves all of it.
- 005d (reordering) may have touched the same card components; the
  implementation rechecks the merged card markup before extending it.

### 005e / 005f extraction boundary

005e returns `originalAmountMinor` as a decimal string plus an explicit
supported `originalCurrency`, and never guesses a currency from locale
or symbol; 005f owns review and persistence. 005g consumes **stored
tuples only**. It neither requires nor changes extraction. Whether
005e/005f have merged is irrelevant to this slice's read and display
contracts.

### Exact-main recheck gate

- Implementation must start from a `main` that already contains the
  merged, independently approved heads of 005a, 005b, 005c, and 005d
  (plus 005h's CI surface), and must inspect their final merged
  migrations, column grants, `src/wishlist/` display modules, and
  stack-gated spec list before writing code. Where this brief pins a
  column, format, or algorithm, the merged head is authoritative: if an
  exact equivalent capability already exists there, no redundant code is
  added and its reuse is recorded in the pull request; if the merged
  shape differs from this brief's expectation, the difference is
  resolved by review before implementation proceeds, and any amendment
  to an approved 005a–005d contract requires fresh independent review.

## Key pinned decision: conversion is dormant in V1

### Why dormant

- The backlog item authorizes **presentation** ("original and
  approximate converted price presentation"), not provider integration.
  The product spec leaves the exchange-rate source as an explicit open
  question ("Which exchange-rate source will power approximate currency
  conversion?"), so no provider is demanded in V1.
- The repository rules forbid inventing a conversion from locale alone
  and forbid new dependencies the current stack cannot justify. The
  Version 18 prototype's `utils/money.ts` (`RATES_TO_INR` hardcoded
  floats, `toINR` rounding to multiples of 10, locale-mapped
  `Intl.NumberFormat`) is illustrative design code, not a conversion
  implementation; copying it would violate both rules.
- A read-only presentation slice needs no network egress, no credential
  surface, no cache, and no migration. That is the honest minimal
  scope.

### What dormant ships

- The extended server read and display snapshot including the converted
  tuple, the approximate/unavailable/stale display treatments, the full
  rounding and validation contract below, and their tests. A stored
  complete tuple — reachable today only through reviewed fixtures, since
  no production writer exists — renders exactly as specified.
- The fully specified approximate-conversion contract below, so a later
  owner-approved provider-gate slice adds only transport, a rates cache,
  and a write path without reopening display, rounding, or staleness
  decisions.

### What dormant does not ship

Any code path that generates a conversion: no provider call, no rates
table, no rate refresh job, no scheduled work, no API key handling, and
no migration. The owner wishlist's creation, reading, and editing never
depend on conversion availability.

## The pinned approximate-conversion contract (dormant until the provider gate)

This contract binds any future conversion writer. Until the provider
gate, only the display, validation, and fail-safe halves are
implemented and tested.

### Converted-money fields

- The per-item converted tuple is the single display source of truth,
  exactly as 005a defined it. A future provider slice **denormalizes**
  the conversion onto `wishlist_items` at conversion time; the read path
  never joins a rates cache.
- `converted_amount_minor` is the approximate converted price in integer
  minor units of `converted_currency`, range `0..9223372036854775807`.
- `converted_currency` is the uppercase ISO 4217 target code. The V1
  contract requires the provider gate to pin the target-currency policy
  (the V18 prototype converts to INR); the display layer resolves any
  stored code through `currencyMinorDigits` and treats an unsupported
  code as unavailable rather than assuming INR.
- `conversion_rate_source` identifies where the rate came from, ≤ 200
  characters (for example a provider name and quote identifier).
- `conversion_rate_at` is the moment the provider rate was fetched —
  **not** the moment the item was saved or the conversion was computed.

### Rate representation and rounding rule

- A rate is a positive exact decimal string, no sign, no exponent, no
  separators, at most 12 fractional digits, defined as target **major**
  units per original **major** unit. Rates are never binary floats in
  transport, storage, or arithmetic.
- Conversion is exact integer arithmetic on `BigInt`:

  1. Let `d_o` and `d_t` be the minor-digit exponents of the original
     and converted currencies from `currencyMinorDigits`; let `d_r` be
     the rate's fractional-digit count and `R` its digits as an integer.
  2. `N = O × R × 10^d_t` and `D = 10^(d_o + d_r)`, where `O` is the
     original minor amount.
  3. `converted_minor = floor((2N + D) / (2D))` — **round half up**
     (ties round away from zero; amounts are non-negative, so ties round
     up). Half-even is rejected as the repository rule.
  4. A result above `9223372036854775807` is an overflow failure: no
     conversion is stored or shown, and the original price displays.

- The same rule applies on any future write path when computing the
  stored tuple, and in tests as the reference implementation.

### Staleness window

- A stored tuple whose `conversion_rate_at` is older than **24 hours**
  at server read time is stale. Stale tuples remain displayed with their
  approximate marker and captured date; staleness is never silently
  hidden and never blocks the item.
- The read path never refreshes a rate. Refresh belongs to the future
  provider-gate write path, which must define its own bounded retry and
  failure semantics in its reviewed brief.

### Display treatment

- The original price line is unchanged: `{major} {CODE}` via
  `formatMoneyMinor`, code-suffixed, no grouping separator, no symbol.
  005b's permission for 005g to refine symbol/locale sets is
  deliberately **not exercised**; changing the pinned original format is
  a visual deviation requiring owner review.
- A complete, supported, non-stale tuple adds one muted approximate line
  below the original: visually `≈ {major} {CODE}` using the same
  `formatMoneyMinor` algorithm on the converted pair, plus the rate
  source and captured UTC date (`YYYY-MM-DD`). The accessible text must
  include the word "approximately" (the `≈` glyph alone is not
  announced), the converted amount and code, the rate source, and the
  captured date. Final visual copy is pinned during implementation
  review against V18 vocabulary.
- A stale tuple renders the same line with its captured date, which by
  the 24-hour rule reads as older. No hidden behavior differs.
- The approximate marker is textual, never color-only, and never a
  replacement for the original price line.

### Future provider-gate requirements (not authorized now)

A later slice may integrate a provider only after owner approval of a
reviewed brief that names the provider and endpoint, its credential
storage (server-side secret, never in client bundles), fetch and cache
behavior, the 24-hour staleness alignment, rate-limit handling, failure
semantics consistent with this contract, the target-currency policy, and
the rates-cache migration below. That slice owns all transport risk;
this brief's display and rounding contracts must not be reopened.

### Future rates-cache migration shape (specified, not added)

For the provider gate, the expected forward migration is one new table,
for example `conversion_rates`: `base_currency char(3)` and
`quote_currency char(3)` each CHECK-constrained to `^[A-Z]{3}$`,
`rate numeric(24, 12)` (exact Postgres numeric, never `double
precision`) CHECK `rate > 0`, `rate_source text` ≤ 200 characters,
`fetched_at timestamptz` not null, primary key `(base_currency,
quote_currency)`; RLS enabled with **no** anon or authenticated policies
and no client grants, so only reviewed server code (or a narrowly
granted `SECURITY DEFINER` writer with an empty `search_path`) may
read or refresh rates. This shape is recorded for planning only; adding
it is out of scope here and requires its own migration, RLS, and pgTAP
proof.

## User-visible scope

### Original price display

- The owner's wishlist card continues to show the stored original amount
  in the currency's major units at the currency's minor-unit precision,
  then a space, then the uppercase code — the existing 005b resolution 4
  format, now bound for all four exponent classes: zero-decimal (JPY:
  `3500 JPY`), two-decimal (INR: `2499.00 INR`), three-decimal (KWD:
  `1.250 KWD`), and four-decimal (CLF). Conversion of minor to major
  units is string padding and slicing on `BigInt`-safe canonical decimal
  text; no `Number`, `parseFloat`, `Intl`, or float appears anywhere.
- An item with no stored price pair shows no price text (existing
  behavior). An item whose stored code is outside the supported table
  keeps the 005c opaque treatment: raw minor-unit text and code with the
  "price display unavailable" explanation, never an invented format.
- The original currency and price remain visible whenever any price is
  shown; a converted value never replaces an original line.

### Approximate-converted display treatment

As pinned in [Display treatment](#display-treatment): muted `≈` line
with converted amount at the converted currency's exponent, rate source,
and captured date; "approximately" in the accessible text; textual
marker; original line always present above it.

### Unavailable, stale, and failed-conversion behavior

- Conversion unavailable is a **normal** state, not an error: no
  approximate line, no placeholder, no skeleton, no error message, and
  no impact on creating, reading, or editing the item. With no provider
  in V1 this is the default state for every organically created item.
- An incomplete or invalid stored converted tuple cannot exist under the
  005a CHECK, but the read path still fails safe: any missing or
  malformed converted field omits the approximate line and shows the
  original. An unsupported `converted_currency` or a malformed
  `converted_amount_minor` does the same; neither surfaces an error to
  the owner.
- If a future provider fails, the same rules apply: the original value
  displays and nothing blocks creation or reading. No conversion is ever
  inferred from locale, browser language, or currency symbol.

### Honest omissions from Version 18

The V18 `PriceTag` renders `· ≈ {INR value}` on every priced card and
the V18 form shows `≈ {INR} at today's rate` during entry. In the
dormant path, organically created items show **no** approximate line
because no conversion exists to show, and no in-form preview conversion
is added. This is an intentional, documented deviation from the approved
composition: it requires independent product/design review as part of
this slice's visual evidence, and the V18 in-form `at today's rate`
preview stays absent until the provider gate.

## Exact contracts

### Schema: no new migration

Every required column, CHECK, grant, and RLS policy already exists in
`20260930000000_wishlists.sql` and is exercised by 005c's edit contract.
This slice adds **no migration** and changes no grant or policy. The
future rates-cache shape above is planning-only. Existing
`tests/wishlist.sql` assertions for the converted tuple CHECKs are
retained unchanged.

### Display and rounding algorithm (no floating point)

- Placement: the display formatter and the conversion rendering helpers
  live beside `formatMoneyMinor` in `src/wishlist/display.ts` as pure,
  deterministic, server-or-shared functions with no DOM or database
  dependency; the round-half-up reference implementation lives in the
  same pure module so unit tests and any future write path share one
  definition. Nothing new is needed in client bundles: the wishlist
  list is a server-rendered document.
- The read path (`src/wishlist/data.ts`) extends its explicit column
  list with `converted_amount_minor::text`, `converted_currency`,
  `conversion_rate_source`, and `conversion_rate_at`, selected
  explicitly (never `select *`), and extends
  `toWishlistItemSnapshot` with the tuple as exact strings. The
  canonical-bigint string assertion applies to the converted amount
  exactly as to the original; a violation is an invariant failure that
  degrades to original-only display, never a rendered float.
- Staleness comparison uses the server clock at read time; the captured
  date is rendered in UTC `YYYY-MM-DD` so display is deterministic
  regardless of viewer timezone. Visual fixtures freeze the clock.

### Validation bounds and bigint safety

- Both original and converted minor amounts are canonical non-negative
  Postgres bigint decimal strings, bounded by
  `9223372036854775807`, validated by the existing string predicate;
  values above `Number.MAX_SAFE_INTEGER` must round-trip exactly and
  must never pass through a JavaScript number. Zero is valid for both.
- Rate strings (contract inputs, tested against the reference
  implementation even while dormant) reject signs, exponents, separators
  and symbols, more than 12 fractional digits, zero, and negative
  values; conversion overflow rejects without partial writes.
- The 005c edit rules are restated as binding: converted values are
  never accepted from posted input; all four columns clear atomically
  when the original pair changes or clears and are omitted from the
  update when it does not.

### Separation from group-budget rules

The per-item converted tuple is owner-wishlist presentation only. Group
budgets, group currencies, budget caps, and any affordability filtering
(V18 `GiftingView`'s `fits` computation) are future Phase 5 concerns
with their own reviewed schema and permissions. No group table reads
these columns, no group rule may reinterpret them, and this slice adds
no group-budget field, query, or UI.

## Rendering, failure, and accessibility behavior

- The approximate line is part of the card's reading order directly
  after the original price line; its accessible text carries
  "approximately", amount, code, rate source, and captured date. The
  marker is textual, never color-only.
- Every price state keeps persistent text (no icon-only meaning), meets
  the existing card target and focus behavior, and introduces no new
  interactive control, so no new 44-by-44 target is required; existing
  keyboard and axe behavior is preserved and re-proven at both
  viewports.
- Failure behavior: any invariant violation in stored money data
  degrades to the original-only or opaque-price treatment already
  defined — never a thrown error in the owner's list view, never a
  partial or rounded value, never a browser-default rendering.

## Visual reference mapping

| 005g state                                               | Comparison authority                                                    | Required review                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Original-only priced card (default dormant state)        | Frozen `wishlist-filled` captures at 390x844 and 1440x1000              | Must match the existing baseline with no approximate line                     |
| Card with stored complete converted tuple                | V18 `PriceTag` approximate vocabulary; no matching frozen capture       | Independent review of new composition, including the documented V18 deviation |
| Stale tuple, unsupported converted code, malformed tuple | No matching capture; V18 muted-detail vocabulary and `DESIGN.md` states | Independent review of each unavailable/stale treatment                        |
| Opaque original price (unsupported stored code)          | Existing 005c behavior                                                  | Regression-only confirmation; no new baseline                                 |

Capture candidate mobile and desktop states at 390x844 and 1440x1000
with frozen clocks and deterministic fixtures. An independent
product/design reviewer must approve each new composition against
candidate screenshot hashes and the implementation head before any new
baseline commit; a delegated AI review must be identified as such.
Frozen or production baselines cannot be changed merely to pass CI.

## Acceptance criteria

1. **Original exactness.** Unit tests pin `formatMoneyMinor` for
   zero-decimal (JPY), two-decimal (INR/USD/GBP/EUR), three-decimal
   (KWD/JOD/TND), and four-decimal (CLF) currencies at zero, ordinary
   values, values above `Number.MAX_SAFE_INTEGER`, and the bigint
   maximum `9223372036854775807`, with uppercase code output, no
   grouping separator, no symbol, and thrown errors for non-canonical
   strings and unsupported codes. The stored pair round-trips create →
   reload → display → edit prefill exactly as saved.
2. **Approximate treatment.** A card whose row carries a complete
   supported converted tuple renders the approximate line below the
   original: `≈` marker, converted amount at the converted currency's
   exponent via the same algorithm, rate source, and captured UTC date;
   the accessible text contains "approximately"; the marker is textual,
   not color-only; the original line remains visible above it.
3. **Rounding rule.** Table-driven unit tests prove the pinned
   round-half-up reference implementation: exact `.5` minor-unit ties
   round up, values just below `.5` round down, across zero-, two-,
   three-, and four-decimal targets; a 12-fractional-digit rate converts
   exactly; overflow past the bigint maximum fails safe with no
   conversion; sign, exponent, separator, zero, negative, and
   over-length rate strings are rejected. Half-even is tested and
   rejected.
4. **Unavailable and stale.** With no conversion present, the card shows
   the original price only and exposes no conversion placeholder, error,
   or blocked action; creation and reading never depend on conversion
   availability. A tuple older than 24 hours still displays with its
   captured date. An unsupported `converted_currency` or malformed
   stored converted amount omits the approximate line and shows the
   original with no invented value. No conversion is ever inferred from
   locale, language, or symbol — asserted by tests covering non-INR
   locales.
5. **Server truth and forgery.** The read path selects the four
   converted columns explicitly, numeric values as `::text`, and never
   passes through a JavaScript number. Forged converted values in
   create or edit actions are ignored (005c contract preserved); the
   changed-pair clear and unchanged-pair preserve rules are
   regression-tested at the action boundary.
6. **Accessibility.** At 390x844 and 1440x1000, every price state has
   visible focus behavior unchanged from 005b/005c, participates
   correctly in the card's accessible name and reading order, and passes
   axe; keyboard operation of the card is unchanged.
7. **End-to-end conversion failure.** A stack-gated browser spec proves
   the original value displays when conversion is unavailable (the
   default dormant state), that a fixture-seeded tuple renders the full
   approximate treatment, and that the wishlist read path makes **zero**
   outbound requests to any rate provider host.
8. **Visual evidence.** New price states are captured at both viewports
   against the table above; independent product/design review approves
   candidate hashes and the exact head before any baseline commit; no
   baseline changes are made merely to satisfy CI.
9. **Proof package.** The implementation PR maps each criterion to
   evidence; `pnpm verify` passes or names the exact unavailable check;
   any new `E2E_LOCAL_SUPABASE` spec is registered in
   `scripts/e2e-local-stack.sh` in the same PR; the migration/rollback
   note states that no migration exists; and the PR confirms no Magic
   Patterns mock data or editor artifacts (including V18's hardcoded
   rate table, locale map, and float math) shipped.

## Required automated proof

### Unit and component tests

- The pinned rounding and display module: rounding boundaries per
  criterion 3, exponent classes per criterion 1, rate-string rejection
  table, staleness boundary at exactly 24 hours (frozen clock on each
  side), and UTC date rendering.
- Card component tests for the approximate, stale, unsupported-converted,
  malformed-converted, and original-only states, including accessible
  text assertions ("approximately", source, date) and the color-only
  prohibition.

### Database tests

- No new migration means no new pgTAP obligation; the existing
  `tests/wishlist.sql` converted-tuple CHECK assertions remain green.
  If the exact-main recheck finds the merged head already covers a
  case this brief cites, reuse is recorded instead of duplicated tests.

### Browser, visual, and staging tests

- The stack-gated spec of criterion 7, registered in
  `scripts/e2e-local-stack.sh` in the same PR, running at both
  Playwright viewports with deterministic fixtures and frozen clocks;
  the zero-provider-request assertion uses page network instrumentation.
- Visual candidates per the reference-mapping table, reviewed
  independently before any baseline commit.

## Required pull-request evidence

Acceptance-criteria-to-evidence mapping; unit, component, browser,
accessibility, and visual proof; green `pnpm verify` and CI checks on
the exact PR head (or precise unavailable-check explanations); before/
after mobile and desktop images for changed states; a Railway preview
URL when available; the no-migration statement; and confirmation that
no prototype rate table, mock money data, or editor artifact shipped.
Screenshots and evidence exclude credentials, tokens, real user content,
and any provider material.

## Migration and rollback notes

No schema migration. Rollback of the implementation commit restores the
005b/005c read and display behavior; no data cleanup is needed, and no
stored data changes shape. The future rates-cache migration (provider
gate) carries its own migration/rollback obligations and does not exist
in this slice.

## Implementation plan

1. **Recheck the exact base.** Inspect merged `main` for the final
   005a–005d columns, grants, `src/wishlist/` modules, visual baselines,
   and the 005h stack-gated spec list; reconcile with this brief before
   writing code.
2. **Extend the pure display module.** Add converted-tuple display and
   the round-half-up reference implementation to
   `src/wishlist/display.ts` with the full unit-test table; no new
   dependency.
3. **Extend the server read.** Add the four converted columns to the
   explicit column list and the snapshot mapper with fail-safe
   validation and staleness comparison.
4. **Render and prove.** Update the card component and its component
   tests; add the stack-gated browser spec; register it in
   `scripts/e2e-local-stack.sh`; run `pnpm verify` and the database job
   locally on the implementation head.
5. **Review visual evidence independently.** Capture and obtain
   independent approval for the new states per the reference-mapping
   table before any baseline commit.

## Non-goals

- No exchange-rate provider integration, outbound rate request, API key
  handling, rates-cache migration, refresh job, or new dependency in
  this slice.
- No group budgets, group currencies, budget caps, affordability
  filtering, or cart/checkout behavior.
- No change to the pinned original price format (no symbols, grouping,
  or locale-aware `Intl` formatting); no historical rate series; no
  automatic refresh; no conversion of anything other than the stored
  original pair; no extraction changes.
- No weakening of RLS or grants, no service-role client in the
  application path, and no staging or production database mutation as
  part of planning.

## Dependencies and gates

- 005a, 005b, 005c, and 005d must be merged with independent review
  before implementation; the brief's stated base (`592f547`, the ARJ-29
  head) already contains them, but the exact-main recheck gate governs.
- 005e/005f are consumers of the same money columns, not prerequisites;
  price-provider research may run in parallel and informs only the
  future provider-gate brief.
- 005h supplies the CI database job and stack-gated spec registration
  surface this slice's browser proof uses.
- The dormant-conversion decision and the documented V18 deviation are
  owner-approval gates for this slice, recorded in review evidence
  before implementation merges.

## Analytics, security, and privacy

No new analytics event and no change to any existing event schema;
`wishlist_item_added.has_price` keeps its boolean meaning and nothing
emits on read. Prices, currency codes, rate sources, conversion
timestamps, and converted values never enter PostHog properties, logs,
traces, or error reports; failures use generic outcome classes with
identifiers, not amounts or codes tied to a user. The read path adds no
network egress and no service-role client; all data remains under
005a's owner-only RLS through the authenticated server client. Storing
a conversion about an item is owner-visible presentation data and must
never leak to group recipients ahead of Phase 5's reviewed access
rules.

## Planning status

Binding brief and implementation plan for review. Commit this document
alone on `planning/arj-32-005g-price-presentation`; implementation
starts only after the owner approves the dormant-conversion decision and
the exact merged base is rechecked. This brief does not approve
implementation screenshots, visual baselines, provider research
outcomes, or a merge to `main`.
