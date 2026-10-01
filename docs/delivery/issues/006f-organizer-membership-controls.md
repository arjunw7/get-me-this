# 006f - Organizer membership controls and audit behavior

## Outcome

Deliver the organizer's membership controls inside the private group room at
`/groups/[groupId]`. The joined organizer can review the complete membership
roster, including people who are currently invited and people who declined,
left, or were removed; remove a joined member after explicit confirmation;
revoke a live targeted invitation; re-invite a specific declined, left, or
removed person with a one-time targeted invitation; and transfer the organizer
role to a joined member in one atomic transaction. Every mutating control uses
a durable compare-and-swap version so two organizer sessions can never both
win, and every authority-changing action appends one privacy-safe audit event.

Non-organizer members see none of this surface. The room they see remains
exactly the 006d room. Organizer status continues to grant administrative
operations, never additional private reads: no wishlist content, no
assignments, no reservations, no purchase progress, and no gifting state about
any member, ever.

This repository brief is the binding implementation contract for 006f
(Linear ARJ-38). A matching Linear issue is created only after this brief is
approved and must link the exact approved commit rather than copying a
divergent contract.

## Membership state machine

The membership state vocabulary is exactly `invited`, `joined`, `declined`,
`left`, and `removed`, stored in `public.group_members.status` with the
monotonically increasing `public.group_members.membership_generation` defined
by 006a. Every transition below that changes or creates a membership row
increments `membership_generation`. This slice adds no new state and renames
none.

### Allowed transitions, trigger, and authority

| From                             | To                                                     | Trigger                                                                      | Who can trigger it          | Function                                          |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------- |
| (no row)                         | `invited`                                              | Organizer targets a known user with a new invitation                         | Joined organizer            | `issue_group_invitation` targeted overload        |
| (no row)                         | `joined`                                               | First acceptance of a shareable or targeted invitation by the invited person | The invited person only     | 006c continuation acceptance                      |
| `invited`                        | `joined`                                               | The invited person accepts through their own continuation                    | The invited person only     | 006c continuation acceptance                      |
| `invited`                        | `declined`                                             | The invited person declines                                                  | The invited person only     | `decline_group_invitation`                        |
| `invited`                        | `invited` (live token revoked)                         | Organizer revokes a live targeted invitation                                 | Joined organizer            | `revoke_group_invitation` targeted by-ID overload |
| `joined`                         | `left`                                                 | The member leaves                                                            | The member only             | `leave_group`                                     |
| `joined`                         | `removed`                                              | Organizer removes the member                                                 | Joined organizer, confirmed | `remove_group_member`                             |
| `declined`, `left`, or `removed` | `invited`                                              | Organizer re-invites that specific person with a new targeted invitation     | Joined organizer            | `issue_group_invitation` targeted overload        |
| organizer's `joined` row         | another member's `joined` row (role moves, not status) | Organizer transfer                                                           | Joined organizer, confirmed | `transfer_group_organizer`                        |

Binding transition rules inherited from 006a and never weakened here:

- **Sticky removal.** A `removed` row never returns to `joined` through a
  generic shareable link, a replay of an old token, or any acceptance path.
  Only a new targeted invitation bound to the current
  `membership_generation`, accepted by that exact user, reinstates them.
  Repeated removal of an already removed row remains `removed` and performs no
  write.
- **No silent reinstatement.** A `declined` or `left` row is likewise never
  restored by an old targeted token or a replay. Only a new targeted
  invitation can reinstate the person. Generic-link reinstatement of a
  `left` row is not relied on by this slice; the conservative reading (only
  targeted reinvitation reinstates declined, left, and removed people) is
  binding, and the implementation must verify the merged 006a behavior and
  record any divergence as a review finding.
- **Organizer protection.** The organizer cannot remove themselves and cannot
  leave before a successful transfer. A group always has exactly one
  organizer: `groups.organizer_id` is the sole authority field, and
  `transfer_group_organizer` locks the group row and both affected
  memberships, requires the destination to be currently `joined`, and commits
  the new `organizer_id` and one audit event together. No intermediate state
  with zero or two organizers can commit.
- **Outgoing organizer.** After a successful transfer the outgoing organizer
  remains a `joined` member with their participation flag unchanged. They
  immediately lose every organizer-only capability defined here; their next
  attempt receives the same denial as any joined non-organizer. The new
  organizer gains the capabilities on their next navigation; no cached client
  flag extends authority.
- **Decline is the person's own action.** The organizer cannot decline on
  someone's behalf and cannot force a `declined` row back to `invited`
  except through a new targeted reinvitation, exactly as for `left` and
  `removed`.

### What each state can see

- `joined`: the 006d private group room. A joined non-organizer sees nothing
  from this slice.
- `invited`: only the 006c invitation preview. A pending row in the 006d
  roster is presentation for others, never access.
