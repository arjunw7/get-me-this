# 005b — Protected wishlist display and empty state

## Outcome

Show the signed-in owner their real persistent wishlist at `/wishlist`: a
protected, server-rendered owner read path with defense in depth beyond the
proxy, the repository's first real server-side data-access pattern over the
005a schema, an honest branded empty state, and a populated view rendered
from saved item snapshots with a branded missing-image placeholder and
designed loading and error states — with no item-management UI (005c), no
reorder interaction (005d), no extraction (005e/005f), no converted-price
display (005g), and no public sharing, member view, or group visibility of
any kind. Empty and populated mobile (390x844) and desktop (1440x1000)
presentations are compared against the pinned V18 `wishlist-empty` and
`wishlist-filled` references under the manifest workflow, with the accepted
differences documented for owner review.

## Scope

- **Route protection (proxy layer).** `/wishlist` and `/wishlist/items/new`
  join `PROTECTED_ROUTE_PATHS` in `src/auth/proxy-policy.ts`, and the
  pinning tests in `src/auth/proxy-policy.test.ts` are updated to assert
  both paths protected — including the negative cases that stay public
  (the landing and auth routes, case-sensitivity, `/wishlist/unknown`
  child paths, and query strings never counting). The proxy redirects
  anonymous requests for these paths to `/auth` with 302,
  `Cache-Control: no-store`, and `Referrer-Policy: no-referrer` — the
  same envelope `/home` and `/onboarding` already receive (004e) — before
  any page or action runs, covering page GETs, refreshes, direct links,
  and the Server Actions that POST to those same pathnames. A signed-out
  POST to `/wishlist` is therefore redirected, never executed.
- **Route protection (page layer, defense in depth).**
  `app/wishlist/page.tsx` (and the interim add route page below) calls
  `requireCompleteProfile()` (`src/profile/session.ts`) before reading
  data: signed-out → `/auth`; incomplete profile → `/onboarding`. A proxy
  matcher gap must never be the sole control (the 004e rule this slice
  extends to the wishlist routes).
- **CI wiring for the stack-gated specs.** The CI `database` job runs
  only the explicit Playwright paths listed in
  `scripts/e2e-local-stack.sh` (the 005h coupling rule: a PR adding a
  new `E2E_LOCAL_SUPABASE`-gated spec must add it to that list in the
  same PR). Every new stack-gated wishlist e2e and visual spec — none of
  the visual specs run in CI today — is added to that explicit list in
  the same PR, so the `database` job actually executes them. This wiring
  is itself an acceptance criterion (criterion 18). Adding the gated
  visual specs consumes job runtime: the wiring respects 005h's step
  bounds and timeout discipline, using the brief's latitude to split the
  job in parallel if the 30-minute CI budget requires it.
- **Cache policy.** The proxy's final-response cache policy is generalized
  so every response for a protected route path — redirect, rendered
  document, or action response — carries `Cache-Control: no-store`.
  Wishlist content is per-user data; a cached document could leak one
  user's items to another through a shared cache. `/home` and
  `/onboarding` gain no-store as an intended hardening side effect, in
  line with the proxy's existing per-case policy. Pinned by unit tests
  (`src/auth/proxy.test.ts`) and e2e header assertions.
- **Server data access pattern.** A new `src/wishlist/` module establishes
  the repo's first server-side data-access pattern over the 005a schema,
  mirroring the `src/profile/session.ts` precedent: every access goes
  through `createSupabaseServerClient()` under the owner-only RLS
  policies, in server code only (`import "server-only"`), never in a
  client bundle. The owner read is a single fixed shape: the caller's own
  `wishlists` row (at most one, by the one-wishlist-per-owner invariant)
  plus their `wishlist_items` rows selected as the display snapshot —
  `id`, `title`, `source_url`, `retailer`, `image_url`,
  `image_snapshot_path`, `note`, `desire_level`, `sort_position`,
  `original_amount_minor`, `original_currency`, `created_at`,
  `updated_at` — ordered by the 005a deterministic total order
  (`sort_position ASC, id ASC`). Explicit column selection only (never
  `select *`), and the converted-money tuple is deliberately not selected:
  005b never renders conversions (005g owns that contract).
- **Missing-wishlist behavior.** The 005a signup trigger plus backfill
  guarantee every user a wishlist, so a read that returns no wishlist row
  is an invariant violation, not an empty state: the page renders the
  designed error state (below), never a fake empty state and never raw
  error detail. An empty wishlist is "wishlist row present, zero items".
