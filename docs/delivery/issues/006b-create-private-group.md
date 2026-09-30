# 006b - Create a private group

## Outcome

Deliver the first authenticated Phase 5 user interface: an onboarded user can
open `/groups/new`, enter the approved group details, create exactly one private
group, and become its joined organizer. Retrying the same unchanged submission
returns the same group instead of creating a duplicate. The create response
contains no invitation token.

After creation, the organizer may explicitly create a shareable invitation
link. Issuing that link is a separate transaction with compare-and-swap
versioning. A raw bearer token is returned once, kept only in the current page
memory, and never recoverable from storage. If that response is lost or the
page is reloaded, the organizer must deliberately create a new link, which
atomically revokes the prior shareable link. No automatic retry may rotate a
working link.

This is the binding implementation contract for ARJ-37. It consumes the
ARJ-35 / 006a private-group boundary and does not weaken its grants, RLS,
limited projections, audit history, sticky-removal rule, or fixed lock order.

## User-visible scope

### Protected routes

- `/groups/new` is a protected route. A signed-out request follows the existing
  safe `create-group` authentication intent. A returning user comes back to
  group creation. A new user still follows the approved 004e onboarding rule:
  onboarding ends at `/home`, not at a preserved arbitrary destination.
- Successful creation redirects with a 303 response to
  `/groups/[groupId]/created`. The created route is visible only to the joined
  organizer. An outsider, a nonmember, a left or removed member, and a joined
  non-organizer receive the same not-found result with no group data.
- Closing the form returns to `/home`. The success actions remain **Add to my
  wishlist** and **Go to home**, matching Version 18. The later group room and
  groups list are not introduced here.

### Create form

The form follows the frozen Version 18 `CreateGroup` hierarchy and responsive
behavior at 390 by 844 and 1440 by 1000. It contains:

1. Required group name.
2. Required occasion: Diwali, Eid, Birthday, Wedding, Housewarming, Secret
   Santa, or Something else.
3. Required calendar date.
4. Required budget per person and currency. The initial visible currency set
   is INR, USD, GBP, and EUR, matching Version 18. Expanding the product's
   selectable currencies is a separate reviewed decision.
5. Required gifting mode: Draw names privately, Gift everyone, or Share
   wishlists only.

The form does not add optional location or description controls. Their stored
values are null. They remain supported by the 006a model and can be exposed by
the later group-settings slice. Creating the group confirms that the organizer
is participating, so its organizer membership is joined with `participating =
true`. A later organizer-control slice may change participation through an
approved transition.

All fields have persistent labels, visible keyboard focus, at least 44 by 44
CSS-pixel targets, associated inline errors, a pending state, and an error
summary focused after a rejected submit. Invalid submission retains every
entered value. Double click and Enter-key resubmission are disabled visually
but correctness never depends on the disabled control.

### Created and invitation states

The created route has six explicit states:

1. **No link has been issued.** Show the success heading and a **Create invite
   link** action. Do not manufacture a slug or token in the browser.
2. **A token was issued in this page.** Show the opaque link, **Copy invite
   link**, and **Share on WhatsApp**. The copy failure path leaves a selectable
   link and explains that it can be copied manually. WhatsApp opens only after
   the user's click with `noopener,noreferrer`.
3. **An active link exists but its raw token is unavailable.** This occurs
   after reload or an ambiguous issuance response. Explain that invite links
   are shown only once and cannot be recovered. Offer **Create a new invite
   link**, with confirmation that the previous link will stop working.
4. **The latest issued link has expired.** Show the authoritative expiry from
   the organizer projection, state that the old link no longer works, and offer
   **Create a new invite link**. Require confirmation before the new issuance,
   even though the expired token is already invalid. The confirmation says that
   a replacement link will be created and the expired link will remain
   unusable.
5. **The latest link was explicitly revoked.** Show that no invite link is
   active and offer **Create invite link**. No raw prior token is recoverable.
6. **Stale issuance request.** If another tab has already issued, revoked, or
   replaced the link, refresh organizer invitation state and show the
   active-link-lost, issued-expired, or revoked state returned by the
   projection. Never retry issuance automatically and never rotate again
   without a new explicit click.

The Version 18 `create-group-created` screen is the comparison authority for
the token-present state. The no-link, lost-token, issued-expired, revoked,
confirmation, copy-failure, pending, and stale-version states are
security-required extensions and need new independently approved screenshots.
The production link uses `/invite/[opaqueToken]`, never a name-derived slug.