- `declined`, `left`, `removed`: the same generic application not-found
  result as an outsider, with no group, roster, or audit content and no
  distinction between causes. A former member can see only a fresh 006c
  preview produced by a new targeted invitation addressed to them.
- No member of any state ever sees reservations, purchase progress, private
  gifting assignments, or reaction targets about themselves, and the
  organizer's tools defined here expose none of that data about anyone.

## Dependency contract

### 006a - group security model

- Consume the merged `groups`, `group_members`, `group_invitations`,
  `group_invitation_uses`, and `audit_events` schema; the
  `membership_generation` and sticky-removal rules; the fixed lock order; the
  `private.is_group_organizer`/`private.is_joined_group_member` helpers; the
  grants, RLS, and audit contract; and the existing
  `remove_group_member`, `transfer_group_organizer`,
  `issue_group_invitation` (targeted overload), and
  `revoke_group_invitation` (targeted by-ID overload) functions.
- Reuse 006a's organizer-only membership projection `group_admin_members`
  (exactly `user_id`, `display_name`, `status`, `participating`, `joined_at`,
  `left_at`, including pending and former rows). This surface is the admin
  roster's only membership read. The brief does not add columns to it. The
  projected timestamps are `joined_at` and `left_at` only; the roster renders
  truthful status labels without inventing per-state timestamps the database
  does not store.
- Do not broaden direct access to `group_members`, `group_invitations`,
  `group_invitation_uses`, `audit_events`, or profiles. All new behavior goes
  through narrowly reviewed `SECURITY DEFINER` projections and functions with
  006a's conventions: actor derived only from `auth.uid()`, empty
  `search_path`, schema-qualified names, fixed types, no dynamic SQL, EXECUTE
  revoked from `PUBLIC`, `anon`, and `service_role` before exact grants to
  `authenticated`.

### 006b - private group creation

- Reuse the targeted-overload conventions pinned there: the targeted token is
  the canonical 43-character unpadded base64url encoding of 32 random bytes,
  returned exactly once; its SHA-256 digest is the only persisted form; the
  authoritative expiry is exactly 30 days from the after-lock
  `clock_timestamp()` with a fixed one-use limit; and the targeted revoke is
  by invitation ID and cannot touch generic rows.
- Follow its compare-and-swap precedent and its overload-hygiene rule: every
  amendment to an approved 006a/006b signature requires enumerating and
  revoking every older or broader overload before granting the exact new
  signatures, with pgTAP proof over every `pg_proc` identity argument list.

### 006c - invitation preview and acceptance

- Reinvitation produces exactly the invitation kind 006c already accepts: the
  reinvited person opens the raw link, authenticates or reconciles if needed,
  and explicitly joins. This slice adds no acceptance path, no invitation
  cookie, no email change, and no signed-out behavior. A reinvited person who
  was removed sees the same preview and recovery states as any targeted
  invitee.
- Acceptance, decline, revocation, expiry, exhaustion, and generation
  staleness under the reinvitation follow 006a/006c exactly. This slice
  writes no continuation state.

### 006d - private group room

- The organizer member surface renders inside the existing 006d room route
  and consumes its authorization posture: session-derived identity,
  completed-profile gate, joined-membership requirement, no-store caching,
  generic not-found mapping, and the room's single-snapshot projection
  `group_room_snapshot`. The room's visible roster for non-organizers does
  not change by one column or one label.
- This slice adds no new room read for non-organizers and does not alter the
  pending-row eligibility predicate. When the caller is the joined organizer,
  the page additionally loads the admin roster, audit projection, and member
  admin version defined below through separate reviewed calls; it never
  widens `group_room_snapshot` itself.

### Exact-main recheck gate

- Implementation must start from a `main` that already contains the merged,
  independently approved exact heads of 006a, 006b, 006c, and 006d, and the
  implementation must inspect their final merged migrations and signatures
  before writing any forward migration. Where this brief pins a signature,
  audit event identifier, or projection shape, the merged head is authoritative:
  if an exact equivalent capability already exists there, no redundant
  function or migration is added and its contract is recorded in the pull
  request; if the merged shape differs from this brief's expectation, the
  difference is resolved by review before implementation proceeds, and any
  amendment to an approved 006a/006b/006c/006d contract requires fresh
  independent database/security review.

## User-visible scope

### Organizer member surface

- The room route gains one organizer-only disclosure, labelled **Organizer
  tools**, matching the approved Version 18 trigger treatment (the
  `SlidersHorizontalIcon` control in the frozen `group-room-secret`
  reference). It renders only when the server-side projection proves the
  caller is the current joined organizer. It is never present, visible,
  focusable, or present in the RSC payload for any other caller.
