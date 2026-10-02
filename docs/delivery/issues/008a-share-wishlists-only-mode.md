# 008a - Share-wishlists-only mode

## Outcome

Make `wishlist_only` a real, enforced gifting mode rather than the accidental
absence of gifting. A group configured **Share wishlists only** shows exactly
the approved private room (006d) and member wishlist browsing (006e) with the
Phase 6 social layer — reactions, copy-to-wishlist, and private group-scoped
reservations — and nothing else: no draw machinery, no checklists, no
assignment surface, no gifting progress of any kind. Every mode-derived
gating decision is made server-side from the stored `groups.mode` value
through the database; no client claim, route guess, or feature flag can
reveal or manufacture a gifting surface.

The slice adds one narrow database authority — a single-statement gifting
surface projection — plus its pgTAP proof, and binds the existing room,
browsing, and Phase 6 surfaces to the `wishlist_only` behavior with
negative-authorization tests. It changes no approved visual baseline.

This repository brief is the binding implementation contract for 008a. A
matching Linear issue is created only after this brief is approved and must
link the exact approved commit rather than copying a divergent contract.

## Resolved decisions

These decisions are binding for this slice and are recorded because the
product specification does not state them explicitly. Each carries an
owner-review flag; the owner may overturn any of them before approval, which
amends this brief.

1. **Reservations are universal, not a gifting-mode feature.** The product
   specification says a `wishlist_only` group's members "browse, react, copy,
   and reserve gifts privately" and that "reservations are group-scoped and
   invisible to the wishlist owner in every mode". The permissions matrix
   marks reserving as "Mode-dependent" for a joined member; this brief
   resolves that dependency: in `wishlist_only` mode every currently joined,
   participating member is an eligible giver, so reserving is available to
   all of them, exactly as the Phase 6 reservation slice shipped it. Mode
   changes eligibility, never the existence or recipient-privacy of
   reservations. (Owner-review flag: confirm.)
2. **The mode remains organizer-changeable after creation, with constraints
   owned elsewhere.** `create_group_v1` takes the mode at creation and
   `update_group_settings` (006a) already accepts a new mode; no merged brief
   or product document forbids changing it. No new mode-change UI ships in
   008a (the approved room has no change-mode control — 006d's honest
   omissions), but the database behavior must be defined for a group switched
   into `wishlist_only`: gifting surfaces disappear by derivation, no gifting
   state is destroyed, and no mode transition involving existing draw state
   is constrained here — that belongs to the Phase 7 secret-draw brief
   (008c) once `current_draw_version` can become non-null. (Owner-review
   flag: the product spec never states whether organizers may change modes
   after creation.)
3. **The wishlist_only room and browsing surfaces change nothing.** The room
   remains the 006d room with the approved **Share wishlists only** mode
   label, and browsing remains the 006e member-wishlist read path. 008a adds
   no gifting banner, no gifting link, no checklist region, and no assignment
   region to any surface for a `wishlist_only` group, consistent with 006d's
   honest-omission list. If product later wants a labeled gifting entry
   point for this mode, that is a new design decision, not this slice.
4. **Mode gating is database-derived and server-applied.** The application
   render reads the mode from reviewed server projections only
   (`group_room_snapshot`, `group_detail`, and this slice's new
   `group_gifting_surface`). No client bundle, hidden control, analytics
   property, or local state is ever treated as evidence of the mode.

## User stories and success signal

- As a casual group member, I want to browse and reserve without assignments
  when the group chooses share-wishlists-only mode (product-spec story 8).
- As a wishlist owner in a `wishlist_only` group, I want certainty that no
  member can see any gifting state about me — there is nothing to leak,
  because no checklist or assignment surface exists for the group.
- As an organizer, I want the mode I configured (or later changed through the
  settings API) to be the single truth for what the group can do, applied
  identically on every route.

Success signal: a deterministic `wishlist_only` fixture group exercises the
room, browsing, reactions, copy, and reservations for all member roles while
every gifting-mode route and function fails closed, and a group switched from
`gift_everyone` into `wishlist_only` stops exposing checklist state on the
next request without destroying the stored rows.

## Dependency contract

### Phase 5 exit (006a-006f, merged)

