# Evidence pack — ARJ-27 (005b: protected wishlist display and empty state)

- **Issue**: [ARJ-27](https://linear.app/arjun-wadhwa/issue/ARJ-27/005b-protected-wishlist-display-and-empty-state), child of tracker ARJ-25.
- **Binding brief**: [`docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md`](https://github.com/arjunw7/get-me-this/blob/7b65c9840a90605bd41ab4afca2bd0a4c14e15e6/docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md) at its exact merged main commit `7b65c98` (merge of PR #27, merge commit `f925e95`).
- **Branch**: `wishlist/arj-27-wishlist-display`, cut from `main` at `f925e95`.
- **Pull request**: PR #28 — https://github.com/arjunw7/get-me-this/pull/28

## What shipped

1. **Proxy policy** (`src/auth/proxy-policy.ts`, `proxy.ts`): `/wishlist` and
   `/wishlist/items/new` join `PROTECTED_ROUTE_PATHS`; anonymous requests — page
   GETs, refreshes, direct links, and the Server Actions that POST to the same
   pathnames — are redirected to `/auth` with 302, `Cache-Control: no-store`,
   and `Referrer-Policy: no-referrer` before any page or action runs. The
   final-response cache policy is generalized so EVERY response for a protected
   route path (redirect, rendered document, action response) carries no-store:
   wishlist content is per-user data and a cached document could leak one
   user's items to another through a shared cache. `/home` and `/onboarding`
   gain no-store as an intended hardening side effect.
2. **Pinning tests** (`src/auth/proxy-policy.test.ts`, `src/auth/proxy.test.ts`):
   positives for both new paths; negatives (`/wishlist/unknown`, `/wishlist/items`,
   `/WISHLIST`, query strings — exact-match only); the full redirect envelope
   for both paths (including action POSTs) under the unreachable-provider
   pattern; and the generalized no-store on protected-route documents without a
   provider configured.
3. **Server data access** (`src/wishlist/data.ts`, `server-only`): the repo's
   first server-side wishlist read, mirroring `src/profile/session.ts` —
   `createSupabaseServerClient()` under the 005a owner-only RLS policies
   (`wishlists_select_own`, `wishlist_items_select_own`); the caller's own
   wishlist row (at most one) plus their items selected as an explicit
   13-column display snapshot (never `select *`), the converted-money tuple
   deliberately not selected (005g owns conversions), ordered by the 005a
   deterministic total order (`sort_position ASC, id ASC`). A missing wishlist
   row is an invariant violation → the designed error state, never a fake
   empty state.
4. **Display contracts** (`src/wishlist/display.ts` + tests): the pinned
   minor-unit money format (ISO 4217 digit table — "24.99 INR", "3500 JPY",
   three-decimal KWD/BHD/OMR, two-decimal default, never locale-invented,
   original never replaced by a converted value), the 1:1 desire-level mapping
   to the approved V18 strings, the "N things"/"1 thing" count phrasing, and
   the row→snapshot mapper (unknown enum value throws loudly).
5. **UI** (`src/wishlist/*`, `app/wishlist/*`): the V18 `wishlist-empty`
   composition (dashed panel, stacked placeholder cards, "?" card art, pinned
   heading/body copy) with the pinned "Add an item" CTA → `/wishlist/items/new`;
   the V18 profile header card (initials disc, display name, taste line, item
   count; default coral band); the populated masonry card grid
   (`ShelfieCard` port: aspect/tilt cycling, tape cadence, desire chip overlay,
   retailer link with `rel="noreferrer"` when `source_url` exists, note
   speech-bubble); the branded missing-image placeholder (title in display type
   on the cream field) for imageless items, snapshot-path-only items, and
   runtime image failures (client `onError` fallback — the only client
   interactivity besides the shell menu); designed loading (`loading.tsx`
   skeletons, sr-only status, reduced-motion respected) and error states
   (`error.tsx`: generic branded copy + retry, digest-only logging). The same
   header shell as `/home` (wordmark + AccountMenu) on both routes. The interim
   honest `/wishlist/items/new` page (gate + "Add an item" heading + one honest
   sentence + way back — no form, no extraction, no mock data).
6. **Account menu** (`src/home/account-menu.tsx` + test): the "My wishlist"
   entry linking to `/wishlist` (005b lifts the deferral); Edit profile stays
   deferred.
7. **E2E** (`tests/e2e/wishlist.spec.ts` plain; `tests/e2e/wishlist-local.spec.ts`
   stack-gated via `E2E_LOCAL_SUPABASE`): signed-out GET redirects with zero
   wishlist markup; signed-out POST deny (with and without a Server Action
   header); the full stack-gated proxy envelope; the non-cacheable signed-in
   document; empty state + CTA navigation; populated snapshot fields in pinned
   order; placeholder + runtime fallback; persistence (reload + same-browser
   new tab); cross-user denial (separate contexts, DOM + network payload scans
   with the wishlist id known); stale-session recovery + re-sign-in; keyboard
   operability with visible focus + axe WCAG A/AA scans on both states; unknown
   child path → not-found with no data. Shared fixture helper
   (`tests/helpers/local-stack.ts`): admin-created users via the real signup
   path (trigger-created profile + wishlist), admin-minted magic-link sign-in
   through the real UI, service-role item seeding, teardown deletes every
   fixture user (cascade).
8. **Visual candidates** (`tests/visual/wishlist-{empty,filled}.visual.spec.ts`,
   stack-gated; baselines `wishlist-{empty,filled}-{mobile,desktop}.png`
   committed through the baseline-manifest workflow).
9. **CI wiring** (005h coupling rule): all four new spec files added to
   `scripts/e2e-local-stack.sh`'s explicit run list in this same PR; the script
   additionally exports the local stack's service-role key (parsed silently
   through node, never printed) for the specs' fixture management.

## Acceptance criteria cross-check

| # | Brief criterion | Evidence |
| --- | --- | --- |
| 1 | Proxy policy pinning | `src/auth/proxy-policy.test.ts` (positives + negatives) — green in `verify-pass.txt` |
| 2 | Signed-out GET deny | plain e2e `wishlist.spec.ts` (redirect + zero markup; page gate is the control without a provider); stack-gated envelope + `src/auth/proxy.test.ts` unreachable-provider pattern (302/no-store/no-referrer for both paths) |
| 3 | Signed-out POST deny | plain e2e POST test (with and without action header; `redirect: "manual"` — no 200, no content) + stack-gated 302 envelope test |
| 4 | Rendered page non-cacheable | stack-gated document header test + `src/auth/proxy.test.ts` generalized-policy test |
| 5 | Empty state | stack-gated empty-state test (pinned copy, exact CTA label, "0 things", no fake items, DOM scan: no "share"/"visible to"/"group") + unit tests |
| 6 | Empty-state CTA navigation | stack-gated (CTA → designed interim page → way back; never a 404) |
| 7 | Populated snapshot fields | stack-gated populated test (all fields, pinned money strings, zero-decimal JPY, linked/unlinked retailer, pinned order) |
| 8 | Branded missing-image placeholder | stack-gated (imageless → placeholder; unreachable URL → runtime fallback) + unit tests (no-URL, snapshot-only, `onError` fallback, URL-over-snapshot preference) |
| 9 | Persistence | stack-gated (full reload + same-browser new tab) |
| 10 | Cross-user denial | stack-gated (second context; DOM + document payload scans for titles/notes/retailers/amounts/counts/ids) |
| 11 | Stale-session recovery | stack-gated (corrupted cookie → auth flow, no 500/leak; re-sign-in restores the list) |
| 12 | Keyboard + axe | stack-gated (Tab traversal to CTA/retailer link, computed outline, Enter operation; axe scans on both states) + unit tests |
| 13 | Loading/error states + invariant | `app/wishlist/loading.tsx`/`error.tsx` review + unit tests (missing-wishlist → error state, never fake empty; no raw detail) |
| 14 | Visual — wishlist-empty | candidates at 390x844 + 1440x1000 committed via the manifest workflow (`BASELINE-MANIFEST.json` with the round-2 reviewer approval reference); accepted differences listed below |
| 15 | Visual — wishlist-filled | same workflow for the filled pair; money-format difference documented |
| 16 | Unknown child path | stack-gated not-found test (404, zero item data) + proxy-policy negative pin |
| 17 | No mock data shipped | review confirmation below |
| 18 | CI wiring and proof | `scripts/e2e-local-stack.sh` explicit list (same PR); green `gh pr checks` on the PR head with curated log excerpts in `ci-database-job-run.md` showing the wishlist specs' executed test counts |

## Accepted differences vs the pinned V18 references

All documented for owner review, per the brief's design resolutions:

- **Resolution 1**: the empty-state CTA reads **"Add an item"** (approved
  vocabulary) instead of the V18 "Add from a link"; the V18 `LinkIcon` is
  omitted with it.
- **Resolution 3**: omitted — Share button + copied-link toast, the "visible to
  2 groups" line, the per-user theme colour (the band uses the default coral
  accent), reaction summaries, the Reorder toolbar, the populated-view privacy
  line, the populated-view toolbar "Add an item" link, the Edit profile header
  button; the initials disc replaces the V18 avatar image.