- The disclosure contains three sections, in this order:
  1. **Members** - the administrative roster from `group_admin_members`:
     every membership row of the group, including `invited`, `declined`,
     `left`, and `removed` people, each with display name (or the 006a
     generic **Member** fallback), derived initials, truthful state label,
     and `Organizer`/`You` labels where applicable. State labels are exactly
     **Organizer**, **Joined**, **Invited**, **Declined**, **Left**, and
     **Removed**. Color is never the only signal; each label is text.
  2. **Recent member activity** - the bounded audit projection defined
     below, rendered as a plain reverse-chronological list of event text and
     dates. It is the only place membership history is shown.
  3. **Actions** - the per-member controls defined by the state table
     below.
- The surface is a Server Component render of reviewed projections with
  Server Actions for mutations. Client state, hidden fields, member IDs, and
  organizer flags are inputs, never authority. Every response, including
  failures, is private and no-store, and the disclosure is blocked from
  autocapture and session replay.

### Per-member actions

| Visible state                                | Action                | Result                                                                                                                  |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `joined` (not the organizer, not the caller) | **Remove from group** | Confirmed removal; the person immediately loses room access                                                             |
| `joined` (not the organizer, not the caller) | **Make organizer**    | Confirmed transfer; atomic single-organizer handover                                                                    |
| `invited`                                    | **Revoke invite**     | Confirmed revocation of the person's live targeted invitation; the 006d pending row disappears; the row stays `invited` |
| `declined`, `left`, or `removed`             | **Invite again**      | Confirmed targeted reinvitation; returns the one-time link exactly once                                                 |

- The caller's own row offers **Make organizer** transfers to others only;
  the organizer's own row offers no remove action and no leave action. A
  member self-leave control is not part of this slice.
- A `removed` row's **Invite again** is the sticky-removal reinstatement
  path. The roster must not describe a removed person as banned permanently,
  because the organizer can explicitly re-invite them.
- Reinvitation shows the canonical one-time link with the same treatment as
  006b's token-present state: displayed once in page memory, with
  **Copy invite link** and **Share on WhatsApp** actions and a copy-failure
  fallback, never recoverable, never persisted to storage, caches, logs, or
  analytics. A reload after issuance shows that the link was shown once and
  cannot be recovered, exactly matching 006b's honest one-time semantics.
- Reinvitation and revocation do not touch the group's generic shareable
  link or its version. Generic issue/revoke remains a 006b created-state
  capability and is not duplicated here.

### Confirmation and destructive-action pattern

- **Remove from group** opens a confirmation dialog following the
  repository's confirmed-destruction pattern established by 005c's delete
  confirmation: a modal dialog that names the member in plain product
  language, states that they immediately lose access to the group and that
  they can come back only if invited again, and requires an explicit
  confirmed action with **Cancel** as the safe default. Focus moves into the
  dialog on open, Escape and Cancel return focus to the trigger, the dialog
  is keyboard- and screen-reader operable, and its trigger is a real button
  with an accessible name including the member's display label.
- **Make organizer** opens a confirmation dialog naming the incoming person
  and stating that the current organizer will give up organizer tools and
  become a regular member. **Revoke invite** and **Invite again** each
  require one explicit confirmation click; **Invite again** explains that the
  link is shown only once.
- Pending states disable duplicate activation visually, but correctness
  never depends on the disabled control: the database CAS is the authority.

### Stale-version and concurrent-action handling

- One durable group-scoped version stamps every organizer membership
  mutation. The page projects the current version with the admin roster; each
  mutating action sends only `group_id`, the target identifiers, and
  `p_expected_member_admin_version`.
- On version mismatch the database raises SQLSTATE `PT409` with the safe
  message `stale_member_admin_version`, no detail or hint, and performs no
  write. The UI then refetches the admin roster and version and renders one
  truthful state: **The member list changed. Review the current list and try
  again.** It never names the other session, never retries automatically,
  never rotates the version, and never exposes the competing write's
  details.
- Stale-version handling is identical for remove, transfer, revoke of a
  targeted invitation, and reinvitation. A stale response is not an error
  boundary; it is a designed, accessible recovery state.
- Exactly-one-winner semantics are database facts proven by the two-session
  harness below, not UI behavior. Two sessions of the same organizer, or two
  organizers across a transfer boundary acting on stale state, produce one
  committed winner and one stale loser for every conflicting pair.

### Honest omissions from Version 18

The frozen V18 `OrganizerTools` component depicts controls that this slice
must not recreate: **Change gifting mode** (a later group-settings slice with
its own reviewed contract), **Nudge N pending** (no database capability; no
notification surface), and **Lock/Unlock invites** (no 006a capability; no
invite-lock state). None of them appears as a real, disabled, or placeholder
control. The V18 member rows, wishlists, assignment banner, and gifting
navigation remain forbidden by 006d and are not introduced here. The
organizer tools disclosure, members section, recent member activity list,
per-member actions, confirmation dialogs, stale-version state, and reinvite
one-time-link states have no frozen full-page V18 reference; each requires
independently approved mobile and desktop screenshots recorded as documented
design differences, like 006d's honest shorter-page states.

## Exact contracts