- Consume the merged group security model exactly: `groups` (including
  `mode public.group_mode` with values `secret_draw`, `gift_everyone`,
  `wishlist_only`, and the inert nullable `current_draw_version`),
  `group_members` with `status` and `participating`, the
  `membership_generation` and sticky-removal rules, the fixed lock order,
  `private.is_joined_group_member` / `private.is_group_organizer` helper
  semantics, the grants/RLS/audit contract, and the closed projection
  shapes `group_detail`, `group_roster`, `group_room_snapshot(uuid)`, and
  `member_wishlist_snapshot(uuid, uuid)`.
- Do not broaden any direct table grant. This slice's new reads go through
  one new reviewed `SECURITY DEFINER` projection; every existing base-table
  privilege and policy remains byte-for-byte unchanged, proven by pgTAP.
- Preserve 006d's rule that organizer status grants no additional private
  read, and 006e's rule that browsing adds no broad group-member SELECT
  policy on `profiles` or `wishlist_items`.

### Phase 6 social layer (reactions, copy, reservations, activity)

- 008a presumes the Phase 6 slices are merged with their own approved briefs:
  reactions and read-only owner summaries (backlog 27-28), copy-to-wishlist
  (29), atomic private reservations with race tests (30), and the gifting
  view and external purchase action with activity summaries that never leak
  private gifting state (31). At brief-freeze time those briefs do not yet
  exist in `docs/delivery/issues/`; implementation of 008a cannot start
  until they are approved, merged, and their exact heads recorded.
- 008a changes no Phase 6 behavior. It binds the Phase 6 surfaces to the
  `wishlist_only` mode with the eligibility decision in Resolved decision 1
  and verifies them for this mode. Any divergence found between the merged
  Phase 6 behavior and this contract at freeze time is a review finding that
  blocks implementation until reconciled.
- Reservation visibility for a `wishlist_only` group follows the Phase 6
  contract exactly: reservation identity is visible only to the reserving
  user and eligible non-recipient givers when coordination requires it, and
  never to the recipient/owner.

### 008b - gift-everyone checklists (sibling brief)

- 008b owns the `gift_everyone` checklist tables and functions and must make
  every one of its functions deny a `wishlist_only` group inside its own
  transaction. This brief does not test 008b's functions for their own
  correctness; when they exist on the merged head, this slice's pgTAP suite
  additionally asserts they return the generic denial for a `wishlist_only`
  group.
- 008b and 008a share no schema objects. Neither brief may edit the other's
  migrations, functions, or test files.

### Phase 7 secret-draw briefs (008c/008d, not yet drafted)

- Assignment, draw, and redraw surfaces do not exist yet. This brief fixes
  the contract they must honor: every secret-draw route and function denies
  a `wishlist_only` group with the same generic failure as an outsider, and
  no `wishlist_only` group ever gains `current_draw_version` through any
  mode transition constrained here.

## Exact gifting-surface projection

### One statement, one signature

Add one forward-only migration creating exactly:

```sql
public.group_gifting_surface(p_group_id uuid)
returns table (
  mode public.group_mode,
  group_status public.group_status,
  has_draw_version boolean,
  caller_is_participating boolean,
  participating_member_count bigint
)
```

- `mode` and `group_status` are the stored authoritative values.
  `has_draw_version` is exactly `(current_draw_version is not null)`;
  `current_draw_version` itself never leaves the database.
  `caller_is_participating` is the caller's current `group_members`
  `participating` flag. `participating_member_count` counts currently
  `joined` members whose `participating` flag is true.
- The function derives the actor only from `auth.uid()`. It returns zero rows
  unless the caller's `group_members` row for `p_group_id` is currently
  `joined` and the group's lifecycle status is the currently supported
  active state per the 006a contract — the identical active-group membership
  predicate 006d's `group_room_snapshot(uuid)` applies. Null auth, outsider,
  invited, declined, left, removed, cross-group, and inactive-group callers
  all receive zero rows with no distinguishing detail.
- The body is one data-reading SQL statement; authorization, the membership
  predicate, and the returned values are CTEs or expressions of that single
  statement sharing one PostgreSQL snapshot. It never authorizes in one
  statement and reads the mode in another. No wall-clock call is required, so
  the function is declared `STABLE`; atomicity comes from the single
  statement regardless.
- `SECURITY DEFINER`, owned by the same trusted non-client database role as
  the 006a/006d projections, with an empty `search_path`, schema-qualified
  names, fixed types, and no dynamic SQL. Revoke EXECUTE from `PUBLIC`,
  `anon`, and `service_role`; grant the exact `(uuid)` overload to
  `authenticated` only. No JSON, defaulted, variadic, actor-ID, or
  group-name overload exists. pgTAP enumerates every overload.
