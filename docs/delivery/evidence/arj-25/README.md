# Evidence pack — ARJ-25 (Phase 4: staging exit evidence)

- **Issue**: [ARJ-25](https://linear.app/arjun-wadhwa/issue/ARJ-25) (exit gate), Phase 4 of the ARJ-25 delivery track.
- **Staging under test**: https://get-me-this-staging.up.railway.app — Railway auto-deploy of `main` at `bb9ff3518048062acf43a1a413419c90e09b73d8` ("ARJ-31: extraction review and manual fallback", #43), which includes the merged 005f + 005g work.
- **Date of run**: 2026-10-02 (UTC), single authenticated walkthrough session plus targeted captures.
- **Method**: Out-of-band Supabase password-grant sessions (staging SMTP OTP delivery is a known broken issue) injected as the `@supabase/ssr` session cookie into an isolated headless Chromium context (Playwright, no repo modification). Browser walkthroughs ran as two synthetic throwaway staging users (`exit-c@…`, `exit-d@…`); REST isolation probes ran with those users' own bearer tokens. All tokens were redacted after use; none appear in this pack.

## Exit-gate criteria cross-check

| # | Gate | Result | Evidence |
| --- | --- | --- | --- |
| 1 | PRE — staging serves new main; signed-out `/wishlist` redirects to auth entry; `/auth` renders the request-code screen; `/auth/link` with no parked value renders the recovery state; CI green on merged main | **PASS** | `pre-landing.html` (landing 200, title "Get Me This | Group wishlists for every occasion"); signed-out `GET /wishlist` → `302` → `https://get-me-this-staging.up.railway.app/auth` (observed via `curl -o /dev/null -w`); `pre-auth-request-code-*.png` (heading "Welcome to Get Me This."); `pre-auth-link-recovery-*.png` (designed "This link didn't work." recovery state with "Use your six-digit code instead"); CI run `36941056863` (push, `main`, head `bb9ff351…`) conclusion **success** |
| 2 | E1 — owner lifecycle as exit-c: onboarding, add (manual), add (URL flow), edit, reorder, delete with confirmation, persistence across reload | **PASS** | `e1-01…e1-20` screenshots at 390x844 and 1440x1000 (chronological log below); persistence re-verified against the staging database: after the walkthrough only the expected rows remain, with the edited price `159900` minor persisted before deletion |
| 3 | E2 — isolation / privacy-negative as exit-d: own empty wishlist only; REST probes against exit-c's rows return nothing and cannot mutate | **PASS** | `e1-04-wishlist-state-desktop-*.png` shows exit-d's own empty wishlist ("Very minimalist of you.", "0 things", zero exit-c items); probe transcripts `e2-probe1…e2-probe5` (details below) |
| 4 | E3 — extraction dormant by design; pasting a product URL fails safe into the manual fallback preserving the URL and entered data | **PASS** | `e1-09-url-fallback-*.png`: heading "That link played hard to get."; the Source-URL field retains the exact pasted URL (`https://example.com/products/marigold-table-lamp`, programmatic match `true`); the item then completed manually and saved. **No suggestions ever appeared** — the dormant-provider contract held |
| 5 | E4 — original price + currency display correctly and persist across reload; with conversion dormant, no approximate line appears | **PASS** | `e4-price-card-mobile-390x844.png` / `e4-price-card-desktop-1440x1000.png`: card shows `2499.00 INR` (original amount + currency); post-reload DOM check counted `data-testid="approximate-price-line"` = **0**; `original_amount_minor=249900`, `original_currency=INR` confirmed via owner-scoped REST read |
| 6 | E5 — visual states exist at both viewports | **PASS** | Both viewports (390x844 and 1440x1000) captured for: empty wishlist, filled wishlist, added notice, updated notice, edit form, reorder mode / move / Done, delete confirmation dialog, after-delete, after-reload. See the file list below. Two run-1 mobile captures (`e1-08/e1-12/e1-14-mobile`) mistimed a navigation race and are superseded by the `e5-*` mobile notice captures; they are excluded from this pack |

## Chronological run log

### PRE (signed-out checks, no session)

1. `GET /` → 200; saved to `pre-landing.html`.
2. `GET /wishlist` signed out → **302** → `/auth` (no-store redirect as designed).
3. `GET /auth` → 200 (request-code screen; screenshot captured).
4. `GET /auth/link` with no parked value → 200 rendering the recovery state (screenshot captured).
5. `gh run list -R arjunw7/get-me-this --commit bb9ff35` → push run `36941056863`, conclusion **success** (10m29s).

### Session establishment (out-of-band, repeated per user)

Staging SMTP OTP delivery is broken (known issue), so sessions were established with the password grant against the staging auth service, then injected as the `@supabase/ssr` cookie:

```bash
# grant (tokens captured to a 0600 temp file OUTSIDE this pack; never printed)
curl -sS -X POST 'https://lfnccxtowemdzemhcroz.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: <publishable-key>' \
  -H 'Content-Type: application/json' \
  -d '{"email":"exit-c@staging.getmethis.fun","password":"<redacted>"}'

# cookie value, per the app's @supabase/ssr 0.12.7 default encoding
# (createBrowserClient default cookieEncoding="base64url"; single unchunked
# cookie because the value is 2019 chars < the 3180-char chunk limit):
node -e 'const s=JSON.parse(fs); fs.writeFileSync(
  "exit-c.cookie",
  "base64-" + Buffer.from(JSON.stringify(s), "utf8").toString("base64url"))'
# cookie: name sb-lfnccxtowemdzemhcroz-auth-token, domain
# get-me-this-staging.up.railway.app, path /, Secure, SameSite=Lax, not HttpOnly
```

Injected into an isolated browser context, then `GET /wishlist` loaded signed-in on the first try — no format retries were needed (verified empirically, as planned).

### E1 — owner lifecycle (exit-c, mobile 390x844 then desktop 1440x1000)

1. `GET /wishlist` with the fresh exit-c session → routed to **/onboarding** (trigger-created profile row has `display_name NULL`, the designed gate). Captured `e1-01`.
2. Completed the real onboarding form (display name "Exit C", taste line via the form, "Let's go") → landed on **/home**. Captured `e1-02`, `e1-03`.
3. Opened /wishlist → empty state ("Very minimalist of you.", "Add an item"). Captured `e1-04` (mobile; the desktop empty-state capture comes from exit-d's run below).
4. Add an item (manual): "Add an item" → `/wishlist/items/new` → "No link? Add it manually" → filled title "Ceramic pour-over set (<viewport>)", price `2499.00`, currency `INR`, note, desire "Really want" → "Add item" → `/wishlist?item=added` with the banner "Item added to your wishlist." Captured `e1-05`–`e1-08` (mobile `e1-08` superseded by `e5-wishlist-added-notice-mobile`).
5. Add an item via the URL flow: opened `/wishlist/items/new?url=https://example.com/products/marigold-table-lamp`. The extraction provider being dormant, the bounded extract failed safe → heading **"That link played hard to get."**, and the Source-URL field **preserved the exact pasted URL** (programmatic equality check `true`). Completed manually (title "Marigold table lamp (<viewport>)", `1899.00 INR`, "Would love") → saved → `/wishlist?item=added`. Captured `e1-09`–`e1-11`. No suggestions ever appeared (correct dormant behavior).
6. Edit: "Edit Marigold table lamp (<viewport>)" → `/wishlist/items/<id>/edit` → changed price to `1599.00` and the note → "Save changes" → `/wishlist?item=updated` with "Item changes saved.". Captured `e1-12`–`e1-14` (desktop `e1-13` shows all changed fields; mobile notices superseded by `e5-*`). Owner-scoped REST read afterwards confirmed `original_amount_minor=159900` persisted (before that item was later deleted in step 8).
7. Reorder: "Reorder" → reorder list with drag handles, named "Move <item> up/down" buttons and the Done overlay ("Order saved." confirmation) → "Move Marigold table lamp (<viewport>) up" → "Done" → order persisted (REST `sort_position`: lamp `0`, pour-over `1` on mobile). Captured `e1-15`–`e1-17`.
8. Delete: inside reorder mode, the compact trash control ("Remove <item>") opens the confirmation dialog **"Delete this item?"** — "\"Marigold table lamp (<viewport>)\" will be removed from your wishlist. This can't be undone." — confirmed with "Delete item" → item removed. Captured `e1-18`, `e1-19`.
9. Reload → full reload of `/wishlist` re-rendered the persisted state (remaining item, saved order, price `2499.00`); programmatic DOM checks: remaining title present, deleted title absent, `approximate-price-line` count 0. Captured `e1-20` + `e4-price-card-*`.
10. Additional mobile notice states (added/updated/deleted) captured via a disposable item as `e5-wishlist-*-notice-mobile-390x844.png`; the disposable item was deleted again in the same run (post-run REST read confirms only the two pour-over items remain for exit-c).

### E2 — isolation / privacy-negative (exit-d, separate browser context)

1. Independent grant for exit-d, injected into a **separate** browser context. `GET /wishlist` → routed to /onboarding (own incomplete profile), completed it ("Exit D"), then `/wishlist` showed **exit-d's own empty wishlist** ("Very minimalist of you.", "0 things") — exit-c's items were never rendered. Captured `e1-01`–`e1-04` desktop (exit-d's run) — this is also the desktop empty-state and desktop onboarding evidence.
2. REST probes (exit-d's bearer token, publishable key as `apikey`; full responses saved as `e2-probe*.json`; identifiers only here):
   - `GET /rest/v1/wishlist_items?select=id,title` → **HTTP 200, `[]`** — exit-d sees zero rows.
   - `GET /rest/v1/wishlist_items?id=eq.b6134636-b1a3-462e-bfb9-e4eff6c61d85` (exit-c's item) → **HTTP 200, `[]`** — not leaked even by primary key.
   - `PATCH /rest/v1/wishlist_items?id=eq.b6134636-…` body `{"note":"hijack attempt"}`, `Prefer: return=representation` → **HTTP 200, `[]`** — zero rows matched for exit-d (owner-only policy filtered the row out of the statement's scope).
   - `DELETE /rest/v1/wishlist_items?id=eq.b6134636-…` → **HTTP 200, `[]`** — zero rows deleted.
   - Control: exit-c's own token `GET /rest/v1/wishlist_items` → **HTTP 200** with both of exit-c's rows intact and unmodified (`e2-probe5-owner-control.json`) — proving the PATCH/DELETE denials actually held and the data was untouched.
   - Note on shapes: PostgREST + owner-only RLS reports row-level denial as 200 with an empty result set (the policy hides the row's existence, rather than a 4xx that would confirm the id exists). This is the expected, safest envelope for these probes.

### E4 — price persistence

Covered in E1 steps 4/6/9 above. Original price and currency display on the card (`2499.00 INR`), survive edit and reload, and no approximate/converted line renders anywhere while conversion is dormant (`data-testid="approximate-price-line"` count = 0 in the DOM after reload, and absent in every screenshot).

## Session-establishment and probe commands (tokens redacted)

```bash
# grant (per user): see "Session establishment" above — access_token/refresh_token
# captured to chmod-600 temp files outside this pack and never echoed.

# REST probes (exit-d bearer; apikey = publishable key):
B="https://lfnccxtowemdzemhcroz.supabase.co/rest/v1"
curl "$B/wishlist_items?select=id,title" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <exit-d-token>"          # -> 200 []
curl "$B/wishlist_items?id=eq.<exit-c-item-id>" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <exit-d-token>"          # -> 200 []
curl -X PATCH "$B/wishlist_items?id=eq.<exit-c-item-id>" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <exit-d-token>" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"note":"hijack attempt"}'                                                    # -> 200 []
curl -X DELETE "$B/wishlist_items?id=eq.<exit-c-item-id>" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <exit-d-token>" \
  -H "Prefer: return=representation"                                                # -> 200 []

# CI evidence:
gh run list -R arjunw7/get-me-this --commit bb9ff35
gh run view 36941056863 -R arjunw7/get-me-this --json headSha,conclusion,displayTitle,event
```

## Evidence file list

- `README.md` — this log.
- `pre-landing.html` — signed-out landing markup (title proves the new build).
- `pre-auth-request-code-mobile-390x844.png`, `pre-auth-request-code-desktop-1440x1000.png` — `/auth` request-code screen.
- `pre-auth-link-recovery-mobile-390x844.png`, `pre-auth-link-recovery-desktop-1440x1000.png` — `/auth/link` recovery state.
- `e1-01…e1-20` walkthrough screenshots, each at `-mobile-390x844` and/or `-desktop-1440x1000` (per the log: arrival, onboarding, home, wishlist states, add-input, manual form, filled forms, added/updated notices, URL fallback, two-items, edit, reorder mode/moved/done, delete dialog, after-delete, after-reload). Desktop `e1-01…e1-04` are from exit-d's run (desktop onboarding + desktop empty state); all other `e1-*` desktop pairs are exit-c.
- `e4-price-card-mobile-390x844.png`, `e4-price-card-desktop-1440x1000.png` — price presentation close-ups.
- `e5-wishlist-added-notice-mobile-390x844.png`, `e5-wishlist-updated-notice-mobile-390x844.png`, `e5-wishlist-deleted-notice-mobile-390x844.png` — mobile notice states (the last shows the post-delete list; the delete banner does not render on the reorder-mode refresh path, see surprises).
- `e2-probe1-all-items.json` … `e2-probe4-delete.json` — exit-d denial probe responses (all `[]`).
- `e2-probe5-owner-control.json` — exit-c control read after the probes (rows intact).

## Surprises / deviations

1. **Tooling deviation (environment, not product)**: `agent-browser` screenshot capture hung in this environment (every session, even on trivial pages), while page interaction worked. All browser evidence was captured with Playwright driving headless Chromium from a `/tmp` script (no repo modification, no new dependencies).
2. **Delete control placement (design observation)**: the owner delete control exists only inside reorder mode (compact trash icon with the "Remove <item>" accessible name); the normal card grid exposes Edit only. Delete is still behind its confirmation dialog. Flagging for product review — it matches the current implementation, so not counted as a failure.
3. **No "deleted" banner on the reorder-mode delete path**: after confirming the dialog inside reorder mode, the list refreshes in place without the `?item=deleted` notice banner (which exists for the query-param path). Deletion itself was confirmed by dialog flow, post-reload DOM absence, and REST. Minor UX observation only.
4. **Price display format**: the card renders the original amount + code as `2499.00 INR` (no currency symbol / thousands separator). Recorded as observed; the persisted value is `original_amount_minor=249900, original_currency=INR`. Not a failure against the flow contract ("original price and currency remain available"), noted for the 005g price-presentation owners.
5. **Exit-d REST PATCH/DELETE return 200 with `[]`** rather than 4xx — expected PostgREST RLS row-filtering semantics; the owner-control read confirms zero mutations.
6. **Two mistimed run-1 mobile captures** (`e1-08/e1-12/e1-14` mobile) raced a navigation and show intermediate states; superseded by the `e5-*` mobile notice captures and excluded from the pack.

## Sanitization statement

No access tokens, refresh tokens, or passwords appear in this pack. Session credentials were held in chmod-600 temp files outside the pack, referenced only by redacted placeholders here, and the temp files are not committed. Screenshots contain no tokens (the app renders no credential material in the captured states). The synthetic accounts (`exit-c@…`, `exit-d@…`) are throwaway staging-only users; their passwords are redacted in this pack.

## Out-of-scope confirmations

- No application code, schema, RLS, or staging configuration was modified. The only staging writes were rows owned by the two synthetic users (items created/edited/reordered/deleted through the UI as designed).
- No Magic Patterns mock data or editor artifacts shipped.
- Docs-only evidence pack: no dependency, lockfile, or migration changes; no rollback notes required.
