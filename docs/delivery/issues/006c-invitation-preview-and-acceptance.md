# 006c - Invitation preview and authenticated acceptance

## Outcome

Deliver the public invitation journey for Phase 5. A person who opens a valid
opaque invitation link first lands on a clean, non-cacheable URL, sees only the
approved limited preview, and chooses **Join the group**. A signed-out person
can authenticate with either the six-digit code or magic link, complete
onboarding when required, return to the same invitation, and then make a second
explicit Join action before membership is created. A signed-in person can join
from the preview directly. Successful acceptance is atomic and idempotent and
ends in an honest joined confirmation without claiming that the later group
room exists.

The continuation is separate for every invitation flow. It is bound to the
browser, the flow, the requested email, and the provider-verified user. It does
not extend the existing singleton `gmt-auth-carry` cookie or add `invite` to the
generic auth-intent enum. Multiple invitation tabs cannot overwrite one
another's destination or account binding.

This is the binding implementation contract for ARJ-36. It consumes the
ARJ-35 / 006a group-security boundary and the opaque link emitted by ARJ-37 /
006b. Planning may proceed in parallel, but implementation is gated on the
Phase 4 exit and the merged, independently approved exact contracts for both
dependencies.

## User stories and success signal

- As a signed-out invite recipient, I want to understand the group before I
  authenticate so I can decide whether to join without exposing private group
  data.
- As an invite recipient, I want either the code or magic link to return me to
  the same invitation, including through onboarding, so authentication does
  not lose my place or join on my behalf.
- As a signed-in invite recipient, I want one clear Join action and an honest
  confirmation so I know exactly when membership was created.
- As an organizer, I want an expired, revoked, replaced, exhausted, or
  wrong-target link to create no membership and reveal no group details.

The issue introduces no new launch target. It supplies the existing
`invite_accepted` funnel signal and contributes to the Phase 5 exit proof that
four seeded users can join a private group while a fifth user, still an
outsider, is denied its private data. It does not deny a valid unlimited
generic invitation to that fifth user. Event delivery is measured under the
privacy limits in this brief and never substitutes for database membership
evidence.

## Dependency contract

### ARJ-35 / 006a

- Consume the limited invitation projection and atomic acceptance semantics
  defined by 006a. A public preview contains exactly host display name, group
  name, occasion date, budget amount and currency, gifting mode, and joined
  member count. It never contains invitation IDs, group IDs, member IDs,
  emails, invitation targets, location, description, invited-member count,
  avatars, audit data, wishlist data, assignments, reservations, or gifting
  progress.
- Preserve 006a's token validation, fixed lock order, after-lock
  `clock_timestamp()` checks, use limits, targeted-invitation constraints,
  sticky removal, membership generations, same-user replay, audit rules, and
  generic failure behavior. No application check may replace those database
  controls.
- The 006a client-callable raw-token acceptance entry point is superseded for
  application roles by this slice. The 006c migration revokes client EXECUTE
  from every overload of direct `accept_group_invitation`, moves or reuses its
  behavior behind a private reviewed core, and exposes only the
  continuation-bound acceptance function. Leaving the legacy direct function
  callable would bypass the browser, requested-email, verified-user, and
  completed-profile gates and blocks implementation approval.
- The raw-token preview entry point remains available because the initial
  landing handler must validate a bearer token before it creates a
  continuation. Preview never consumes a use or creates membership.

### ARJ-37 / 006b

- Consume the exact canonical invitation token from the final reviewed 006b
  contract: 32 cryptographically random bytes encoded as 43-character
  canonical unpadded base64url, with only the ARJ-35 SHA-256 digest persisted.
  Do not introduce a slug, invitation ID, group ID, or version number into the
  recipient URL.
- Group creation does not issue a link. The organizer's separate explicit
  issuance action returns the plaintext token once. ARJ-36 starts only when a
  recipient presents `/invite/[opaqueToken]`.
- A 006b link rotation revokes the prior generic link and increments the
  organizer-visible generic invitation version once. ARJ-36 never copies that
  version into its continuation and never follows a rotation. A continuation
  tied to the revoked token becomes unavailable. The replacement token starts
  a new continuation.
- The final 006b review must close its database API and legacy issuance-bypass
  questions before this brief's implementation plan freezes migration or RPC
  signatures. ARJ-36 binds to the behavior above, then records the actual
  merged signatures in its implementation plan and tests.

## Exact public and auth routes

### Raw-token cleanup

- The shared link is `/invite/[opaqueToken]`. It is a GET-only landing handler,
  not a page. It validates the canonical token shape and live invitation. With
  an established coordinator cookie, it generates a fresh 32-byte browser
  secret and calls continuation begin. Without one, it creates only a
  30-second one-use pending-start record containing the invitation reference
  and a nonce digest, sets a fixed sealed pending-start cookie, and redirects
  to `/invite/start/[startId]`. It never renders application content, runs
  client code, loads analytics, or verifies authentication.
- The token-free start handler verifies the pending cookie, establishes the
  coordinator once if absent, and then consumes the pending row to begin the
  flow. The coordinator secret is deterministically derived from the sealed
  pending nonce and a dedicated server key, so concurrent completion of the
  same winning pending cookie produces the same coordinator rather than two
  browser identities. Once a coordinator cookie exists, no bootstrap response
  may replace it. Superseded, expired, replayed, or cookie-mismatched pending
  starts create no continuation and retain no recoverable bearer.
- A valid begin returns a 302 to `/invite/continue/[flowId]` and sets the
  flow-specific sealed cookie defined below. A malformed, unknown, expired,
  revoked, exhausted, full-inventory, or invalid-bootstrap request returns the
  same 302 to `/invite/unavailable` and creates no continuation.
- Every raw and start redirect response sets `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`. They contain no raw token in the body,
  cookie, redirect target, Server Component payload, trace, log, or analytics
  call. No route may redirect back to the raw-token URL.
- `flowId` is a random UUID generated by the database. It is an opaque
  correlation identifier, not authorization. A flow URL without the matching
  browser cookie returns the same unavailable state as an invalid flow.

### Clean route family