## Exact creation contract

### Server and authorization boundary

- A Next.js Server Action performs creation using the authenticated user's
  Supabase session. It never accepts an actor ID and never uses a service-role
  credential. The 006a database function derives the actor from `auth.uid()`
  and creates the group, joined organizer membership, creation receipt, and
  safe audit event in one transaction.
- Client validation improves the experience, but the Server Action and
  database function repeat all validation. Hidden fields, route parameters,
  and client state are inputs, not authority.
- The action returns only a typed field-error or safe form-error result before
  success. On success it returns or redirects with the stable `group_id`. It
  never returns an invitation ID, invitation version, raw token, token hash,
  audit data, member generation, or private gifting state.
- Expected validation failures contain no SQL detail, table name, constraint
  name, token material, or distinction useful for group enumeration. Unknown
  failures are logged by safe error class and correlation identifier only,
  never by form contents.

### Canonical payload version 1

The database computes the canonical payload. It does not trust a client hash.
Canonical payload version 1 contains these normalized values, including
explicit nulls:

- `name`: Unicode NFC, outer whitespace removed, internal whitespace runs
  collapsed to one space, then 1 through 80 Unicode code points.
- `occasion_type`: `diwali`, `eid`, `birthday`, `wedding`, `housewarming`,
  `secret_santa`, or `other`. `other` stores the user-visible occasion as
  `Something else`; this slice has no free-form occasion field.
- `occasion_at`: the selected ISO calendar date at `00:00:00` as local wall
  time. The UI displays the calendar date and never shifts it through UTC.
- `time_zone`: the browser-resolved IANA time-zone identifier. Missing or
  invalid time-zone data is a form error. The implementation must not silently
  substitute the server zone or UTC.
- `location` and `description`: null.
- `budget_amount_minor`: the exact positive integer minor-unit amount parsed
  from the major-unit input without binary floating-point arithmetic.
- `budget_currency`: the selected uppercase code.
- `mode`: `secret_draw`, `gift_everyone`, or `wishlist_only`.
- `organizer_participating`: true.
- `contract_version`: 1.

The date must be a real `YYYY-MM-DD` calendar value; this slice does not reject
a date merely because it is in the past. The IANA identifier is at most 64
characters and must resolve in the database time-zone catalog. A budget is
required and its minor-unit value is in the inclusive range 1 through
9,223,372,036,854,775,807. Parsing honors each supported currency's minor-unit
exponent, rejects excess fractional digits, and never uses `parseFloat`,
`Number` multiplication, or rounded scientific notation. The UI and database
share these exact bounds instead of maintaining looser duplicates.

### User-scoped idempotency

- Each form draft owns a cryptographically random UUID request key. The key is
  scoped by the database to `auth.uid()`. It is not an authorization token.
- Before the first server submission, the browser owns an unbound draft key.
  When a submission is sent, the browser binds that key to the attempted
  canonical-payload SHA-256 digest and retains both values in session storage.
  It never stores the raw payload or group name. Client-only validation that
  prevents a server submission does not bind the key.
- An edit after a submitted attempt does not rotate or silently rebind the key.
  A subsequent submit whose digest differs must surface
  `idempotency_conflict` before sending the changed payload. The user can retry
  the original payload with the original key, discard the edits, or choose the
  explicit confirmed **Submit changes as a new request** action. Only that
  confirmation creates a new key, binds it to the changed payload, and submits
  it. A committed database receipt independently enforces the same conflict if
  the browser state is missing or forged.
- Success clears the submitted key/digest pair. An ambiguous response, safe
  server failure, validation response, reload, navigation away, or field edit
  does not clear or rotate it. **Start another group** after success and the
  pre-success **Submit changes as a new request** confirmation are the only UI
  paths that deliberately create a replacement key. Thus an intentionally
  identical second group remains possible without making accidental duplicates
  the retry behavior.
- If session storage is unavailable, the form shows a safe recovery error and
  does not submit. It must not silently fall back to a reload-volatile key that
  can duplicate an ambiguously committed group.
- The database stores a creation receipt keyed uniquely by actor ID and request
  key, containing only canonical payload version, SHA-256 payload digest,
  stable group ID, and managed timestamps. The raw canonical payload and
  user-entered text are not duplicated into the receipt or audit metadata.
  Application roles have no direct table privileges or permissive RLS policy on
  receipts.
