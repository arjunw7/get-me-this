# 004e — Onboarding, protected routes, and session lifecycle

## Outcome

Complete the identity vertical slice (Phase 3, item 4): new users finish
onboarding with a persisted profile, returning users resume safely, all
application routes are protected server-side, and every signed-in user gets an
honest authenticated Home with a confirmed logout — the first usable signed-in
slice, with no simulated wishlist or group work.

## Design resolutions owned by this brief

### Taste line (owner decision, 2026-09-28: persist, bounded, blank-to-null)

- A **forward-only migration** adds `taste_line text` to `public.profiles`
  alongside `display_name` and `avatar_path`, per the data model's rule that
  exact SQL belongs in reviewed migrations. Never edit the 004a migration.
- **One whitespace rule (owner correction, 2026-09-29):** a single,
  explicit rule defines **blank** for both `display_name` and `taste_line`,
  and it is evaluated identically by the database CHECK constraints, the
  normalization trigger, and server-side validation: **a value is blank if
  it is null, the empty string, or consists solely of whitespace characters**
  (spaces, tabs, newlines, and other whitespace), i.e. the value matches the
  anchored pattern `'^\s*$'` (`value ~ '^\s*$'`). PostgreSQL's `btrim()` with no
  trim characters removes **spaces only** — tabs and newlines would pass a
  `btrim`-based check — so `btrim` is not used as the blank definition
  anywhere. Non-blank values are stored exactly as provided (nothing trims,
  rewrites, or otherwise normalizes them).
- **Nullable, limited, normalized:** `taste_line` is nullable; the approved
  screen's **60-character limit** is enforced **by a database CHECK
  constraint** and mirrored by server-side validation on the onboarding submit
  action (rejecting longer input before any write, not truncating silently).
  **Blank input (per the whitespace rule above) is normalized to null**, never
  stored as an empty or whitespace-only string, so empty and never-provided
  are indistinguishable downstream.
- **Database-level normalization (owner correction, 2026-09-29):** the
  blank-to-null guarantee is enforced **in the database**, not only in the
  onboarding action. The same migration adds a BEFORE INSERT OR UPDATE
  trigger on `public.profiles` that sets `taste_line` to null when the value
  is blank under the whitespace rule above. The 004a grant lets an
  authenticated user update the column directly, bypassing the onboarding
  server action, so the normalization must hold for **direct authenticated
  updates** — and the migration tests must prove it that way: a direct
  UPDATE writing a blank value stores null, not the blank string. The blank
  corpus for those tests includes the **empty string, ordinary spaces, tabs,
  and newlines** (a spaces-only corpus would not prove the rule, since
  `btrim`-style trimming handles spaces but not tabs or newlines).
  Non-blank values pass through unmodified (the trigger does not trim or
  otherwise rewrite them; only the blank-to-null rule applies).
- **Permissions:** the authenticated column-limited UPDATE grant extends to
  `taste_line` (owner-only RLS is unchanged from 004a; `id`, `created_at`,
  `updated_at` remain non-updatable); the migration ships with owner-only
  permission tests — anon denied everything, cross-user read and write denied,
  over-60-character writes rejected, blank normalized to null **including via
  direct authenticated updates** — matching the permissions matrix's required
  negative tests.
- **Onboarding UI:** the approved screen's suggestion chips insert text into
  the field only; they carry no other behavior. No avatar-selection control is
  invented — the frozen V18 onboarding screen has none, and the ARJ-18
  route-map discrepancy (flow doc's optional avatar vs the approved screen's
  taste line) stays recorded, not silently resolved.

### Intent after onboarding (owner decision, 2026-09-28: default to home)

- The 004c carry cookie is cleared at successful verification exactly as 004c
  approves. 004e adds **no handoff mechanism**: **after onboarding completes,
  every user lands on `/home`.**
- The approved intent is honored **only for users whose profile is already
  complete**, resolved through 004d's tested intent-to-route table at
  verification time (server-defined routes only; unbuilt `wishlist`/
  `create-group` intents resolve to `/home` with no claim that anything was
  created, per 004d).
- **Rejected alternative (recorded):** a signed, intent-only, short-lived
  handoff cookie set at verify when the profile is incomplete, cleared on
  onboarding completion. It would preserve the flow doc's "completion returns
  the user to the preserved destination" for new users, but adds a second
  cookie lifetime to validate and expires silently during a long onboarding
  anyway; the owner ruled the simpler, always-honest default.
- This deliberately deviates from `docs/flows/authentication.md`'s
  "Completion returns the user to the preserved destination" for the
  onboarding path only; the deviation is flagged here for owner confirmation
  at brief review, and the flow doc is updated with the implementation issue,
  not by this planning PR.