- **Empty state.** The V18 `wishlist-empty` composition
  (`magic-patterns-v18/source/components/shelfie/ShelfieEmpty.tsx`),
  reproduced with the repository's semantic design tokens: the dashed
  rounded panel with the stacked placeholder cards and "?" card art,
  heading **"Very minimalist of you."**, body copy **"Add the first thing
  you'd secretly love to unwrap. A candle, a camera, the hoodie you keep
  looking at."**, and a primary CTA.
  The copy never implies public visibility (no "share", no audience
  claims) and there are no fake or mock items, ever.
- **Populated view.** The V18 `wishlist-filled` composition, reproduced
  with semantic tokens: the profile header card (display name, taste line,
  item count — "N things" / "1 thing"), and the masonry-style card grid of
  `ShelfieCard`-style cards rendered from saved item snapshots: image
  field with the desire chip overlay, title, retailer, original amount
  with currency, and the note speech-bubble when a note exists. The
  source URL is displayed as a retailer link when present (owner-only
  surface; `rel="noreferrer"`), and items render in the pinned read order.
- **Missing-image placeholder.** The branded placeholder field (cream
  background, the item's title set in display type at the V18 placeholder
  scale) is the fallback for (a) items with no `image_url`, and (b) items
  whose image fails to load at runtime (the flow rule: a broken or
  deleted retailer image degrades to the branded placeholder, never a
  broken-image icon, blank gap, or browser default). Display preference
  when both image fields are set: `image_url` wins over
  `image_snapshot_path` in this slice — a deliberate, documented
  supersession of 005a resolution 7's stated preference order, because
  Storage resolution for snapshot paths does not exist until 005e/005f,
  so a snapshot path cannot be rendered here; a snapshot-path-only item
  (no `image_url`) renders the placeholder rather than a broken image.
  005e/005f's briefs restore the snapshot-path preference once Storage
  exists. Runtime image failure is handled client-side (a small
  event-delegated fallback); the list itself stays a server component.
- **Honest loading and error states.** A designed loading state
  (`loading.tsx`) matching the card geometry — skeleton panels, no fake
  items, no spinner-only page, respecting reduced-motion preferences — and
  a designed error state (`error.tsx`) with generic branded copy and a
  retry affordance: no stack traces, no raw provider errors, no data.
- **Application shell on the new routes.** `/wishlist` and the interim
  add page render the same header shell as `/home` — the wordmark and the
  existing `AccountMenu` trigger — so the routes sit inside the approved
  application shell rather than as bare documents. Per DESIGN.md, the
  account menu exposes "My wishlist": 005b adds that entry, linking to
  `/wishlist`, lifting `src/home/account-menu.tsx`'s existing deferral
  for that entry. The Edit profile entry remains deferred (no route yet)
  and is recorded as an accepted difference. `/home` gains no new
  navigation to `/wishlist` in this slice — the home screen's wishlist
  affordances arrive with 005c's create surface — recorded as an accepted
  difference.
- **Interim add-route page (minimal, honest).** The empty-state CTA links
  to `/wishlist/items/new`, which has no real page until 005c. To keep
  every shipped state designed, this slice ships a minimal protected
  interim page at that route — `requireCompleteProfile()` gate, the V18
  add-surface heading ("Add an item"), one honest sentence that item
  entry arrives with the next slice, and a visible way back to the
  wishlist — carrying no form, no fake extraction, and no mock data. 005c
  replaces this page's content with the real create surface; 005f extends
  it into the extraction state machine. `/wishlist/items/new` therefore
  has no signed-out exposure from the moment the route is claimed.

### Design resolutions owned by this brief

Resolutions 1–7 are dated owner decisions (2026-09-30), pinning every open
question left by the Linear draft and the V18 references. Resolution 8 is a
dated agent decision under delegated owner authority. Rejected alternatives
are recorded with each.

