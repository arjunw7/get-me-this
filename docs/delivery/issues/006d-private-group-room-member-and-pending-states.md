# 006d - Private group room, joined members, and pending invitations

## Outcome

Deliver the first honest private group room at `/groups/[groupId]`. A joined,
onboarded member can open an active group, understand its occasion, date,
location when present, budget, currency, and configured gifting mode, and see
the minimum safe roster needed for this slice: joined members and people with
a current targeted invitation still awaiting a response. The room is
server-authorized and non-cacheable. A signed-out visitor, outsider, invited
but not joined person, declined, left, or removed member receives no private
group or roster data.

This slice deliberately stops at the room shell and roster. It does not render
member wishlists, gifting assignments, checklists, reactions, reservations,
activity, or organizer membership controls. It also does not pretend that a
generic shareable link identifies a pending person. The organizer and a joined
non-organizer see the same group facts and roster, apart from truthful
`Organizer`, `Joined`, `Invited`, and `You` labels; organizer status grants no
extra private read.

This repository brief is the binding implementation contract for 006d. A
matching Linear issue is created only after this brief is approved and must
link the exact approved commit rather than copying a divergent contract.

## User stories and success signal

- As a joined member, I want to open the group I joined and see who is already
  in so the invitation flow ends in a real destination.
- As a joined member, I want pending invitations described honestly so I do
  not mistake an issued generic link, a declined person, or a former member
  for someone who is expected to join.
- As an invited but not yet joined person, I want the invitation preview to
  remain my only group view until I explicitly accept.
- As a former member or outsider, I want private group and roster information
  to remain undiscoverable even if I know or guess a group UUID.

The slice contributes to, but does not complete, the Phase 5 exit. Its proof
shows four joined synthetic users and optional live targeted invitees in one
private room while a fifth outsider cannot read the room, roster, profiles, or
wishlist data. Member wishlist browsing remains the next separate Phase 5
slice and is still required for the phase exit.

## Dependency contract

### Phase 4 exit

- Implementation must not start until Phase 4 has actual exit evidence that a
  user can maintain a real persistent wishlist. A planning commit, open pull
  request, or partially green implementation does not satisfy this gate.
- This slice may read no wishlist table or item projection. Phase 4 is a
  sequencing dependency, not permission to pull wishlist browsing into 006d.

### 006a - group security model

- Consume the merged `groups`, `group_members`, targeted-invitation, profile
  fallback, fixed lock-order, sticky-removal, grants, RLS, and audit contract.
  The caller's identity always comes from `auth.uid()`.
- Reuse 006a's group-detail fields: group ID, organizer ID, name, occasion,
  local occasion date/time and IANA time zone, optional location and
  description, budget minor units and currency, gifting mode, lifecycle
  status, and joined-member count. Internal draw version, invitation state,
  membership generation, audit data, and future gifting state remain hidden.
- Do not broaden direct access to `group_members`, `group_invitations`,
  profiles, or audit events. The room consumes one narrowly reviewed
  projection and keeps 006a's base-table grants unchanged.
- Preserve the rule that an organizer is not omniscient. Organizer authority
  does not reveal a pending person's email, invitation token or expiry,
  private wishlist data, assignment, reservation, or future gifting progress.

### 006b - private group creation

- A successfully created organizer already has the group ID and joined
  organizer membership. Add a working **Open group** action to the
  organizer-only created state; it points only to that committed group.
- Group creation and the room do not issue, recover, rotate, or copy a raw
  invitation token. Existing 006b one-time token handling remains confined to
  the created/invitation state. The room does not recreate the prototype's
  **Copy invite link** or **Share on WhatsApp** controls.
- The room renders the authoritative stored date, time zone, budget, currency,
  mode, optional location, and description. It never rebuilds those values
  from the original create-form payload or browser storage.

### 006c - invitation preview and acceptance

- Only a continuation accepted by the same verified user yields a joined
  membership and the group ID. After that state is confirmed, add a working
  **Open group** action to the joined confirmation. Authentication,
  onboarding, reconciliation, GET requests, and an unaccepted invitation do
  not gain room access.
