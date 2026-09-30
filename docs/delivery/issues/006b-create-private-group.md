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

The created route has four explicit states:

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
4. **Stale issuance request.** If another tab has already issued or replaced
   the link, refresh organizer invitation state and show the active-link-lost
   state. Never retry issuance automatically and never rotate again without a
   new explicit click.

The Version 18 `create-group-created` screen is the comparison authority for
the token-present state. The no-link, lost-token, confirmation, copy-failure,
pending, and stale-version states are security-required extensions and need
new independently approved screenshots. The production link uses
`/invite/[opaqueToken]`, never a name-derived slug.

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
- The browser retains only the request key in session storage until success. It
  does not persist the group name, payload, or payload digest for idempotency.
  Repeated submission of the unchanged canonical payload reuses the key. A
  canonical field change in the live form creates a new key. After a reload,
  the retained key is safe to retry: an unchanged payload replays, while a
  changed payload receives the database conflict below and must be confirmed as
  a new request. **Start another group** clears the prior request key and
  creates a new one, so an intentionally identical second group remains
  possible.
- The database stores a creation receipt keyed uniquely by actor ID and request
  key, containing only canonical payload version, SHA-256 payload
  digest, stable group ID, and managed timestamps. The raw canonical payload
  and user-entered text are not duplicated into the receipt or audit metadata.
  Application roles have no direct table privileges or permissive RLS policy
  on receipts.
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
API. The receipt digest is SHA-256 over the database's deterministic UTF-8
serialization of canonical payload v1; authentication identity is excluded
from the digest because it is already part of the unique receipt key.

The internal database result may include `created_now` solely so the server can
emit analytics once. The browser-visible result is stable and contains only the
group ID. The server emits `group_created` only when `created_now` is true, with
the existing catalogued `occasion_type`, `gifting_mode`, `currency`, and
`has_budget_cap` properties and the internal user/group UUID context. Group
name, date, time zone, request key, payload digest, budget value, and invitation
data never enter analytics. Analytics failure does not roll back or misreport a
successful group creation.

## Exact shareable-invitation contract

### Versioned issuance

Shareable invitation issuance is not part of group creation. The organizer
action sends only `group_id` and `expected_invitation_version` to the server.
The server supplies a fixed expiry of 30 days from the after-lock
`clock_timestamp()` check and no use limit. The browser cannot extend expiry,
set a use limit, target a user, or change authority. The token-present state
states the expiry date without exposing server time or other invitation data.

The 006a database boundary must provide an organizer-only projection with:

- `invitation_version`: a nonnegative monotonically increasing integer,
  initially 0.
- `has_active_shareable_invitation`: whether the current generic invitation is
  active and unexpired at `clock_timestamp()`.

It must also provide compare-and-swap issuance with this behavior:

1. Derive the actor from `auth.uid()`, lock the group first, and confirm the
   caller is still its joined organizer.
2. Re-read the current generic shareable-invitation version under that lock.
   If it differs from `expected_invitation_version`, return
   `stale_invitation_version` with no token and no write.
3. Lock prior invitation rows in the 006a fixed order. Revoke every prior
   active generic shareable invitation for the group, increment the version by
   exactly one, and issue one new generic invitation in the same transaction.
4. Return the new version and the canonical 43-character unpadded base64url
   token exactly once. Persist only the SHA-256 token digest defined by 006a.
5. Append the safe invitation-issued audit event. A rotation also appends the
   old invitation's revocation event. Both events and both invitation changes
   commit or roll back together. Audit metadata contains identifiers and
   versions only.

The server action returns the raw token and new version only to the initiating
organizer page. It sets no cookie and writes no cache, database row, URL,
redirect, flash message, local storage, session storage, analytics event,
error report, trace, console output, or server log containing the token or
complete invite URL. The initial HTML and reload response never contain it.
The token remains only in the live component state until navigation or reload.

There is deliberately no raw-token recovery function. A successful database
commit followed by a lost response leaves a valid link whose plaintext is
unknown to the organizer. Repeating the old expected version must return stale
and must not create another link. Only a new, confirmed **Create a new invite
link** action using the refreshed version may rotate it. Two tabs issuing from
the same version yield one winner; the loser receives no token and cannot
revoke the winner.

If the final ARJ-35 implementation does not yet contain the receipt and
versioned-issuance primitives above, 006b must add them in one narrow
forward-only migration with matching pgTAP and two-session race proof. It may
not emulate either guarantee in process memory, browser state, a service-role
route, or a check-then-write application sequence. Any amendment to the
approved 006a signatures and privilege inventory requires fresh independent
database/security review before 006b implementation approval.

## Validation and failure behavior

- Validation is deterministic at a fixed clock and time zone. Field errors use
  clear product language and never discard valid fields.
- An unauthenticated, incomplete-profile, outsider, or non-organizer call
  cannot create on another actor's behalf, inspect a receipt, read organizer
  invitation state, or issue/rotate a token.
- An ambiguous creation response offers **Try again** with the same request key
  and unchanged payload. It never tells the user to click repeatedly with new
  keys.
- A known idempotency conflict explains that the form changed after a prior
  attempt and asks the user to review and submit as a new request. It does not
  expose the prior payload or group.
- A stale invitation version refreshes state and explains that another tab may
  have changed the link. It never reveals the current or previous token.
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
   mismatch returns `idempotency_conflict` without change. Another user may use
   the same UUID independently, and a deliberate new key may create an
   identical second group.