- Same user, same key, and same canonical payload returns the original group ID
  without another group, membership, or audit event. Same user and key with a
  different canonical payload returns the typed `idempotency_conflict` result
  and changes nothing. The same UUID used by a different authenticated user is
  an independent request.
- Concurrent same-key requests are serialized inside the database transaction.
  Exactly one group, joined organizer membership, receipt, and creation audit
  event commit. A failed or rolled-back attempt commits none of them.
- A new request key with identical content is a new intentional creation. The
  product does not deduplicate groups by their name or contents.

The request key must be a canonical UUIDv4 generated with the browser crypto
API. The submitted browser digest and receipt digest are SHA-256 over the same
versioned deterministic UTF-8 serialization of canonical payload v1. The
database recomputes rather than trusts the submitted digest. Authentication
identity is excluded from the digest because it is already part of the unique
receipt key.

The internal database result may include `created_now` solely so the server can
emit analytics once. The browser-visible result is stable and contains only the
group ID. The server emits `group_created` only when `created_now` is true, with
the existing catalogued `occasion_type`, `gifting_mode`, `currency`, and
`has_budget_cap` properties and the internal user/group UUID context. Group
name, date, time zone, request key, payload digest, budget value, and invitation
data never enter analytics. Analytics failure does not roll back or misreport a
successful group creation.

## Exact shareable-invitation contract

### Durable group-scoped version

Shareable invitation issuance is not part of group creation. The migration
adds `groups.shareable_invitation_version bigint not null default 0` with a
nonnegative check. This is the one durable compare-and-swap version for the
group's generic shareable link. It is internal: it is excluded from direct
client SELECT and from `group_detail`, roster, signed-out preview, and every
non-organizer projection.

Generic invitation rows have a nonnull `shareable_version`; targeted rows have
`shareable_version is null`. The migration enforces unique
`(group_id, shareable_version)` for generic rows and at most one generic row
whose stored status is active. The target-field pairing from 006a is extended
so a row is exactly one of:

- generic: null target user/generation and nonnull shareable version; or
- targeted: nonnull target user/generation and null shareable version.

Targeted issue/revoke never reads, changes, or contends on the group's
shareable-invitation version except for the common group-first lock order.
Generic issue or revoke never creates, revokes, or otherwise changes a targeted
row.

### Deterministic populated-state upgrade

The forward migration must succeed against any valid populated ARJ-35 state,
not only an empty database. It performs this upgrade in one transaction before
adding the final not-null and uniqueness constraints:

1. Lock `groups`, then `group_invitations`, then `audit_events` against
   concurrent writes for the migration transaction. Add the group version and
   invitation shareable-version columns as nullable, with no client grant.
   Capture one `migration_checked_at := clock_timestamp()` value for the whole
   backfill only after those locks are held.
2. For each group, select legacy generic rows only, identified by both target
   fields being null. Order them by `created_at asc, id asc` and assign
   `shareable_version = row_number()` starting at 1. Targeted rows retain null
   shareable version and are otherwise unchanged.
3. Rank rows whose stored status is active within each group. A row with
   `expires_at > migration_checked_at` ranks ahead of an expired row; ties are
   ordered by `created_at desc, id desc`. If more than one stored-active row
   exists, keep exactly the first ranked row and mark every other stored-active
   generic row revoked. This preserves the newest still-usable link when one
   exists; if all are expired, it preserves the newest expired row so organizer
   state honestly becomes `issued_expired`.
4. Initialize `groups.shareable_invitation_version` to 0 when the group has no
   generic history. Otherwise initialize it to the maximum assigned row version
   plus 1 only when step 3 revoked one or more duplicate stored-active rows;
   without a normalization revocation, initialize it to the maximum assigned
   row version. The single extra increment represents the atomic migration
   normalization, regardless of how many duplicate rows it revoked.
5. For each row revoked by step 3, append one existing-type
   `invitation_revoked` audit event at `migration_checked_at`, referencing the
   group and invitation and containing only `migration_version = '006b'` and
   `reason = 'multiple_stored_active'`. It has a null actor so no organizer or
   invitation creator is falsely represented as taking the action. If needed,
   the migration removes the actor column's blanket not-null constraint and
   replaces it with an equivalence check: actor ID is null if and only if the
   event is `invitation_revoked` with both exact migration metadata values above.
   Thus only this system-marked use of the existing event type has a null actor;
   every application event, including ordinary invitation revocation, still
   requires a nonnull actor. The existing restrictive actor foreign key remains
   for every nonnull actor. Application roles receive no way to insert the
   system-marked event or any audit row.