### Protected routes (server-side, defense in depth)

- The 004c `proxy.ts` session-refresh proxy redirects signed-out requests for
  authenticated routes to `/auth` with a safe return intent, and **each
  protected route also verifies the session server-side** (server components
  reading the session, not client JavaScript) — proxy matcher gaps must not be
  the sole control. Typing an application URL while signed out lands on
  `/auth` with the safe intent, per the flow doc.
- Protection covers **refresh and direct-link requests** (bookmark, shared
  link, new tab), not just in-app navigation. The landing page, auth routes,
  and limited invitation preview stay public per the permissions matrix.

### Profile-completeness gate

- **Non-blank database rule (owner correction, 2026-09-29):** the 004a
  schema grants authenticated users a direct UPDATE on `display_name` with no
  non-blank constraint, so an empty or whitespace-only value written by any
  path other than the onboarding form would pass a null-only completeness
  gate. The same 004e migration therefore adds a CHECK constraint:
  `display_name` is **null (incomplete) or non-blank under the whitespace
  rule above** — `display_name is null or display_name !~ '^\s*$'` — and a
  blank `display_name` is rejected by the database on every write path,
  including direct authenticated updates. Never edit the 004a migration;
  the constraint ships as a new forward-only migration and is covered by
  migration tests that UPDATE the column **directly** with blank values —
  the empty string, ordinary spaces, **tabs, and newlines** — and assert
  rejection, not only through the onboarding form.
- A profile with a null `display_name` (004a: null means incomplete) routes to
  `/onboarding`; profiles with a display name set **never repeat onboarding**
  and go straight to their destination. Given the constraint above, "set"
  means non-null and non-blank — no blank value can mark a profile complete.
  The gate is evaluated server-side; onboarding cannot be skipped by client
  manipulation, and a complete profile cannot be forced back into onboarding.
- Onboarding completion (required display name, optional bounded taste line)
  updates the profile through the existing column-limited grant and navigates
  to `/home` (see the intent rule above).

### Honest authenticated `/home`

- **Design reference (owner correction, 2026-09-29):** the reference for the
  minimal `/home` is the pinned V18 `home-new-account` frozen reference
  (`docs/design-reference/baselines/v18/home-new-account--{mobile,desktop}*.png`),
  the state a user just out of onboarding sees, with `home-active` used where
  relevant for an established profile. The `auth-home` reference is **not**
  the comparison target for this screen.
- **Documented omissions:** the reference screens show surfaces this issue
  intentionally does not build — wishlist items and content, group surfaces,
  and navigation to unbuilt routes (wishlist, create-group, My wishlist, Edit
  profile). The implementation omits them deliberately per the minimal,
  honest rule below, and the omissions (plus the approved honest copy
  replacing them) are recorded for the owner's side-by-side review so the
  diff against the reference is reviewed as a stated decision, not as drift.
- `/home` is a **minimal, honest** authenticated home: the user's display name
  and the account menu, with honest copy about what exists now. No simulated
  wishlist items, group content, or Coming-Soon-only-for-layout placeholders
  that imply working features; anything shown exists in this issue's code.
- No navigation to routes that don't exist yet (wishlist and group surfaces
  are Phase 4+).

### Account menu and logout (owner decision, 2026-09-28: honest minimal)

- The account menu shows the signed-in **email** and a **confirmed Log out**
  only. The flow doc's My wishlist and Edit profile entries are **deferred
  until their routes exist** — 004c/004d's no-navigation-to-unbuilt-routes
  rule governs — and this omission is flagged for owner side-by-side copy
  review before merge.
