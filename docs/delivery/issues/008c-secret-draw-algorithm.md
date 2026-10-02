# 008c — Transactional secret-draw algorithm and invariant tests

## Outcome

Phase 7's secret-draw groups gain a working, provably private assignment
algorithm. When a group in `secret_draw` mode runs its draw, every eligible
joined participant is bound to exactly one recipient in a random derangement —
no self-assignment, no orphan assignments, no partial visibility — inside one
transactional `SECURITY DEFINER` function guarded by the 006a fixed lock
order. Each committed draw produces a new draw version, full audit evidence,
and a secrecy boundary enforced by the database: a member can read only their
own current assignment, and the organizer — like every other member — can
never read anyone else's assignment, past or present.

The proof is deterministic: pgTAP asserts permutation validity across many
seeded and randomized runs, version monotonicity, audit completeness, and
negative authorization for every role; a committed two-session race harness
proves that membership changes and concurrent draws can never produce a
self-assignment, an orphan assignment, a secrecy leak, or a partial state.
No assignment value ever reaches analytics, logs, or any client other than
its giver's own projection.

This slice owns the algorithm, its schema, its invariants, and its tests.
The assignment view, viewed state, redraw confirmation UX, and departure
notifications are 008d's slice; the handoff contract is fixed below.

## Scope and schema

- Add one forward-only migration and database tests, following the 006a
  migration pattern (UUID keys, `clock_timestamp()` wall clock, bounded
  fields, explicit `ON DELETE RESTRICT`, schema-qualified pgcrypto, empty
  `search_path` definer functions, explicit REVOKE before exact grants).
- `public.group_assignments` records the draw result. Columns: `group_id`,
  `draw_version integer`, `giver_id uuid`, `recipient_id uuid`,
  `giver_membership_generation integer`, `recipient_membership_generation
  integer`, `created_at timestamptz default clock_timestamp()`. Primary key
  `(group_id, draw_version, giver_id)`; a unique constraint on
  `(group_id, draw_version, recipient_id)` enforces the bijection at the
  storage layer, so no draw can ever commit two givers per recipient or two
  recipients per giver. A check constraint enforces `giver_id <>
  recipient_id`. Both member references are composite foreign keys to the
  unique `(group_id, user_id)` of `public.group_members` with `ON DELETE
  RESTRICT` — the 006a pattern — so an assignment can never attach to the
  wrong group and no member, group, or account deletion can erase or orphan
  assignment history. A check constraint requires both generation values to
  be >= 1.
- Bind every assignment to the members' `membership_generation` at draw
  time, mirroring how 006a binds invitation tokens to a generation. A
  generation mismatch — produced by any later leave, decline, removal, or
  reinvitation — makes the assignment unreachable through every client
  projection. Stale generations cannot read assignments after leave or
  removal, exactly as stale tokens cannot reinstate membership.
- Extend the audit contract in the same migration:
  `ALTER TYPE public.group_audit_event_type ADD VALUE 'draw_created',
  'draw_redrawn'`. Because a PostgreSQL transaction cannot use an enum value
  added in the same transaction, the migration must not execute any
  statement that writes the new values; the values are exercised by the
  pgTAP suites and the application in later sessions. Extend the
  `private.audit_metadata_is_safe` allowlist — the 006b pattern — with
  exactly three new keys: `draw_version`, `previous_draw_version`, and
  `participant_count` (string or number values, as the existing helper
  requires). No other metadata key is permitted, and no assignment,
  recipient identity, or giver identity is ever stored in audit metadata.
- `groups.current_draw_version` (nullable integer, already present and inert
  since 006a) becomes authoritative: it is the group's committed draw
  version, `null` before the first draw, incremented by exactly one per
  committed draw. Its existing check constraint (`null or >= 1`) already
  matches. Exactly two functions may write this column: `run_secret_draw`
  (real versions) and the narrowly extended `update_group_settings` (the
  tombstone bump on a mode change away from `secret_draw`, specified under
  "Membership-change semantics" — it increments the version without
  creating assignment rows, so a mode round-trip cannot resurrect
  assignments). The client column SELECT granted in 006a excludes the
  column, so it remains internal. No new column on `groups` is required.