### Durable member-admin version

- One narrow forward migration adds
  `public.groups.member_admin_version bigint not null default 0` with a
  nonnegative check. It is internal: excluded from direct client SELECT on
  `groups`, from `group_detail`, from `group_room_snapshot`, from
  `group_admin_members`, and from every non-organizer projection. No existing
  column, enum, constraint, or function signature is edited in place; where a
  new callable signature is required, older overloads are dropped or revoked
  per 006b's hygiene rule.
- Every function below locks the `groups` row `FOR UPDATE` first under the
  006a fixed lock order, re-reads `member_admin_version` under that lock,
  rejects a mismatched expected value with SQLSTATE `PT409` /
  `stale_member_admin_version` and no write, and increments the version by
  exactly one as part of the same atomic commit as the membership change and
  its audit event. A null or negative expected value is rejected with
  SQLSTATE `22023` and message `invalid_member_admin_version`. All functions
  evaluate authority (`auth.uid()` plus currently joined organizer) inside
  the transaction, after locks.

### Removal

```sql
public.remove_group_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_expected_member_admin_version bigint
)
returns table ( member_admin_version bigint )
```

- The target's current membership must be `joined` and must not be the
  caller's own row and must not be the current organizer's row (the
  organizer is the caller, so self-removal and any transfer-first
  requirement are enforced here). The row becomes `removed`,
  `membership_generation` increments, `member_admin_version` increments, one
  removal audit event appends, and the committed version returns. Removing an
  already removed, declined, left, or absent person performs no write and
  returns a safe non-enumerating failure indistinguishable from the denial of
  a nonexistent target. Concurrent duplicate removes have exactly one winner;
  the loser receives the stale-version result with no second audit event.

### Targeted reinvitation and revocation

```sql
public.issue_group_invitation(
  p_group_id uuid,
  p_target_user_id uuid,
  p_expected_member_admin_version bigint
)
returns table (
  token text,
  expires_at timestamptz,
  target_membership_generation bigint
)

public.revoke_group_invitation(
  p_group_id uuid,
  p_invitation_id uuid,
  p_expected_member_admin_version bigint
)
returns table (
  revoked boolean,
  revoked_at timestamptz
)
```

- Reinvitation is allowed for a target whose current membership is
  `declined`, `left`, or `removed`; it is refused for `joined` and for
  self. It creates the `invited` row when none exists, increments
  `membership_generation` before binding the token to that generation, and
  follows 006b's targeted semantics: 30-day after-lock expiry, fixed one-use
  limit, digest-only persistence, single safe audit event for the explicit
  reinvitation. If the target already has an `invited` row, reinvitation is
  refused; the organizer revokes the live invitation first. This keeps at
  most one deliberate live path per person at a time and bounds invitation
  spam without a new constraint; broad rate limiting remains Phase 8 work.
- Revocation targets a live targeted invitation for a member whose current
  membership is `invited`. Revoking an already revoked, expired, or
  nonexistent invitation returns `revoked = false` with no write and no
  audit event, mirroring 006b's generic revoke idempotence. A successful
  revocation increments `member_admin_version` and appends one event. The
  membership row remains `invited`; only a new targeted invitation can move
  it.
- Generic issue/revoke overloads never touch `member_admin_version` and
  never contend on it except for the common group-first lock.

### Atomic organizer transfer

```sql
public.transfer_group_organizer(
  p_group_id uuid,
  p_target_user_id uuid,
  p_expected_member_admin_version bigint
)
returns table (
  member_admin_version bigint,
  new_organizer_id uuid
)
```

- The target's current membership must be `joined` and must not be the
  caller. The transaction locks the group row, then both membership rows in
  ascending user-id order, verifies authority and the version under the
  locks, sets `groups.organizer_id` to the target, increments
  `member_admin_version` exactly once, appends one transfer audit event, and
  returns the committed values. The outgoing organizer's membership stays
  `joined` with unchanged participation. No intermediate zero-organizer or
  two-organizer state can commit; any error rolls back authority, version,
  and audit together.
- Transfer to an `invited`, `declined`, `left`, or `removed` person is
  refused with the same non-enumerating failure class as transfer to a
  nonmember. Transfer to self is refused. A former organizer acting after
  someone else's transfer is denied as any joined non-organizer; their stale
  expected version produces the same `PT409` result and never an authority
  revival.

### Organizer audit projection

```sql
public.group_admin_audit(p_group_id uuid)
returns table (
  event_type text,
  created_at timestamptz,
  subject_user_id uuid,
  subject_display_label text,
  membership_generation bigint
)
```