1. **CTA label — "Add an item", a documented divergence from V18.** The
   V18 empty state's CTA reads "Add from a link" (it links to the
   prototype's `/add`). This brief pins the label **"Add an item"** — the
   term in DESIGN.md's approved-vocabulary list ("Use familiar terms: …
   `Add an item`"), applied to the first-item action per the flow rule
   that the empty state encourages the first item without implying public
   visibility (`docs/flows/wishlist.md`). Keeping the V18 label was
   rejected: "Add from a link" pre-commits the empty state to the
   extraction path (005e/005f) before 005c's manual entry exists, and the
   approved product vocabulary treats "Add an item" as the canonical
   action label on every Phase 4 surface. The divergence is recorded in
   the pull request and evidence pack for owner review.
2. **CTA destination — `/wishlist/items/new`, claimed now with an honest
   interim page.** The route-map pins production route
   `/wishlist/items/new` for the add surface, so the CTA targets it rather
   than inventing a second destination. Rejecting the alternatives: a
   dead link into the framework's 404 was rejected — every shipped state
   must be designed (DESIGN.md), and a 404 dead end fails that rule
   between this slice and 005c; a disabled "coming soon" button was
   rejected as fake interactivity; pointing the CTA at `/home` was
   rejected as dishonest labeling. The minimal interim page (Scope above)
   is the smallest honest bridge, and it is explicitly 005c-replaceable.
