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
- **One whitespace rule (owner correction, 2026-09-29):** a single, explicit
  rule defines **blank** for both `display_name` and `taste_line`, and the
  database CHECK constraints, the normalization trigger, and server-side
  validation all decide blankness by that one rule. **A value is blank when
  it is null, the empty string, or consists solely of characters from the
  blank set below.** Non-blank values are stored exactly as provided —
  nothing trims, rewrites, or otherwise normalizes them — so a value with
  internal or surrounding spaces is preserved verbatim.
- **The blank set (pinned, 26 code points):** U+0009 tab, U+000A line feed,
  U+000B line tabulation, U+000C form feed, U+000D carriage return,
  U+0020 space, U+0085 next line, U+00A0 no-break space, U+1680 ogham space
  mark, U+2000–U+200A, U+2028 line separator, U+2029 paragraph separator,
  U+202F narrow no-break space, U+205F medium mathematical space,
  U+3000 ideographic space, and U+FEFF zero-width no-break space — that is,
  the Unicode `White_Space` property plus U+FEFF.
- **Why the set is enumerated rather than delegated to `\s` (the mismatch
  this correction resolves):** the two engines disagree about `\s`, so a
  brief that simply says "whitespace" or reuses `'^\s*$'` on both sides does
  **not** define one rule. PostgreSQL's `\s` is shorthand for
  `[[:space:]]`, which is ASCII-only and locale-dependent — it does not
  match U+00A0 or U+3000 under the usual `C`/UTF-8 configurations — while
  JavaScript's `\s` under Unicode semantics **does** match them, but omits
  U+0085 and adds U+FEFF. Left to `\s`, the server would treat a no-break
  space as blank while the database accepted it as a real name. **The
  database rule is therefore widened to match the server rule** (rather than
  narrowing the server), and both sides are pinned to the enumerated set
  above, which is the union of what either engine would call blank. So:
  - The migration's CHECK constraints and trigger match blankness with a
    bracket expression **enumerating those code points** (PostgreSQL ARE
    supports `\uwxyz` escapes). They must not use `\s`, `[[:space:]]`, or
    `btrim()` — `btrim()` with no trim characters removes **spaces only**,
    so tabs and newlines would survive a `btrim`-based check. Exact SQL
    belongs in the reviewed migration, per the data model's rule; this
    brief pins the set and these prohibitions.
  - The server matches blankness against `\p{White_Space}` plus U+FEFF with
    the `u` flag — **not** bare `\s` — exported as a **single shared
    predicate** used by onboarding validation and the profile-completeness
    gate alike, so no caller can reimplement it differently.
  - A test asserts the server predicate and the migration's enumerated set
    classify the **identical** code points, so the two definitions cannot
    drift apart in later work.
- **The blank corpus (used by every blank-related test below):** the empty
  string; a single space; a tab; a line feed; a carriage return; **mixtures
  in one value** (space + tab + line feed together, and leading/trailing
  mixtures such as a tab wrapped in spaces); U+00A0 alone; **U+00A0 mixed
  with ASCII whitespace**; U+3000; and U+FEFF. Paired non-blank controls
  must be accepted and stored verbatim: a value containing an internal
  space, and a value with leading and trailing spaces around real
  characters (blank-looking padding is preserved, not trimmed, because only
  wholly blank values are affected).
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
  updates** — and the migration tests must prove it that way, exercising
  **the full blank corpus** above through direct UPDATEs: every entry,
  including the mixtures and the non-ASCII entries, **stores null**, not the
  blank string. Non-blank values pass through unmodified (the trigger does
  not trim or otherwise rewrite them; only the blank-to-null rule applies).
- **Pre-existing rows:** 004a permits blank values today, so a row written
  before this migration could violate the new constraints and block them
  from being added. The migration therefore normalizes existing blank
  `taste_line` values to null **before** adding the constraint and trigger,
  in the same forward-only migration, and the rollback notes cover it.
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
  `display_name` is **null (incomplete) or non-blank under the one
  whitespace rule above**, matched against the enumerated blank set (never
  `\s`, `[[:space:]]`, or `btrim()`), and a blank `display_name` is rejected
  by the database on every write path, including direct authenticated
  updates. Never edit the 004a migration; the constraint ships as a new
  forward-only migration, existing blank `display_name` values are
  normalized to null before it is added (leaving those profiles correctly
  marked incomplete), and it is covered by migration tests that UPDATE the
  column **directly** with **the full blank corpus** — mixtures and
  non-ASCII entries included — and assert rejection, not only through the
  onboarding form.
- A profile with a null `display_name` (004a: null means incomplete) routes to
  `/onboarding`; profiles with a display name set **never repeat onboarding**
  and go straight to their destination. Given the constraint above, "set"
  means non-null and non-blank — no blank value can mark a profile complete.
  The gate is evaluated server-side; onboarding cannot be skipped by client
  manipulation, and a complete profile cannot be forced back into onboarding.
- **A whitespace-only display name never bypasses onboarding (owner
  correction, 2026-09-29):** the completeness gate calls the **same shared
  blank predicate** as validation and the database rule — it is not a
  null-only check — so a display name that is blank under the pinned set
  reads as **incomplete** and routes to `/onboarding`. The database
  constraint is the primary control and the gate is defense in depth, which
  matters because the constraint alone cannot cover a row that predates the
  migration or a value written through any future path. A test seeds
  `display_name` with the blank corpus (bypassing the constraint via a
  privileged fixture) and asserts every entry routes to onboarding rather
  than `/home`.
- Onboarding completion (required display name, optional bounded taste line)
  updates the profile through the existing column-limited grant and navigates
  to `/home` (see the intent rule above).