- **Logout requires confirmation** (per the flow doc: signing in again
  requires email access), then calls `signOut({ scope: 'local' })` — the same
  local scope 004c ships (clears this browser's session, does not revoke other
  devices' sessions), asserted by test — resets the typed analytics identity
  through the approved adapter, and returns to the landing page with the
  approved copy: **"You're logged out. See you soon."**
- Responses that clear the session are `no-store`.

### Session lifecycle

- **Restoration:** a valid session survives page refresh and **a new tab in
  the same browser**; the proxy maintains and refreshes expired tokens per the
  standard `@supabase/ssr` scheme.
- **Isolation:** a **fresh browser context with no cookies is signed out** and
  lands on `/auth` with a safe intent — session state is never inferred from
  anything but the session cookies themselves.
- **Equivalence:** both verification paths (six-digit code and 004d magic
  link) reach **identical post-auth rules** — same gate, same destinations,
  same protection — proven by test.
- **Expiry:** an expired session recovers safely to `/auth` with the safe
  intent; no half-authenticated state, no error leaks.

## Non-goals

Wishlist or group backend, surfaces, or actions; invitation join; avatar
upload/selection; My wishlist / Edit profile routes; any intent handoff beyond
the default-to-home rule above; production rollout; PostHog replay (ARJ-15
remains the consent gate); changes to the 004a–004d migrations, email
templates, or the pinned link URL form.

## Acceptance criteria

- **Unit/component tests:** onboarding validation (display name required;
  taste line ≤ 60 characters, rejected server-side, never silently truncated;
  blank values normalized to null under the shared whitespace rule — the test
  corpus covers the empty string, ordinary spaces, tabs, and newlines);
  profile-completeness gate logic; account-menu states; confirmation flow
  for logout.
- **Migration/permission tests (same pull request, per the matrix):**
  `taste_line` column exists with the CHECK constraint; the authenticated
  UPDATE grant covers it; anon denied; cross-user SELECT and UPDATE denied;
  over-60-character writes rejected by the database; blank input stored as
  null **proven by direct authenticated UPDATEs with blank values (empty
  string, ordinary spaces, tabs, and newlines), not only through the
  onboarding action**; the `display_name` non-blank CHECK constraint rejects
  direct authenticated UPDATEs writing the same blank corpus; a user cannot
  read or edit another user's profile.
- **Proxy/protected-route tests:** the matcher covers authenticated routes
  and Server Actions; anonymous requests for protected routes redirect to
  `/auth` with a safe return intent; **each protected route denies
  server-side even when the proxy is bypassed**; public routes stay public.
- **Session tests (owner correction, 2026-09-28):** a **new tab in the same
  browser retains a valid session**; a **fresh browser context with no
  cookies is signed out** and redirected safely; refresh preserves a valid
  session; an expired session recovers to `/auth` without error leaks.
- **E2E (local stack), both verification paths:** fresh user → onboarding
  (display name + taste line persisted; blank stored as null) → `/home`;
  returning user (complete profile) → straight to destination; the unbuilt
  intent corpus resolves to `/home` with no false claims; logout requires
  confirmation, clears the session, resets the analytics identity, and lands
  on the approved logged-out copy; both code and magic-link paths pass the
  same post-auth assertions.
- **No leakage:** no email addresses, display names, or auth material in
  URLs, logs, analytics payloads, or replay files beyond what the approved
  tracking plan already permits; analytics events introduce nothing outside
  the typed catalog.
- **Copy/visual (owner correction, 2026-09-29):** changed screens compared
  against **existing references only where they exist** — onboarding and the
  logged-out landing have committed baselines
  (`tests/visual/baselines/`), and those comparisons happen at the same
  route, viewport, and content fixture. **`/home` and the account menu have
  no committed baselines**; the design references for owner side-by-side
  review are the pinned V18 **`home-new-account`** frozen reference for
  `/home` (**`home-active` where relevant** for an established profile) plus
  `account-menu` and `logout-confirmation` under
  `docs/design-reference/baselines/v18/`, with the reference screens'
  unbuilt surfaces covered by the **documented omissions** in the
  authenticated-`/home` section above; new committed baselines for those
  surfaces are generated as **candidates** and committed only after
  explicit owner approval per `docs/delivery/visual-baselines.md`
  (candidates are never committed before approval, and the human reviewer
  fills the manifest approval fields by hand). Owner copy review before
  merge; no invented avatar control.

## Required proof

- Local test transcripts (unit, migration/permission, proxy, e2e), `pnpm
  verify` green; migration and rollback notes for the 004e migration
  (`taste_line` column and CHECK, the blank-to-null trigger, and the
  `display_name` non-blank CHECK).
- Sanitized staging rehearsal with synthetic users only: a fresh user
  (onboarding → `/home`) and a returning user (direct to destination),
  refresh and new-tab retention, fresh-context signed-out state, confirmed
  logout with identity reset. No addresses, codes, tokens, or secret URLs in
  committed evidence.
- The owner's approval of this brief at its exact commit, and the side-by-side
  copy review, before merge.

## Dependencies

004c (ARJ-22) and 004d (ARJ-23) working and accepted — this issue's code does
not start before that. Parent tracker ARJ-19. The repository brief governs if
the Linear draft (ARJ-24) differs.

## Planning status

Brief only. ARJ-24 stays in Backlog until this brief is owner-approved at its
exact commit and 004d is working and accepted; no branch, code, remote
configuration, or Factory implementation before that gate.