- One narrow, reviewed extension to `public.update_group_settings` is in
  scope for exactly this purpose: inside its existing transaction and
  group lock, when the committed mode differs from the previous mode and
  moves **away from** `secret_draw` while `current_draw_version` is not
  null, it increments `current_draw_version` by one. Nothing else about
  the function changes; the extension is tested with positive, negative,
  and round-trip cases (criterion 5), and every other 006a/006b function
  remains untouched.
- Superseded assignment rows are retained as internal durable history —
  memberships, invitations, and audit events are never deleted, and neither
  are assignments. Retention is safe because every client projection below
  filters `draw_version = groups.current_draw_version` and requires a
  current generation match; a superseded row is byte-present but
  client-unreachable. No client role gains any direct privilege on
  `group_assignments` at all.

## The assignment algorithm

- **Eligibility.** Inside the locked transaction, the draw's participant set
  is exactly the currently `joined` members with `participating = true` at
  draw time. Pending (`invited`), `declined`, `left`, and `removed` rows are
  never eligible. This resolves the product spec's open eligibility
  question for v1: invited-but-not-joined members are excluded and can be
  included only by a later redraw. The participant list is ordered by
  `user_id` ascending before shuffling so the algorithm's input is
  deterministic for a given roster.
- **Cardinality.** The draw requires at least two eligible participants
  (`n >= 2`). With `n < 2` — including `n = 1` and `n = 0` — the draw is
  blocked: the function returns a distinct, non-enumerating
  `insufficient_participants` result, commits nothing, increments no
  version, and appends no audit event. Failed operations write nothing,
  consistent with 006a. The organizer can see the roster, so this result
  reveals nothing that their own admin projection has not already shown.
- **Random source.** The draw is seeded from a cryptographically secure
  source: `extensions.gen_random_bytes`, the same schema-qualified pgcrypto
  function 006a uses for bearer tokens. Never `random()`, never
  application-provided seed bytes, never a hash of member IDs or
  timestamps.
- **Pure permutation core.** The derangement itself is a pure, side-effect-
  free helper in the `private` schema:

  ```sql
  private.derangement_from_bytes(p_members uuid[], p_bytes bytea)
  returns uuid[]
  ```

  Given the ordered member array and a byte string, it performs
  Fisher–Yates shuffling where each index `i` (from `n - 1` downto `1`) is
  chosen by rejection sampling against the byte stream — drawing unbiased
  integers in `[0, i]`, refilling from `p_bytes` when exhausted, and never
  biasing via modulo-of-nonpower-of-two without rejection. After the
  shuffle it verifies that no position is a fixed point; the transactional
  wrapper retries on any fixed point (rejection-sampled derangement,
  succeeds with probability ~1/e per attempt). The wrapper bounds attempts
  (minimum 100) and fails atomically with a generic result if exhausted —
  unreachable in practice.
- **Testability without weakening secrecy.** pgTAP (running as the
  migration owner, not a client role) calls the pure helper directly with
  fixed byte vectors for deterministic seeded permutation tests, and calls
  the transactional draw function repeatedly with real `gen_random_bytes`
  output for randomized invariant tests. The helper is never granted
  EXECUTE to any application role.
- **Result.** The derangement maps each participant to exactly one distinct
  recipient: a bijection with no fixed points, so every participant gives
  exactly once, receives exactly once, and gives to someone else. The
  transaction inserts one `group_assignments` row per participant binding
  the draw version and both membership generations, sets
  `groups.current_draw_version` to the new version, and appends one audit
  event — all or nothing.

## Database API and authorization