- `/invite/continue/[flowId]` renders the limited preview or an authenticated
  joined confirmation. `/invite/unavailable` renders one generic recovery for
  malformed, unknown, expired, revoked, exhausted, missing-cookie, expired
  continuation, and invalidated flows.
- Signed-out invitation authentication uses dedicated routes:
  `/auth/invite/[flowId]`, `/auth/invite/[flowId]/verify`,
  `/auth/confirm/invite/[flowId]`, and `/auth/link/invite/[flowId]`.
  Invitation onboarding uses `/onboarding/invite/[flowId]`.
- Every route in the invitation, invitation-auth, and invitation-onboarding
  families, including Server Action responses, is `no-store` and
  `no-referrer`. Dynamic flow IDs are removed from client analytics page paths
  and referrers. Invitation regions are blocked from autocapture and session
  replay.
- The existing generic `/auth`, `/auth/verify`, `/auth/confirm`, `/auth/link`,
  and `/onboarding` behavior remains unchanged. A generic auth flow never
  discovers or adopts an invitation continuation.

## Per-invitation continuation boundary

### Browser binding

- The browser also has one fixed HttpOnly, Secure, SameSite=Lax,
  `Path=/`, no-Domain coordinator cookie. Its sealed value contains only a
  random browser-coordinator secret, version, issue time, and expiry. It is not
  an active-invitation pointer and contains no flow, destination, email, user,
  token, or group value. The server stores only its digest on continuation
  rows and uses the secret solely to serialize flow creation, bound the active
  inventory, serialize invitation-auth mutations, and authenticate logout
  cleanup. It expires no earlier than the latest possible active flow and is
  never silently rotated while an active row exists.
- Every successful raw-token cleanup sets one dynamic cookie named
  `__Host-gmt-invite-[flowId]`. It is HttpOnly, Secure, SameSite=Lax,
  `Path=/`, has no Domain attribute, and expires after 3,600 seconds. The
  continuation also expires at the earlier of that time and the invitation's
  own expiry.
- The cookie is a versioned AES-256-GCM envelope using a dedicated server-only
  `INVITATION_CONTINUATION_COOKIE_SECRET`. It contains the flow ID, the fresh
  browser secret, optional requested email needed for OTP verification, an
  issued-at time, and an expiry. The flow ID is authenticated as additional
  data. The cookie never contains the raw invitation token, token hash,
  invitation ID, group ID, profile, or membership state. Cookie parsing rejects
  an unknown version, bad length, bad encoding, failed authentication tag,
  future issue time, expiry, cookie-name/flow mismatch, or swapped envelope as
  one generic unavailable result.
- The secret is exactly 32 random bytes encoded as canonical 43-character
  unpadded base64url before sealing. The database stores only its SHA-256
  digest. Possessing a flow ID without the cookie, or a cookie without its
  matching flow ID, confers no access.
- Each flow has its own cookie and row. Opening two invitation links, or the
  same link twice from its raw URL, creates independent flows. No global
  `activeInvite`, singleton destination cookie, local-storage key, or
  session-storage key may select which invitation an auth result belongs to.
- A browser may have at most eight nonexpired, unaccepted continuations. A
  raw landing with no coordinator first uses a clean, token-free bootstrap
  step and creates no continuation until the browser returns the coordinator
  proof. The bootstrap and every creation take the coordinator's database
  lock, prune only already expired or invalidated rows, and count again
  under that lock. If eight live rows remain, creation is refused without
  evicting one, retaining the raw token, or changing an existing flow. The
  recovery tells the user to complete, sign out, or explicitly discard an
  existing invitation and then reopen the link. A confirmed discard proves the
  coordinator plus that flow's browser secret and invalidates only that flow.
  Accepted, expired, and invalidated envelopes may be cleared as terminal
  cleanup; a live unaccepted flow is never silently evicted.
- The clean bootstrap serializes concurrent first-contact tabs before either
  can create a continuation. Only the pending start matching the browser's
  fixed pending cookie may complete; concurrent completion of that one start
  derives the same coordinator, and a superseded start is rejected without a
  continuation. Thereafter the shared database lock makes two concurrent
  creates observe consecutive counts. Tests must prove that zero through eight
  concurrent entries produce no more than eight active rows or eight live
  dynamic cookies, including lost bootstrap and creation responses.

### Database shape and lifecycle

- Add one forward-only migration after the merged ARJ-35 schema. Store
  continuations in an unexposed private-schema table with: flow UUID,
  invitation reference, browser-secret and browser-coordinator SHA-256 digests,
  optional requested email binding digest, optional verified user ID, whether
  the flow began with a valid authenticated session, monotonically increasing
  revision, expiry, accepted timestamp, invalidated timestamp, and managed
  timestamps. A second private browser-coordinator row holds only the
  coordinator digest, current session epoch, an optional short auth-mutation
  lease identifier and expiry, and managed timestamps. A bounded pending-start
  table holds a random ID, invitation reference, nonce digest, 30-second
  expiry, and consumed timestamp. No table stores a raw token, token hash
  duplicate, browser secret, coordinator secret, plaintext email, group
  content, provider credential, or session token.
- The requested-email binding is
  `HMAC-SHA256(lower(trim(email)), browser_secret)` using the high-entropy
  browser secret as the key. The same normalization is applied to the
  provider-verified `auth.users.email`. The plaintext email exists only in the
  sealed flow cookie and transient provider call. It is absent from tables,
  audit metadata, analytics, logs, screenshots, and evidence.
- The table has no direct privilege or permissive RLS policy for `anon`,
  `authenticated`, or `service_role`. Public SECURITY DEFINER functions own
  the narrow lifecycle. They use empty `search_path`, schema-qualified names,
  fixed argument and return types, no dynamic SQL, derived `auth.uid()`, and
  exact EXECUTE grants. Revoke EXECUTE from `PUBLIC` and every unapproved role
  for every overload before granting the listed roles.
- Beginning a flow accepts a canonical raw token and browser secret
  and browser-coordinator secret transiently, locks the coordinator inventory,
  enforces the exact eight-flow maximum, resolves the invitation by its ARJ-35
  digest, checks current preview eligibility, stores the invitation reference
  plus both secret digests, and returns only flow ID and expiry. If
  `auth.uid()` is present, the same transaction derives that user's canonical
  `auth.users.email`, stores its HMAC binding and verified user ID, and records
  that the flow began authenticated. It never trusts a caller-supplied user or
  email for this shortcut. Invalid inputs or a full inventory return no row.
  The token-free pending-start form resolves the already stored invitation
  reference instead of accepting a token, consumes the start once, and repeats
  the same live-invitation checks under the same coordinator lock.