- Callable only by the current joined organizer, derived from `auth.uid()`.
  It returns the most recent 100 events for the group from the 006a
  `audit_events` table, ordered `created_at desc` with the event's stable
  identity as the deterministic tie-break, in one statement. `event_type` is
  the existing 006a audit vocabulary, restricted here to the member-control
  events this surface consumes: removal, transfer, and targeted
  issue/reinvitation and revocation. The exact stored identifier strings
  must be pinned from the merged 006a migration at the recheck gate; this
  brief expects `member_removed`, `organizer_transferred`, and
  `invitation_issued`/`invitation_revoked` and binds the implementation to
  the merged values rather than inventing new ones.
- `subject_display_label` is resolved inside the definer from profiles with
  the same generic **Member** fallback used by `group_admin_members`; the
  application performs no direct profile query. Rows without a member
  subject return a null subject and the application omits the name.
- The projection exposes nothing else: no actor beyond what the event type
  already implies, no email, no invitation ID, no token or hash, no target
  metadata beyond the generation, no wishlist, assignment, reservation,
  purchase, or reaction data, and no audit metadata beyond 006a's bounded
  identifier/generation fields. The application renders each event as one
  plain sentence, for example **Arjun was removed** or **Organizer role
  transferred to Priya**, without timestamps more precise than the stored
  event time and without invented actors.
- Retention and authority: `audit_events` stays append-only for application
  roles. Rows are retained for the group's lifetime; no update, delete, or
  truncate function is added; the restrictive foreign keys continue to deny
  deleting referenced groups, members, invitations, or users; and only the
  joined organizer can read the projection. Members, former members, invited
  people, and outsiders receive zero rows. `service_role` receives no new
  grant.

## Rendering, failure, and accessibility behavior

- The server validates the admin projections before rendering: unexpected
  states, a roster without exactly one organizer row, a missing caller row,
  duplicate member IDs, a former-state organizer row, or a version/roster
  mismatch fails closed to the room's existing safe-error boundary and is
  logged by class and correlation ID only, never with row contents.
- Actions return typed results: success (committed version, and the one-time
  token only for reinvitation), typed field/safe-form errors, and the
  `stale_member_admin_version` recovery state. Expected failures contain no
  SQL detail, table or constraint names, token material, or enumeration
  hints. Unknown failures are logged by safe class and correlation ID only.
- After a committed mutation the page refetches the admin roster, audit
  list, and version with a fresh server render; it never patches client
  state optimistically as authority. A committed response lost before it
  reaches the browser reconciles on reload from committed state without a
  duplicate write, because replaying the same action against the new version
  is stale and replaying a removal is a no-op.
- The disclosure and all controls are keyboard operable with visible focus;
  every control has a persistent accessible name and a target of at least
  44 by 44 CSS pixels. Dialog semantics, focus movement, Escape behavior,
  and live-region announcements for success, stale, and failure results are
  explicit. State is never color-only. Motion is decorative and disabled
  under reduced motion. Text reflows at 320 CSS pixels and stays readable at
  200% zoom.
- The member activity list is an ordered list with a screen-reader heading;
  event text is static, and no event renders another member's email, token,
  invitation identifier, or wishlist data.

## Visual reference mapping

- Frozen authority remains
  `docs/design-reference/baselines/v18/group-room-secret--mobile-390x844.png`
  and
  `docs/design-reference/baselines/v18/group-room-secret--desktop-1440x1000.png`
  for the room shell and header, plus the V18 source
  `docs/design-reference/magic-patterns-v18/source/pages/CircleRoom.tsx` and
  `docs/design-reference/magic-patterns-v18/source/components/circle/OrganizerTools.tsx`.
- The room shell, header, and roster regions stay apple-to-apple with the
  frozen V18 references at exactly 390 by 844 and 1440 by 1000. The
  organizer tools trigger matches the V18 trigger treatment; everything the
  disclosure contains is a documented security-required extension with no
  frozen reference, because V18's three tools (change mode, nudge, lock) are
  intentionally not reproduced and V18 has no remove/transfer/reinvite UI at
  all.
- Production uses **group** and **wishlist** everywhere; the V18 nouns
  `Circle` and `Shelfie` and its `MemberShelfieRow` wishlists are not
  copied.
- Capture production full-page mobile and desktop images for: the organizer
  disclosure with a mixed joined/invited roster; the confirmation dialogs
  for remove and transfer; the reinvite token-present state; the
  stale-version recovery state; and the joined non-organizer room (unchanged
  from 006d, re-captured as regression evidence). Each new state requires
  independent product/design approval before baseline adoption. Reviewers
  inspect the actual images at recorded hashes, not filenames, OCR, or a
  pixel score.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Organizer-only surface.** The member surface renders only for the
   current joined organizer inside the 006d room. Joined non-organizers,
   invited, declined, left, removed people, outsiders, and signed-out
   visitors receive the unchanged 006d room or the same generic not-found
   result, with no admin roster, audit, version, or control content in HTML,
   RSC payload, prefetch, or browser bundle.
2. **Truthful administrative roster.** The roster from `group_admin_members`
   lists every membership row exactly once with truthful state labels,
   organizer/you labeling, and generic fallback names; it exposes no email,
   token, generation, invitation detail, wishlist, or gifting data, and no
   timestamp the database does not store.