6. Add the nonnegative/default/not-null group-version constraint, the generic
   row version/pairing checks, unique `(group_id, shareable_version)`, and the
   one-stored-active-generic partial unique index only after the backfill and
   audit inserts succeed. Any error rolls back columns, row changes, versions,
   and audit events together.

The zero/one/multiple behavior is therefore fixed:

- zero stored-active generic rows: revoke nothing; no migration audit; state is
  `never_issued` with no history or `revoked` with prior generic history;
- one stored-active generic row: preserve it, even if expired; no migration
  audit; state is `active` or `issued_expired` from the single captured clock;
- multiple stored-active generic rows: preserve the deterministic ranked
  winner, revoke and audit every loser, and advance the initialized group
  version by one normalization epoch.

The user-visible impact is explicit: in the multiple-active legacy case, every
superseded link stops working immediately after migration and only the selected
winner remains usable if unexpired. No plaintext token is available to the
migration or audit. The release/staging note reports affected synthetic row
counts without names, hashes, or tokens. An organizer reopening the created
route sees active-link-lost, issued-expired, or revoked from the projection and
can explicitly create a replacement. The migration never guesses or displays a
legacy token.

The organizer-only projection has the exact signature:

```sql
public.group_shareable_invitation_state(p_group_id uuid)
returns table (
  invitation_version bigint,
  state text,
  expires_at timestamptz
)
```

It returns one row only to the current joined organizer. `state` is exactly
`never_issued`, `active`, `issued_expired`, or `revoked`. It evaluates one
`checked_at := clock_timestamp()` value: stored status active with
`expires_at > checked_at` is `active`; stored status active with `expires_at <=
checked_at` is `issued_expired`. `expires_at` is the authoritative stored value
for active and issued-expired, and null for never-issued or revoked. No
invitation ID, target, token hash, use count, or token is returned.

### Exact callable overloads

The only callable generic issue RPC is:

```sql
public.issue_group_invitation(
  p_group_id uuid,
  p_expected_invitation_version bigint
)
returns table (
  invitation_version bigint,
  token text,
  expires_at timestamptz
)
```

The only callable generic revoke RPC is:

```sql
public.revoke_group_invitation(
  p_group_id uuid,
  p_expected_invitation_version bigint
)
returns table (
  invitation_version bigint,
  revoked boolean,
  revoked_at timestamptz
)
```

The targeted capability required by 006a remains separate overloads:

```sql
public.issue_group_invitation(
  p_group_id uuid,
  p_target_user_id uuid
)
returns table (
  token text,
  expires_at timestamptz,
  target_membership_generation bigint
)

public.revoke_group_invitation(
  p_group_id uuid,
  p_invitation_id uuid
)
returns table (
  revoked boolean,
  revoked_at timestamptz
)
```

The targeted issue overload rejects a null target, binds the current target
membership generation under the 006a locks, uses the same after-lock 30-day
expiry with a fixed one-use limit, and returns its canonical token and stored
expiry once. The targeted revoke-by-ID overload rejects a generic invitation.
It cannot be used to bypass generic compare-and-swap. No overload accepts
optional/default target, expected version, expiry, use limit, creator, actor,
raw status, or invitation version. No variadic or JSON wrapper and no
direct-table write is callable by an application role.

Migration review enumerates every `pg_proc` identity argument list. It drops or
revokes every older/broader overload before granting EXECUTE on only the four
signatures above plus the state projection. EXECUTE is revoked from `PUBLIC`,
`anon`, and `service_role`; exact overloads are granted to `authenticated` and
derive the actor from `auth.uid()`. The existing anon preview grant is unchanged.

### Compare-and-swap semantics and authoritative expiry

The generic organizer action sends only `group_id` and the projected
`expected_invitation_version`. It cannot set expiry, use limit, target, actor,
or authority. Generic issue performs exactly this transaction:

1. Derive the actor, lock the group first, verify joined-organizer authority,
   and re-read `groups.shareable_invitation_version` under that lock.
2. Reject a null or negative expected value with SQLSTATE `22023` and safe
   message `invalid_invitation_version`. If a valid expected value differs from
   the stored value, raise SQLSTATE `PT409` with message
   `stale_invitation_version`, no detail/hint, no result row, and no write.
3. Lock invitation rows in the 006a order. Revoke the prior generic row if its
   stored status is active, whether still usable or already expired. Do not
   touch targeted rows.
