# 006a — Group security model, invitations, and database proof

## Outcome

Establish the Phase 5 database boundary for private groups, membership,
bearer-link invitations, and consequential audit events. A joined member can
see only the limited group and roster data needed by later screens; a valid
bearer token yields only the signed-out invitation preview; accepting an
invitation is atomic, idempotent for the same accepted user, and cannot undo a
removal without a new organizer-targeted reinvitation. The schema, grants,
row level security (RLS), and transactional functions are proven by pgTAP
and a bounded two-session race harness in CI. This slice has no group UI,
email, wishlist sharing, draw, reservation, or staging mutation.

The repository brief is the binding implementation contract for ARJ-35.
The older logical model's `group_members.role` is deliberately superseded:
`groups.organizer_id` is the single source of organizer authority. This
choice prevents a group row and a membership role from disagreeing.

## Scope and schema

- Add one forward-only migration and database tests. Use UUID keys,
  `clock_timestamp()` for wall-clock comparisons and managed timestamps,
  bounded text, integer minor-unit money, uppercase three-letter currency,
  and the approved `secret_draw`, `gift_everyone`, `wishlist_only` mode set.
  A group stores name, occasion, local occasion date/time and IANA time zone,
  optional location/description, budget, currency, lifecycle status,
  nullable current draw version, organizer id, and timestamps. The draw
  version is inert in 006a; no assignment table or draw operation is added.
- `public.groups.organizer_id` is the sole organizer-authority field. It
  references `auth.users(id)` with `ON DELETE RESTRICT`.
  `public.group_members` has a unique
  `(group_id, user_id)` key, one of `invited`, `joined`, `declined`, `left`,
  `removed`, a participation flag, joined/left timestamps, and a monotonically
  increasing `membership_generation`. It has no role column. A group is
  created with a joined organizer member in the same transaction. The
  organizer cannot be removed or leave before a successful transfer.
  An atomic organizer-transfer function locks the group and both affected
  memberships, requires the destination to be joined, changes
  `groups.organizer_id`, and appends one audit event. No intermediate state
  with zero or two organizers can commit.
- Every auth-user reference introduced here uses the explicit foreign-key
  action `ON DELETE RESTRICT`: `groups.organizer_id`, `group_members.user_id`,
  `group_invitations.creator_id`, nullable
  `group_invitations.target_user_id`,
  `group_invitation_uses.user_id`, and audit actor/subject references.
  The database denies account deletion while any such group history or
  membership still references that user; account deletion/anonymization
  is a later reviewed workflow. Existing profile/wishlist cascades do not
  override these restrictive FKs: a failed auth-user deletion rolls the
  entire transaction back. No client-facing delete function for a group,
  invitation, membership, use, or audit row is added.
- Status is durable history, not an insert/delete proxy. A targeted issue
  for a known user creates an `invited` row if none exists; an invited user
  may decline. Leaving and declining do not erase the member row. Every
  status-changing action increments `membership_generation` (new rows
  start at generation 1), and every new targeted invitation increments it
  before binding the token to that exact generation. Removal sets
  `removed` and increments the generation. Generic group links cannot
  move a `removed` row to `joined`, even if issued after removal. An
  organizer can explicitly target that user with a new invitation;
  acceptance requires its target user and generation to match the locked
  row, then advances the generation again. An older targeted token, or a
  token for another user, cannot reinstate them. Repeated removal remains
  removed. This is the sticky-removal rule.
- `public.group_invitations` stores group, creator, status (`active` or
  `revoked`), `token_hash bytea UNIQUE`, expiry, positive optional use
  limit, use count, optional `target_user_id` and
  `target_membership_generation` pair, and timestamps. Both target fields
  are null for a shareable link; both are populated for a targeted
  invitation, including an explicit reinvitation of a removed user. The
  issuer receives a newly generated
  **32-byte cryptographically random token encoded as canonical unpadded
  base64url (43 characters)** exactly once. Only its SHA-256 digest is
  stored, computed with the schema-qualified pgcrypto function
  `extensions.digest(convert_to(token, 'UTF8'), 'sha256')`. Generate the
  source bytes with `extensions.gen_random_bytes(32)`; reject tokens that
  are not the canonical 43-character base64url encoding of 32 bytes.
  The migration ensures pgcrypto is installed in `extensions`; it never relies on an
  unqualified `digest` or a mutable `search_path`. Raw tokens are never
  persisted in tables, seed data, audit metadata, or logs. No plaintext
  token column, reversible encryption, weak hash, or token-as-ID shortcut.