- The projection is read-only. It mutates nothing and writes no audit event:
  a mode read is not a lifecycle change.
- The function makes no mode-independent claim about what the client may do.
  It is an input to server rendering; the enforceable boundaries for
  checklist and assignment state live inside the functions that own that
  state (008b, 008c/008d) and in unchanged RLS.

### No other schema change

- No new table, column, enum value, index, trigger, seed row, or direct
  table privilege is added. `groups.mode` and `current_draw_version` are
  untouched. All existing RLS, grants, functions, and projections keep their
  exact merged signatures; pgTAP proves the privilege inventory is unchanged
  apart from the one new grant.

## Mode behavior binding

For a group whose stored mode is `wishlist_only`, on every merged surface:

- **Room (006d).** Unchanged. The header renders the approved
  **Share wishlists only** label from the stored mode. No gifting banner,
  gifting link, draw state, checklist region, or assignment region exists —
  including after the group is switched into `wishlist_only` from another
  mode.
- **Member browsing (006e).** Unchanged. Items render in the owner's
  committed order with the authorized projection fields; the owner redirect,
  empty sentinel, image contract, and uniform denial are untouched.
- **Phase 6 social layer.** Reactions, copy-to-wishlist, and reservations
  behave exactly as shipped, with eligibility per Resolved decision 1. No
  mode-specific copy, badge, or progress state is added to them in this
  slice.
- **Gifting-mode routes.** Any checklist or assignment destination for a
  `wishlist_only` group — current or future — must resolve to the same
  generic application not-found result as an outsider request. This slice
  proves it for everything merged on its head and records the binding
  contract for 008b and the secret-draw briefs.
- **Mode transitions.** When the organizer changes the mode through
  `update_group_settings`, the next request renders from the new stored
  value. No cache may serve a prior mode's private surface: all affected
  responses remain private and non-cacheable per 006d/006e. No migration,
  backfill, or data cleanup accompanies a transition; gifting state owned by
  other modes is hidden by their own predicates, not deleted here.
- **Invitation preview.** The seven-field preview (006a) already includes the
  mode. A signed-out visitor joining a `wishlist_only` group sees
  **Share wishlists only** before authenticating; this slice changes
  nothing about the preview.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Single new database authority.** `group_gifting_surface(uuid)` exists
   with exactly the declared signature, return columns, nullability,
   `SECURITY DEFINER` ownership, empty `search_path`, default-EXECUTE
   revocation, and the single `authenticated` grant; no unapproved overload
   exists; the declared and runtime results contain no additional field.
2. **One-statement authorization.** pgTAP proves the function returns the
   authoritative mode, status, draw-version flag, caller participation, and
   participating count from one statement snapshot for a joined caller, and
   zero rows for null-auth, outsider, invited, declined, left, removed,
   cross-group, forged-JWT, guessed-UUID, and inactive-group callers with no
   distinguishing timing or error detail.
3. **Least privilege preserved.** The full table, column, schema, sequence,
   and function privilege inventory is unchanged apart from the one new
   function grant; no direct client access to any gifting state is created;
   existing RLS and policies are provably unmodified.
4. **wishlist_only room truth.** A deterministic `wishlist_only` fixture
   group renders the exact 006d room for organizer, joined non-organizer,
   and joined-only states, with the **Share wishlists only** label and no
   gifting banner, link, checklist, draw, or assignment region in HTML, RSC
   payload, or browser bundle.
5. **wishlist_only browsing truth.** 006e browsing, the owner redirect, the
   empty sentinel, ordering, image fallback, and uniform denial are
   unchanged for a `wishlist_only` group, verified by the existing suites
   run against a `wishlist_only` fixture.
6. **Universal reservations, mode-correct eligibility.** In the
   `wishlist_only` fixture, joined participating members can reserve
   others' items through the Phase 6 surfaces exactly once atomically; the
   recipient never sees reservation state or reserving identity for their
   own item; a user cannot reserve their own item; non-participating or
   former members cannot reserve.
7. **Gifting surfaces fail closed.** Every checklist or assignment surface
   merged on the implementation head — 008b's functions once merged, and
   any route that exists — returns the generic denial/not-found for the
   `wishlist_only` group, proven by negative database and browser tests. No
   client-side mode claim can alter the outcome.