4. Capture `checked_at := clock_timestamp()` only after those locks. Set the
   new authoritative `expires_at` to exactly `checked_at + interval '30 days'`,
   with no use limit. Increment the group version by exactly one and insert the
   new generic row with that same shareable version.
5. Return exactly the committed version, canonical 43-character unpadded
   base64url token, and stored `expires_at`. Persist only the 006a SHA-256 token
   digest. Append one issue audit event and, when a prior stored-active generic
   row was replaced, one revoke event. All changes commit or roll back together.
   A bigint increment overflow rejects and rolls back the whole operation.

Generic revoke follows the same group-first lock and expected-version check. If
the current generic row has stored status active, including issued-but-expired,
it marks that row revoked, increments the group version exactly once, returns
the new version, `revoked = true`, and authoritative `revoked_at`, and appends
one event. If there is no current stored-active generic row, it returns the
unchanged version, `revoked = false`, and null `revoked_at` with no event. A
stale expected version raises the same `PT409` result and performs no write.

The created UI always renders the returned/projected `expires_at`; it never
computes 30 days from browser or response time. Preview validity continues to
require `expires_at > clock_timestamp()`, so the token is invalid at the exact
expiry instant. Organizer state uses the same strict boundary and shows
`issued_expired` at equality.

The server action returns the raw token, new version, and authoritative expiry
only to the initiating organizer page. It sets no cookie and writes no cache,
database row, URL, redirect, flash message, local storage, session storage,
analytics event, error report, trace, console output, or server log containing
the token or complete invite URL. Initial HTML and reload responses never
contain it. The token remains only in live component state until navigation or
reload.

There is deliberately no raw-token recovery function. A successful database
commit followed by a lost response leaves a valid link whose plaintext is
unknown to the organizer. Repeating the old expected version returns stale and
cannot create another link. Only a new confirmed **Create a new invite link**
action using freshly projected state may rotate it. This applies equally to an
active-lost link and an issued-but-expired link. Two tabs issuing from the same
version yield one winner; the loser receives no token and cannot revoke the
winner.

If the final ARJ-35 implementation does not yet contain the receipt and exact
versioned primitives above, 006b adds them in one narrow forward-only migration
with matching pgTAP and two-session race proof. It may not emulate either
guarantee in process memory, browser state, a service-role route, or a
check-then-write application sequence. Any amendment to the approved 006a
signatures and privilege inventory requires fresh independent database/security
review before 006b implementation approval.

## Validation and failure behavior

- Validation is deterministic at a fixed clock and time zone. Field errors use
  clear product language and never discard valid fields.
- An unauthenticated, incomplete-profile, outsider, or non-organizer call
  cannot create on another actor's behalf, inspect a receipt, read organizer
  invitation state, or issue/rotate a token.
- An ambiguous creation response offers **Try again** with the same request key
  and unchanged payload. It never tells the user to click repeatedly with new
  keys.
- A changed payload after any submitted attempt first renders the same safe
  `idempotency_conflict` state without sending the changed payload. It explains
  that the form changed after an earlier attempt and asks the user to review
  the explicit **Submit changes as a new request** confirmation. Cancel retains
  the original key and attempted binding. Confirm creates the replacement key;
  neither path exposes the prior payload or group.
- A stale invitation version refreshes state and explains that another tab may
  have changed the link. It never reveals the current or previous token.
- An `issued_expired` result is not collapsed into never-issued or active-lost.
  The UI displays the authoritative expiry and requires the replacement-link
  confirmation before it calls generic issue with the current version.
- Database/provider unavailability leaves the form usable and does not claim
  success. Once creation has committed, later analytics or clipboard failure
  cannot turn the result back into a failed creation.
- Copy and WhatsApp actions require a token present in current memory. Copy
  success may announce **Invite link copied**. Copy failure is accessible and
  never clears the only displayed token.

## Acceptance criteria

The implementation pull request copies these criteria and marks each with
exact evidence.

1. **Protected creation route.** Signed-out access follows the safe
   `create-group` intent; only an authenticated onboarded user can create.
   Actor IDs, organizer flags, and group IDs supplied by a client never grant
   authority.
2. **Complete valid creation.** The Version 18 fields validate and normalize to
   canonical payload v1. A successful action commits one private active group,
   one joined participating organizer membership, one creation receipt, and
   one safe creation audit event, then redirects to the organizer-only created
   route.
3. **Exact money and calendar semantics.** Budget conversion is exact for all
   accepted values and currency exponents with no float rounding. The selected
   local calendar date and validated IANA time zone round-trip without a
   UTC-induced date shift.