- `public.group_invitation_uses` records unique `(invitation_id, user_id)`
  acceptance and the membership generation reached. A successful new
  acceptance adds exactly one use row and increments `use_count` exactly
  once in the same transaction. A replay by that same user succeeds without
  consuming another use only while their membership is still joined in that
  accepted generation. After leave or removal, a replay cannot restore
  membership or return private group data. Exhaustion blocks new users; it
  does not turn an already joined user's safe replay into another use.
- `public.audit_events` is append-only for application roles, with actor,
  group, event type, timestamp, and bounded, typed safe metadata containing
  identifiers/generations only. Create, transfer, invitation issue/revoke,
  acceptance, leave/decline, removal, and explicit reinvitation each append
  an event in the same transaction as the change. Never record raw bearer
  tokens, emails, private assignments, or wishlist contents. Table-owner,
  migration, and database-administrator capabilities are outside this
  application-role claim; application roles, including `service_role`, get
  no direct audit INSERT, UPDATE, DELETE, or TRUNCATE privilege. Definer
  functions owned by a trusted, non-client database role perform the
  narrowly authorized inserts. No UPDATE/DELETE/TRUNCATE function is exposed.
- Audit history is never changed indirectly by deleting a referenced row.
  `audit_events.group_id` references `groups.id ON DELETE RESTRICT`;
  `audit_events.actor_id` references `auth.users.id ON DELETE RESTRICT`;
  nullable `audit_events.subject_user_id` separately references
  `auth.users.id ON DELETE RESTRICT`; nullable
  `(audit_events.group_id, audit_events.invitation_id)` references a
  declared unique `(group_invitations.group_id, group_invitations.id)`
  with `ON DELETE RESTRICT`; and nullable
  `(audit_events.group_id, audit_events.subject_user_id)` references the
  unique `(group_members.group_id, group_members.user_id)` with
  `ON DELETE RESTRICT` when a member is the event subject. These composite FKs also
  prevent a subject from being attached to the wrong group. No audit FK uses
  `CASCADE` or `SET NULL`; optional identifiers remain null only when the
  event was created without that subject. Other parent references in this
  slice also use `ON DELETE RESTRICT`: member and invitation group IDs,
  and invitation-use invitation IDs. The migration and pgTAP prove that
  deleting a referenced group, invitation, member, or auth user is denied
  and leaves every existing audit row byte-for-byte unchanged.

### Database API and authorization

- Put authorization helpers in an unexposed private schema. A helper such as
  `private.is_joined_group_member(group_id)` derives its user from
  `auth.uid()`; `private.is_group_organizer(group_id)` checks
  `groups.organizer_id` and joined membership. Neither accepts an arbitrary
  user id. Both are `SECURITY DEFINER`, have an empty `search_path`,
  schema-qualified names, fixed return types, and no dynamic SQL. Their
  owner can read the underlying tables without invoking those tables' RLS,
  so group/member policies never recurse through themselves. Grant only
  exact helper EXECUTE and private-schema USAGE to `authenticated`; no
  broad default EXECUTE. A null `auth.uid()` always returns false.
- Enable RLS on every new public table. Table owners and database
  administrators can bypass it; application roles cannot. The only direct
  client read is a column-limited SELECT on `groups` for joined members
  through the nonrecursive helper: `id`, `organizer_id`, `name`,
  `occasion`, `occasion_at`, `time_zone`, `location`, `description`,
  `budget_amount_minor`, `budget_currency`, `mode`, and `status`. It
  excludes internal draw and audit state. No client role has direct INSERT,
  UPDATE, DELETE, or TRUNCATE on any new table. `group_members`, `group_invitations`,
  `group_invitation_uses`, and `audit_events` have no direct client SELECT
  grant or permissive client policy. A private group is never found by an
  outsider through ID enumeration or counts. The organizer has no special
  read path to later private assignment or reservation data.