- Preview accepts flow ID and browser secret, rechecks the continuation and
  invitation at `clock_timestamp()`, and returns exactly the seven ARJ-35
  preview fields. It returns an empty result for every invalid cause. Preview
  never extends expiry, changes invitation use count, creates membership, or
  returns continuation internals.
- Email binding locks the continuation, validates the browser secret, and
  writes the email binding once. A retry with the same normalized email is
  idempotent. A different email returns one generic restart result and changes
  nothing. Concurrent different-email binds have exactly one winner.
- Verification is authenticated-only. It derives the user and canonical email
  from the verified Supabase session, compares the email binding, and stores
  the verified user ID once. The same user may replay safely. Another user,
  another email, a null session, an expired flow, or a changed browser secret
  gets the same account-mismatch/restart result and cannot alter the binding.
- Verification is also the idempotent reconciliation primitive. After the
  provider has created a valid session, it may be called again using only that
  session, flow ID, and browser secret. It never replays `verifyOtp`, consumes
  another code or link, creates membership, changes the requested email, or
  changes a different verified-user binding. This closes the gap where the
  provider succeeded but the database bind failed, timed out, or committed
  without its response reaching the browser.
- A small authenticated continuation-state projection returns only
  `verified` or `accepted`, plus group ID only after that same verified user has
  joined. It never returns email, invitation ID, target, generation, browser
  digest, revision, audit data, or another user's state.
- Expired rows are inert. A bounded, indexed cleanup of expired unaccepted rows
  may run opportunistically inside continuation creation. It must use a finite
  row limit and may not delete accepted membership, invitation uses, or audit
  history. A queue, cron service, and production cleanup job are out of scope.

### Public function behavior

The implementation plan must pin exact signatures after ARJ-35 is merged. The
required capabilities are:

1. Begin a continuation from a raw token or a server-resolved one-use pending
   start plus browser proofs, callable by `anon` and `authenticated`; callers
   never supply the pending start's invitation reference.
2. Read the seven-field preview through a valid flow and browser secret,
   callable by `anon` and `authenticated`.
3. Bind the requested email once, callable by `anon` and `authenticated`.
4. Bind or idempotently reconcile the provider-verified user from the current
   session, callable only by `authenticated`.
5. Read the minimal verified/accepted continuation state, callable only by
   `authenticated`.
6. Accept through the continuation, callable only by `authenticated`.
7. Explicitly discard one coordinator- and browser-proven unaccepted flow,
   callable by `anon` and `authenticated`.
8. Atomically invalidate the coordinator's bounded active inventory for
   confirmed local logout, callable only by `authenticated`.
9. Acquire, finalize, or release one browser-scoped invitation-auth mutation
   lease and advance its session epoch, callable only through the reviewed
   server route boundary.

No function accepts an actor ID, arbitrary invitation ID, group ID,
membership generation, profile-complete flag, audit metadata, or caller-chosen
expiry as authority. No general continuation CRUD or raw-token recovery
function exists.

## Authentication and onboarding

### Email request and OTP

- Selecting **Join the group** while signed out navigates to the dedicated
  invitation email screen. It does not create membership. The screen uses the
  approved invitation helper copy and obtains preview text only through the
  flow-bound projection.
- The invitation request action validates the flow cookie and live preview,
  validates the email, binds that email in the database first, and then asks
  Supabase to send the existing combined OTP and magic-link message. Provider
  failure leaves the same email binding available for a safe same-email retry.
  A different email requires reopening the original invitation link and cannot
  overwrite the flow.
- The flow cookie is resealed with the requested email only after the database
  binding succeeds. No existing `gmt-auth-carry` value is read, overwritten,
  or used as fallback.
- OTP verification reads the requested email only from the matching sealed
  flow cookie. Before calling `verifyOtp`, the action reads the current
  provider-validated session. With no session, it verifies the six-digit code
  and returns a response whose only application/browser state mutations are
  delivery of the new provider session and advanced browser session epoch. It
  does not bind the continuation in that response. The clean destination then
  requires a separate **Continue this invitation** POST to reconcile the
  current session.
  With a session whose provider user and normalized email match the
  continuation binding, verification skips `verifyOtp` and goes directly to
  that reconciliation step. With any other existing session, it does not call
  the provider or alter that session; it shows account-mismatch recovery and
  requires confirmed local logout and a fresh invitation-auth attempt. A code
  submitted under another flow or email cannot select this continuation.
  Provider errors use the existing non-enumerating recovery classes and leave
  any pre-existing session intact.

### Magic link

- The invitation auth request supplies a server-constructed, allowlisted
  `emailRedirectTo` of `/auth/confirm/invite/[flowId]` on the current trusted
  origin. The flow ID must be a canonical UUID already bound to the request's
  sealed cookie. No caller-provided origin, path, query, or full URL is used.
- The local and staging Supabase templates are revised to build the application
  link from the trusted `RedirectTo`, then append `token_hash` and the closed
  `type=email`. Generic auth continues to use the exact trusted
  `/auth/confirm` destination. Redirect allowlist tests cover both staging
  domains, local origins, encoded bypasses, protocol-relative values,
  backslashes, unexpected paths, and foreign origins.
- GET `/auth/confirm/invite/[flowId]?token_hash=...&type=email` never verifies.
  It first validates the flow cookie and query shape, parks the auth token hash
  inside that flow's sealed cookie, and returns a clean 302 to
  `/auth/link/invite/[flowId]` with `no-store` and `no-referrer`. It renders no
  content and runs no analytics. A missing browser cookie, altered flow,
  malformed query, or link opened in another browser reaches the same clean
  recovery and creates no session.