- The 006c invitation preview remains the only group view for a valid invited
  person before acceptance. Its seven-field public projection is not reused as
  authority for the private room.
- Preserve 006c's continuation, browser binding, logout invalidation, raw-token
  cleanup, no-store policy, and session-writer controls. This slice adds no
  invitation cookie, auth intent, token recovery, or direct acceptance path.
- A generic shareable invitation creates no named pending member. Only a
  targeted invitation tied to an `invited` membership can appear in the room's
  pending state.

## User-visible scope

### Protected route and entry points

- `/groups/[groupId]` is a protected Server Component route. The route parses
  a canonical UUID, validates the current Supabase session server-side, checks
  the completed profile, and obtains all page data through the exact room
  projection below. Client state, route ownership claims, and organizer flags
  are never authority.
- A malformed UUID, nonexistent group, inactive unsupported group, outsider,
  invited-but-not-joined user, declined member, left member, removed member,
  or cross-group member receives the same application not-found result. The
  response reveals no distinction, group name, member count, or timing detail.
- Signed-out requests follow the existing protected-route authentication
  behavior and safe `home` intent. This slice does not add a parameterized
  group-return intent or change generic onboarding. The normal entry points
  are the authenticated 006b created state and the accepted 006c joined
  confirmation; both now offer **Open group**.
- The in-room **Home** action goes to the existing `/home`. No `/groups` list,
  group switcher, deep-link restoration protocol, or fabricated navigation
  destination is introduced.
- Every successful private-room response is dynamic and uses private,
  no-store cache control. It is never statically generated, prefetched into a
  shared cache, placed in revalidation storage, or served from a public CDN
  cache. Not-found and authentication responses are also non-cacheable.

### Group header

Reproduce the approved Version 18 room header hierarchy where its content is
backed by the private read model:

1. Approved gifting-mode label: **Draw names privately**, **Gift everyone**,
   or **Share wishlists only**.
2. Group name as the single page heading.
3. The stored, validated occasion label followed by the occasion date, for
   example **Diwali · Sat, 7 Nov 2026**. The label is rendered exactly from the
   bounded group value; the date is formatted from the stored local date/time
   and recorded IANA time zone without shifting the calendar day through the
   viewer's zone. **Something else** remains the approved label for the
   non-specific occasion in this slice; no free-form occasion is invented.
4. Optional location when non-null. Optional description follows as plain
   supporting text when present; neither is invented when absent.
5. Honest countdown based on calendar days in the group's time zone: **Today**
   on the occasion date, **1 day**/**N days** before it, and **1 day ago**/**N
   days ago** after it. One server-captured clock drives the whole render so the
   server and hydrated page cannot disagree at midnight.
6. Exact budget formatted from integer minor units and the stored currency,
   followed by **per person**. There is no approximate conversion in this
   room slice.

The header has no invitation actions, organizer-tools disclosure, gifting CTA,
draw result, assignment claim, or countdown animation. Gifting mode is
informational only; Phase 7 owns mode behavior.

### Joined-member state

- The **Who's in** section is a semantic list. It displays every current
  `joined` member exactly once and reports the authoritative joined count.
  The current caller is labelled **You**. The group organizer is labelled
  **Organizer**. Every other joined person is labelled **Joined**.
- A non-organizer joined member sees the same safe roster as the organizer.
  No row exposes email, profile taste line, avatar storage path, participation
  flag, joined timestamp, invitation history, or former status.
- Initial avatars are presentational and derived from the projected display
  name. Their approved accent is deterministically derived from the member UUID
  without persisting a new profile attribute. The adjacent full display name
  and textual state carry meaning; color, border style, and initials are never
  the only status signal.
- A missing or incomplete profile name uses 006a's generic **Member** label for
  a joined row. The room never substitutes an email address, username, or
  token-derived label.
- The roster remains usable with one organizer, four joined members, long
  display names, duplicate initials, and the database's bounded maximum data.
  It follows the approved horizontal-row intent on narrow screens, aligns to
  the page gutter after scrolling, and does not hide information behind hover.

### Pending-invitation state