4. **Idempotent replay.** Sequential and concurrent same-user retries with the
   same key and payload return the same group ID and leave one group,
   membership, receipt, audit event, and `group_created` emission. A payload
   edit retains the submitted key and attempted digest, surfaces
   `idempotency_conflict` before the changed payload is sent, and rotates only
   after explicit new-request confirmation. A forged/missing browser guard is
   still rejected by the database receipt. Another user may use the same UUID
   independently, and a deliberate confirmed new key may create an identical
   second group.
5. **Atomic rollback.** Induced failures at receipt, membership, audit, and
   final-return boundaries leave no partial group or receipt. A waiting retry
   after rollback can succeed once.
6. **No invitation coupling.** Group creation, replay, redirect, initial HTML,
   action response, analytics, and logs contain no invitation token and do not
   create an invitation. Token issuance never happens on mount, reload,
   redirect, retry, or render.
7. **Explicit one-time issuance.** A joined organizer's explicit generic CAS
   action with expected version 0 creates version 1 and returns exactly version,
   canonical token, and authoritative stored expiry once. Only its digest
   persists. Reload shows active-link-lost with that authoritative expiry and
   no token.
8. **Safe rotation, expiry, and race.** A confirmed new-link action revokes the
   prior generic row and creates version N+1 atomically without touching
   targeted invitations. The old token produces the same empty preview as
   every invalid token and the new token remains valid until, but not at, its
   returned expiry. `issued_expired` is distinct, shows the stored expiry, and
   requires confirmation before replacement. Two independent sessions starting
   at version N produce one N+1 winner; the stale loser gets no token and
   performs no revoke, issue, version, or audit write.
9. **Negative authorization.** Anon, outsider, joined non-organizer, left
   member, removed member, forged actor, cross-group organizer, and null-auth
   calls cannot create for another user, read receipts, read organizer invite
   state, or issue/rotate links. Direct-table, guessed-ID, and function-overload
   attempts reveal no rows or counts. Generic issue/revoke through a targeted,
   legacy, defaulted, null-target, JSON, or by-ID path is unavailable or safely
   rejected, while valid targeted issue/revoke remains functional and never
   changes the group shareable version.
10. **Token secrecy.** Automated scans and response assertions find no raw
    token or full invite URL in persisted rows, audit, seed, logs, analytics,
    cookies, browser storage, initial/RSC HTML, redirects, traces, screenshots,
    or uploaded artifacts. Test tokens are synthetic and evidence redacts them.
11. **Honest accessible states.** Empty, validation, pending, safe failure,
    success-without-link, token-present, copy-failure, active-link-lost,
    issued-expired, revoked, replacement-confirmation, new-request-confirmation,
    and stale-version states are keyboard and screen reader usable. Focus moves
    predictably, pending actions resist duplicate activation, and reduced
    motion is respected.
12. **Visual fidelity.** Initial, validation, and token-present states receive
    apple-to-apple image comparison with frozen Version 18 at both approved
    viewports. Security-required new states receive independent visual review
    and explicit baseline approval. The reviewer inspects the actual images,
    not filenames, OCR, or a pixel score alone.
13. **Typed analytics only.** Exactly one server-authoritative `group_created`
    event is attempted for the committed first creation, with only the existing
    allowed properties and internal UUID context. Replay, validation failure,
    idempotency conflict, token issuance, rotation, copy, and share do not emit
    duplicate or token-bearing events.
14. **Deterministic populated upgrade.** Applying the migration to valid
    populated ARJ-35 states assigns legacy generic versions by creation time and
    ID, initializes every group counter exactly, leaves targeted rows unchanged,
    and handles zero, one, expired, and multiple stored-active generic rows by
    the pinned ranking. Multiple-active losers are revoked with truthful
    actor-null system audit rows, the winner and user impact are deterministic,
    and a forced migration failure rolls everything back.
15. **Fresh-stack and exact-head gates.** Any schema/API addition is a committed
    forward migration with explicit REVOKE/GRANT, RLS, pgTAP, race tests, and a
    deliberate smoke inventory update. `pnpm verify`, the CI database job, the
    stack-gated browser suite, visual checks, and Railway deployment are green
    on the exact independently reviewed head.

## Required automated proof

### Unit and component tests