5. **Atomic rollback.** Induced failures at receipt, membership, audit, and
   final-return boundaries leave no partial group or receipt. A waiting retry
   after rollback can succeed once.
6. **No invitation coupling.** Group creation, replay, redirect, initial HTML,
   action response, analytics, and logs contain no invitation token and do not
   create an invitation. Token issuance never happens on mount, reload,
   redirect, retry, or render.
7. **Explicit one-time issuance.** A joined organizer's explicit action with
   the current expected version creates one shareable invitation and returns
   one canonical token once. Only its digest persists. Initial version 0 moves
   to 1. Reload shows the active-link-lost state and no token.
8. **Safe rotation and race.** A confirmed new-link action revokes the old
   generic link and creates version N+1 atomically. The old token produces the
   same empty preview as every invalid token and the new token remains valid.
   Two independent sessions starting at version N produce one N+1 winner; the
   stale loser gets no token and performs no revoke, issue, or audit write.
9. **Negative authorization.** Anon, outsider, joined non-organizer, left
   member, removed member, forged actor, cross-group organizer, and null-auth
   calls cannot create for another user, read receipts, read organizer invite
   state, or issue/rotate links. Direct-table, guessed-ID, and function-overload
   attempts reveal no rows or counts.
10. **Token secrecy.** Automated scans and response assertions find no raw
    token or full invite URL in persisted rows, audit, seed, logs, analytics,
    cookies, browser storage, initial/RSC HTML, redirects, traces, screenshots,
    or uploaded artifacts. Test tokens are synthetic and evidence redacts them.
11. **Honest accessible states.** Empty, validation, pending, safe failure,
    success-without-link, token-present, copy-failure, active-link-lost,
    replacement-confirmation, and stale-version states are keyboard and screen
    reader usable. Focus moves predictably, pending actions resist duplicate
    activation, and reduced motion is respected.
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
14. **Fresh-stack and exact-head gates.** Any schema/API addition is a committed
    forward migration with explicit REVOKE/GRANT, RLS, pgTAP, race tests, and a
    deliberate smoke inventory update. `pnpm verify`, the CI database job, the
    stack-gated browser suite, visual checks, and Railway deployment are green
    on the exact independently reviewed head.

## Required automated proof

### Unit and component tests

- Canonicalization for Unicode/whitespace, every occasion and mode mapping,
  date/time-zone validation, exact major-to-minor conversion, all field bounds,
  request-key reuse/rotation/clearing, safe error mapping, and input retention.
- Server Action tests prove session-derived authority, no service-role import,
  no token in create results, stable replay mapping, analytics only on
  `created_now`, and safe behavior when analytics fails.
- Component tests cover keyboard submission, duplicate activation, error
  summary focus, all created/invitation states, confirmation cancel/accept,
  clipboard success/failure, manual copy, and no issuance on render/reload.

### Database and race tests

- pgTAP inspects receipt/invitation shape, constraints, grants, RLS, function
  signatures and every overload, owner/security mode, empty search paths,
  default EXECUTE revocation, audit contents, and absence of plaintext-token
  storage.
- Positive and negative tests cover every acceptance role and state, canonical
  payload mismatch, replay, rollback, version transition, old-token revocation,
  and exact result projections.
- The committed bounded two-session harness uses independent sessions, real
  barriers, and finite lock/statement/client timeouts for same-key create,
  changed-payload conflict, create rollback/waiter success, same-version issue,
  issue versus organizer transfer/removal, and rotate rollback/waiter success.
  It asserts final rows and audit counts after each interleaving and emits no
  token material.

### Browser, visual, and staging tests

- Stack-gated Playwright creates synthetic users through the real auth/session
  boundary, exercises valid and invalid creation, double submission, replay,
  reload, organizer/outsider denial, explicit issuance, stale-tab behavior,
  replacement, clipboard failure, and cleanup.
- Visual tests use deterministic content, fixed time/date/time zone, local
  assets, fixed fonts, identical viewport and interaction state, and the
  approved Version 18 references. Before/after mobile and desktop images are
  reviewed by a fresh independent reviewer.
- The Railway preview is exercised with synthetic data. After the reviewed
  ARJ-35/006b migration is applied to the existing staging Supabase project,
  staging proof covers one creation, safe replay, organizer-only state,
  one-time issuance, old-token denial after rotation, and outsider denial.
  Raw tokens are used only transiently and never recorded in evidence.

## Required pull-request evidence

- Acceptance-criteria table linking each item to tests, exact-head check runs,
  screenshots, and staging evidence.
- `pnpm verify` transcript and green exact-head `verify` and `database` jobs,
  including the named race step and stack-gated spec.
- Migration ledger, grants/RLS/function inventory, race transcript with token
  redaction, forward-fix/rollback notes, and synthetic-fixture cleanup proof if
  this slice adds the prerequisite migration.
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
   expected-version issuance are absent, add the narrow forward migration,
   pgTAP suite, and two-session cases first. Obtain fresh independent
   database/security signoff before application work consumes it.
2. **Build the typed server boundary.** Add shared normalized input/result
   types, exact money/date/time-zone validation, the authenticated create and
   invitation Server Actions, safe error mapping, no-store handling, and
   typed analytics. Write failing unit tests before behavior.
3. **Build the protected form and created route.** Reproduce the approved V18
   structure with repository tokens/components. Implement accessible
   validation, pending and recovery states, idempotency-key lifecycle,
   organizer-only loading, explicit issuance, one-time in-memory token display,
   copy/share, replacement confirmation, and stale-version recovery.
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