- The clean magic-link screen requires the user's explicit **Use my sign-in
  link** action. Before calling `verifyOtp`, it applies the same existing-session
  rule as OTP: a matching provider-validated session reconciles without
  re-verification; a mismatched session is preserved and the parked credential
  is not consumed; only an absent session allows provider verification. After
  any provider verification attempt, the action removes the parked auth token.
  On success its response delivers only the provider session plus advanced
  browser session epoch and redirects to the clean reconciliation screen; a
  subsequent explicit POST binds the session to the continuation. Provider
  denial or failure preserves any session that existed when the action began.
  Prefetch, GET, back navigation, and email scanners never verify, join, or
  consume an invitation use.

### Session reconciliation and account restart

- Provider authentication/session-cookie delivery and continuation binding are
  different HTTP requests as well as separate commits. The verification
  response never calls the continuation-binding function. After the browser
  has applied its session cookies, the clean route shows **Continue this
  invitation**. That POST calls only the idempotent session-derived
  reconciliation primitive. It does not call the provider again and does not
  accept the invitation. Binding failure, timeout, or a lost binding response
  is therefore retryable from the session already delivered to the browser.
- A response that is actually lost before its Set-Cookie headers reach the
  browser cannot be recovered as an authenticated session. The UI must not
  infer provider success or claim a verified continuation. Reload sees no
  matching session and offers an honest fresh-code or fresh-link restart. If
  headers were applied but navigation or body was lost, reload observes the
  session and offers only the separate reconciliation POST. Tests must drop
  the real verification response both before cookie application and after
  cookie application and assert these two safe outcomes.
- If reconciliation had already committed, repeating it returns the same
  verified state. If it had not committed, the matching session completes the
  binding once. A changed user, changed normalized email, missing browser
  secret, expired or invalidated flow, or another flow returns the same restart
  result and changes neither the continuation nor membership.
- A pre-existing mismatched session is never silently replaced. The recovery
  action **Log out and restart sign-in** requires confirmation, signs out the
  current Supabase session with local scope, removes only parked provider
  material for that invitation attempt, retains the browser-bound unverified
  continuation and requested-email binding, and returns to
  `/auth/invite/[flowId]` for a fresh send. If local sign-out fails, the
  existing session and continuation remain unchanged and the UI does not claim
  restart success.

### Cross-tab auth mutation and session epoch

- Every invitation provider verification, invitation account restart, and
  confirmed logout is a browser-scoped auth mutation. While a coordinator
  cookie exists, any generic auth or account route that could set, replace,
  refresh, or clear the same Supabase session cookies participates too; absent
  that cookie its existing behavior is unchanged. Before touching the provider
  or session cookies, the route acquires the coordinator row's single short
  lease using the session epoch presented in the sealed coordinator cookie.
  Another tab waits for the bounded lease or receives a retry result; it never
  runs a concurrent provider verification or sign-out. A crashed operation
  expires without advancing the epoch and exposes no credential.
- A successful auth mutation finalizes the lease and advances the server epoch
  exactly once before returning cookies. Its response seals the new epoch into
  the coordinator cookie alongside any provider Set-Cookie or clearing
  headers. Failure releases the lease without changing epoch or session. Every
  invitation route compares the cookie epoch with the server row before it
  trusts a provider session, renders authenticated content, reconciles, or
  accepts. A stale browser epoch gets only safe session-cookie clearing and a
  coordinator cookie resealed at the current server epoch; it never gets
  authenticated content or an implicit retry of the old mutation.
- Response delivery order is not authority. If verification finalizes first
  and logout finalizes second, logout's later server epoch wins even when the
  older verification response reaches the browser last. The stale epoch makes
  that restored client session unusable and the next server response clears
  it. If logout finalizes first, the queued verification must reacquire against
  the new epoch and cannot silently replace the logged-out account; it returns
  to a fresh explicit sign-in choice. Tests cover both server orders and both
  opposite browser-response orders across two tabs.

### Post-auth and onboarding

- A complete returning profile returns to `/invite/continue/[flowId]`. An
  incomplete profile goes to `/onboarding/invite/[flowId]`. This is an
  invitation-specific exception to 004e's default-home onboarding decision;
  generic onboarding remains unchanged.
- A user who was already signed in when the raw invitation opened is bound by
  the continuation-begin transaction. If that profile is incomplete, the
  first **Join the group** action routes directly to invitation onboarding. It
  does not show email auth, invoke acceptance, or discard the existing user
  binding. After onboarding, the clean preview returns and requires a second
  explicit **Join the group** action.
- Invitation onboarding repeats the current authenticated-session and
  continuation-user checks on every render and submit. It reuses the approved
  onboarding validation and profile write, then returns to the clean
  invitation preview. A flow-ID edit, cookie swap, session switch, expired
  continuation, or mismatched verified user cannot choose a destination.
- Authentication and onboarding do not accept the invitation. After either
  path, the person sees the live preview again and must activate **Join the
  group**. No GET, auth callback, successful OTP, magic-link action,
  onboarding submit, render, mount, or retry creates membership.

## Explicit acceptance

- The dedicated same-origin Join POST handler reads only flow ID from its route
  and the matching sealed browser cookie. It uses a request-only authenticated
  Supabase client that may validate the current access token but may not
  refresh, set, clear, or reseal any session or invitation cookie. An expired
  session returns safe reauthentication instead of a Set-Cookie response. The
  handler revalidates the user and completed profile, then calls the
  continuation-bound database acceptance function using that user's session.
  It never uses a service-role client or accepts an actor, invitation, target,
  group, generation, or completion flag from the browser. It rejects missing
  or foreign Origin and Fetch Metadata before any database call.
- Inside one transaction, acceptance follows the ARJ-35 group-first lock order,
  rechecks continuation expiry/browser/email/user binding, rechecks profile
  completion from `profiles`, rechecks the current invitation after locks, and
  runs the 006a acceptance core. A new success creates or advances membership,
  records one invitation use, increments use count once, appends one safe
  acceptance audit event, and marks the continuation accepted. All effects
  commit or roll back together.
- Same-user replay in the still-joined accepted generation returns the same
  safe success without another membership, invitation use, count, membership
  generation change, or audit event. Repeating acceptance through the same
  already-accepted continuation is fully write-free. When the same user opens
  the same token as a second independent continuation and explicitly joins,
  the transaction recognizes the existing 006a use and may mark only that
  second continuation accepted. This continuation-only reconciliation emits
  no acceptance audit or analytics event. A joined user who did not use this
  invitation receives the 006a `already_joined` result with no continuation or
  invitation write. Leave or removal prevents any continuation from restoring
  membership. Only a matching new targeted invitation may reinstate a removed
  user under 006a.