3. **State machine fidelity.** Every allowed transition in the state table
   behaves as pinned, increments `membership_generation` where required, and
   every disallowed transition (self-removal, organizer self-leave,
   removal of a former row through the removal action, transfer to a
   non-joined or self target, reinvitation of a joined or invited target,
   generic-link reinstatement of removed people) is refused with a
   non-enumerating failure and no write.
4. **Confirmed removal.** Removal requires the explicit dialog, commits
   exactly one version increment, one generation increment, and one removal
   audit event, immediately and permanently (until a new targeted
   reinvitation) revokes the person's room access, and survives reload and
   lost-response reconciliation without a duplicate effect.
5. **Targeted reinvitation and revocation.** **Invite again** issues one
   targeted token shown exactly once with 006b's token-handling rules and
   30-day one-use expiry, binds it to the incremented generation, and appends
   one event; the reinvited person joins only through the 006c path.
   **Revoke invite** revokes only the live targeted invitation, is idempotent
   for already-revoked/expired invitations, leaves the row `invited`, and
   never touches the generic link or its version.
6. **Atomic transfer.** Transfer commits the new `organizer_id`, version
   increment, and one audit event in one transaction; the outgoing organizer
   remains joined, loses all organizer capabilities immediately, and the new
   organizer gains them on next navigation. No zero-organizer or
   two-organizer state is observable at any point, including under rollback.
7. **Stale-version concurrency.** Every conflicting pair (remove/remove,
   remove/transfer, transfer/transfer, reinvite/remove, revoke/remove,
   reinvite/reinvite on the same target) yields exactly one committed winner
   and one stale loser with the designed recovery state, no automatic retry,
   no partial write, and no duplicate audit. The durable
   `groups.member_admin_version` never moves by more than one committed
   mutation at a time and is invisible to every non-organizer projection.
8. **Negative authorization.** `anon`, null auth, outsider, invited,
   declined, left, removed, joined non-organizer, former organizer after
   transfer, cross-group organizer, forged actor, guessed IDs, and
   `service_role` application calls cannot execute any new function or
   projection, cannot read the admin roster, audit list, or version, and
   cannot enumerate members, invitations, or events. Direct table grants and
   every unapproved overload remain absent or revoked, proven per `pg_proc`
   identity argument list.
9. **Audit privacy and integrity.** Every committed control action appends
   exactly one safe audit event in the same transaction; events contain only
   006a-grade identifiers/generations and never a raw token, email, wishlist
   content, assignment, reservation, purchase state, or reaction target.
   `audit_events` remains append-only for application roles with no new
   update/delete/truncate path, and only the joined organizer can read the
   new projection.
10. **No privacy expansion.** Organizer status confers no new read of any
    wishlist, assignment, reservation, purchase progress, or gifting state,
    and no member ever sees reservation, purchase, or assignment data about
    themselves through this surface. The 006d room for non-organizers is
    byte-for-byte equivalent in content and cache behavior to its 006d
    contract.
11. **Zero-emission analytics.** No new analytics event is introduced.
    Opening, refreshing, or being denied the surface, and every remove,
    transfer, revoke, reinvite, stale, and failure outcome, emit no event and
    no sensitive property; existing `group_created`, `invite_accepted`, and
    `group_activated` semantics and counts are unchanged. Group/member
    content and mappings are absent from analytics, logs, replay, errors,
    and diagnostic artifacts, and the disclosure is blocked from autocapture
    and session replay.
12. **Accessible resilient states.** Organizer, stale-version, pending,
    confirmation-dialog, reinvite token-present, copy-failure, safe-error,
    and not-found states pass keyboard and axe checks with correct dialog
    and list semantics, full accessible names, 44-pixel targets, 200% zoom,
    320-pixel reflow, predictable focus, and reduced-motion support.
13. **Visual fidelity with documented differences.** Room shell and header
    regions compare apple-to-apple with frozen V18 at 390 by 844 and 1440 by
    1000; every new disclosure state receives independent actual-image
    review and explicit approval before baseline change, with the V18
    OrganizerTools omissions documented beside each comparison.
14. **Exact-head gates.** The forward migration, pgTAP, two-session race
    harness, unit and component tests, stack-gated browser/axe suite, visual
    comparisons, `pnpm verify`, CI database job, and Railway preview are
    green on the exact independently reviewed implementation head. Staging
    proof uses only the existing staging Supabase/Railway resources and
    synthetic accounts.

## Required automated proof

### Unit and component tests

- Roster rendering for every state label, organizer/you/fallback labeling,
  duplicate initials, long names, maximum-length database values, and at
  least 20 mixed-state rows to force overflow; the 20-row size is a test
  fixture, not a product membership cap.