- Expose small, explicitly typed projections instead of base-table access:
  joined-member group detail and joined-only roster; an organizer-only
  membership/status view; and a valid-token invitation preview containing
  only host display name, group name, occasion date, budget/currency,
  gifting mode, and joined-member count. The preview function is the only
  function callable by `anon`. It validates a canonical token, looks up its
  SHA-256 hash, and returns the same empty result for malformed, unknown,
  expired, revoked, or exhausted tokens. It never reveals invitation ID,
  member IDs, email addresses, invitation target, raw token, audit state,
  assignments, reservations, wishlist data, or different error detail.
  Preview access does not create membership or consume a use. Existing
  profile owner-only RLS remains intact; a reviewed definer projection
  emits only the host's display name, or a generic organizer label if the
  profile is incomplete. The preview result fields are exactly
  `host_display_name`, `group_name`, `occasion_at`,
  `budget_amount_minor`, `budget_currency`, `mode`, and
  `joined_member_count`.
- The authenticated projections also have closed result shapes:
  `group_detail` returns exactly `id`, `organizer_id`, `name`,
  `occasion`, `occasion_at`, `time_zone`, `location`, `description`,
  `budget_amount_minor`, `budget_currency`, `mode`, `status`, and
  `joined_member_count` for a joined caller;
  `group_roster` returns exactly `user_id`, `display_name`,
  `participating`, and `joined_at` for joined members of that group;
  `group_admin_members` returns exactly `user_id`, `display_name`,
  `status`, `participating`, `joined_at`, and `left_at` for the joined
  organizer, including pending and former membership rows. A missing
  display name uses the same generic organizer/member label as preview.
  No projection may add email, avatar path, invitation details, member
  generation, audit data, draw version, wishlist data, or gifting state
  without a new reviewed brief and authorization tests. pgTAP inspects
  declared return columns and runtime results, rejecting extra fields.
- Exact authenticated functions cover transactional group creation,
  organizer-only group settings update, invitation issuance/revocation,
  organizer removal/reinvitation, organizer transfer, member leave/decline,
  invitation acceptance, and the limited read projections. Each derives
  the actor from `auth.uid()`, rejects null, checks current authority
  _inside its transaction_, validates inputs and legal status transitions,
  returns only the minimum result, and writes an audit event where required.
  Do not accept actor IDs, arbitrary SQL identifiers, or caller-supplied
  audit metadata as authority. Revoke function EXECUTE from `PUBLIC`,
  `anon`, and `service_role` before granting exact functions to
  `authenticated`; preview alone is granted to `anon` and `authenticated`.
  No general-purpose definer CRUD endpoint is permitted.

The required public function inventory is
`create_group`, `update_group_settings`, `issue_group_invitation`
(including targeted invitations), `revoke_group_invitation`,
`accept_group_invitation`, `remove_group_member`,
`transfer_group_organizer`, `leave_group`, `decline_group_invitation`,
`group_detail`, `group_roster`, `group_admin_members`, and
`preview_group_invitation`. The migration pins exact signatures and return
types; privilege tests enumerate **every overload**, not merely function
names. There is no separate broad reinvitation function: issuance of a
targeted token by the organizer is the sole reinvitation authority.

### Fixed lock order and time semantics

All functions that can contend on a group follow one order:

1. Resolve an invitation's group from its hash without taking a row lock,
   then lock the `groups` row `FOR UPDATE`. Other operations already know
   the group id and start with that group lock. A hash lookup that races a
   revoke must recheck the invitation after acquiring locks.
2. Lock any involved `group_invitations` rows by ascending id, then any
   existing `group_members` rows by ascending user id. Create missing
   membership/use rows only after these locks. Unique constraints handle
   concurrent first inserts. Append audit events last. Never acquire a
   group lock after holding an invitation or membership lock.