- Revoked, expired, exhausted, malformed, unknown, wrong-target, stale-target,
  missing-cookie, expired-continuation, incomplete-profile, switched-account,
  and outsider cases create no partial membership, use, count, continuation,
  or audit change. Public copy does not distinguish sensitive causes.
- A committed response lost before the browser receives it is reconciled by
  the accepted continuation state and 006a replay. Reload or a repeated
  explicit Join shows success without another write. An uncommitted failure
  remains retryable.
- The same guarantee applies to a second independent flow. If its
  continuation-only reconciliation commits and the response is lost, reload
  reads that flow's accepted state and shows success. If it rolls back, a new
  explicit Join repeats the 006a replay check and marks only that continuation.
  Tests must not infer success merely from group membership, because an
  already-joined user with no use of this token is a different write-free
  outcome.
- Continuation-only reconciliation is still a live invitation acceptance. It
  locks and rechecks the current invitation under the same group/invitation
  order as a first acceptance. Revocation, ARJ-37 rotation, expiry, or
  exhaustion that linearizes first makes every still-unaccepted second flow
  unavailable and prevents its accepted timestamp from being written, even
  though the user remains a member from the earlier flow. If the second-flow
  reconciliation linearizes first, that continuation remains accepted and the
  later revocation or rotation does not undo membership or its joined state.
  Lost responses in both orders reconcile only from committed continuation
  state, never from membership alone.
- Only the transaction winner returns `accepted_now = true`. The server makes
  one best-effort `invite_accepted` analytics attempt for that result, using
  only `was_authenticated` from the continuation's start state plus internal
  user/group UUID context. A replay does not emit. Analytics failure cannot
  roll back or misreport membership. A response lost after commit may produce
  no external analytics attempt; this slice does not claim exactly-once
  PostHog delivery without the Phase 8 delivery/outbox work.

### Acceptance versus logout

- Confirmed account-menu logout first collects every valid dynamic invitation
  cookie in the browser and calls one bounded database invalidation function
  with the coordinator proof and the complete list of at most eight matching
  flow IDs and browser secrets. Under the coordinator lock, the function
  derives the authoritative database active inventory, sorts and locks every
  row in it, verifies that every supplied cookie belongs to that inventory,
  and marks every active unaccepted row invalidated in one transaction. This
  includes a row whose creation committed but whose cookie-setting response
  was lost. An extra, duplicate, or unverified supplied entry rolls the whole
  operation back; absence of an orphaned cookie cannot strand its row. The
  function never locks a group or invitation after taking a continuation lock.
  If this database step fails, logout does not clear the session or claim
  success; the user can retry. The creation cap is what makes authoritative
  all-flow invalidation bounded.
- Acceptance preserves the ARJ-35 order by resolving its group without a row
  lock, locking the group and invitation first, and then locking its
  continuation before any membership write. Logout locks only continuation
  rows and never later requests a group or invitation lock, so the shared
  continuation lock is the linearization point without introducing a lock
  cycle.
- Revoke and rotation take the same group then invitation locks used by
  acceptance. A second-flow replay may write its continuation only while those
  locks still prove the invitation live. Thus accept-first and revoke-first or
  rotate-first orders have one deterministic boundary and cannot turn existing
  membership into authority to accept a stale flow.
- If acceptance locks the continuation first, it may commit membership and
  accepted state; logout then invalidates no accepted history, signs out
  locally, and clears browser material. Membership correctly remains after
  logout. If logout locks and invalidates first, a waiting acceptance observes
  invalidation and commits no membership/use/audit/continuation acceptance.
- Only after database invalidation commits does logout call Supabase local
  sign-out and clear every invitation envelope and parked auth credential in
  its response. The proxy and Join handler are configured so a Join response
  contains no `Set-Cookie`, including a session refresh. A late Join response
  or redirect therefore cannot resurrect cookies cleared by logout and must
  pass a fresh server-side session, flow-cookie, and continuation-state check
  before joined content can render. Browser response reordering cannot restore
  cleared state or show a signed-out user a stale success screen.

## User-visible states and copy boundary

### Valid preview

- Reproduce the Version 18 `invite-valid` card hierarchy, typography, spacing,
  responsive behavior, privacy explanation, and dominant Join action at 390
  by 844 and 1440 by 1000.
- Render only the seven ARJ-35 fields. The production preview intentionally
  omits the prototype's location, occasion label, member avatars, invited
  count, and **Copy invite link** action because they are outside the approved
  projection or would require retaining/re-exposing the discarded bearer.
  These are documented security differences that require independent
  product/design approval, not reasons to expand the public database result.
- Budget formatting uses the existing exact minor-unit currency formatter.
  The date is formatted from the stored group date/time semantics without
  inventing a viewer-local date shift. Gifting-mode copy uses the approved
  product terms.

### Unavailable and auth recovery

- All unavailable causes show one clear state: **This invite isn't available.**
  Explain that the link may have expired or been replaced and suggest asking
  the organizer for a new one. Do not reveal whether the group, invitation,
  target, or account exists.
- An invitation magic link opened without its original browser binding says
  to return to the browser where the invitation was opened and use the code,
  or reopen the original invitation link. It does not transfer the flow to the
  new browser.
- Account mismatch explains that the invitation flow was verified for a
  different account. Before verification it offers confirmed local logout and
  a fresh send for the same browser-bound invitation; after a continuation is
  already verified to another user it requires logout and reopening the raw
  invitation. It never silently switches accounts or rebinds a verified flow.

### Joined confirmation

- Show **You're in.** with the group name only after the same verified user has
  an accepted/joined continuation. Offer working actions **Add an item to my
  wishlist** and **Go to home**. Do not link to or simulate the later group
  room, roster, member wishlists, pending members, organizer controls, or
  gifting views.
- The joined state is a new production state derived from the Version 18
  joined hierarchy. It requires independently approved mobile and desktop
  screenshots because no frozen joined-state screenshot exists.