- Canonicalization for Unicode/whitespace, every occasion and mode mapping,
  date/time-zone validation, exact major-to-minor conversion, all field bounds,
  submitted key/digest retention, changed-payload conflict before RPC,
  confirmation-only rotation/clearing, unavailable-session-storage blocking,
  safe error mapping, and input retention.
- Server Action tests prove session-derived authority, no service-role import,
  no token in create results, stable replay mapping, analytics only on
  `created_now`, and safe behavior when analytics fails.
- Component tests cover keyboard submission, duplicate activation, error
  summary focus, all created/invitation states, confirmation cancel/accept,
  issued-expired versus active-lost copy/actions, authoritative expiry display,
  clipboard success/failure, manual copy, and no issuance on render/reload.

### Database and race tests

- pgTAP inspects receipt/invitation shape, the durable group-scoped version,
  generic/targeted pairing and uniqueness constraints, grants, RLS, the five
  exact callable signatures and every rejected/absent overload, owner/security
  mode, empty search paths, default EXECUTE revocation, audit contents, and
  absence of plaintext-token storage.
- Positive and negative tests cover every acceptance role and state, canonical
  payload mismatch, replay, rollback, generic version transitions, exact
  generic issue/revoke results, targeted issue/revoke isolation, old-token
  revocation, state projection values, and exact return columns.
- A committed `pnpm test:db:group-upgrade` harness creates a disposable local
  database at the exact ARJ-35 predecessor migration, inserts synthetic valid
  populated states, applies the 006b migration once, and asserts the resulting
  schema and data. Fixtures include: no generic history; only revoked generic
  history; one active unexpired row; one stored-active expired row; multiple
  active rows with mixed expiry; multiple equally timed active rows requiring
  the UUID tie-break; targeted rows beside every generic case; and at least two
  groups proving partitioned numbering. It verifies assigned versions, group
  counters, deterministic winner, loser revocations, one truthful system audit
  per loser, null-actor check enforcement, targeted byte-for-byte preservation,
  constraints, and rollback after an induced failure. The harness has finite
  timeouts, never targets staging/production, emits no raw tokens or hashes, and
  is an explicit bounded step in the CI database job.
- The committed bounded two-session harness uses independent sessions, real
  barriers, and finite lock/statement/client timeouts for same-key create,
  changed-payload conflict, create rollback/waiter success, same-version issue,
  generic issue versus generic revoke, generic versus targeted issue/revoke,
  issue versus organizer transfer/removal, and rotate rollback/waiter success.
  It asserts the durable version, generic/targeted rows, result shape, and audit
  counts after each interleaving and emits no token material.
- Clock-boundary tests hold generic issuance behind the group lock, capture
  database clock bounds immediately before lock release and after return, and
  prove returned expiry equals the stored value and is exactly 30 days after
  the function's after-lock `checked_at` within those bounds. Separate tests
  prove preview/state is active strictly before expiry and empty/
  `issued_expired` at equality and after it, using `clock_timestamp()` rather
  than transaction-fixed `now()`.

### Browser, visual, and staging tests

- Stack-gated Playwright creates synthetic users through the real auth/session
  boundary, exercises valid and invalid creation, double submission, replay,
  changed-payload conflict before request, confirmation-only new request,
  reload, organizer/outsider denial, explicit issuance, stale-tab behavior,
  authoritative expiry, issued-expired replacement confirmation, targeted-link
  isolation, clipboard failure, and cleanup.
- Visual tests use deterministic content, fixed time/date/time zone, local
  assets, fixed fonts, identical viewport and interaction state, and the
  approved Version 18 references. Before/after mobile and desktop images are
  reviewed by a fresh independent reviewer. Issued-expired and its replacement
  confirmation each have explicit mobile and desktop visual proof.
- The Railway preview is exercised with synthetic data. After the reviewed
  ARJ-35/006b migration is applied to the existing staging Supabase project,
  staging proof covers one creation, safe replay, organizer-only state,
  one-time issuance, authoritative expiry, old-token denial after rotation,
  issued-expired handling with a short-lived synthetic database fixture,
  targeted-invitation survival, and outsider denial. Raw tokens are used only
  transiently and never recorded in evidence.

## Required pull-request evidence

- Acceptance-criteria table linking each item to tests, exact-head check runs,
  screenshots, and staging evidence.
- `pnpm verify` transcript and green exact-head `verify` and `database` jobs,
  including the named race step and stack-gated spec.