- A pending row is shown only when all of these conditions are true in the
  same database statement snapshot:
  - the `group_members` row is currently `invited`;
  - a targeted invitation exists for that exact user and current membership
    generation;
  - the invitation's stored status is active;
  - `expires_at > clock_timestamp()` at the projection's one captured check
    time; and
  - its positive use limit, when present, has remaining capacity.
- Multiple live targeted invitations for the same membership still produce
  one pending row. A generic shareable link, token use without a known target,
  revoked or expired target, exhausted target, declined row, joined row, left
  row, removed row, stale generation, or historical invitation produces no
  pending row.
- A pending row shows only the safe display name, derived initials, and the
  textual label **Invited**. An incomplete profile uses **Invited member**.
  It exposes no email, target flag, invitation ID, token/hash, expiry,
  generation, use count, creator, or resend/nudge action.
- The heading summary is **N joined** when there are no pending rows and **N
  joined, M invited** when pending rows exist. Counts are derived from the
  rows returned by the same snapshot rather than separate client queries.
- A person represented by a pending row cannot open the private room through
  that status. They use the 006c preview and explicit acceptance path. Pending
  visibility to already joined members is presentation, not authority.
- Acceptance, decline, removal, revocation, expiry, exhaustion, or a new
  targeted generation changes what the next request shows. The page does not
  poll, mutate status, or claim real-time presence.

### Honest omissions from Version 18

The frozen `group-room-secret` reference depicts later product work. 006d must
not recreate any of it with placeholders, disabled controls, mock data, or
client-only state:

- no **Copy invite link**, **Share on WhatsApp**, or **Organizer tools**;
- no change-mode, nudge, lock-invites, transfer, remove, leave, decline, or
  reinvite control;
- no **Names have been drawn**, gift plan, checklist, wishlist-only gifting
  banner, or link to `/groups/[groupId]/gifting`;
- no member wishlist rows, item cards, desire labels, prices, reactions,
  copy-to-wishlist, reservation badges, or recipient privacy copy;
- no activity, reminder, purchase, or progress state.

The production room ends after the roster and optional bounded description.
It does not say that unavailable features are working, fake an empty wishlist,
or use "coming soon" to disguise missing behavior.

## Exact private read model

### One statement-level snapshot

Add one exact authenticated projection after the merged 006a-006c migrations:

```sql
public.group_room_snapshot(p_group_id uuid)
returns table (
  group_id uuid,
  organizer_id uuid,
  group_name text,
  occasion text,
  occasion_at timestamp without time zone,
  time_zone text,
  location text,
  description text,
  budget_amount_minor bigint,
  budget_currency text,
  mode text,
  group_status text,
  joined_member_count bigint,
  member_user_id uuid,
  member_display_name text,
  member_state text,
  member_is_organizer boolean
)
```

- It returns one row per visible joined or pending member, repeating identical
  group columns. A joined caller guarantees at least their own joined row, so
  the function does not need a synthetic null-member row. The application
  rejects inconsistent repeated group values rather than silently combining
  them.
- The function derives the actor only from `auth.uid()`, requires the caller's
  current membership to be `joined`, and requires the group to be in the
  currently supported active lifecycle state. Null auth and every other
  membership state return zero rows.
- Its body is one data-reading SQL statement, not a PL/pgSQL sequence or a
  series of application queries. Authorization, active-group filtering,
  `checked_at := clock_timestamp()`, joined count, visible pending eligibility,
  profile fallbacks, and returned rows are all CTEs or expressions in that one
  statement and therefore use one PostgreSQL statement snapshot. Because the
  required wall-clock call is volatile, the function must not be falsely
  labelled `STABLE`; atomicity comes from the single SQL statement, not an
  incorrect volatility declaration. It never authorizes in one statement and
  reads group data in a later statement, or assembles a room through separate
  browser calls to group detail, roster, admin members, and invitations.
- `member_state` is exactly `joined` or `invited`. `member_is_organizer` is true
  only where `member_user_id = organizer_id`; the database invariant makes
  that row joined. The runtime return and declared return shape contain no
  additional key.