All controls have persistent accessible names, visible focus, 44 by 44
CSS-pixel minimum targets, honest pending and failure states, predictable
focus movement, screen-reader announcements, and reduced-motion support.
Pending controls resist duplicate activation, but database correctness never
depends on disabled UI.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Raw URL cleanup.** A canonical invitation GET performs only the bounded
   continuation begin or token-free coordinator bootstrap and a clean 302.
   Valid and every invalid response are `no-store` and `no-referrer`; no raw
   token survives in body, redirect, cookie plaintext, RSC/HTML, analytics,
   log, trace, screenshot, or artifact.
2. **Limited live preview.** A valid flow plus browser cookie renders exactly
   the seven approved fields. Every invalid/revoked/expired/exhausted or
   missing/mismatched flow returns the same unavailable state and no private
   data. Preview performs no membership or use write.
3. **Independent continuation.** Every raw link opening has an independent
   database row and sealed cookie. Flow-ID guessing, cookie swapping, envelope
   tampering, expiry, and another browser fail. The coordinator-locked active
   inventory never exceeds eight even under concurrent first contact or lost
   responses; a ninth live flow is refused and no live flow is silently
   evicted. Only confirmed proof-bound discard, terminal cleanup, or expiry
   frees a slot. Existing generic auth carry and intent behavior are unchanged.
4. **Requested-email binding.** First valid email binding wins; a same-email
   retry is idempotent; a different or concurrent email cannot overwrite it.
   No plaintext email persists outside the sealed cookie or appears in
   evidence.
5. **OTP completion.** A valid code verifies the cookie-bound email and binds
   only the provider-derived user through a later reconciliation POST. The
   verification response delivers session cookies and advances the session
   epoch but never binds or accepts. A matching existing session reconciles
   without re-verifying; a mismatched existing session is preserved and blocks
   the provider call until confirmed local logout/restart. Invalid, expired,
   excessive-attempt, unavailable-provider, cross-flow, cross-email, and
   switched-session cases create no membership and have accessible recovery.
6. **Magic-link completion.** The trusted dynamic redirect is flow-specific.
   The initial auth-token URL cleans before content or analytics, GET never
   verifies, an explicit action verifies once only when no session exists, and
   another browser or flow cannot adopt the link. Matching and mismatched
   pre-existing sessions follow the same non-destructive rule as OTP. Generic
   magic-link behavior does not regress.
7. **Session reconciliation.** Provider success followed by bind failure,
   timeout, or binding-response loss is recoverable from the matching current
   session through an idempotent continuation-only POST. Loss of the actual
   verification response before cookie application instead produces an honest
   fresh-credential restart; loss after cookie application permits the POST.
   Reconciliation neither re-verifies nor accepts; mismatch and expiry change
   neither session nor membership.
8. **Onboarding return.** An incomplete verified user completes the existing
   onboarding rules and returns to the same live preview. A directly signed-in
   incomplete user preserves the initial binding and goes straight to
   invitation onboarding on the first Join action. A complete user does not
   repeat onboarding. Every path requires a later explicit Join to accept.
9. **Explicit atomic acceptance.** Only POST from the visible Join action can
   invoke continuation acceptance. The same-origin handler rejects CSRF inputs
   and emits no Set-Cookie or session refresh. A new success atomically creates
   the 006a membership/use/count/audit effects and accepted continuation state.
   Rollback leaves all unchanged.
10. **Lifecycle and replay.** Same-user replay changes no membership, use,
    count, generation, or audit. The same accepted flow is fully write-free; a
    second independent flow may mark only itself accepted after proving the
    existing use, including after reload or lost response. An already joined
    non-user of this token is write-free. Leave/removal prevents restoration;
    only a fresh matching targeted invitation may reinstate a removed user.
    Expiry, revocation, exhaustion, wrong target, and ARJ-37 rotation block a
    new acceptance, including continuation-only reconciliation by an
    unaccepted second flow. An already accepted flow remains joined.
11. **Account and logout safety.** Session switch after verification, changed
    provider email, stale user binding, null auth, and incomplete profile are
    denied. Confirmed account-menu logout atomically invalidates every
    browser-proven unaccepted continuation before local sign-out, then clears
    all flow cookies and parked auth material. The coordinator derives and
    invalidates its authoritative at-most-eight active rows, including an
    orphan after lost cookie delivery; every supplied cookie must match that
    inventory. Failure before invalidation preserves the session and reports
    no success.
12. **Multitab and real races.** Independent flows do not overwrite one
    another. Same-flow different-email races have one binding winner. Two
    accepts by one user create one use/audit; two users at a one-use limit admit
    at most one. Accept versus revoke, rotation, remove, expiry, logout, and
    rollback/waiter interleavings preserve the ARJ-35 final states. Both
    accept-first and logout-first orders, revoke/rotate versus second-flow
    reconciliation in both orders, plus reversed browser response order, have
    deterministic tested outcomes. Provider verification, restart, and logout
    serialize by browser lease and monotonically checked session epoch, so a
    stale response cannot silently restore or replace an account.
13. **Honest recovery after lost responses.** A committed acceptance whose
    response is lost reconciles to joined success without a duplicate effect.
    The same proof covers continuation-only reconciliation in a second flow. A
    rolled-back attempt remains safely retryable. No UI claims failure for a
    known committed join.
14. **Privacy and authorization.** Direct legacy raw-token acceptance is not
    executable by application roles. No direct continuation table access or
    broad function overload exists. Tokens, email, browser secrets, hashes,
    targets, member generations, and private group/gifting state are absent
    from analytics, logs, errors, browser-readable storage, evidence, and
    public projections.
15. **Accessible visual states.** Valid preview and joined confirmation match
    their approved references or documented differences at both viewports.
    Unavailable, email, verify, magic-link recovery, onboarding return,
    pending, account-mismatch, and safe-failure states pass keyboard and axe
    checks. A fresh independent reviewer inspects actual images before any
    baseline update.
16. **Typed analytics.** Only a newly committed acceptance may attempt the
    existing `invite_accepted` event. Its allowed property is
    `was_authenticated`; internal UUID context is permitted. Preview, auth,
    onboarding, reconciliation, failure, replay, continuation-only replay,
    already-joined, logout, and unavailable states emit no invitation event or
    sensitive property.