8. **Mode transition honesty.** A group switched from `gift_everyone` into
   `wishlist_only` (and, if merged, from `secret_draw`) stops exposing the
   prior mode's gifting surface on the next uncached request; no stored
   gifting row is mutated by the transition; the invitation preview and room
   label reflect the new mode; no cached prior-mode private response is
   served.
9. **No draw state creation.** No path in this slice writes
   `current_draw_version` or creates any assignment, draw, or checklist row;
   `has_draw_version` is false for every `wishlist_only` fixture group.
10. **Privacy of mode reads.** Opening or being denied the gifting-surface
    projection emits no analytics event and logs no mode, group, or member
    content. Room and browsing responses for `wishlist_only` groups carry no
    gifting field, and the surfaces remain blocked from autocapture and
    session replay per 006d.
11. **Accessible unchanged surfaces.** Keyboard traversal, visible focus,
    heading/landmark semantics, 44-pixel targets, 200% zoom, 320-pixel
    reflow, and reduced motion remain green on the room and browsing
    surfaces for the `wishlist_only` fixture at both approved viewports; axe
    reports zero violations.
12. **Visual baselines unchanged.** No approved visual baseline changes.
    Room and browsing captures for the `wishlist_only` fixture are recorded
    as evidence and compared apple-to-apple with the deployed prototype at
    390 by 844 and 1440 by 1000; any unavoidable pixel difference (fixture
    content) is documented, and a baseline update would require explicit
    product/design approval, not agent action.
13. **Analytics and privacy.** No new analytics event is introduced; the
    existing `group_created` `gifting_mode` property already covers mode
    choice, and `gifting_mode_selected` remains unused until a mode-change
    UI slice ships. The development test sink records zero new events from
    every 008a surface, positive or denied.
14. **Exact-head gates.** The forward migration, pgTAP suites, unit and
    component tests, stack-gated browser/axe suite, visual runs,
    `pnpm verify`, the CI database job, and the Railway preview are green on
    the exact independently reviewed implementation head. Staging proof uses
    only the existing staging Supabase/Railway resources and synthetic
    accounts.

## Required automated proof

### Database authorization tests (pgTAP)

- Exact signature, return columns, owner, security mode, search path,
  privilege inventory before/after, overload enumeration, and RLS-state
  assertions for `group_gifting_surface`.
- Positive fixtures: caller as organizer, caller as ordinary joined member,
  participating and non-participating callers, zero-participant group,
  full-participation group, `wishlist_only`, `gift_everyone`, and
  `secret_draw` fixture groups returning identical projection shapes.
- Negative fixtures: anon, null auth, outsider, invited, declined, left,
  removed, cross-group member, forged JWT actor fields, guessed UUID,
  inactive/archived group, direct base-table reads, and application use
  through `service_role`. Denials return zero rows and perform no write.
- Invariant fixtures: `has_draw_version` false with null
  `current_draw_version` and true when a synthetic non-null version is
  staged (the value itself must never appear in the result); participating
  count matching a `group_roster`-consistent expectation.
- A mode-transition fixture flips the stored mode with
  `update_group_settings` and asserts the projection reflects the new mode
  in the same-transaction and next-statement reads, with no audit-event
  requirement change and no checklist/assignment row created or destroyed.

### Unit, component, and browser tests

- Server-render tests prove the room and browsing pages derive gating from
  server projections only: no client module imports a mode constant as
  authority, no service-role import exists, and responses use private
  no-store caching.
- Stack-gated Playwright with real local Supabase sessions exercises the
  `wishlist_only` fixture: room, roster entry to browsing, reactions, copy,
  reserve/conflict/release, owner privacy, direct navigation to every
  gifting route, and a mode transition followed by fresh navigation.
  Response inspection scans HTML, RSC/Flight bodies, prefetches, analytics
  sink, console, and artifacts for every synthetic gifting marker — all
  must be absent.
- Negative browser matrix: outsider, invited, declined, left, removed, and
  signed-out requests see no group, roster, wishlist, or gifting data and
  no distinction between causes.

### Visual and staging tests

- Captures of the room and one member-browsing page for the `wishlist_only`
  fixture at 390 by 844 and 1440 by 1000, using fixed fonts, fixed server
  clock, deterministic seed data, local licensed assets, and reduced motion.
  Compare against the deployed prototype and the approved frozen baselines;
  record fixture-driven differences; change no baseline without owner
  approval.