- Order is deterministic: caller first; then the organizer if different; then
  other joined members by `joined_at asc, user_id asc`; then invited members by
  case-folded display label asc, user ID asc. Ordering affects presentation
  only and grants no authority.
- The fallback display labels are produced inside the reviewed projection so
  the application never performs a direct profile lookup. The function
  returns the complete display value; visual truncation does not change the
  accessible name.

### Privileges and implementation safety

- The projection is `SECURITY DEFINER`, owned by the same trusted non-client
  database role used by the 006a projections, with an empty `search_path`,
  schema-qualified objects, fixed input/output types, and no dynamic SQL.
- Revoke EXECUTE from `PUBLIC`, `anon`, and `service_role`, then grant only the
  exact `(uuid)` overload to `authenticated`. Enumerate every overload in
  migration and pgTAP proof. No JSON, defaulted, variadic, actor-ID, invitation
  ID, or raw-token overload exists.
- No table, column, sequence, or private-schema grant is added for `anon`,
  `authenticated`, or `service_role`. Existing RLS stays enabled. The function
  does not make `group_admin_members` callable to joined non-organizers and
  does not widen direct profile visibility.
- Expected denial returns zero rows or the route's generic not-found result;
  errors and logs contain only a safe class and correlation ID. They never
  include group content, roster values, SQL text, table/constraint names, or a
  distinction between unknown and unauthorized IDs.
- The implementation must inspect the final merged 006a-006c signatures and
  ownership before writing the forward migration. If the required exact room
  projection already exists on that merged head, no redundant function or
  migration is added; its exact equivalent contract and proof are recorded.
  Under the approved planning contracts it does not exist, so one narrow
  forward migration is expected.

## Rendering, failure, and accessibility behavior

- The server validates the complete projection before rendering. Zero rows,
  invalid enums, contradictory group columns, a missing caller row, duplicate
  member IDs, a pending organizer, or a count mismatch fails closed to the same
  private not-found/error boundary and is logged without row contents.
- Provider/database unavailability shows the existing authenticated safe-error
  treatment and a retry that performs a fresh server navigation. It never
  substitutes stale mock content or claims the user left the group.
- The route loading state preserves the room's broad geometry without names,
  counts, budget, location, or inferred membership. It is not cached and has a
  screen-reader label. No skeleton width encodes private text length.
- The group heading is the page `h1`; **Who's in** is an `h2`; the roster is a
  list; date, countdown, budget, and status labels are exposed as coherent
  text. Decorative sparkle, initials, and mode iconography are hidden from
  assistive technology where adjacent text already names them.
- The horizontal roster supports touch, trackpad, mouse-wheel/shift, and
  keyboard scrolling without trapping focus. Its overflow container is one
  focusable region with `tabindex="0"`, `role="region"`, and an accessible
  name from the **Who's in** heading; native arrow-key scrolling works while
  that region has focus and a clearly visible focus ring. A short
  screen-reader description explains that the region scrolls horizontally.
  Because roster rows are not actions, individual rows are not made fake
  buttons or tab stops. Visible focus is provided for the region and the real
  Home/Open-group links.
- Text remains readable at 200% zoom and reflows at 320 CSS pixels. Touch
  targets are at least 44 by 44 CSS pixels. Status is never color-only.
  Motion is decorative and omitted or disabled under reduced motion.
- Navigating from the 006b/006c success states to the room preserves focus at
  the new page heading. A not-found or safe-error navigation moves focus to its
  heading and announces the result once.

## Visual reference mapping

- Frozen authority:
  `docs/design-reference/baselines/v18/group-room-secret--mobile-390x844.png`
  and
  `docs/design-reference/baselines/v18/group-room-secret--desktop-1440x1000.png`.
  The matching V18 source is
  `docs/design-reference/magic-patterns-v18/source/pages/CircleRoom.tsx`.