17. **Exact-head gates.** The forward migration, pgTAP, two-session race
    harness, unit/component tests, stack-gated browser suite, visual checks,
    `pnpm verify`, database job, and Railway preview are green on the exact
    independently reviewed head. Staging proof uses only the existing staging
    Supabase/Railway resources and synthetic accounts.

## Required automated proof

### Unit and component tests

- Canonical token/UUID/browser-secret and coordinator-secret parsing; AES-GCM
  round trip, tamper, wrong key, wrong flow, wrong cookie name, future issue
  time, expiry, and stale session epoch; dynamic cookie naming/clearing; email
  normalization; safe error mapping; and the trusted invitation auth redirect
  allowlist.
- Raw landing policy proves no render or analytics path, exact headers, valid
  clean redirect, uniform invalid redirect, and absence of token in response
  body, Location, and Set-Cookie.
- Actions prove session-derived authority, no service-role import, no generic
  auth-carry access, bind-before-send, same-email resend, flow-specific OTP and
  magic link, provider-response/session-cookie separation from reconciliation,
  matching-session reconciliation without `verifyOtp`, mismatched
  existing-session preservation, confirmed local logout/restart, auth-mutation
  lease and epoch checks, direct signed-in incomplete-profile onboarding,
  explicit-only same-origin Join with no Set-Cookie,
  authoritative-inventory logout cleanup, late-response handling, and safe
  analytics behavior.
- Components cover all states, focus movement, keyboard activation, duplicate
  presses, live-region messages, reduced motion, and no private value in DOM or
  browser-readable storage.

### Database and race tests

- pgTAP inspects continuation, coordinator, and pending-start shape,
  constraints, indexes, expiry, digest and HMAC lengths, one-use start
  consumption, exact active-flow cap, session epoch and lease transitions,
  grants, lack of direct privileges, RLS exposure, every function and overload,
  owner/security mode, empty search paths, default EXECUTE revocation, and
  revocation of every direct raw-token acceptance overload.
- Positive and negative tests cover begin/preview/bind/verify/state/accept,
  session-derived reconciliation after provider/bind uncertainty, profile
  completeness, generic and targeted invitations, sticky removal, replay
  generations, second-flow continuation-only reconciliation only while live,
  authoritative-inventory logout invalidation, creation refusal, explicit
  discard, terminal cleanup, revocation, expiry, exhaustion, rotation,
  rollback, and exact public result columns. Persisted-row and audit scans
  reject plaintext token, browser or coordinator secret, provider session, or
  email.
- A committed bounded harness uses independent database sessions, explicit
  barriers, and finite lock/statement/client timeouts. It covers different
  email binds on one flow; duplicate acceptance; same token through two flows;
  one-use different-user acceptance; accept/revoke; accept/remove;
  accept/rotation; revoke and rotation versus unaccepted second-flow
  reconciliation in both lock orders and with lost responses; accept/logout in
  both lock orders; simultaneous flow creation at counts zero through eight;
  inventory-derived logout during creation; expiry while blocked; acceptance
  rollback followed by a waiting success; provider-success/bind response loss;
  same-flow and second-flow acceptance response loss; and reload
  reconciliation. It asserts final membership, generation, use count,
  invitation, continuation, invalidation, coordinator epoch, active inventory,
  and audit rows after every interleaving and prints no credential material.
- Add a dedicated package command and an explicit CI database step after
  pgTAP and before stack-gated browser tests. The command must target only the
  repository's selected local Supabase container and fail on timeout or an
  unexpected result. A sequential mock is not race proof.

### Browser, visual, and staging tests

- Stack-gated Playwright uses real local Supabase auth and Mailpit to exercise
  signed-out OTP, same-browser magic link, link prefetch, another-browser magic
  link recovery, returning user, new-user onboarding, signed-in join, invalid
  token families, directly signed-in incomplete-profile onboarding,
  provider-success/bind uncertainty, pre-verification matching and mismatched
  sessions, actual provider-response loss before and after cookie application,
  revocation, rotation, expiry, account switch, confirmed restart, provider
  verification versus logout in both server and browser response orders,
  accept/logout with reversed response delivery, second-flow replay versus
  revoke/rotation in both orders, same-flow and second-flow response loss,
  zero-to-eight creation races, ninth-flow refusal, explicit flow discard,
  terminal envelope cleanup, authoritative-inventory logout, reload, and
  multitab flows at both approved viewports.
- Tests inspect the initial raw-token and auth-token responses before following
  redirects, asserting clean destinations and headers. Network, DOM, cookie
  plaintext, local/session storage, analytics sink, test logs, screenshots, and
  collected artifacts are scanned for synthetic token, email, and browser
  secret or coordinator-secret markers.
- Visual fixtures use deterministic safe preview content matching the frozen
  V18 fields where permitted, fixed date/time zone, fixed fonts, reduced
  motion, identical state and viewport, and no bearer text. Every security
  difference from V18 is listed beside the actual image review.
- Staging exercises a valid generic link with a returning synthetic user, both
  OTP and same-browser magic link with separate fresh requests, a new synthetic
  user through onboarding, old-token denial after ARJ-37 rotation, revoked and
  expired denial, account switch, and same-user replay. The fifth synthetic
  user is denied private group, roster, and wishlist access while still an
  outsider. If staging also proves denial at acceptance, it uses either a
  one-use invitation whose capacity another user consumed or a targeted
  invitation for a different user. A fifth user who possesses a valid,
  unexpired, unrevoked, unlimited generic link and explicitly joins must be
  admitted, not used as denial evidence. Test users/groups are cleaned up.
  Evidence records identifiers and result classes only, never emails, codes,
  links, tokens, or secrets.

## Required pull-request evidence

- Acceptance-criteria table linking every item to exact tests, check runs,
  screenshots, and staging records.
- Exact-head `pnpm verify`, CI `verify` and `database` jobs, named continuation
  race step, stack-gated invitation suite, visual run, and Railway deployment.
- Migration ledger, complete grants/RLS/function inventory, legacy-acceptance
  revocation proof, race transcript with bounded duration, and forward-fix
  rollback notes.
- Mobile and desktop before/after images for valid preview and joined
  confirmation plus changed auth/recovery families, each with exact hashes and
  fresh independent image-review signoff.