3. In acceptance, check a prior use by this authenticated user after locks.
   If the membership is still joined at that use's accepted generation,
   return the same safe replay success without another use or audit event,
   even if the invitation was subsequently revoked, expired, or exhausted.
   Preview remains empty in those states. A joined user with **no** use
   of this token is not a replay: require an active, unexpired,
   unexhausted invitation and matching target constraints, then return
   `already_joined` without creating membership, use, count, or audit.
   Otherwise evaluate `clock_timestamp()` **after** the group and
   invitation locks are held and the invitation has been re-read. Require
   `expires_at > checked_at`, `active`, and capacity for a _new_ use at that
   point. Do not use transaction-fixed `now()` or a pre-lock expiry check.

The group lock serializes accept vs. accept, accept vs. revoke, accept vs.
remove, and transfer vs. remove for that group. A winning transaction
commits membership, use count, and audit together; an error or rollback
commits none. If revoke/removal commits first, the waiting accept sees
the new state and fails. If accept commits first, later revoke prevents
new uses but does not undo that joined membership; later removal makes it
removed and prevents replay. A concurrent duplicate acceptance by the
same user has one counted use and a safe idempotent result. A use-limit race
by two different users admits at most the configured number. Functions
return generic, non-enumerating failures for invalid tokens and authority.

Account deletion is constrained by the explicit restrictive FKs, not by
an application-side precheck. If deletion of a previously unreferenced
invitee commits before a membership-creating accept's FK check, accept
fails atomically with no use/count/audit; if accept commits first, the
new membership/use references deny the deletion. Transfer requires an
already joined destination, whose membership FK already denies auth-user
deletion; a concurrent deletion of either organizer cannot leave a group
pointing at a missing user. A failed transfer or deletion rolls back its
audit and authority changes. The two-session suite exercises deletion
against acceptance and transfer, and verifies both allowed commit orders
where one can occur. No FK cascade or nulling can erase audit context.

## Privilege inventory to implement and test