- **Resolution 4**: money renders in the pinned code-suffixed minor-unit format
  ("2499.00 INR", "132000 JPY") — the V18 references show symbol formatting and
  approximate conversions ("$78 = ₹6,550") that this slice deliberately does
  not render.
- **Observed during this slice's review**: the V18 mobile **bottom navigation**
  (Home / My wishlist / Groups) is absent — the brief pins "the same header
  shell as /home" (wordmark + AccountMenu), and `/home` ships without bottom
  nav; the brief governs. Navigation affordances arrive with later slices.
- **Item imagery**: candidates render the app's own vendored product photos or
  the branded cream placeholder (no external retailer images exist in M1);
  the V18 references use prototype photos.

## Visual-baseline review of record

The runtime available to this mission's workers cannot render image inputs, so
the round-2 AI reviewer of record approved the four baselines on independently
reproduced non-visual evidence: macOS Vision OCR of all 4 candidates vs all 4
pinned V18 references (`ocr-candidates.txt`, `ocr-v18-references.txt`),
round-1 programmatic dimension/palette checks, the DOM-level e2e
content/order/state assertions, axe scans, and line-by-line V18 source-port
fidelity. The approval reference is recorded in
`tests/visual/baselines/BASELINE-MANIFEST.json` (`approvedBy`/`approvedDate`),
under the 005b brief's "Owner authorizations applied here" (AI review is the
only approval needed for Phase 4 baseline commits; owner decision 2026-09-30,
recorded in the merged 005h brief).