- Safe scans proving no raw invitation/auth token, requested email, browser
  secret, coordinator secret, provider session, full invite URL, or private
  projection escaped into persisted state, logs, analytics, browser-readable
  storage, screenshots, or uploaded artifacts.
- Confirmation that no Magic Patterns mock data, Vite/editor scaffolding,
  service-role credential, new dependency, production resource, or baseline
  change made only to silence CI shipped.

## Implementation plan

1. **Rebase and freeze dependency interfaces.** Start from current `main` only
   after Phase 4 exit, ARJ-35 merge, and ARJ-37 merge. Record both exact merge
   commits. Map the merged invitation table, preview, acceptance core, generic
   issuance version, grants, and race harness. Amend this plan with exact SQL
   signatures before implementation, without loosening this brief.
2. **Write the database red tests first.** Add the 006c pgTAP suite for the
   private continuation, coordinator, and pending-start tables, function
   inventory, raw-accept revocation, lifecycle, active-flow cap, session epoch,
   and negative roles. Add the real two-session harness cases and CI/package
   command. Demonstrate that the tests fail against the merged ARJ-35/37 schema
   for the missing continuation boundary.
3. **Implement the forward migration.** Add the private tables, constraints,
   indexes, exact definer functions, minimal projections, explicit REVOKE and
   GRANT statements, session-derived reconciliation,
   authoritative-inventory batch invalidation, auth-mutation lease/epoch
   operations, and private shared acceptance core. Preserve ARJ-35 lock order
   and result semantics, including continuation-only second-flow replay only
   while the invitation is live. Make pgTAP and every bounded race pass before
   application code consumes the API.
4. **Build the sealed browser boundary.** Add focused server-only modules for
   flow IDs, coordinator bootstrap, dynamic cookie names, the exact eight-flow
   inventory, AES-GCM envelope sealing, token/email-safe error mapping, and
   cookie cleanup. Use Web Crypto already available in the runtime; add no
   dependency. Add the raw-token and unavailable route handlers with cleanup
   headers and leakage tests.
5. **Build dedicated invitation auth.** Add the invitation email, verify,
   confirm, link, and onboarding route family and actions. Reuse presentational
   auth/onboarding primitives while keeping state and actions flow-specific.
   Update the local auth templates, trusted RedirectTo construction, proxy
   header policy, existing-session preflight, split provider/reconciliation
   requests, auth-mutation lease/session epoch, reconciliation/restart paths,
   and staging-template procedure. Prove the generic auth suite remains
   unchanged.
6. **Build preview and explicit acceptance.** Add the limited-preview loader,
   valid/unavailable/account-mismatch/joined states, explicit Join action,
   signed-in incomplete-profile onboarding, acceptance/replay reconciliation,
   linearized logout cleanup, and typed `invite_accepted` attempt. Do not add
   a group-room link or re-expose the bearer for copy.
7. **Add browser and visual proof.** Extend the explicit stack-gated CI spec
   list and image-only evidence collector for 006c. Exercise the full OTP,
   magic-link, reconciliation, onboarding, multitab, switch/logout, replay,
   second-flow replay, race, response-loss, response-reordering, privacy,
   keyboard, axe, and both-viewport visual matrix. Baseline adoption requires a
   fresh independent reviewer who opens the actual images.
8. **Review and stage.** Obtain fresh independent database/security, code,
   accessibility, and image signoff; correct every finding; run green checks
   on that exact head; merge; apply only the reviewed migration and auth
   template/config to the existing staging project; deploy the exact merge;
   run the synthetic staging matrix; clean up; and preserve concise versioned
   evidence. Do not provision or mutate production.

## Non-goals

- No group creation or link issuance UI, organizer invitation rotation UI,
  invitation email product campaign, groups list, group room, roster, pending
  members, member wishlist browsing, organizer membership controls, transfer,
  leave/decline/remove UI, or manual revoke UI.
- No location, description, occasion-label, invited-count, avatar, email,
  invitation-target, audit, wishlist, assignment, reservation, or gifting
  field is added to the public preview.
- No draw/redraw, checklist, reaction, item copy, reservation, purchase,
  activity, reminder, or gifting-progress behavior.
- No transferable continuation, QR handoff, cross-browser magic-link join,
  raw-token recovery, client-side token cache, global active-invite pointer,
  queue, background cleanup service, or exactly-once external analytics claim.
- No production Supabase/Railway resource, DNS, sender, CAPTCHA, system
  package, local container runtime, new dependency, or unreviewed visual
  baseline.

## Dependencies and gates

- Phase 4 must have actual exit evidence before any 006c implementation. A
  planning commit or open pull request is not an exit gate.
- ARJ-35 / 006a must be merged with green exact-head pgTAP and race proof, then
  its reviewed migration must be applied to the existing staging Supabase
  project before 006c staging validation.
- ARJ-37 / 006b must be merged with its exact token, generic-link rotation, and
  legacy-issuance contracts independently approved. ARJ-36 implementation
  consumes that merged head and may not guess unresolved function or column
  names from the planning draft.
- 004c/004d/004e supply the generic OTP, magic-link, onboarding, session, and
  logout behavior. This slice adds a parallel invitation-specific continuation
  and must preserve every generic regression test. 005h supplies the binding
  database and stack-e2e CI surface.
- A reviewed 006c migration and matching staging auth-template change are
  authorized only on the existing staging project. Production provisioning,
  domain, sender, secrets, and launch remain pending.

## Analytics, security, and privacy

`invite_accepted` is the only analytics event in this slice. Invitation
preview, authentication, onboarding, and failures produce no invitation
event. The event contains only the catalogued `was_authenticated` boolean and
internal UUID context. Raw or hashed tokens, flow IDs, browser secrets,
emails, group names, dates, budgets, member counts, targets, memberships, and
errors never enter analytics.

The raw bearer exists only in the organizer's one-time ARJ-37 response, the
shared `/invite/[opaqueToken]` request, and the transient argument used to
begin a continuation. After the initial redirect, acceptance uses the
short-lived database continuation plus browser secret. No service-role
credential enters application code or a browser bundle. Organizer authority
still grants no access to future assignments, reservations, or recipient
gifting state.