3. **V18 affordances deliberately omitted, documented for owner review.**
   The V18 wishlist screen carries several affordances that belong to
   later phases or to prototype-only plumbing, and 005b omits all of
   them, each recorded as an accepted difference in the PR and evidence
   pack: the Share button and "Wishlist link copied" toast (public sharing
   is a non-goal — no public sharing exists in Phase 4); the "visible to
   2 groups" header line (no groups before Phase 5, and factually false
   in M1); the per-user theme colour on the header band (005a pinned no
   theme columns — the band uses the default primary accent token); the
   owner reaction summaries on cards (Phase 6); the "Reorder" toolbar
   button (005d); and the header Edit profile button (profile editing
   lives in the global application shell's account menu per DESIGN.md);
   the populated-view toolbar privacy line ("You'll never see what's been
   reserved. That's the point.") — a reservation affordance owned by
   Phase 6, omitted rather than rendered vacuously while no groups exist;
   and the populated-view toolbar "Add an item" link — the CTA is owned
   by the empty state in this slice, and 005c's real create surface
   introduces the populated-state affordance; the V18 header **avatar
   image** — no avatar exists to render (004e shipped no avatar-selection
   control and Storage is a later slice), so the header renders the
   repository's initials-avatar initial disc in its place, matching the
   account-menu trigger. All are recorded as accepted differences in the
   PR and evidence pack.
4. **Money display — original pair only, minor-units truthful.** The
   populated card renders the stored original amount in the currency's
   major units — using a pinned ISO 4217 minor-unit digit table (0 for
   zero-decimal currencies such as JPY, 2 as the default) — followed by
   a space and the uppercase currency code: 2499 minor INR renders
   exactly "24.99 INR" and 3500 minor JPY renders exactly "3500 JPY".
   This exact format is the pin for this slice (criterion 15's visual
   comparison holds it steady); 005g may refine symbol/locale
   presentation and never removes the code. No locale-invented symbol
   sets, and never a converted value in place of the original.
   Displaying any converted tuple was rejected: 005g owns conversion
   display, its labeling, and its rate provenance; 005b does not select
   or render those columns.
5. **Desire-level display mapping.** The stored enum maps 1:1 to the
   approved V18 strings: `really_want` → "Really want", `would_love` →
   "Would love", `just_an_idea` → "Just an idea" (005a resolution 1),
   rendered as the V18 desire chip on the card image field.
6. **Read-path shape — one server component, no client data fetching.**
   The list is a single server-rendered document: no client-side
   Supabase reads, no React Query-style hydration of wishlist data, no
   per-item client requests. RLS-scoped server reads keep all
   authorization in one reviewed place; client fetching would spread
   session handling across surfaces. The only client interactivity is the
   image-failure fallback and the application shell's existing menu.
7. **Cross-user and unknown URLs reveal nothing.** There are no per-item
   routes in this slice; navigation to any unknown `/wishlist/*` child
   path renders the framework's not-found state with no wishlist data,
   and the only possible read is the caller's own rows under RLS (the
   005a pgTAP suites prove the cross-user denials at the database; the
   e2e suites here prove the route-level consequences).
8. **Empty-state audience copy correction (agent decision 2026-09-30,
   under delegated owner authority).** The required body copy ends with
   "the hoodie you keep looking at." The pinned V18 copy has one further
   sentence, "Your friends will take it from there." This sentence is
   omitted in 005b because this slice has no friend, group, or public
   access to the wishlist. Keeping it would contradict the owner-only
   visibility rule and the requirement to make no audience claims. This
   correction is an agent decision under delegated authority, not a
   human-authored approval. Record the exact omission in visual evidence.

### Owner authorizations applied here

- **AI reviewer signoff plus green required checks authorize merging
  Phase 4 pull requests** (owner decision 2026-09-30, recorded in the
  merged 005h brief): this brief's planning PR merges under that gate.
- **AI review is the only approval needed for Phase 4 visual baseline
  commits** (owner decision 2026-09-30, recorded in 005h): the candidate
  baselines below are committed under AI review per that authorization —
  after the AI reviewer's image review, the AI reviewer of record fills
  `approvedBy`/`approvedDate` with their review reference, superseding
  `docs/delivery/visual-baselines.md`'s human-only rule for Phase 4
  slices under the brief-governs-over-earlier-documents rule — while the
  manifest's hash/clear mechanics (`scripts/update-baseline-manifest.mjs`)
  and the guard test apply unchanged.

## Non-goals

- No item creation, editing, or deletion UI or server actions (005c).
- No reorder interaction or toolbar (005d).
- No URL extraction, fetching, or `/wishlist/items/new` state machine
  (005e/005f); the interim page above carries no extraction behavior.
- No converted-price display, labeling, or rate handling (005g).
- No groups, memberships, member wishlist browsing, reactions,
  reservations, copies, or sharing — no public or member visibility of any
  kind exists in this slice (Phase 5/6; nothing here may preclude the
  recipient-never-sees-reservations guarantee).
- No Supabase Storage bucket, upload, snapshot upload, or signed-URL
  resolution for `image_snapshot_path` (005e/005f own storage mechanics;
  this slice renders the placeholder for snapshot-path-only items).
- No wishlist-level fields (theme/personality) and no profile-editing UI
  (005a pinned the schema; editing lives in the global shell).
- No staging or production Supabase/Railway mutation. Applying the 005a
  migration to the staging project is the separate owner-approved gate
  that must close before this slice's staging user-testing validation
  begins; it is not part of this slice.
- No new npm dependencies.

## Acceptance criteria

Test types: **unit** = Vitest unit/component tests colocated in `src/`
(RTL where components render); **pinning** = the `proxy-policy` /
`proxy` unit tests; **e2e** = Playwright specs in `tests/e2e/` against
the production build on `127.0.0.1:3100` — plain specs run without a
provider (the page-level gate is the control), and stack-gated specs
(`E2E_LOCAL_SUPABASE` pattern) run in the CI `database` job against the
local Supabase stack; **axe** = accessibility assertions in the stack-
gated e2e; **visual** = Playwright visual specs in `tests/visual/` under
the baseline-manifest workflow; **review** = PR-diff inspection. Allow
AND deny cases are all mandatory.

1. **Proxy policy (pinning).** `isProtectedRoutePath` returns true for
   `/wishlist` and `/wishlist/items/new`, and false for `/`, `/auth`,
   `/auth/*`, `/health`, `/wishlist/unknown` (child paths are not
   blanket-protected), `/WISHLIST` (case-sensitive exact match), and the
   same paths with query strings. Trailing-slash variants are out of
   scope for the proxy negative list: Next.js normalizes them before the
   proxy sees the pathname.
2. **Signed-out GET deny (e2e, plain — no provider configured).** An
   anonymous GET of `/wishlist` is redirected to `/auth` with zero
   wishlist markup — not even the empty state (the page-level
   `requireCompleteProfile` gate is the control without the proxy layer;
   the plain spec asserts the redirect and the absence of markup, not the
   response status or headers). Same assertions for
   `/wishlist/items/new`. The stack-gated spec re-proves the full proxy
   envelope — 302, `Cache-Control: no-store`,
   `Referrer-Policy: no-referrer` — with the provider configured, and the
   `src/auth/proxy.test.ts` unreachable-provider pattern pins the
   envelope for both new pathnames at the unit level.
3. **Signed-out POST deny (e2e, plain).** An anonymous POST to
   `/wishlist` (with and without a Server Action header) does not execute
   wishlist behavior: no 200 with wishlist content, no mutation, no data
   in the response body.
4. **Rendered page is non-cacheable (e2e, stack-gated).** The signed-in
   rendered `/wishlist` document response carries
   `Cache-Control: no-store` (the generalized protected-route policy).
5. **Empty state (e2e + unit, stack-gated).** A fresh signed-in user with
   zero items sees the V18 empty-state composition: the pinned heading
   and body copy exactly "Add the first thing you'd secretly love to
   unwrap. A candle, a camera, the hoodie you keep looking at.", and the
   primary CTA labeled exactly "Add an item" —
   no fake items, no loading residue, no public-visibility language
   (a case-insensitive DOM scan finds no "share", "visible to", or
   group-count copy). The profile header shows the display name, taste
   line, and "0 things".
6. **Empty-state CTA navigation (e2e, stack-gated).** Activating the CTA
   navigates to `/wishlist/items/new`, which renders the designed interim
   state — signed-in, honest copy, a visible way back — and never a 404
   or an extraction form.
7. **Populated view snapshot fields (e2e, stack-gated).** With seeded
   items (the stack-gated specs manage their own deterministic fixtures —
   direct local-stack inserts, never production mock data), `/wishlist`
   renders for each item: title, retailer (linked when `source_url`
   exists), original amount with its ISO currency code at the pinned
   minor-unit precision (a 2499-minor INR item and a 3500-minor JPY item
   render without fractional digits for JPY), note when present, desire
   chip with the mapped V18 string, and image-or-placeholder per
   criterion 8 — in `sort_position ASC, id ASC` order.
8. **Branded missing-image placeholder (e2e, stack-gated + unit).** Items
   with no `image_url` render the branded placeholder (title in display
   type on the cream field) — never a broken-image icon or blank gap; an
   item whose image URL fails at runtime degrades to the placeholder; a
   snapshot-path-only item renders the placeholder.
9. **Persistence (e2e, stack-gated).** A full reload of `/wishlist`
   re-renders the same items in the same order (server round-trip, not
   client cache), and a second tab in the same browser context shows the
   same items without re-authentication friction.
10. **Cross-user denial (e2e, stack-gated).** A second signed-in user's
    `/wishlist` shows only their own rows: none of user A's items,
    titles, notes, images, amounts, or item counts in DOM or network
    payloads, including when A's wishlist id is known to the test.
11. **Stale-session recovery (e2e, stack-gated).** With a dead session
    cookie, `/wishlist` recovers to the auth flow (no 500, no leak),
    and after re-signing in the wishlist renders.
12. **Keyboard and axe (e2e + axe, stack-gated).** On empty and populated
    states, every interactive element — the empty-state CTA, retailer
    links, the shell wordmark link, the account-menu trigger and its
    entries (including the new My wishlist link), and the interim add
    page's way-back link — is reachable and operable by keyboard alone
    with visible focus, and the axe scan reports no violations on either
    state.
13. **Loading and error states (unit + review).** The loading state
    renders skeleton geometry with no fake items and respects
    reduced-motion; the error state renders generic branded copy with a
    retry affordance and no raw error text; the missing-wishlist invariant
    violation renders the error state, not the empty state. The page's
    state-selection branch is extracted into a testable unit (or the
    named mock strategy for `next/navigation` and the data module is
    documented in the PR) so this criterion is provable without a stack.
14. **Visual — wishlist-empty (visual, stack-gated).** Candidate
    screenshots at 390x844 and 1440x1000 are captured against the pinned
    V18 `wishlist-empty` references (same route, viewport, state, scroll
    position, no overlays), compared per the route-map review procedure,
    and committed through the baseline-manifest workflow
    (`scripts/update-baseline-manifest.mjs` + guard test) with the
    accepted differences documented: resolution 1's CTA label,
    resolution 3's omissions (the empty-state comparison inherits the
    header omissions — groups line, theme colour, avatar treatment),
    and resolution 8's omission of V18's final audience sentence.