- Migration ledger, grants/RLS/function inventory, race transcript with token
  redaction, populated-state upgrade transcript and before/after counts,
  deterministic multiple-active decision, system-audit inventory,
  forward-fix/rollback notes, and synthetic-fixture cleanup proof if this slice
  adds the prerequisite migration.
- Mobile and desktop before/after screenshots for every changed visual family,
  independent image-review signoff by exact file hash, and the Railway preview
  URL.
- Safe response/body/storage/log/artifact scans showing that no raw invitation
  token or private group payload was retained or uploaded.
- Confirmation that no Magic Patterns mock data, Vite/editor scaffolding,
  service-role credential, new dependency, or unapproved visual artifact
  shipped.

## Implementation plan

1. **Close the database contract first.** Compare the merged ARJ-35 function,
   schema, privilege, and race contract with this brief. If receipts or
   durable expected-version issue/revoke are absent, add the narrow forward
   migration, deterministic populated-state backfill and audit, exact overload
   cleanup/grants, pgTAP suite, dedicated predecessor-state upgrade harness,
   and two-session/clock-boundary cases first. Obtain fresh independent
   database/security signoff before application work consumes it.
2. **Build the typed server boundary.** Add shared normalized input/result
   types, exact money/date/time-zone validation, the authenticated create and
   invitation Server Actions, safe error mapping, no-store handling, and
   typed analytics. Write failing unit tests before behavior.
3. **Build the protected form and created route.** Reproduce the approved V18
   structure with repository tokens/components. Implement accessible
   validation, pending and recovery states, submitted-key binding and explicit
   new-request confirmation, organizer-only loading, explicit issuance,
   one-time in-memory token display, authoritative expiry, issued-expired and
   revoked states, copy/share, replacement confirmation, and stale-version
   recovery.
4. **Add real browser and visual proof.** Extend the explicit CI stack-gated
   spec list and image-only evidence collector for the named ARJ-37 images.
   Capture both viewports and all security-required states. Never place token
   text in a screenshot or artifact; deterministic visual tokens must be
   redacted before capture without changing layout.
5. **Review and verify.** Run formatting and available local gates, then use CI
   for the fresh Supabase stack, pgTAP, bounded races, stack e2e, and visuals.
   Correct every independent spec, security, code, accessibility, and actual
   image-review finding until explicit signoff on the exact head.
6. **Stage only after merge gates.** Merge only with green checks and signoff.
   Apply reviewed migrations to the existing staging Supabase project only,
   deploy the exact merge, run the synthetic staging proof, preserve concise
   evidence, and clean up test users/groups. Do not provision or mutate
   production.

## Non-goals

- No signed-out invitation preview, authentication-context preservation for an
  invite, invitation acceptance, email invitation, or joined-member flow.
- No groups list, group room, member wishlist browsing, pending-member UI,
  organizer settings/member controls, transfer UI, leave/decline/remove UI, or
  manual revoke-without-replacement UI.
- No optional location/description editor, free-form occasion, custom currency
  list, group archive/delete, draw/redraw, assignment, checklist, reservation,
  reaction, copy-to-wishlist, purchase, or gifting progress.
- No production Supabase/Railway resource, DNS, sender, CAPTCHA, system package,
  local container runtime, new dependency, or visual-baseline update made only
  to silence CI.

## Dependencies and gates

- Planning and independent review of this brief may proceed in parallel, but
  implementation must not start before the Phase 4 tracker has actual exit
  evidence and ARJ-35 / 006a has merged with green exact-head database/race
  proof.
- The exact ARJ-35 migration must be applied to the existing staging Supabase
  project, with its ledger and negative authorization evidence, before 006b
  staging validation. If 006b adds the narrow receipt/version migration, that
  reviewed migration follows the same staging-only gate.
- 004d/004e provide safe auth intent, onboarding, protected routes, sessions,
  and logout. 002b/002c provide design/test foundations. 005h provides the
  binding database and stack-e2e CI surface.
- ARJ-37 must merge before the invitation-preview/acceptance slice consumes its
  opaque links. The absence of that later public preview route is stated
  honestly in ARJ-37 evidence and is not represented as an end-to-end join.

## Analytics, security, and privacy

`group_created` is the only event in this slice. All group content, money,
request keys, payload hashes, invitation state, tokens, URLs, membership data,
and errors remain excluded. Session replay stays disabled until its staging
privacy gate is approved; if enabled later, every form and invitation region
must be masked or blocked. Service-role credentials never enter application
code or browser bundles. Organizer status grants only the 006a administrative
operations and never access to future assignments, reservations, or recipient
gifting state.