- Confirmation dialogs: focus movement, Escape/Cancel retention, destructive
  confirmation, duplicate-activation resistance, and accessible names;
  reinvite token-present, copy success/failure, one-time-loss-after-reload,
  and stale-version recovery states; safe error mapping without
  enumeration; and absence of any control or payload for non-organizer
  renders.
- Server action tests prove session-derived authority, no service-role
  import, no direct member/invitation/audit/profile query, expected-version
  forwarding from projected state, token returned only in the reinvite
  response, `no-store`, and zero analytics emission for every outcome.

### Database authorization and race tests

- pgTAP inspects the `member_admin_version` column and check, the exact new
  signatures and every rejected or absent overload over full `pg_proc`
  identity lists, owner/security mode/empty `search_path`, EXECUTE
  revocation from `PUBLIC`/`anon`/`service_role`, the exact authenticated
  grants, unchanged table/schema/sequence privileges, and unchanged 006a-006d
  projections and RLS.
- Positive fixtures cover each allowed transition, version increments,
  generation increments, one-time token semantics, revocation idempotence,
  transfer authority handover, and exact audit rows. Negative fixtures cover
  every denied role and state in criterion 8, including the former
  organizer, cross-group organizer, forged JWT actor fields, and direct
  base-table and profile reads.
- A bounded two-session harness with independent sessions, explicit
  barriers, finite lock/statement/client timeouts, and no credential output
  proves: remove versus remove on one target (one winner, one audit);
  transfer versus remove on the same target in both orders; transfer versus
  transfer from two stale sessions of one organizer (one winner);
  reinvite versus remove on the same target in both orders; removal
  committed first versus a waiting 006c acceptance (acceptance fails);
  transfer committed first versus the outgoing organizer's stale mutation
  (denied); and rollback of the loser leaving no partial version, membership,
  invitation, or audit change. Existing 006a-006c race suites remain the
  authority for acceptance-side mutations; this harness adds no new write
  endpoint beyond the pinned signatures.
- The harness runs as an explicit bounded step in the CI `database` job
  after `pnpm test:db`, matching the established pattern for group race
  suites, and fails CI on any assertion failure or timeout.

### Browser, visual, and staging tests

- Stack-gated Playwright uses real local Supabase sessions and synthetic
  users for an organizer, joined members, a pending invitee, declined/left/
  removed former members, and an outsider. It exercises the full action
  matrix including confirmations, one-time reinvite links, stale-version
  recovery across two tabs, transfer handover and immediate authority loss,
  removal followed by fresh-navigation denial, and response/DOM/analytics/
  artifact scans proving no private marker or token leakage.
- Visual tests use fixed fonts, fixed clock and time zone, local licensed
  assets, reduced motion, identical viewport and state, and deterministic
  test-only content at both approved viewports, with every V18 omission
  recorded beside actual-image review and file hashes.
- Railway preview proof with synthetic accounts after the reviewed migration
  is applied to the existing staging project: organizer surface access,
  confirmed removal and immediate denial, reinvite and 006c rejoin, revoke,
  transfer and former-organizer denial, stale-version recovery, and
  non-organizer room equivalence. Clean up synthetic users/groups according
  to the existing staging procedure.

## Required pull-request evidence

- Acceptance-criteria table linking every item to exact tests, check runs,
  screenshots, and staging records.
- Exact-head `pnpm verify`, CI `verify` and `database` jobs including the
  named race step, stack-gated browser and axe suite, visual run, and
  Railway deployment.
- Migration ledger with the populated-state note (existing groups start at
  `member_admin_version` 0; no data backfill), complete function/overload/
  grant/RLS inventory, exact runtime return shapes, the pinned audit event
  identifiers recorded from the merged 006a head, and forward-fix/rollback
  notes.
- Mobile and desktop before/after images for every changed visual family,
  actual-image review with hashes, documented V18 omissions, and the owner
  baseline decision.
- Safe scans demonstrating no token, email, roster mapping, or audit content
  in responses, caches, logs, analytics, replay, screenshots used as
  diagnostics, or uploaded artifacts.
- Confirmation that no Magic Patterns mock data, Vite/editor scaffolding,
  raw invitation token, service-role credential, new dependency, production
  resource mutation, or baseline change made only to silence CI shipped.

## Migration and rollback notes

- One narrow forward-only migration adds `groups.member_admin_version`
  (default 0, nonnegative check, no client grant), the exact callable
  signatures above with full overload cleanup and revokes, and the
  `group_admin_audit` projection with its exact grant. It adds no table, no
  enum, no index beyond the version column's needs, no seed row, and no
  direct table privilege, and it changes no existing projection's return
  shape.
- The migration is tested from a fresh database and from a valid populated
  006a-006d state. Existing groups initialize their version to the default 0
  with no backfill and no membership, invitation, or audit rewrite; the
  first organizer action after migration proceeds from version 0.