### Honest authenticated `/home`

- **Design references (owner correction, 2026-09-29):** the reference for the
  new-user `/home` this issue builds is the pinned V18 **`home-new-account`**
  frozen reference under `docs/design-reference/baselines/v18/`
  (`home-new-account--mobile-390x844.png` and its matching
  `--desktop-1440x1000.png`), the state a user sees straight out of
  onboarding. **`home-active`** is the
  returning-user reference and is consulted **only where a returning-user
  state is actually relevant** — nearly all of its content (upcoming-group
  card, private gifting assignment, activity feed, wishlist-refresh nudge)
  is Phase 4+ and out of scope here. The account menu and its confirmation
  compare against **`account-menu`** and **`logout-confirmation`**.
- **`auth-home` is not a Home reference.** Per
  `docs/design-reference/route-map.md`, `auth-home` (with `auth-wishlist`
  and `auth-create-group`) is an **email-entry** state — the `/auth` screen
  at the `home` intent, already covered by ARJ-17 — while Home maps to
  `home-active` and `home-new-account`. The name is misleading; it is
  recorded here so the mix-up is not repeated in implementation or review.
- **V18 features intentionally omitted from the minimal 004e Home.** The
  references show a fuller product than this issue builds. Each omission
  below is a stated decision, reviewed as such rather than as drift, and
  none of them may be faked with placeholders:
  - From `home-new-account`: the **Step 1 "Add something you'd love to get"
    block** (paste-a-link field, Paste control, "Add an item" action, and
    its helper copy); the **"No link handy? Start with an idea" suggestion
    carousel** and its "Add this" actions; the **Step 2 "Create a group for
    your next occasion"** block and its button; the **invitation hint line**;
    and the **sidebar navigation and primary CTA** (Home, Groups, My
    wishlist, "Add an item") — every one of these targets a wishlist,
    group, or item route that does not exist until Phase 4+.
  - From `home-active`: the entire returning-user surface — **"Up next"
    group card** (countdown, date, location, per-person cost, member
    avatars, "Open group", "Draw names privately"), the **private gifting
    assignment card**, the **"Since you last looked" activity feed**, and
    the **"Still into all of this?" wishlist-refresh nudge**.
  - From `account-menu`: the **My wishlist** and **Edit profile** entries
    (see the account-menu section below); the signed-in email and **Log
    out** are built.
  - **Kept from the references:** the welcome heading carrying the user's
    display name, the sidebar profile block showing display name and taste
    line, and the account menu's email and confirmed logout — the parts
    backed by real data and working code in this issue.
  - The honest copy standing in for the omitted surfaces is written for
    this issue and gets owner side-by-side review; it must not imply that
    an omitted feature exists or is "coming" in a way the code cannot back.
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
  blank values normalized to null under the shared whitespace rule, over the
  **full blank corpus** with its non-blank controls); the shared blank
  predicate matched against the migration's enumerated set, code point for
  code point; profile-completeness gate logic, including a **blank
  `display_name` routing to onboarding** across the same corpus;
  account-menu states; confirmation flow for logout.
- **Migration/permission tests (same pull request, per the matrix):**
  `taste_line` column exists with the CHECK constraint; the authenticated
  UPDATE grant covers it; anon denied; cross-user SELECT and UPDATE denied;
  over-60-character writes rejected by the database; blank `taste_line`
  input stored as null **proven by direct authenticated UPDATEs over the
  full blank corpus — mixtures and the non-ASCII entries included — not only
  through the onboarding action**; the `display_name` non-blank CHECK
  constraint rejects direct authenticated UPDATEs writing that same corpus;
  the non-blank controls are accepted and stored verbatim, untrimmed; the
  pre-migration normalization of existing blank values is covered; a user
  cannot read or edit another user's profile.
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
  against **existing references only where they exist**, with every
  comparison at the same route, viewport, and content fixture. Onboarding
  has a committed baseline (`tests/visual/baselines/`). The existing landing
  baseline covers **only the normal visit to `/`**
  (`tests/visual/landing.visual.spec.ts`); it does **not** capture the new
  logged-out "You're logged out. See you soon." state — that baseline is
  kept for the normal landing, unchanged, and the **logged-out state gets
  its own separately reviewed candidate** (a new capture, presented for
  owner review and committed as a baseline only after explicit approval
  per `docs/delivery/visual-baselines.md`; candidates are never committed
  before approval, and the human reviewer fills the manifest approval
  fields by hand). **`/home` and the account menu have
  no committed baselines**; the design references for owner side-by-side
  review are the pinned V18 frozen references under
  `docs/design-reference/baselines/v18/` — **`home-new-account`** for the
  new-user `/home`, **`home-active`** only where a returning-user state is
  relevant, and **`account-menu`** and **`logout-confirmation`** for those
  interactions. **`auth-home` is the email-entry reference and is not used
  for Home.** Each comparison is read against the **documented omissions**
  in the authenticated-`/home` section above, so an absent V18 feature
  reviews as a stated decision, not as a defect. New production screenshots
  of these surfaces are generated as **candidates** and remain candidates
  until explicit owner approval, committed as baselines only afterwards per
  `docs/delivery/visual-baselines.md`. Owner copy review before merge; no
  invented avatar control.

## Required proof

- Local test transcripts (unit, migration/permission, proxy, e2e), `pnpm
  verify` green; migration and rollback notes for the 004e migration
  (`taste_line` column and CHECK, the blank-to-null trigger, the
  `display_name` non-blank CHECK, and the normalization of pre-existing
  blank values that precedes both constraints).
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