- Compare the production shell, Home link, header hierarchy, mode pill, group
  title, date/location line, countdown, budget, **Who's in** heading, joined
  avatars, pending dashed treatment, labels, spacing, and responsive intent at
  exactly 390 by 844 and 1440 by 1000. The explicit stored occasion label is a
  truthful production addition because the outcome requires occasion
  comprehension but the V18 header omits that field; record and approve it as
  a design difference rather than dropping the data or hiding it in an
  accessible-only string.
- The V18 source's user-visible nouns `Circle` and `Shelfie` are not copied.
  Production uses **group** and **wishlist** everywhere.
- The full V18 page is not an apple-to-apple expected image because it contains
  invite actions, organizer tools, assignment state, gifting navigation,
  member wishlists, reactions, and reservations that this slice forbids.
  Record those omissions beside each comparison. Review both an equivalent
  joined-plus-pending fixture and a joined-only fixture. The shared top region
  uses matching deterministic visible content and state; test-only fixture
  data never becomes a production seed or browser-bundled mock.
- Capture production full-page mobile and desktop images for: organizer with
  joined and pending members; joined non-organizer with the same safe roster;
  and joined-only state. The shorter honest room and the non-organizer/
  joined-only states require explicit independent product/design approval
  because no frozen full-page reference exactly represents them.
- Baseline adoption is a product/design decision. An agent cannot update a
  baseline to make CI pass. Reviewers inspect the actual images at recorded
  hashes, not only filenames, OCR, or a pixel score.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Joined-only private route.** An authenticated, onboarded, currently joined
   member can open `/groups/[groupId]`. Malformed/unknown IDs, signed-out
   visitors, outsiders, invited, declined, left, removed, cross-group, null-auth,
   and inactive unsupported groups receive the same non-enumerating result and
   no private group or roster content.
2. **Atomic minimal snapshot.** One exact room projection returns the approved
   group facts and one deterministic row per visible member from one statement
   snapshot. Repeated group values are identical; joined count matches joined
   rows; caller and organizer labels are correct; no extra result field or
   separate client profile/invitation query is present.
3. **Truthful joined roster.** Every current joined member appears once.
   Organizer, current caller, and ordinary joined states render truthfully;
   missing display names use a generic label; long names and duplicate initials
   remain understandable; former and pending-only data do not leak into a
   joined row.
4. **Truthful pending roster.** Only a current `invited` membership with a live,
   matching-generation, capacity-available targeted invitation appears as
   **Invited**, once. Generic, revoked, expired, exhausted, stale-generation,
   declined, joined, left, removed, and duplicate-target histories do not
   create pending rows. Pending status never grants room access.
5. **Negative authorization and least privilege.** `anon`, outsider, invited,
   declined, left, removed, cross-group, forged actor, guessed ID, and
   `service_role` application calls cannot execute or use the projection to
   enumerate groups, members, profiles, invitations, or counts. Direct table
   grants remain unchanged; every unapproved overload is absent or revoked.
6. **Honest header semantics.** Mode, name, stored occasion label, occasion
   date, optional location and description, group-zone countdown, exact
   original budget/currency, and per-person label render from authoritative
   values. Every approved occasion label, including **Something else**, is
   covered. Null optionals are omitted; today/future/past and singular/plural
   states are correct; the calendar date never shifts through the viewer's
   time zone.
7. **No invitation or organizer-control expansion.** The room cannot issue,
   recover, copy, rotate, revoke, resend, nudge, or lock an invitation and
   cannot update/remove/transfer a member. A generic link is never presented
   as a named pending person. Organizer and ordinary joined reads differ only
   in truthful labels.
8. **No wishlist or gifting expansion.** No wishlist/item query, item content,
   reactions, reservations, assignments, draw/checklist state, gifting CTA,
   purchase state, or activity appears in the route, RSC payload, HTML,
   analytics, test fixture shipped to production, or browser bundle.
9. **Working entry points.** The committed 006b organizer-created state and
   the same-user accepted 006c joined confirmation expose a working **Open
   group** action. Unaccepted/reconciled-only/mismatched invitation states and
   unauthenticated pages do not manufacture the link or room authority.