- Production rollback remains forward-fix only: a disabling migration
  revokes authenticated EXECUTE on the changed and new functions
  immediately, and a later reviewed migration may drop them after the
  application stops calling them. Never edit or roll back earlier group
  migrations, delete member/invitation/audit rows, or weaken RLS to restore
  the surface.
- Apply the migration only to the existing staging Supabase project after
  the dependency migrations and owner approval. This brief authorizes no
  production or dashboard mutation.

## Implementation plan

1. **Freeze merged dependencies.** Start only after 006a, 006b, 006c, and
   006d are merged with green exact-head proof. Record their merge commits
   and inspect the final signatures, audit vocabulary, projections, and test
   interfaces; resolve any divergence from this brief by review before
   implementation.
2. **Write database denial and shape tests first.** Add the pgTAP version,
   signature, overload, privilege, transition, and audit cases and prove
   they fail because the capabilities are absent, without changing base-table
   grants.
3. **Add the narrow migration.** Implement the version column, CAS
   signatures, overload cleanup, audit projection, and exact grants; keep
   every existing database and race suite green.
4. **Build the server boundary and surface.** Add typed projection parsing,
   confirmed Server Actions, stale-version recovery, one-time token
   handling, and the accessible disclosure inside the 006d room. Query no
   wishlist or gifting surface and alter no non-organizer render.
5. **Add browser and visual proof.** Exercise the full role/state and
   leakage matrix, capture all state families at both approved viewports,
   and obtain independent actual-image review before any baseline change.
6. **Verify and stage.** Run formatting and available local gates, obtain
   independent implementation/security/accessibility/image review, then use
   CI and the Railway preview for exact-head proof. Apply only the reviewed
   migration to existing staging, run the synthetic matrix, clean up, and
   preserve concise evidence. Do not mutate production.

## Non-goals

- No group creation, invitation acceptance, group-room browsing change,
  member wishlist browsing, reactions, reservations, draws, gifting modes,
  checklists, assignments, purchase state, or activity feed.
- No member self-serve leave or decline UI; both transitions remain
  database capabilities consumed by later slices.
- No change-gifting-mode, nudge, invite-lock, archive, delete-group, or
  participation-toggle control; no group settings editor.
- No email, WhatsApp, or other outbound delivery for removals, transfers,
  revocations, or reinvitations beyond the existing 006c acceptance journey
  the reinvited person follows.
- No new analytics event, no automated resend, no bulk actions, no member
  cap change, no rate limiting or CAPTCHA work (Phase 8).
- No direct client access to `group_members`, `group_invitations`,
  `group_invitation_uses`, `audit_events`, or profiles; no weakening of any
  006a-006d grant, policy, projection, or race contract; no production
  Supabase/Railway mutation; no new dependency, Magic Patterns code or mock
  data import, remote prototype asset, or unapproved visual-baseline update.

## Dependencies and gates

- 006a must be merged with green exact-head schema, grants/RLS, pgTAP,
  audit, and race proof, and its reviewed migration applied to the existing
  staging project before 006f staging validation.
- 006b must be merged with its exact issuance/revocation, versioned
  compare-and-swap, and token-handling contracts approved.
- 006c must be merged with its continuation-bound acceptance and recovery
  contracts approved; reinvited people rejoin only through it.
- 006d must be merged with its room, snapshot projection, and pending
  contracts approved; the organizer surface lives inside that room and must
  not alter its non-organizer contract.
- 002b/002c provide design and test foundations; 004e provides
  protected-route, completed-profile, session, and account-shell behavior;
  005h provides the binding database and stack-e2e CI surface; 005c's
  confirmed-destruction dialog is the confirmation pattern to match.
- Member wishlist browsing (006e) is a sibling Phase 5 slice; 006f neither
  depends on it nor broadens it. Later briefs consume these controls and
  must add their own reviewed permissions rather than broadening this slice
  retroactively.

## Analytics, security, and privacy

This slice introduces no analytics event. The tracking plan gains no entry;
removal, transfer, revocation, reinvitation, staleness, denial, and every
failure outcome emit nothing, and zero-emission tests bind that. Existing
events keep their definitions, and no control action satisfies or duplicates
`group_created`, `invite_accepted`, or `group_activated`.

Member display labels, state mappings, audit events, versions, generations,
invitation state, tokens, and errors never enter PostHog properties, person
properties, logs, traces, or error reports. The disclosure is blocked from
autocapture and session replay because it combines private group content with
membership mappings. Synthetic evidence uses identifiers and result classes;
reinvite links shown in test fixtures are synthetic and redacted from saved
evidence, and visual evidence is reviewed as private test material containing
no bearer, email, or secret.

The surface trusts only the database functions and projections under the
authenticated user's session. It uses no service-role credential, no
client-side organizer check as authorization, no raw token storage, no direct
member, invitation, audit, or profile query, and no cached public payload.
Organizer authority grants exactly the operations and projections defined
here and never access to assignments, reservations, purchase progress, or any
member's private gifting state.