The implementation migration must explicitly REVOKE inherited/default
privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role` before
granting exact permissions. Inspect table, sequence, schema, and function
privileges, default EXECUTE, RLS state/policies, function owner/security
mode/search path, and SECURITY DEFINER code in the implementation review.

| Object                        | `anon`                   | `authenticated`                                                    | `service_role` via application API |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------ | ---------------------------------- |
| `groups`                      | No table privileges      | SELECT on the exact safe columns listed above, joined-row RLS only | No direct application grant        |
| `group_members`               | None                     | None; projections/functions only                                   | No direct application grant        |
| `group_invitations`           | None                     | None; functions only                                               | No direct application grant        |
| `group_invitation_uses`       | None                     | None; functions only                                               | No direct application grant        |
| `audit_events`                | None, including TRUNCATE | None, including TRUNCATE                                           | None, including TRUNCATE           |
| Private authorization helpers | None                     | USAGE plus EXECUTE on exact helpers                                | No application EXECUTE grant       |
| Invitation preview            | EXECUTE                  | EXECUTE                                                            | No application EXECUTE grant       |
| Other read/write functions    | None                     | EXECUTE on exact functions only                                    | No application EXECUTE grant       |

The implementation must distinguish grants from RLS: a direct query can
be denied by missing table privileges even where a deny-all policy exists.
Tests must prove both properties. Postgres administrative and table-owner
powers are not presented as blocked by RLS or REVOKE. The application must
not ship a service-role key to browsers or use it for ordinary group CRUD.

## Non-goals

- No group creation, invitation, member-management, or preview UI; no
  Next.js route, server action, email template/delivery, WhatsApp share
  implementation, or auth-return-intent change. Those consume this API in
  later Phase 5 slices.
- No group-based `profiles`, `wishlists`, or `wishlist_items` grants or
  policies. Joined members browsing wishlists is a later slice and must
  preserve recipient privacy.
- No assignments, draw/redraw, gift-everyone checklist, reactions, item
  copies, reservations, purchase state, or organizer access to them.
- No production or staging Supabase mutation, new dependency, mock data
  from Magic Patterns, or visual baseline change.

## Acceptance criteria and required proof

Implementation tests are transaction-wrapped pgTAP suites under
`supabase/tests/`, plus a committed, bounded two-session CI harness. The
existing CI `database` job must run both against a fresh local Supabase
stack on the exact implementation PR head. No local Docker run is required
on a machine without a container runtime; the green CI job is binding
database proof under 005h. The PR copies these criteria and marks each
with evidence.

1. **Shape and invariants (pgTAP).** Check every table/enum/constraint,
   valid and invalid status transitions, unique membership, organizer
   membership, positive limits, token-hash uniqueness/length, target-field
   pairing, bounded fields, minor-unit budget/currency, and timestamp
   management. A direct row/column write cannot forge or duplicate
   organizer authority.
2. **Grants and RLS (pgTAP/inventory).** Assert the full table, column,
   schema, function, and sequence inventory above, including absence of
   default PUBLIC EXECUTE and all direct audit writes. Prove `anon` and an
   outsider cannot enumerate groups, members, invitations, users, or
   counts; a joined member sees only its permitted group projection and
   joined roster; a left/removed member loses access. Test NULL-auth,
   cross-group, direct-table, and forged-JWT user cases. Check that policy
   evaluation does not recurse.
3. **Preview (pgTAP).** A canonical valid token returns exactly the seven
   approved preview fields (host, name, date, budget, currency, mode,
   joined count); invalid, guessed-ID-only, malformed, expired, revoked,
   and exhausted tokens yield the same empty result with no private
   group/member fields. Preview does not change use count. No raw token
   survives in persisted rows, seed, audit, or logs.
4. **Authority and lifecycle (pgTAP).** Only the joined organizer can
   update settings, issue/revoke invitations, remove/reinvite, or transfer.
   Transfer to a joined member changes sole authority and emits one event
   atomically; neither previous organizer nor an outsider can continue
   admin operations. The organizer cannot leave/remove self before
   transfer. A removed member cannot use generic or stale targeted links;
   a matching new targeted invite can reinstate exactly that user once.
   Every auth-user and audit-reference FK has the exact `ON DELETE RESTRICT`
   action above; deleting a referenced auth user, group,
   invitation, or member is denied and does not mutate audit history.
5. **Acceptance and audit (pgTAP).** New acceptance changes status,
   inserts one use, increments count once, and appends one safe event.
   Same-user replay in the same joined generation remains idempotent after
   revocation, expiry, or exhaustion; an already joined user presenting
   an unused valid token gets `already_joined` with no writes; an unused
   revoked/expired/exhausted token cannot create membership or yield that
   result. Leave or removal makes replay fail. Rollback after an induced
   failure leaves membership, use count, and audit unchanged. Audit is append-only for
   application roles and contains no token/email/private gifting fields.
6. **Real races (two-session CI harness).** Use two independent database
   sessions with barriers and strict timeouts, never two sequential calls
   in one connection. Demonstrate accept/accept at a one-use limit,
   duplicate accept, accept/revoke, accept/remove, and transfer/remove
   interleavings, including both commit orders where relevant; assert the
   final rows, use count, authority, and audit after each. Hold an accept
   behind the group lock until expiry passes to prove the after-lock
   `clock_timestamp()` rejection. Force a losing transaction to roll back
   and prove no partial use/member/audit effects. Include the critical
   one-use rollback interleaving: session A tentatively accepts the final
   use while holding its transaction open; session B waits on the group;
   A rolls back; B then succeeds, leaving one use/audit for B and no
   membership/use/audit for A. Race auth-user deletion against acceptance
   of an unreferenced invitee and against organizer transfer; assert the
   restrictive FK outcomes and no dangling organizer/audit references.
   The harness must fail CI on assertion failure or timeout and clean up
   its synthetic fixtures.
7. **Fresh migration and CI.** A reset from committed migrations and seed
   succeeds; all existing pgTAP suites and the new suite pass in the CI
   `database` job. Update `smoke.sql`'s exact public-table inventory and
   fixture counts deliberately in the same PR; record any changed
   assertion as a scoped amendment, never silently relax it. `pnpm