10. **Cache and payload privacy.** Successful, not-found, loading, error, and
    navigation responses are not shared-cacheable. Outsider HTML, RSC/Flight,
    prefetch, error, redirect, and timing assertions contain no group name,
    member name/ID, counts, budget, location, description, or membership-state
    distinction. Session replay and autocapture are blocked for the room.
11. **Accessible resilient states.** Organizer, joined non-organizer,
    joined-only, joined-plus-pending, loading, safe-error, and not-found states
    pass keyboard and axe checks. Heading/list semantics, full accessible
    names, textual statuses, 44-pixel targets, 200% zoom, 320-pixel reflow,
    predictable focus, horizontal scrolling, and reduced motion are verified.
12. **Visual fidelity with documented differences.** The approved shared
    header/roster region is compared apple-to-apple with frozen V18 at 390 by
    844 and 1440 by 1000. Every forbidden V18 section is documented as an
    intentional omission. Joined-only, non-organizer, and honest shorter-page
    images receive independent product/design approval before baseline change.
13. **Analytics and privacy.** Opening, refreshing, or being denied the room
    emits no new event and no duplicate `invite_accepted`, `group_created`, or
    `group_activated` event. Group/member content and mappings are absent from
    analytics, logs, replay, errors, screenshots intended as telemetry, and
    uploaded diagnostic artifacts.
14. **Exact-head gates.** The forward migration when required, pgTAP, unit and
    component tests, stack-gated browser/axe suite, visual comparisons,
    `pnpm verify`, CI database job, and Railway preview are green on the exact
    independently reviewed implementation head. Staging proof uses only the
    existing staging Supabase/Railway resources and synthetic accounts.

## Required automated proof

### Unit and component tests

- Every approved stored occasion label and its separator/date presentation;
  date/countdown behavior at group-zone day boundaries, today, future, past,
  singular/plural, and DST transitions; exact currency/minor-unit formatting;
  mode labels; optional location/description omission; deterministic initials
  and accent choice; display-name fallbacks; and projection-shape validation.
- Components cover caller/organizer/ordinary/pending labels, zero and multiple
  pending rows, long names, duplicate initials, one-member state, roster
  summary grammar, provider failure, loading, not-found, focus movement, the
  focusable region's accessible name/instructions/focus ring and native arrow
  scrolling, zoom/reflow, and reduced motion. Layout fixtures use every
  header/display-name field at its database maximum and at least 20 mixed
  joined/pending rows to force overflow; this test size is not a product
  membership cap.
- Server data tests prove session-derived identity, completed-profile gate,
  one projection call, no service-role import, no direct profile/member/
  invitation/wishlist query, safe zero-row/error mapping, `no-store`, and no
  analytics emission.
- Created and joined-confirmation tests prove **Open group** appears only after
  the corresponding committed authorized state and uses the returned group
  UUID without accepting a client-supplied destination.

### Database authorization tests

- pgTAP inspects the exact `(uuid)` signature and return columns, owner,
  `SECURITY DEFINER` mode, empty search path, default EXECUTE revocation, exact
  authenticated grant, unchanged table/schema/sequence privileges, and absence
  of actor/default/JSON/variadic or duplicate overloads.
- Positive fixtures cover caller-as-organizer, caller-as-ordinary-member,
  joined ordering, one-member group, fallback labels, and live targeted pending
  rows. The declared and runtime result contain exactly the fields in this
  brief.
- Negative fixtures cover anon, null auth, outsider, invited, declined, left,
  removed, cross-group, forged JWT actor fields, guessed UUID, inactive group,
  direct base-table reads, direct profile reads, and application use through
  `service_role`.
- Pending-state fixtures cover generic-only history, active/expired/revoked/
  exhausted targeted tokens, use-limit boundaries, wrong user, stale and
  current generations, multiple live tokens for one membership, decline,
  acceptance, leave, and removal. Each produces the exact row/count result and
  no write, audit event, or invitation-use change.