Three new `SECURITY DEFINER` functions in the `public` schema, following the
006a contract exactly: caller derived from `auth.uid()`, authority checked
inside the transaction after locks, minimum result, generic
non-enumerating failures, empty `search_path`, schema-qualified bodies, no
dynamic SQL. `REVOKE EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and
`service_role` on every new function before granting exact EXECUTE.

- `public.run_secret_draw(p_group_id uuid, p_expected_draw_version integer)`
  returns `table(result text, draw_version integer)`. Organizer-only. The
  expected-version parameter is the compare-and-swap guard (below). Success
  results: `drawn` with the new version. Failure results: `unavailable`
  (not the organizer, unknown group, wrong mode, archived group, or a
  null `p_group_id` — a null `p_expected_draw_version` is the valid
  first-draw input, not a failure), `stale` (the CAS check failed — the
  group's committed draw version no longer matches what the caller
  confirmed against), and
  `insufficient_participants` (`n < 2`). The organizer-authority check
  completes before the expected-version comparison, so a non-organizer
  always receives `unavailable` and never reaches `stale`.
- `public.my_assignment(p_group_id uuid)` returns
  `table(draw_version integer, recipient_id uuid, recipient_display_name
  text, is_valid boolean)`. For a caller who is a joined member of a
  `secret_draw` group whose current `(user_id, membership_generation)`
  matches an assignment row of the group's current draw version, returns
  exactly their own assignment: the recipient's id and display name (with
  the established generic **Member** fallback for a missing display name)
  and `is_valid = true`. Validity is computed in the same statement: the
  recipient's current `group_members` row must still be `joined` at the
  assignment's bound `recipient_membership_generation`. When that
  generation no longer matches — the recipient left, declined, or was
  removed after the draw — the projection returns the row with
  `is_valid = false` and **both recipient columns null**: the giver learns
  their assignment is no longer valid but never learns who departed through
  this path. Every other case — outsider, pending, left, removed, stale
  own generation, wrong mode, no draw, superseded version — returns zero
  rows. The function returns at most one row.
- `public.group_draw_state(p_group_id uuid)` returns
  `table(draw_version integer, drawn_at timestamptz, participant_count
  integer, roster_in_sync boolean)`. Organizer-only. It exposes existence
  metadata only: the current draw version (null before the first draw),
  the current version's commit time, the number of assignments in the
  current version, and whether the current eligible roster still matches
  the assignment bindings exactly (false when anyone has joined, left, or
  changed generation since the draw). It never exposes any giver→recipient
  pair, any count of "who has viewed" (008d), or any attribution of
  staleness to a member. The organizer is not omniscient: no organizer
  function or projection reads another member's assignment under any
  circumstance, matching the permissions matrix ("View another member's
  assignment: No" for every role including organizer).
- `my_assignment` and `group_draw_state` are single-statement SQL functions
  (the 006e one-statement snapshot pattern) so reads cannot straddle a
  concurrent redraw: a reader either sees the complete pre-commit version or
  the complete post-commit version, never a half-updated mix.
- Authorization and mode gating: `run_secret_draw` requires the caller to be
  the `groups.organizer_id` with a currently joined membership (the
  `private.is_group_organizer` semantics, re-checked inside the transaction
  after the group lock) and `mode = 'secret_draw'` and `status = 'active'`.
  Draw is refused in every other mode; 008a/008b own the other modes'
  surfaces and may not read this table.

### Fixed lock order and concurrency

`run_secret_draw` follows the 006a fixed lock order without exception:

1. Lock the `groups` row `FOR UPDATE` first. This serializes the draw
   against every other contending operation — accepts, leaves, declines,
   removals, transfers, settings updates, revocations, and any concurrent
   draw — for that group.
2. Then lock the participating `group_members` rows by ascending `user_id`.
3. Then compute the derangement, insert assignments, increment
   `groups.current_draw_version`, and append the audit event last.

Because every 006a/006b membership-changing function already takes the
group row lock first, a join, leave, decline, removal, or transfer either
commits entirely before the draw's lock is acquired (and the draw sees the
post-change roster) or commits entirely after (and the draw's committed
bindings reflect the pre-change generations, making the changed member's
row stale by the generation rule). No interleaving can produce an
assignment involving a member whose row the draw did not observe.

- **Compare-and-swap idempotency.** `p_expected_draw_version` must equal
  the group's `current_draw_version` as read after the group lock: `null`
  for the first draw (reject if a draw already exists), the committed
  version for a redraw. A retry of an already-committed draw therefore
  cannot re-randomize: the retry re-reads the group after the lock, sees a
  version that no longer matches the caller's expected value, and fails
  atomically as `stale` with no writes and no audit event. A losing
  concurrent draw commits nothing at all. **Result-row contract
  (authoritative):** a version mismatch is reported as the `stale` result
  row — consistent with 006a's minimum-result, generic-failure pattern —
  not as a raised typed error. 006b's shareable-invitation CAS is the
  precedent for the check itself, not for the reporting style; the
  implementer must not copy its `stale_invitation_version`/PT409 raise.
- **Two concurrent draws.** Serialized by the group lock, the second draw
  proceeds only if its expected version still matches — after the first
  commits, it does not, so exactly one draw wins and the loser fails
  atomically as `stale`. Both-commit and no-commit outcomes are
  impossible.

## Membership-change semantics

Every case below preserves the four invariants — no self-assignment, no
orphan assignments, no member learning anything beyond their own current
assignment, audit append-only. The 006a membership functions are **not**
modified by this migration; the generation binding makes staleness a read
property, not a write-time rewrite.

- **Member leaves, declines, or is removed after a draw.** The status
  change increments `membership_generation` (existing 006a behavior). The
  departed member immediately loses access to their own assignment (their
  generation no longer matches; `my_assignment` returns zero rows — the
  same loss of group reads they already experience). Assignments **to**
  the departed member remain stored and reachable to their givers, but
  `my_assignment` reports them `is_valid = false` with the recipient
  identity nulled, so a giver sees a neutral "this assignment is no longer
  valid" state. The organizer's `group_draw_state` reports
  `roster_in_sync = false`, which is the database-level basis for the
  organizer alert; the system never silently redraws (product trust rule).
  Recovery is the organizer's explicit confirmed redraw (008d UX, audited
  here). Assignments **through** the departed member — where the departed
  member was the giver — become unreachable via their own stale
  generation; their recipient simply has one fewer potential giver until a
  redraw. No row is rewritten or deleted at any point.
- **A new member joins after a draw.** The join does not disturb the
  committed draw: the new member has no assignment row for the current
  version, so `my_assignment` returns zero rows for them, and no current
  participant is assigned to them. They can be included only by the
  organizer's explicit confirmed redraw, which creates a new version over
  the full current roster. The join does increment
  `roster_in_sync = false` for the organizer. A join never invalidates
  existing assignments.
- **Organizer transfer after a draw.** Transfer changes sole authority
  only. Existing assignments, their secrecy, and their generations are
  untouched. The new organizer gains exactly the draw administration
  powers (run/redraw, draw state) and still no read access to anyone's
  assignment — including the previous organizer's.
- **Mode change or archival after a draw.** `update_group_settings` (006a)
  may change the mode away from `secret_draw` at any time, and a group may
  be archived. **Decision (binding):** a mode change away from
  `secret_draw` leaves every assignment row stored but **permanently
  unreachable for that draw version** — returning the mode to
  `secret_draw` does **not** resurrect prior assignments. The enforcement
  mechanism is a tombstone version bump, reusing the existing monotonic
  version counter rather than new schema: when `update_group_settings`
  commits a mode change away from `secret_draw` while
  `groups.current_draw_version` is not null, it increments
  `current_draw_version` by one in the same transaction. The superseded
  version's rows become unreachable exactly as in a redraw, and the new
  current version has no assignment rows at all — so switching the mode
  back to `secret_draw` still reads zero rows everywhere until a
  confirmed redraw creates the next real version over the current roster.
  The bump is unconditional and idempotent per settings change (one bump
  per committed settings update that moves the mode away), never
  decrements, and coexists with the CAS: a draw or redraw that committed
  just before the mode change is tombstoned by it; a draw attempting to
  commit after it re-checks the mode after the group lock and refuses.
  The stored rows remain valid internal history throughout, and mode
  changes never mutate, rewrite, or delete assignment rows — the
  reachability switch is a read-predicate property of the version counter
  only. Archived groups behave the same way at the read boundary:
  `run_secret_draw` refuses archived groups (already specified), and both
  `my_assignment` and `group_draw_state` return zero rows for an archived
  group. This closes the only read path by which stale assignments could
  resurface after a mode round-trip. The narrow `update_group_settings`
  extension this requires is specified in the scope section and excepted
  from the non-goals below.
- **Join/leave racing the draw transaction.** Serialized by the group
  lock, per the concurrency section. The race harness (criterion 7) must
  demonstrate at least: join vs. draw (either the join is visible to the
  draw's roster snapshot or the joiner is excluded — never half-in),
  leave vs. draw (either the draw binds the pre-leave generation, which
  then reads stale, or the draw excludes the leaver — never an assignment
  for a departed generation that still reads valid), two concurrent draws
  (exactly one commits; the loser is `stale` with zero writes), and a
  remove of a drawn assignee between draw versions (v1 bindings go stale,
  the v2 redraw binds fresh generations).

## Redraw semantics

- **Who can redraw.** The organizer only — the permissions matrix reserves
  "Run/redraw secret draw" for the organizer, confirmed and audited. There
  is no member-initiated redraw and no organizer-omniscient preview of the
  next result.
- **Confirmation.** The database enforces authority and the CAS expected
  version; the explicit confirmation UX (showing what a redraw invalidates
  and requiring deliberate confirmation) is 008d's. The API is designed so
  a redraw is never accidental: it requires the caller to state the draw
  version it intends to supersede.
- **Supersession.** A committed redraw increments
  `groups.current_draw_version` and inserts a complete new assignment set
  for the current eligible roster. The prior version's rows are retained
  as internal history but become unreadable: every client projection
  serves only the current version, so old assignments are unreachable,
  including to members whose generation still matches the old rows.
  Exactly one audit event records the redraw with `draw_version`,
  `previous_draw_version`, and `participant_count` metadata. A failed
  redraw (insufficient participants after departures, stale CAS, lost
  authority race) writes nothing and audits nothing.
- **New randomness.** Each draw consumes fresh bytes from the secure
  source. There is no continuity requirement between versions, no
  "minimal change" redraw, and no reuse of prior permutations.

### Handoff contract to 008d

008d (assignment view, viewed state, redraw confirmation UX, and
member-leaves handling UI) consumes exactly this contract and may not
broaden it:

1. **Assignment identity.** An assignment is identified by
   `(group_id, draw_version, giver_id)`. Viewed-state records in 008d key
   on that identity (or an equivalent per-version-per-member key) so a
   redraw naturally starts a fresh viewed state per version.
2. **Read surface.** 008d renders only what `my_assignment` and
   `group_draw_state` return. It adds its own viewed-state storage and
   never a new read path to other members' assignments — the organizer's
   "n of m viewed" style reporting, if any, is aggregate-only and must be
   specified in 008d with its own privacy review.
3. **Validity semantics.** `is_valid = false` with null recipient columns
   is the canonical "assignment invalidated by a membership change" state;
   008d renders it neutrally and links the organizer to the confirmed
   redraw flow. Zero rows is the canonical "no current assignment" state
   (no draw yet, excluded roster change, or stale own generation).
4. **Departure alert.** `roster_in_sync = false` is the database-computed
   basis for the organizer alert required by the flow document; the alert
   itself, and any notification, is 008d scope.
5. **No version resets.** Draw versions are monotonic per group and never
   reused or reset; 008d may rely on that for cache keys and audit
   narratives.

## Privilege inventory to implement and test

Mirror the 006a inventory exactly. Explicit REVOKE of table, sequence,
schema, and function privileges from `PUBLIC`, `anon`, `authenticated`, and
`service_role` before exact grants; privilege tests enumerate every
overload of every touched function.

| Object | `anon` | `authenticated` | `service_role` via application API |
| --- | --- | --- | --- |
| `group_assignments` | None | None; projections/functions only | No direct application grant |
| `run_secret_draw` | None | EXECUTE | No application EXECUTE grant |
| `my_assignment` | None | EXECUTE | No application EXECUTE grant |
| `group_draw_state` | None | EXECUTE | No application EXECUTE grant |
| `private.derangement_from_bytes` | None | None | None |

- `group_assignments` has deny-all RLS and **no** policy and **no** client
  grant, exactly like `group_members` and `audit_events`: no client role
  can read or write it directly, including `service_role` through the
  application API. Its security story is grants + absence of policies +
  narrow definer projections, and the tests must prove both properties
  (a missing grant denies even where a deny-all policy exists, and vice
  versa).
- The pure permutation helper is never granted to any application role;
  pgTAP exercises it as the table owner.
- No function accepts a user id as an authority input; no function returns
  another member's assignment to any caller, organizer included.

## Non-goals

- No assignment view route, page, or component; no viewed state, viewed
  receipts, or aggregate viewed counts; no redraw confirmation dialog; no
  departure notification, email, or push (008d and Phase 8).
- No changes to the other modes: gift-everyone checklists (008b) and
  wishlist-only mode (008a) never read `group_assignments`.
- No advanced draw exclusions ("don't draw X") or previous-year history —
  both are P2 future considerations in `docs/product/scope-v1.md`. No
  exchange reveal scheduling or per-pair exceptions either; no scope
  document provides for those, so adding them would require a new product
  decision first.
- No changes to 006a/006b membership, invitation, or audit functions beyond
  the two-value enum extension, the metadata-allowlist extension, and the
  single `update_group_settings` tombstone extension specified above.
- No analytics event, tracking-plan change, new dependency, Magic Patterns
  artifact, visual baseline, or UI of any kind. This slice has no
  user-visible surface; before/after screenshots and a Railway preview
  comparison are not applicable and must be stated as such rather than
  fabricated.
- No production or staging Supabase mutation. Staging application is a
  separate owner-approved gate (below).

## Acceptance criteria and required proof

Implementation tests are transaction-wrapped pgTAP suites under
`supabase/tests/`, plus the committed bounded two-session CI race harness
pattern established in 006a. The existing CI `database` job must run both
against a fresh local Supabase stack on the exact implementation PR head.
The PR copies these criteria and marks each with evidence.

1. **Shape and invariants (pgTAP).** `group_assignments` columns,
   constraints, composite RESTRICT foreign keys, bijection uniqueness, and
   `giver_id <> recipient_id` all exist and hold; a direct write that
   would duplicate a recipient, self-assign, reference a non-member, or
   attach to the wrong group is denied. The two new audit enum values
   exist; the metadata allowlist accepts the three new keys in addition
   to the existing seven and rejects everything else, including any
   assignment-bearing key.
2. **Permutation validity across many runs (pgTAP).** The pure helper,
   driven by fixed byte vectors, produces valid derangements (bijection,
   zero fixed points) for deterministic seeded runs across participant
   counts 2 through 12, including repeated fixed vectors and the
   `n = 2` single-derangement case. The transactional draw, executed
   live at least 50 times across fixture groups of varying sizes, never
   produces a fixed point, a duplicate giver, or a duplicate recipient;
   every committed draw touches exactly `n` rows.
3. **Draw transaction and idempotency (pgTAP).** First draw on a
   qualified `secret_draw` group sets `current_draw_version = 1`, binds
   current generations, writes exactly one `draw_created` audit event,
   and is refused (with zero writes and zero audit) for: non-organizers,
   outsiders, wrong modes, archived groups, `n < 2`, and any
   `p_expected_draw_version` other than null. A committed draw retried
   with the same expected version returns `stale` and re-randomizes
   nothing. Version monotonicity holds across a scripted
   draw→redraw→redraw sequence (1, 2, 3) with exactly one audit event per
   committed draw and correct `previous_draw_version` chains.
4. **Secrecy and authorization (pgTAP).** `my_assignment` returns the
   caller's own current assignment and nothing else; every denial class —
   signed-out (null auth), outsider, pending, declined, left, removed,
   stale own generation, wrong mode, no draw, superseded version,
   cross-group — returns zero rows with no distinguishing error.
   `group_draw_state` is organizer-only and exposes exactly the four
   approved fields. Direct client reads of `group_assignments` are denied
   for `anon`, `authenticated`, and `service_role` (grants and RLS proven
   separately), including a joined member, the organizer, and a
   superseded-version holder. The organizer's every path — including
   inside the draw function's own transaction — never reads another
   member's assignment values.
5. **Membership-change interactions (pgTAP).** After a committed draw:
   a leaver's/removed member's own assignment becomes unreadable; their
   giver's assignment reads `is_valid = false` with null recipient
   columns; a joiner reads zero rows and appears in no current
   assignment; an organizer transfer changes no assignment; each status
   change flips `roster_in_sync` as specified; audit history for prior
   draws is unchanged by every membership change; and no case produces a
   self-assignment, an orphan assignment, or a new exposure. **Mode and
   archival cases:** changing the mode away from `secret_draw` after a
   draw bumps `current_draw_version` exactly once, leaves all assignment
   rows stored and byte-identical, and makes `my_assignment` and
   `group_draw_state` read zero rows; switching the mode back to
   `secret_draw` still reads zero rows (no resurrection); a confirmed
   redraw after the round-trip creates the next real version and restores
   reads only for that version; a settings update that does not move the
   mode away from `secret_draw` never bumps the version; and an archived
   group reads zero rows through both read functions while
   `run_secret_draw` refuses it.
6. **Rollback atomicity (pgTAP).** An induced failure after assignment
   insertion (forced exception in a transaction wrapper) leaves
   `current_draw_version`, assignment rows, and audit events exactly as
   before: no partial version, no orphan rows, no audit fragment.
7. **Real races (two-session CI harness).** Using two independent
   database sessions with barriers and strict timeouts — never two
   sequential calls in one connection — demonstrate, with asserted final
   rows, versions, and audit after each: (a) join vs. draw, both commit
   orders; (b) leave vs. draw, both commit orders, including the leaver
   being a drawn assignee; (c) two concurrent draws with the same
   expected version, where exactly one commits and the loser is `stale`
   with zero writes; (d) remove of a drawn assignee between v1 and a v2
   redraw, proving v1 bindings go stale and v2 binds fresh generations;
   and (e) a draw losing the CAS against an intervening confirmed redraw.
   The harness must fail CI on assertion failure or timeout and clean up
   its synthetic fixtures.
8. **Fresh migration and CI.** A reset from committed migrations and seed
   succeeds; all existing pgTAP suites and the new suites pass in the CI
   `database` job; the two-session draw races run in the same job under
   the existing race step (or an explicitly added adjacent step, with
   `timeout-minutes` bounded). `pnpm verify` and all other CI checks pass
   on the same head. `smoke.sql`'s public-table inventory and fixture
   counts are updated deliberately in the same PR for
   `group_assignments`; any changed assertion is recorded as a scoped
   amendment, never silently relaxed.
9. **Audit completeness and secrecy (pgTAP).** Every committed draw or
   redraw appends exactly one event with the correct type, a non-null
   organizer actor, and metadata limited to the three allowed keys;
   failed draws append nothing. No audit event, metadata value, log
   line, test fixture, or error message in the migration, tests, or
   harness contains an assignment pair, recipient identity beyond the
   acting member's own, or any raw secret. Audit remains append-only
   with no new write path.
10. **Privacy and analytics.** No analytics event is added and the
    tracking plan is untouched; assignment data is token-like secret
    state and is excluded from analytics, logs, error reporting, and
    client bundles by construction, asserted by the tests in criteria 4
    and 9.

Required PR evidence: exact-head CI checks; the grants/RLS/function
inventory; the two-session race transcript with bounded run time;
forward-migration and rollback-by-forward-fix notes; synthetic-only fixture
confirmation; and the no-Magic-Patterns confirmation. **Rollback contract
(binding):** the revert path drops the three draw functions and
`group_assignments` only, in dependency order. The two enum values are
**permanent once added**: PostgreSQL has no `ALTER TYPE ... DROP VALUE`, so
they cannot be removed by a forward migration and remain in
`group_audit_event_type` as harmless, unused values if the slice is
reverted. Removing them would require a full type-recreation migration —
recreating `group_audit_event_type` under a new name, migrating every
existing audit row off the old type, and dropping the old type — which is a
data-destroying gate touching 006a's audit history and is out of scope for
this slice's revert plan. Reverting `group_assignments` itself deletes draw
history irreversibly; a revert is a deliberate data-destroying gate, never a
hotfix. This database-only slice has no changed UI, so screenshots
and a Railway preview comparison are not applicable and must be stated
as such.

## Implementation plan and gates

1. Review the 006a/006b migration and pgTAP patterns and the existing
   race harness script. Implement the single forward migration:
   `group_assignments`, the two-value enum extension, the metadata
   allowlist extension, the pure helper, the three public functions,
   explicit REVOKE/GRANT, and deny-all RLS. Keep the definer bodies short
   and separately reviewable; the permutation core stays pure and
   unexposed.
2. Add synthetic pgTAP fixtures and positive/negative assertions per
   criterion 1–6 and 9–10; amend the smoke inventory deliberately; extend
   the two-session harness with the criterion 7 scenarios, reusing 006a's
   barrier/timeout/cleanup conventions.
3. Review every SECURITY DEFINER body and the exact privilege inventory;
   run formatting checks and available local verification. A red privacy,
   permutation, or race assertion blocks the slice.
4. **Dependency gate.** Implementation starts only after 006a (audit
   contract, lock order, generations), 006b (CAS precedent, metadata
   allowlist extension pattern), and 006d (group room whose 008d surface
   will carry the assignment view) are merged, and after the approved
   exact brief commit is linked to its Linear issue. 008a/008b are
   sibling Phase 7 mode slices, not dependencies; Phase 6's
   coordination exit must be complete per the build sequence before any
   Phase 7 implementation starts.
5. **Staging gate.** Applying the committed migration to the dedicated
   **staging** Supabase project is a separate owner-approved gate before
   any later Phase 7 staging validation. Evidence must include the exact
   migration commit and ledger version, inventory/RLS verification,
   synthetic draw/redraw smoke results, and an owner approval record.
   No dashboard SQL or production deployment is included here. The
   staging gate does not close merely because local/CI tests pass.

## Dependencies and planning status

- Depends on 006a for the audit contract (`private.append_group_event`,
  the fixed event-type enum, the metadata safety allowlist), the fixed
  lock order, membership generations, and the deny-all RLS/grant pattern;
  on 006b for the compare-and-swap precedent and the allowlist-extension
  pattern; and on 006d for the group room context in which 008d will
  surface assignments.
- 008d depends on this brief: it consumes the assignment identity, the
  `my_assignment` result shape (including the `is_valid`/null-recipient
  semantics), the `group_draw_state` staleness flag, and the monotonic
  version contract defined above, and may not silently broaden any of
  them.
- Brief only. Implementation starts from the approved exact brief commit
  on its own branch. No migration, application code, cloud resource,
  Linear state change, or pull request is changed by the planning commit.

## Analytics, security, and privacy

No analytics event is introduced by this slice; the typed event catalog and
tracking plan are otherwise untouched. The already-catalogued server-side
event `name_draw_completed` (properties `participant_count_bucket`,
`is_redraw` — `docs/analytics/tracking-plan.md`) is wired by the **008d**
assignment-view slice, which owns the user-visible draw surface; 008c adds
no emission of it. Assignments are treated like bearer tokens: secret by
construction, never persisted in audit metadata, logs, analytics, error
reports, client bundles, or test fixtures, and readable only through the
narrow own-assignment projection. The organizer's administrative powers
confer existence metadata only. Security logging for denied operations
uses identifiers and coarse categories, never assignment content. The
draw's randomness comes exclusively from the cryptographic source; no
participant, organizer, or operator can predict or steer a permutation
through any granted interface.