verify` and the other CI check pass on the same head.

Required PR evidence: exact-head CI checks; grants/RLS/function inventory;
two-session race transcript with bounded run time and negative-gate proof;
forward migration and rollback-by-forward-fix notes; synthetic-only fixture
confirmation; and explicit confirmation that no Magic Patterns mock data or
editor artifacts shipped. This database-only slice has no changed UI, so
before/after screenshots and a Railway preview comparison are not applicable
and must be stated as such rather than fabricated.

The implementation must commit `pnpm test:db:races`, backed by a new
`scripts/test-group-races-local.sh` and a matching `package.json` script.
It selects this repository's local Supabase database container exactly,
opens two independent `psql` sessions with explicit barriers, sets finite
statement/lock/client timeouts, emits no bearer or credential material,
and exits nonzero on any unexpected result. The implementation PR adds an
explicit `Run group two-session races` step to the existing CI `database`
job **after** `pnpm test:db` and **before** the stack-gated e2e step, with
`run: pnpm test:db:races` and `timeout-minutes: 5`. A green pgTAP step
alone never satisfies criterion 6.

## Implementation plan and gates

1. Review the existing 004a/005a migration and pgTAP patterns. Implement
   the single forward migration with constraints, indexes for hash/group
   lookups, private owner/functions, explicit REVOKE/GRANT, and RLS. Keep
   sensitive functions short and separately reviewable.
2. Add synthetic pgTAP fixtures and positive/negative assertions for each
   public table and function; deliberately amend smoke inventory. Add the
   committed `pnpm test:db:races` harness with deterministic barriers,
   finite waits, and no remote database target. Wire its explicit step
   into the existing CI `database` job
   without weakening `verify` or the current gated e2e list.
3. Review every SECURITY DEFINER body and the exact privilege inventory;
   run formatting/diff checks and available local verification. The
   implementation PR records the fresh-stack CI result and forward-fix
   plan. A red privacy or race assertion blocks the slice.
4. Complete Phase 4's persistent-wishlist exit before starting any 006a
   implementation. Planning and review of this brief may run in
   parallel with Phase 4, but there is no exception for implementation
   work, migration authoring, or an early implementation PR. The approved
   exact brief commit and required checks gate the later 006a merge.
   Group UI, signed-out join, and member wishlist
   browsing then follow as separate bounded slices.
5. Applying the committed migration to the dedicated **staging** Supabase
   project is a separate owner-approved gate before later Phase 5 staging
   validation. Evidence must include the exact migration commit and ledger
   version, inventory/RLS verification, synthetic acceptance/denial smoke
   results, and an owner approval record. No dashboard SQL or production
   deployment is included here. The staging gate does not close merely
   because local/CI tests pass.

## Dependencies and planning status

- ARJ-35 / 006a is the first database slice of Phase 5 in
  `docs/delivery/build-sequence.md`; 004a profiles and 005a wishlists are
  the existing migration/grant/RLS precedents, and 005h provides the CI
  database proof surface. `docs/architecture/permissions-matrix.md` and
  `docs/flows/groups-and-gifting.md` govern later consumers.
- The later group-creation, invitation-preview/join, organizer-controls,
  and member-browsing slices consume this contract. They must not add
  direct privileges that bypass it. Sharing wishlist data requires its
  own reviewed policies and negative recipient/privacy tests.
- Brief only. Implementation starts from the approved exact brief commit
  on its own branch. No migration, application code, cloud resource,
  Linear issue, or pull request is changed by the planning commit.

## Analytics, security, and privacy

No analytics event is introduced. Security-sensitive inputs and outcomes
use synthetic IDs in tests; bearer tokens are never printed. Invitation
preview and all group reads are limited projections. Organizer authority
does not confer access to private gifting state.