- A bounded two-session room-snapshot harness uses independent database
  sessions, explicit barriers, and finite lock/statement/client timeouts. It
  holds remove, accept, and targeted-invitation revoke transactions uncommitted
  while the other session reads, then releases each change on both sides of a
  fresh read. Every result must be wholly the pre-commit or post-commit state:
  authorization cannot survive a committed removal into a later data read,
  acceptance cannot produce duplicate joined/invited rows or mismatched
  counts, and revocation cannot leave a pending row paired with post-revoke
  facts. The harness inspects the function definition to prove the body is one
  data-reading SQL statement and fails on timeout or contradiction. It adds no
  new write endpoint or write-race contract; existing 006a-006c race suites
  remain the authority for the mutations themselves.

### Browser, visual, and staging tests

- Stack-gated Playwright uses real local Supabase sessions and synthetic data
  for an organizer, three other joined members, live pending invitees, an
  invited target, declined/left/removed former members, and an outsider. It
  exercises direct navigation, 006b/006c entry links, reload, malformed and
  guessed IDs, auth/profile gates, database unavailability, and membership
  changes followed by fresh navigation.
- Response inspection covers HTML and RSC/Flight requests, prefetch, redirects,
  cache headers, browser history, DOM, network bodies, analytics sink, console,
  and collected artifacts. Outsider/former-member surfaces are scanned for all
  synthetic private markers. Wishlist fixtures exist specifically to prove
  their content is absent from this slice.
- Visual tests use fixed fonts, fixed server clock, fixed group time zone,
  reduced motion, local licensed assets only, identical viewport and state,
  and safe deterministic test-only content. Capture the three approved state
  families at both viewports and record every V18 omission beside actual-image
  review and file hashes.
- Railway preview proof uses synthetic accounts after the reviewed migrations
  are applied to the existing staging project: organizer and ordinary joined
  access; accepted 006c entry; live pending display; generic-link non-pending;
  outsider/invited/declined/left/removed denial; no wishlist payload; and no
  analytics/replay leakage. Clean up synthetic users/groups according to the
  existing staging procedure.

## Required pull-request evidence

- Acceptance-criteria table linking every item to exact tests, check runs,
  screenshots, and staging records.
- Exact-head `pnpm verify`, CI `verify` and `database` jobs, named stack-gated
  room suite, axe run, visual run, and Railway deployment.
- Migration ledger, complete function/grant/RLS inventory, exact runtime return
  shape, pending-eligibility matrix, and forward-fix notes. If inspection proves
  no migration is needed, include that evidence and explain which merged exact
  projection satisfies the contract.
- Mobile and desktop before/after images for organizer joined-plus-pending,
  joined non-organizer, and joined-only states, with actual-image review,
  hashes, documented V18 omissions, and owner baseline decision.
- Safe scans demonstrating that outsider and former-member responses, caches,
  logs, analytics, replay, screenshots used as diagnostics, and browser storage
  contain no private group/roster or wishlist values.
- Confirmation that no Magic Patterns mock data, Vite/editor scaffolding,
  raw invitation token, service-role credential, new dependency, production
  resource, Phase 6 behavior, or baseline change made only to silence CI
  shipped.

## Migration and rollback notes

- Under the approved dependency contracts, one narrow forward-only migration
  adds only `public.group_room_snapshot(uuid)` plus its exact revokes/grant. It
  adds no table, column, enum, index, trigger, seed row, audit event, or direct
  table privilege and changes no existing function signature.
- The migration is tested from a fresh database and from a valid populated
  006a-006c state. Because it creates no durable data and performs no backfill,
  deployment does not rewrite membership or invitation history.
- Production rollback remains forward-fix only. The safe disabling migration
  revokes authenticated EXECUTE immediately; a later reviewed migration may
  drop the exact function after the application no longer calls it. Never edit
  or roll back the earlier group migrations, delete member/invitation rows, or
  weaken RLS to restore the page.
- Apply the migration only to the existing staging Supabase project after the
  dependency migrations and owner approval. This brief authorizes no
  production or dashboard mutation.

## Implementation plan

1. **Freeze merged dependencies.** Start from current `main` only after the
   Phase 4 exit and merged, independently approved 006a, 006b, and 006c exact
   heads. Record their merge commits and map the final group, roster, targeted
   invitation, continuation-state, grants, and test interfaces.