15. **Visual — wishlist-filled (visual, stack-gated).** Candidate
    screenshots at 390x844 and 1440x1000 of the deterministic seeded
    populated state are compared against the pinned V18 `wishlist-filled`
    references on structure, layout hierarchy, card design, typography,
    and accent usage (design comparison, not exact product pixels), and
    committed through the same manifest workflow with the accepted
    differences documented: resolution 3's omissions and resolution 4's
    money format (code-suffixed minor-unit display, no converted tuple —
    the V18 reference shows symbol formatting and an approximate
    conversion that this slice deliberately does not render).
16. **Unknown child path (e2e, stack-gated).** A signed-in GET of an
    unknown `/wishlist/*` child path renders the not-found state with no
    wishlist data — no items, titles, notes, images, amounts, or counts —
    in DOM or network payloads (the page-level consequence of deliberately
    not blanket-protecting child paths, criterion 1's negative case).
17. **No mock data shipped (review).** No Magic Patterns mock data,
    editor artifacts, prototype scaffolding, contexts, or preview
    plumbing appear in production code; fixtures live only in test files
    and the local/CI stack.
18. **CI wiring and proof (CI + review).** The new stack-gated e2e and
    visual specs are added to the explicit list in
    `scripts/e2e-local-stack.sh` in the same PR (the 005h coupling
    rule); `pnpm verify` and the `database` job are green on the
    implementation PR head via `gh pr checks`, with curated CI log
    excerpts showing the wishlist specs' executed test counts — proof
    the new specs actually ran in the job, not just that the job is
    green.

## Required proof

- Green `gh pr checks` on the implementation PR head: the `verify` job
  and the `database` job (carrying the stack-gated wishlist e2e, axe, and
  visual specs) both green — the binding proof per the 2026-09-30 owner
  decision (no local Docker on this machine).
- `pnpm verify` green locally before the PR opens.
- Before/after screenshots at 390x844 and 1440x1000: "before" is the
  signed-out redirect for a route that did not exist, stated explicitly;
  "after" is the empty and populated states at both viewports.
- Paired visual comparisons vs the pinned V18 `wishlist-empty` and
  `wishlist-filled` baselines, with the accepted-differences list
  (resolutions 1, 3, 4, and 8) recorded in the PR and evidence pack.
- Railway preview URL for the PR (the staging Supabase gate is closed —
  the 005a migration is applied to staging — so the empty state is
  signed in via the staging path without further gating).
- Evidence pack `docs/delivery/evidence/arj-27/`: README mapping every
  acceptance criterion to evidence, curated CI log excerpts (never raw
  full-run logs), transcripts, and the sanitization statement (no
  credentials, tokens, or secret URLs).
- Migration and rollback notes: schema-only in the sense that this slice
  ships no migration — the note records that explicitly and the rollback
  path (revert the page, module, policy, and test files).
- "No Magic Patterns mock data or editor artifacts shipped" confirmation.

## Dependencies

- Linear
  [ARJ-27](https://linear.app/arjun-wadhwa/issue/ARJ-27/005b-protected-wishlist-display-and-empty-state)
  (this slice), child of tracker
  [ARJ-25](https://linear.app/arjun-wadhwa/issue/ARJ-25/005-persistent-wishlist-tracker).
- 005a merged (ARJ-26, PR #26): the `wishlists`/`wishlist_items` schema,
  owner-only RLS, and the read contract this slice consumes.
- 005h merged (PR #24): the CI `database` job that carries the
  stack-gated specs. **The repository brief governs if the Linear draft
  differs.**
- Phase 3 exit satisfied (ARJ-19 Done), per the Linear draft's planning
  gate; informational, already true.
- The staging Supabase gate (005a migration applied to staging) must
  close before this slice's staging user-testing validation begins; it
  does not gate this brief or the implementation PR. Owner record: the
  gate is closed — `20260930000000_wishlists` is applied and verified on
  staging (backfill 1/1, five owner-only policies, anon zero privileges).
- Downstream: 005c (manual CRUD) replaces the interim add-route page and
  feeds this view's populated state; 005d (reorder) consumes the pinned
  read order; 005e/005f (extraction) own Storage snapshot mechanics and
  the `/wishlist/items/new` state machine; 005g (prices) refines money
  display.

## Analytics, security, and privacy

None. No PostHog events are added or changed. All reads are the caller's
own rows under RLS via the server client; no wishlist data reaches a
client bundle, cache, or shared proxy cache (the no-store policy is
pinned); cross-user and anonymous access is denied and tested; fixtures
are synthetic (`@example.invalid`, fixed UUIDs) and exist only in the
local/CI stack; no credentials, tokens, or real personal data are
committed or rendered.

## Planning status

Brief only. ARJ-27 stays in Backlog until this brief is approved at its
exact commit and linked there; implementation is authorized only after
that approval, on a branch cut from the brief's merged commit.
