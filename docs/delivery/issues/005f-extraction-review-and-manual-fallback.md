# 005f - Extraction review and manual fallback

## Outcome

A signed-in owner with a complete profile can paste a product link on
`/wishlist/items/new`, watch a bounded same-origin extraction, review every
proposed field before anything is saved, correct whatever the extractor got
wrong, choose or decline a suggested image, and explicitly save a durable
wishlist item through the exact same validation and persistence contract as
005c. Extraction failure, admission denial, or a blocked link never blocks
manual creation: the pasted URL and every entered field survive into an
editable manual form, and the saved item prefers its stored snapshot so a
later retailer failure cannot blank it. This is Linear
[ARJ-31](https://linear.app/arjun-wadhwa/issue/ARJ-31/) and backlog slice 20
("Implement extraction review and manual fallback"). The repository brief
governs implementation if the Linear draft differs.

This slice consumes the 005e security boundary and the 005c save boundary. It
changes neither the outbound transport nor the storage contract of 005e's
normalized-image function; it owns the review state machine, the private
Storage bucket and upload, and snapshot-first display.

## Dependency contract

### 005c - manual wishlist item CRUD

005c supplies, and this slice must reuse without modification:

- `requireCompleteProfile()` server gating on every page render and Server
  Action call; signed-out requests go to `/auth`, incomplete profiles to
  `/onboarding`; protected documents and action responses are `no-store`.
- The shared validated save boundary under `src/wishlist/` taking an
  explicitly reviewed draft plus a `create` or `edit` operation. Extractor
  output receives no implicit trust: every field 005f submits is revalidated
  by the identical server rules (title blank predicate and 200-character
  bound; retailer blank-to-null or 1-120; note blank-to-null or 2000; source
  URL blank-to-null or 2048 with the 005c HTTP(S)/host/credential/port
  classification; the frozen SIX ISO 4217 List One currency table dated
  2026-09-17; unsigned decimal-text amounts parsed with strings and
  `BigInt` into signed-`bigint` minor units; desire level
  `really_want` / `would_love` / `just_an_idea` with default
  `would_love`).
- The `client_submission_id` UUID submission key: one UUID per new draft,
  a fresh UUID on Start over, live-row equal-payload replay succeeding as
  idempotent, changed-payload replay returning `submission-conflict` with
  the entered draft retained, and append position calculated inside the
  owner-wishlist lock as pinned by 005d.
- Successful create navigation to a fresh `/wishlist` server read with a
  short success notice, and 005c's field-error and generic
  write-failure response vocabulary.

### 005e - product-link extraction security boundary

005e supplies, and this slice must consume without modification:

- One authenticated, same-origin, Node-runtime `POST /wishlist/items/extract`
  Route Handler accepting exactly `{ url: string }`, with origin checking,
  bounded bodies, admission limits (5 attempts/user and 60/process per
  rolling minute; 2/user and 16/process simultaneous), `no-store` and
  `Referrer-Policy: no-referrer` headers, and zero dials for denied work.
- The success payload, a validated `ExtractionResult`: `sourceUrl`; optional
  `title` (200 characters), `retailer` (120),
  `originalAmountMinor` (decimal **string**), and `originalCurrency`
  (uppercase ISO 4217); and at most **8** `candidateImageUrls`. Missing
  values are omitted or `null`, never invented. The result is a proposal,
  never trusted item data.
- The typed failure vocabulary: `invalid_url`, `blocked_url`, `unavailable`,
  `too_large`, `timeout`, `unsupported_content`, `extraction_failed`, plus
  generic `429`/`503` admission denials. All user-visible wording stays
  generic; no link, header, retailer text, DNS answer, or exception detail is
  echoed, logged, or sent to analytics.
- A **server-only** guarded image normalization function (same pinned
  transport, JPEG/PNG/WebP sniffing, bounded decode, static WebP output at
  most 2 MiB, metadata stripped) that 005f calls after user selection. 005e
  does not pin the exported symbol name; the implementation PR records the
  actual name and module. The function neither writes Storage nor proxies
  arbitrary bytes; 005f owns the private object path, upload, owner-only
  access, and snapshot-first display.
- The staging-only codec-memory exception and its production-launch blocker
  (`docs/delivery/evidence/arj-30/security-amendment.md`) remain in force;
  005f adds no codec path around them.

### 005a - wishlist schema and storage fields

`wishlist_items` columns 005f writes, all pinned by the 005a migration
`20260930000000_wishlists.sql` and the 005c migration
`20260930210754_wishlist_item_submission_id.sql`:

- `extraction_status` — enum `wishlist_item_extraction_status` with exactly
  `manual`, `extracting`, `extracted`, `failed`, NOT NULL default `manual`.
  Phase 4 flows persist only `manual` and `extracted`:
  a save from extracted or partial review persists `extracted`; a save from
  the manual fallback (failure, blocked URL, or the manual-first affordance)
  persists `manual`. `extracting`/`failed` are never persisted by this slice.
- `image_url text` — the selected remote candidate URL, 2048 characters,
  `http(s)` CHECK.
- `image_snapshot_path text` — the private Storage object path, 1024
  characters, never an external URL.
- `original_amount_minor bigint` / `original_currency char(3)` — both null
  or both non-null, nonnegative, `^[A-Z]{3}$`.
- `client_submission_id uuid` — unique by `(owner_id, client_submission_id)`
  while non-null; INSERT-only grant.
- Owner-only RLS and column grants are unchanged: `image_url` and
  `image_snapshot_path` remain client-updatable only through the owner's own
  UPDATE grant, which this slice does not alter.

### Exact-main recheck gate

Implementation must start from a `main` that already contains the merged,
independently approved exact heads of 005c and 005e, and the implementation
must inspect their final merged code before writing the review UI or the
Storage migration. Where this brief pins a route name, payload shape, or
function contract, the merged head is authoritative: if the merged 005e
route path or result field name differs from the names above, the merged
shape is used and the difference is recorded in the pull request; if the
merged shape conflicts with a security property this brief relies on, the
difference is resolved by review before implementation proceeds, and any
amendment to an approved 005c/005e contract requires fresh independent
database/security review. The recheck gate explicitly covers, before any
implementation code is written: (a) the merged extract route's exact
pathname, admission behavior, and `ExtractionResult` validation; (b) the
merged server-only normalization function's exported name, input, and output
types; and (c) the merged 005c save boundary's operation signature,
submission-key handling, and append-under-lock behavior.

## User-visible scope

### Route and state machine

All states live on the protected `/wishlist/items/new` route (V18 prototype
route `/add`), replacing 005c's interim manual page with the full V18-derived
add-item flow. The state machine is:

1. **Initial URL entry** — the V18 `input` step: "Drop the link. We'll do
   the nosy part.", a persistently labelled Product link field with the
   Paste helper, the help line, the `Fetch details` primary action, and the
   `No link? Add it manually` affordance. The pasted URL is carried in the
   route as `?url=` and preserved across every later state and retry.
2. **Extracting** — the V18 `loading` step with the "Being nosy…" heading,
   the truncated host line, the bounded step list, and a Cancel control.
   The client wait is bounded at **12 seconds** (the 005e 10-second server
   deadline plus admission margin); expiry or server failure routes to the
   failed state. Cancel aborts the in-flight request and returns to initial
   entry with the URL preserved; the server observes the abort and releases
   admission permits as 005e requires.
3. **Extracted review** — the V18 `review` step: "Found it. Look right?"
   over the form prefilled only with extracted values that actually arrived.
4. **Partial-extraction review** — the same review composition when the
   result is missing title, retailer, price, currency, or images: the
   missing fields render empty or, for the image, as the branded
   placeholder; nothing is invented. A short, generic notice says some
   details could not be read and manual completion is available.
5. **Failed extraction with manual fallback** — the V18 `manual` step with
   the "That link played hard to get." banner, the pasted URL and any
   entered data preserved into the editable form.
6. **Blocked-URL safety state** — the same manual fallback composition for
   `invalid_url` and `blocked_url` outcomes, with generic wording that does
   not distinguish blocked from unavailable and reveals nothing about why.
7. **Validation-error states** — 005c's field-error rendering with every
   raw entered value retained and focus moved to the first error.
8. **Success** — navigation to `/wishlist` with the 005c short success
   notice (see Visual reference mapping for the V18 `added` deviation).

Every state is a designed composition with persistent labels, associated
errors, visible focus, and a page background and typography from the
semantic tokens; no browser-default loading, empty, success, or failure
rendering appears anywhere (DESIGN.md binds this).

### Extracted and partial review

- Suggestions are never silently saved. The only path to persistence is the
  explicit `Add item` submit through the 005c save contract.
- The image chooser is the V18 radio-group fieldset "Pick the photo friends
  will see" over the returned candidate thumbnails; selecting another
  candidate replaces the selection; keyboard operation and visible focus are
  required. Declining every candidate (or having no candidates) saves the
  branded placeholder. Selected candidates are thumbnails rendered as remote
  `img` elements with `referrerpolicy="no-referrer"`; the page HTML itself
  is never fetched client-side (see Privacy and security).
- Every extracted field is editable before save, including the source URL
  and retailer; editing never triggers another fetch.
- `Start over` clears all fields to defaults, generates a new submission
  UUID, and returns to initial entry, per 005c. Re-running extraction from
  review keeps the draft's existing submission key; only Start over rotates
  it.
- A re-extract affordance ("Try the link again") returns to the extracting
  state with the same URL and retains the draft's entered fields for the
  fields the new result does not propose.

### Failed extraction, blocked URLs, and manual fallback

- The manual fallback form is the same 005c form composition: title,
  optional source URL (prefilled with the preserved pasted URL), optional
  retailer, optional original amount with currency, optional note, desire
  selector, and the branded noninteractive photo placeholder. No user file
  upload exists in this slice.
- The failure banner is generic ("We couldn't read that shop."), names
  nothing about network internals, and never includes the response code or
  URL diagnostics. The user can also reach manual entry deliberately from
  initial entry via `No link? Add it manually` with the URL prefilled.
- Admission denials (`429`/`503`) and the client 12-second bound render the
  same recoverable failure state with a retry affordance; the URL and all
  entered data survive.

### Success and reload persistence

- A successful save creates exactly one row via the 005c create contract
  with `extraction_status = 'extracted'` or `'manual'` as above, then
  navigates to `/wishlist` with the short success notice.
- The saved item survives reload, second tab, and later retailer failure:
  display prefers the snapshot, falls back to the remote `image_url`, then
  the branded placeholder, exactly per the 005a resolution 7 and 005b
  contract.
- A full browser reload during review (before save) is not a durability
  surface: the pasted URL survives via `?url=`, extraction restarts from it,
  and nothing was persisted. The e2e suite proves this distinction
  explicitly so "reload persistence" is never ambiguous.

### Honest omissions from Version 18

- The V18 `added` step ("On your wishlist. Your groups can see it now.")
  is omitted: no groups exist in this slice, and the copy would be false.
  Success follows 005c's `/wishlist` navigation with a short notice. This
  is a documented deviation for review.
- The V18 currency conversion preview ("≈ … at today's rate") is omitted:
  approximate conversion is 005g's slice. Original price and currency
  remain exact and available.
- The V18 manual-branch photo file picker is omitted; the photo area stays
  005c's styled noninteractive placeholder.
- The V18 Home starter-pick handoff (`?pick=`) is not part of this slice;
  only `?url=` is honoured.

## Exact contracts

### Extraction request and result

- The browser client posts `{ url }` to the same-origin
  `POST /wishlist/items/extract` exactly once per extracting state, from a
  server-rendered page's client component. No client code fetches any
  retailer page, image normalization, or third-party endpoint; the extract
  route is the only outbound-callable surface, and it performs all remote
  work server-side under 005e's transport.
- The client validates that the response is either a bounded
  `ExtractionResult` or a typed failure before entering review; any
  malformed or unexpected response renders the generic failure state. The
  result is treated as untrusted input end to end: it is never stored,
  logged, or emitted to analytics, and it is fully revalidated at save.
- The extracting state shows the host of the pasted URL as V18 does, with
  truncation; no response metadata is rendered.

### Explicit save

- Save calls the 005c shared validation and persistence boundary with
  operation `create`, the draft's `client_submission_id`, and the reviewed
  fields including the chosen `extraction_status`. Nothing bypasses the
  boundary: the server revalidates every field, derives `owner_id` and
  `wishlist_id` from the fresh session, ignores any posted ownership or
  identity, and computes the append position inside the owner-wishlist lock
  with 005c's replay and `submission-conflict` semantics.
- A `submission-conflict` retains the entered draft and offers the saved
  item's edit route or a new draft, per 005c. A generic write failure keeps
  the draft recoverable.
- After a definite or uncertain save outcome the UI never claims a save
  that did not happen; reconciliation follows 005c's meanings.

### Snapshot storage and snapshot-first display

- A forward-only migration creates the private Storage bucket
  `wishlist-item-snapshots` (see Migration and rollback notes) with
  owner-only policies. The save path uploads the already-normalized WebP
  bytes produced by the 005e server-only normalization function to
  `wishlist-item-snapshots/{owner_id}/{client_submission_id}.webp` through
  the authenticated server client — no service role anywhere in the
  application path — and persists `image_snapshot_path` in the same save
  flow.
- If the candidate fetch or normalization fails, the item still saves
  (never blocked) with `image_url` as the selected candidate when one was
  chosen, or both image columns null; display then falls back per the
  pinned order. A snapshot failure is a designed state, not an error toast
  graveyard: the save succeeds and the notice does not promise a stored
  photo.
- Display integration: the wishlist card rendering gains the
  snapshot-first branch — a short-expiry server-generated signed URL for
  `image_snapshot_path`, then `image_url`, then the branded placeholder.
  Raw storage paths never reach the client; only the signed URL does, and
  it never enters logs, analytics, or evidence.
- The edit route continues to preserve extraction and image metadata per
  005c; this slice adds no image replacement on edit.

### Failure, admission, and retry semantics

- Client-side cancellation, 12-second expiry, `429`, `503`, and every typed
  005e failure code resolve to the failed/manual state with the URL
  preserved. The UI distinguishes nothing beyond "try again or add it
  manually".
- Retrying extraction reuses the same pasted URL; the client does not
  batch, loop, or background-retry extraction. Any automatic retry beyond a
  single user-initiated retry is out of scope.

## Privacy and security

- No browser-side fetch of untrusted retailer pages: the only network call
  the review UI makes is the same-origin extract route; candidate
  thumbnails load as images in the browser under `no-referrer`, an
  acknowledged, documented exposure (the retailer sees an image request
  from the reviewer's browser) that 005e's prohibition on client page
  fetches does not remove. Server-side proxying of candidates is
  forbidden by 005e and not introduced here.
- Generic, non-enumerating errors everywhere: no difference between
  blocked, unavailable, rate-limited, and failed outcomes in user-visible
  text; no link, header, retailer text, or exception detail is rendered,
  logged, or emitted. Bounded 005e metrics (reason codes without URLs) are
  the only extraction telemetry besides the analytics events below.
- No raw storage paths to the client; no signed URL in logs; no
  service-role credential in the application path — the local-stack test
  fixture administration keeps the existing tests-only service-role
  pattern.
- Extraction and save remain owner-only: signed-out and incomplete-profile
  requests are redirected before any data work; the saved row is readable
  by its owner alone under unchanged 005a RLS. No reservation, reaction,
  or gifting state is queried or revealed by this slice.
- No Magic Patterns mock data, prototype `checkLink` stubs, or editor
  artifacts ship; the prototype's mock extraction util is never copied.

## Rendering, failure, and accessibility behavior

- All controls meet the 44-by-44 CSS-pixel minimum: the header close/back
  control, the Paste helper, the image radio thumbnails and their labels,
  Cancel, Start over, Try the link again, and the sticky action bar. Focus
  is always visible; the extracting step's status region is
  `aria-live="polite"`; the failure banner is a `role="alert"`; validation
  errors associate with fields and move focus.
- Reduced motion replaces the V18 step transitions, spinner, and pulse with
  opacity-only or static equivalents without removing function or state
  information.
- The image chooser is a labelled radio group: arrow-key navigation across
  candidates, Space to select, named options, and the selection checkmark
  conveyed accessibly, not only by colour.
- Both viewports (390x844 and 1440x1000) receive full compositions; the
  V18 sticky mobile action bar and desktop static action row are both
  represented.

## Visual reference mapping

The V18 authority for this slice is
`docs/design-reference/magic-patterns-v18/source/pages/AddFromLink.tsx` with
`components/add/AddLoading.tsx`, `components/add/ItemForm.tsx`, and
`components/add/DesireSelector.tsx`. Frozen captures exist for `add-initial`,
`add-loading`, `add-extracted-review`, and `add-manual-fallback` at
390x844 and 1440x1000 under `docs/design-reference/baselines/v18/`.

| 005f state                                          | Comparison authority                                          | Required review                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Initial URL entry, empty and with `?url=` prefilled | Frozen `add-initial` captures plus V18 `input` step           | Compare geometry with matched fixture and scroll; the starter-pick card is an omitted feature and must not appear |
| Extracting                                          | Frozen `add-loading` captures plus V18 `AddLoading`           | Compare with matched host line; the reduced-motion variant is reviewed as a documented difference                 |
| Extracted review                                    | Frozen `add-extracted-review` captures plus V18 `review` step | Compare with matched fixture values; the conversion preview and photo-picker omissions are recorded deviations    |
| Partial-extraction review                           | V18 review vocabulary; no matching frozen capture             | Independent review of the new composition including empty fields and placeholder                                  |
| Failed/blocked manual fallback                      | Frozen `add-manual-fallback` captures plus V18 `manual` step  | Compare banner and preserved URL; per 005c, the frozen capture's banner is a 005f element here                    |
| Validation errors, submission conflict              | V18 form vocabulary; no matching capture                      | Independent review including retained values and error focus                                                      |
| Success notice on `/wishlist`                       | Frozen `wishlist-filled` captures for the underlying list     | Compare list with matched fixture; independently review the notice                                                |

Candidate captures for mobile and desktop are produced for every reviewed
state at 390x844 and 1440x1000 with deterministic fixtures, fixed fonts, and
no network-dependent imagery. An actual independent product/design reviewer
must approve each new composition and every V18 difference against candidate
screenshot hashes and the exact implementation head **before any visual
baseline commit**; a delegated AI review must be identified as such, and no
agent may approve its own baseline changes or update baselines merely to
satisfy CI. The implemented states are compared against the deployed
prototype at the same route-equivalent state, viewport, fixture, scroll, and
open-overlay conditions before approval.

## Acceptance criteria

1. **Auth and profile gating.** A signed-out GET of `/wishlist/items/new`
   redirects to `/auth`; an incomplete profile redirects to `/onboarding`;
   an extract request and a save action from those sessions return no data
   and perform no writes, and the extract route makes zero outbound dials
   for them. Protected documents and action responses are `no-store`.
2. **Initial and extracting states.** A signed-in owner can paste a URL
   (and use the Paste helper), see the V18 initial composition, submit,
   observe the bounded extracting state with host line and Cancel, and
   cancel back to initial entry with the URL preserved. The client wait
   expires at 12 seconds into the failed state, preserving the URL; no
   unbounded spinner exists.
3. **Extracted review.** A complete fixture result prefills title, retailer,
   source URL, price, currency, and up to 8 candidate thumbnails; a partial
   result prefills only what arrived and renders the generic partial notice
   with empty/placeholder gaps. Nothing is saved until the owner explicitly
   submits; a reload of `/wishlist` after reaching review (without saving)
   shows no new item.
4. **Explicit save through the 005c contract.** Saving from review
   revalidates every field server-side, persists exactly one row with
   `extraction_status = 'extracted'`, the chosen image columns, the exact
   decimal-string minor units, and the draft's submission key; equal-payload
   replay succeeds idempotently and changed-payload replay returns
   `submission-conflict` with the draft retained. Navigation lands on
   `/wishlist` with the success notice, and a full reload shows the same
   item.
5. **Manual fallback and blocked URLs.** `invalid_url`, `blocked_url`,
   `unavailable`, `timeout`, `too_large`, `unsupported_content`,
   `extraction_failed`, `429`, `503`, and the 12-second client expiry each
   resolve to the generic failed/manual composition with the pasted URL and
   all entered data preserved; saving from it persists
   `extraction_status = 'manual'`. User-visible text does not distinguish
   blocked from unavailable, and no diagnostic detail is rendered.
6. **Validation errors preserve input.** Submitting the review or fallback
   form with invalid title, URL, retailer, note, or price returns field
   errors (or the generic write-failure code) with every raw entered value
   retained and focus on the first error; no field is truncated or
   silently normalized away.
7. **Snapshot storage.** A successful save with a chosen candidate uploads
   exactly one WebP object under the owner's own prefix in the private
   bucket and persists `image_snapshot_path`; the card then renders the
   signed snapshot URL, falling back to `image_url`, then the branded
   placeholder. A normalization failure saves the item without a snapshot
   and renders the fallback image path. A foreign user cannot read the
   object by direct authenticated storage API, and no raw path or signed
   URL appears in logs or analytics.
8. **Negative authorization.** A second authenticated user cannot read or
   mutate the saved item by page, real action, or direct RLS API; forged
   ownership, parent, identity, image, extraction, sort, and submission-key
   fields are ignored; the app uses no service-role client in the
   application path.
9. **Accessibility.** At 390x844 and 1440x1000: every control meets
   44x44 CSS pixels; keyboard alone can complete paste-to-save, image
   selection, cancel, retry, start-over, and manual fallback; focus is
   visible; extracting/failure/success regions announce politely or
   assertively as designed; axe checks pass at both viewports; reduced
   motion removes decorative movement without removing function.
10. **Analytics discipline.** The only emissions are the two existing
    catalog events pinned below, with their closed enums, from the server
    side. Zero-emission denial tests prove no URL, title, retailer, price,
    note, image path, storage path, or error detail enters any event
    property, log, or person property, and that no extraction failure
    detail is emitted at all.
11. **CI and scope.** `pnpm verify` passes or identifies the exact
    unavailable check. The CI database job resets local Supabase, runs
    `pnpm test:db`, then executes all new `E2E_LOCAL_SUPABASE` specs
    through explicit paths added to `scripts/e2e-local-stack.sh` in the same
    PR, at both Playwright viewports. Plain signed-out tests stay in
    `tests/e2e/`. The exact final PR head has green CI, the
    criteria-to-evidence map, before/after captures, the independent visual
    decision with candidate hashes, the migration/rollback note, and a
    Railway preview URL when available.

## Required automated proof

### Unit and component tests

- State-machine coverage of every designed state and transition:
  initial, extracting (success, typed failures, 429/503, 12-second expiry,
  cancel), complete review, partial review, failed/manual, blocked-URL
  fallback, validation errors, submission conflict, and Start over key
  rotation.
- Response validation: malformed or unexpected extract responses render the
  generic failure state and never leak content into the DOM.
- Result-as-untrusted-input: extracted values at the field bounds and
  beyond are revalidated at save; invented fields are never submitted.
- Reduced-motion and axe coverage at both viewports in the component
  harness.

### Database authorization tests

pgTAP for the new Storage migration, mirroring the 005a allow/deny
discipline: the bucket exists private with the pinned size and MIME
constraints; the owner can INSERT/SELECT (and DELETE their own) objects
under `wishlist-item-snapshots/{owner_id}/` only; any other authenticated
user is denied under a foreign prefix; `anon` is denied everywhere; no
policy on `wishlist_items` changes (the existing owner-only suites from
005a/005c/005d must pass unchanged, proving no grant drift).

### Browser, visual, and staging tests

- New stack-gated spec `tests/e2e/wishlist-extract-local.spec.ts`
  (registered in `scripts/e2e-local-stack.sh` in the same PR) covering,
  with **Playwright route interception serving fixture `ExtractionResult`
  and typed-failure responses — no real outbound egress in e2e**:
  complete extraction to review to save with exact database assertions;
  partial extraction review; each failure class into manual fallback with
  URL preservation; blocked-URL safety; validation-error retention; equal
  and changed submission-key replay; signed-out and incomplete-profile
  redirects; reload persistence of the saved item and the non-persistence
  of an unsaved review; foreign-user denial; and the snapshot-first,
  `image_url`-fallback, branded-placeholder display order.
- New visual spec `tests/visual/wishlist-extract.visual.spec.ts` for the
  candidate states at both viewports, gated behind the owner-approved
  baseline review above; no baseline commit precedes that approval.
- The real-transport extraction proof remains 005e's controlled-preview
  criterion; this slice's e2e adds no network-dependent test.

## Required pull-request evidence

- Acceptance criteria copied from this brief and marked with test names,
  executed counts, and exact database before/after assertions.
- Unit/component, pgTAP, e2e, and axe results; `pnpm verify` and green
  `verify` and `database` jobs on the exact PR head, with a precise
  explanation of any unavailable check.
- Before/after mobile and desktop captures for every changed state, the
  independent product/design reviewer's identity, reviewed commit, approved
  candidate hashes, and any documented deviations (the omitted `added`
  step, conversion preview, photo picker, and starter-pick handoff).
- Confirmation that no Magic Patterns mock data, prototype extraction
  stubs, or editor artifacts shipped, and that no retailer content, secret
  URL, storage path, or signed URL entered code, logs, analytics, or
  evidence.

## Migration and rollback notes

One forward-only migration, `20261002000000_wishlist_item_snapshot_bucket.sql`
(name adjusted only if taken; never edit an applied migration):

- Idempotent `insert into storage.buckets (id, name, public,
file_size_limit, allowed_mime_types) values
('wishlist-item-snapshots', 'wishlist-item-snapshots', false, 2097152,
array['image/webp']) on conflict (id) do update set public = false,
file_size_limit = excluded.file_size_limit, allowed_mime_types =
excluded.allowed_mime_types;` — the 2 MiB limit matches 005e's normalized
  output cap and the single `image/webp` MIME matches its re-encoding
  contract.
- Owner-only `storage.objects` policies named
  `wishlist_item_snapshots_select_own`, `wishlist_item_snapshots_insert_own`,
  `wishlist_item_snapshots_update_own`, and
  `wishlist_item_snapshots_delete_own` for `authenticated`, each scoped to
  `bucket_id = 'wishlist-item-snapshots'` with the first
  `storage.foldername(name)` element equal to `auth.uid()::text` (USING on
  read/update/delete, WITH CHECK on insert/update). No anon role and no
  service-role policy is added; no `wishlist_items` column or grant changes.
- No `wishlist_items` schema migration is needed; this slice's columns all
  exist from 005a/005c/005d.
- Rollback: remove the four policies and delete the bucket only after a
  decision on retained objects (objects are content the owner chose to
  keep; dropping them destroys data). The UI degrades to the
  `image_url`/placeholder fallback if the bucket is removed while rows
  still reference paths. Any correction to the applied migration ships
  forward.

## Implementation plan

1. **Recheck the exact base.** Verify merged `main` contains 005c and 005e
   heads; record the merged extract route name, `ExtractionResult`
   validation, normalization function symbol, and save-boundary signature.
   Resolve any mismatch by review before code.
2. **Migrate and prove storage.** Add the bucket migration and pgTAP
   allow/deny suites; confirm the existing wishlist pgTAP suites pass
   unchanged.
3. **Wire the review state machine.** Build `/wishlist/items/new` from the
   V18 sources with semantic tokens: the client extract call with bounded
   wait and cancel, the untrusted-result validation, review/partial/fallback
   compositions, and the explicit save through the 005c boundary including
   the server-side normalization call, Storage upload, and
   `image_snapshot_path` persistence in the save flow.
4. **Integrate snapshot-first display.** Extend the wishlist card rendering
   with the signed-URL snapshot branch and fallbacks; keep paths off the
   client.
5. **Prove the behavior.** Add unit/component, e2e, and visual specs;
   register the stack-gated specs in `scripts/e2e-local-stack.sh`; run
   `pnpm verify`; capture candidates and obtain the independent visual
   approval before any baseline commit.

## Non-goals

- No group UI, sharing, reactions, reservations, copies, or gifting state
  of any kind.
- No approximate currency conversion, exchange-rate lookup, or converted
  display — that is 005g's slice; original price and currency remain exact
  and available.
- No auto-save, draft persistence beyond the route `?url=` parameter, batch
  extraction, background retries, or persistence of in-flight or failed
  extraction attempts.
- No user photo upload, no edit-time image replacement, no candidate
  caching across sessions, no candidate persistence (transient review
  state only, per 005a resolution 7).
- No changes to the 005e transport, admission limits, parser, or normalizer
  contracts; no new outbound fetch path; no service-role client in the
  application path.
- No new npm dependency; no staging or production Supabase/Railway mutation
  during planning.

## Dependencies and gates

- 005c (manual CRUD, submission keys, save boundary) and 005e (extraction
  boundary, normalization function) must both be **merged heads on exact
  `main`**, plus the Phase 3 exit evidence, before implementation begins.
  This planning commit establishes neither.
- The **exact-main recheck gate** above governs the first implementation
  step; any mismatch between this brief's pinned names and the merged heads
  is resolved by review, and amendments to approved 005c/005e contracts
  require fresh independent database/security review.
- 005a supplies the schema, RLS, and image/snapshot column contract; 005b
  supplies the protected display and placeholder fallback; 005d supplies
  the append-under-lock behavior the save path composes with; 005h supplies
  the CI database job and stack-gated e2e surface.
- The owner reviews mobile and desktop visual candidates before any visual
  baseline commit, per the Linear acceptance.

## Analytics, security, and privacy

Zero new events and zero catalog changes. Two already-defined catalog
events receive their first production emission from server code this slice
introduces, with the closed enums already pinned in
`src/analytics/event-definitions.ts` and the tracking plan:

- `product_extraction_completed` — emitted server-side at the extract
  boundary with `outcome` (`succeeded` | `partial` | `failed` mapping from
  the 005e result/failure taxonomy), `duration_bucket`
  (`under_2s` | `2_to_5s` | `5_to_10s` | `over_10s`, measured server-side),
  and `manual_fallback_offered` (boolean, true whenever the outcome offered
  the manual fallback). No URL, host, reason code beyond `outcome`, or
  content is emitted.
- `wishlist_item_added` — emitted server-side from the save boundary on
  successful create with `entry_method` = `link` (both extracted and
  manual-fallback saves on this route), `has_price`, and `has_image`.

Zero-emission denial tests prove the absence of every prohibited property
per the tracking plan. Logs and error states use generic outcomes; the
extract route's own 005e no-log rules are unchanged and take precedence.

Flagged for reviewer attention (not resolved by this brief): 005c's manual
`/wishlist` create path currently emits nothing, so manual saves are
undercounted against the tracking plan's funnel; whether to add
`wishlist_item_added` with `entry_method = 'manual'` there is a separate
one-line decision requiring its own reviewed amendment to 005c, not silent
scope here.

The route trusts only the 005e boundary and the 005c save boundary under
the authenticated session. No service-role credential, client-side
retailer fetch, raw storage path, signed URL, or cached extraction result
enters the client bundle, logs, or analytics.

## Planning status

Binding brief and implementation plan for review. Implementation starts
only after 005c and 005e are merged heads on `main`, the exact-main recheck
gate passes, and this brief is approved at its exact commit and linked to
ARJ-31. This brief does not approve implementation screenshots, visual
baselines, a merge to `main`, or any staging/production mutation.