## Transcripts

- `verify-pass.txt` — full local `pnpm verify` (format, lint, typegen+tsc,
  396 unit tests, build) passing at the PR head.
- `ocr-candidates.txt` / `ocr-v18-references.txt` — the OCR transcripts backing
  the visual-baseline review of record.
- `ci-database-job-run.md` — the green `database` job on the PR head with
  curated log excerpts showing the wishlist specs' executed test counts
  (criterion 18).

## Migration and rollback notes

No migration ships in this slice — the schema is 005a's
(`20260930000000_wishlists`, already merged and applied to staging). Rollback
path: revert the PR (the page, module, policy, and test files); the proxy
policy and cache-policy changes revert with `proxy.ts` and
`src/auth/proxy-policy.ts`. No data is affected.

## Out-of-scope confirmations

- No Magic Patterns mock data, editor artifacts, scaffolding, contexts, routing,
  or preview plumbing shipped — fixtures exist only in test files and the
  local/CI stack (`tests/`, `tests/helpers/local-stack.ts`), synthetic
  (`@example.invalid`) with teardown deletes.
- No item creation/edit/delete UI (005c), no reorder (005d), no extraction
  (005e/005f), no converted-price display (005g), no groups/members/sharing.
- No new npm dependencies; no lockfile drift.
- No staging or production Supabase/Railway configuration was modified. The
  Railway PR preview and CI runs provide the external evidence; the local
  visual candidate capture ran the built app against the staging Supabase
  project with four synthetic users, all deleted in spec teardown (verified
  zero synthetic users remain).
- RLS unchanged; every read is the caller's own rows under the 005a policies.

## Sanitization statement

No credentials, tokens, OTPs, `.env.local` content, or local-stack key material
appears in this pack, the PR, the specs, or the CI logs. The local stack's
fixture keys (publishable and service-role) are parsed silently through node in
`scripts/e2e-local-stack.sh` and never echoed; screenshots capture only
post-redirect states (no token hashes in any URL).