- Railway preview proof on the existing staging project after the reviewed
  migration is applied: the full positive/negative matrix above with
  synthetic accounts, then synthetic-data cleanup per the staging procedure.
  No production Supabase or Railway mutation is authorized.

## Migration and rollback notes

- One forward-only migration adds `public.group_gifting_surface(uuid)` with
  its exact revokes and grant. It adds no table, column, enum, index,
  trigger, seed row, audit event, or table privilege and changes no existing
  function signature. It is tested from a fresh database and from a
  populated 006a-006f state.
- Production rollback is forward-fix only: the safe disabling migration
  revokes authenticated EXECUTE immediately; a later reviewed migration may
  drop the function after the application stops calling it. Never edit or
  roll back earlier group migrations or weaken RLS to restore behavior.
- `supabase/tests/smoke.sql` asserts an exact public-table inventory. This
  slice adds no public table, so the count is unchanged; the implementation
  PR must still run the full smoke suite and record the reconciliation
  (no amendment expected). Any required amendment is a reviewed, explicit
  change, never a silent relaxation.

## Implementation plan

1. **Freeze merged dependencies.** Confirm Phase 5 exit and merged, approved
   006a-006f heads, plus the approved, merged Phase 6 briefs and heads.
   Record the final `groups` schema, mode enum, projection signatures, and
   Phase 6 reservation surface. Any divergence from this brief is a review
   finding before implementation.
2. **Write denial and shape tests first.** Add the pgTAP signature,
   privilege, positive, negative, and transition cases; prove they fail
   because the projection is absent, without touching base-table grants.
3. **Add the narrow projection migration.** Implement the single-statement
   function with exact revokes/grant and nothing else. Keep every existing
   database and race suite green.
4. **Bind the application surfaces.** Add the server-side gating consumers
   for the merged surfaces, the `wishlist_only` fixtures, and the negative
   browser matrix. Add no route, control, or copy.
5. **Prove, review, and stage.** Run local gates, obtain independent
   implementation/security/accessibility review, then CI, the Railway
   preview, and the staging migration/verification per the staging gate.
   Do not mutate production.

## Non-goals

- No mode-change UI, no mode-change API change, and no new mode-transition
  constraint (owned by 008c once draw state exists).
- No checklist, draw, assignment, redraw, or reminder behavior of any kind;
  no change to 008b's tables or functions.
- No change to reactions, copy, reservation semantics, activity summaries,
  or the gifting view's Phase 6 behavior beyond mode-eligibility binding.
- No new route, no gifting banner or link in the room, no new analytics
  event, no tracking-plan change.
- No new dependency, no Magic Patterns code or mock-data import, no
  production Supabase/Railway mutation, and no visual-baseline change.

## Dependencies and gates

- Phase 5 exit evidence (four joined users in a private group, fifth
  outsider denied) and the merged 006a-006f exact heads gate implementation.
- The Phase 6 briefs and merged heads (reactions, copy, reservations,
  gifting view, activity) gate implementation; their exact contracts are
  consumed unchanged.
- 002b/002c, 004e, 005h, and the 006d/006e visual/DB foundations apply as
  published.
- The later 008b and secret-draw briefs consume the gating contract fixed
  here and may not broaden it retroactively.
- Applying the migration to the existing staging Supabase project is a
  separate owner-approved gate before staging validation; the staging gate
  does not close merely because local/CI tests pass.

## Analytics, security, and privacy

No analytics event is introduced by this slice. Mode choice is already
covered by `group_created`'s `gifting_mode` property; `gifting_mode_selected`
stays unused until a mode-change UI brief introduces it. Positive and denied
gating reads emit nothing; tests prove the zero-emission property for every
role and state.

Mode, group facts, member identifiers, participation, and denial causes
never enter PostHog properties, logs, traces, error reports, session replay,
or screenshots used as telemetry. The projection derives authority solely
from `auth.uid()` inside the database; there is no service-role credential in
the application path, no client-side mode claim, and no feature flag acting
as authorization.

## Planning status

Brief only. This document does not authorize implementation, migrations,
cloud changes, Linear state changes, baseline commits, or merge. The owner
must approve the exact commit and link it from the matching Linear issue
first, and must rule on the owner-review flags in Resolved decisions 1-2.