2. **Write database denial and shape tests first.** Add the pgTAP exact-shape,
   privilege, role/status, pending-eligibility, and snapshot cases. Prove they
   fail because the joined-member room projection is absent, without changing
   base-table grants.
3. **Add the narrow projection migration.** Implement the single
   statement-snapshot function, fallbacks, deterministic ordering, live
   targeted-pending predicate, explicit revokes/grant, and no other schema
   change. Keep all existing database and race suites green.
4. **Build the server boundary and room shell.** Add strict projection parsing,
   safe not-found/error mapping, no-store handling, group-zone date/countdown
   helpers, exact currency formatting, and the accessible V18-informed header
   and roster. Query no wishlist or gifting surface.
5. **Wire authorized entry points.** Add **Open group** to the committed 006b
   created state and accepted 006c joined confirmation. Preserve every
   invitation/auth negative path and generic Home fallback.
6. **Add browser and visual proof.** Exercise the complete role/status and
   payload-leakage matrix, then capture the three state families at both
   approved viewports. Review actual images and document every intentional V18
   omission; do not adopt a baseline without owner approval.
7. **Verify and stage.** Run local formatting and available gates, obtain
   independent implementation/security/accessibility/image review, then use CI
   and the Railway preview for exact-head proof. Apply only the reviewed
   migration to existing staging, run the synthetic matrix, clean up, and
   preserve concise evidence. Do not mutate production.

## Non-goals

- No groups list, group switcher, public group page, parameterized auth-return
  intent, invitation preview/acceptance change, invite email, token recovery,
  copy/share, issuance, rotation, revoke, resend, nudge, or invite lock.
- No organizer settings or membership controls: no mode change, participation
  change, transfer, remove, reinvite, leave, decline, archive, or delete UI.
- No member wishlist/profile browsing, profile details beyond the safe display
  label, item cards, link extraction, item copy, reactions, owner summaries,
  reservations, purchase state, or activity.
- No draw/redraw, assignment, gift-everyone checklist, wishlist-only gifting
  behavior, private gift plan, progress, reminders, or any Phase 6 or Phase 7
  work.
- No production Supabase/Railway mutation, new service, background polling,
  real-time subscription, queue, dependency, Magic Patterns code/mock-data
  import, remote prototype asset, or unapproved visual-baseline update.

## Dependencies and gates

- Phase 4 must have actual persistent-wishlist exit evidence before 006d
  implementation begins.
- 006a must be merged with green exact-head schema, grants/RLS, pgTAP, audit,
  and race proof. Its reviewed migration must be applied to the existing
  staging project before 006d staging validation.
- 006b must be merged with its exact private-group creation, one-time generic
  link, organizer-created-state, and staging contracts approved.
- 006c must be merged with its exact continuation-bound acceptance, joined
  confirmation, session/logout safety, and staging auth-template contracts
  approved. 006d consumes only its committed accepted group ID.
- 002b/002c provide design and test foundations; 004e provides protected-route,
  completed-profile, session, and account-shell behavior; 005h provides the
  binding database and stack-e2e CI surface.
- The later member-wishlist browsing and organizer-control briefs consume this
  room and projection. They must add their own reviewed permissions and may not
  broaden this slice retroactively.

## Analytics, security, and privacy

This slice introduces no analytics event. A room view is not an invitation
acceptance and does not satisfy `group_activated`, whose existing definition
also requires wishlist evidence. Refresh, denial, entry-link use, and pending
display emit nothing.

Group names, occasion/date, location, description, budgets, roster names and
IDs, caller/organizer/pending mappings, invitation state, and errors never
enter PostHog properties, person properties, logs, traces, or error reports.
The entire room is blocked from autocapture and session replay because the
screen combines private group content with membership mappings. Synthetic
evidence uses identifiers and result classes; visual evidence is reviewed as
private test material and contains no bearer, email, or secret.

The room trusts only the database projection under the authenticated user's
session. It uses no service-role credential, client-side membership check,
feature flag as authorization, raw invitation token, direct profile query, or
cached public payload. Organizer status grants no access beyond the safe room
facts and roster defined here.
