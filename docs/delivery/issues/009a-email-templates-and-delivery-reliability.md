# 009a — Invitation, assignment, and reminder email templates with idempotent, observable delivery

## Outcome

Phase 8's transactional email surface: branded templates for group
invitations, secret-draw assignment notifications, and occasion reminders —
delivered through Resend behind an idempotent, retrying, maintainer-observable
send pipeline. Every template obeys the product's privacy boundary as a hard
invariant:

- **Assignment emails go only to givers.** A recipient is never emailed
  anything that reveals who — or that anyone — is giving to them, that a draw
  ran in their honor, or any reservation, checklist, or purchase state about
  their own items.
- **Invitation emails carry the 006b/006c opaque link** and are subject to
  the same token-hygiene rules as the raw landing: the token exists in the
  email body for the recipient and nowhere else — never in logs, analytics,
  error reports, screenshots, or PR evidence.
- **008c tombstone semantics are respected end to end:** when a mode changes
  away from `secret_draw`, committed assignments remain stored but are never
  surfaced; assignment emails are sent only from readable current-version
  assignments (`my_assignment` semantics, including the `is_valid = false`
  with null-recipient state), and a redraw restores readability and may
  trigger a fresh giver notification for the new version only.

Reliability is a first-class deliverable: a send is attempted at most once
per logical email under concurrent retries, provider failures are retried
with bounded backoff, and maintainers can observe delivery outcomes without
ever seeing recipient addresses in plaintext logs, raw tokens, or secret
URLs.

This brief is **conditional-delivery aware**: the staging Resend/SMTP
credential has been broken since 2026-09-29. Live-delivery validation gates
in this brief are written as conditional on owner credential restoration and
are flagged below as an explicit owner action item. They are never silently
skippable and are never a reason to weaken an automated test; automated
tests that do not require live delivery must pass regardless.

## Scope

### Email pipeline (schema change — justified, minimal, one migration)

- Transactional email cannot be delivered correctly with at-most-once
  semantics from request-scoped Next.js handlers: a handler crash after
  Resend accepts a send, a Railway deploy mid-send, or a double-submitted
  server action would lose or duplicate the email. The existing stack cannot
  solve this without durable state, so this slice adds exactly one new
  private-schema table, `private.email_outbox`, in one forward-only
  migration following the 006a/007c conventions (UUID key,
  `clock_timestamp()` timestamps, bounded text, explicit REVOKE-then-exact
  GRANT, deny-by-default exposure):
  - `id uuid` primary key;
  - `template_key text` bounded check: exactly `invitation`,
    `assignment`, `reminder`;
  - `idempotency_key text` not null, unique index — a deterministic,
    caller-supplied key (defined per template below) that makes a logical
    email replay-safe;
  - `recipient_user_id uuid` references `auth.users` (id)
    `ON DELETE RESTRICT`, not null — the email is addressed from the
    profile's email at send time, never stored in the row;
  - `payload jsonb` not null — template variables only, validated by an
    allowlist per `template_key` (group id, occasion date, group display
    name, sender-side names already approved for each template). No email
    address, token, token hash, secret URL, assignment identity, or wishlist
    content beyond what the named template legitimately renders is stored;
  - `status` `public.email_outbox_status` (`pending`, `sent`,
    `failed_permanent`), not null, default `pending`;
  - `attempt_count integer` not null default 0, bounded by check to
    `<= 10`; `last_attempt_at timestamptz` null;
  - `provider_message_id text` null, bounded — Resend's returned id, an
    identifier, never an address or subject body;
  - `last_error_category text` null, bounded enum of coarse categories
    (`provider_error`, `rate_limited`, `invalid_payload`,
    `recipient_unavailable`) — never a provider response body, which can
    contain addresses and content;
  - `created_at` / `updated_at` timestamptz, database-managed.
- **No client role receives any privilege** on `private.email_outbox` — no
  grant, no RLS policy surface, same posture as `group_members`,
  `audit_events`, and `group_assignments`. All writes go through SECURITY
  DEFINER functions with empty `search_path`.
- `private.enqueue_email(p_idempotency_key text, p_template_key text,
  p_recipient_user_id uuid, p_payload jsonb)` returns `text`: inserts the
  row or, on unique-conflict replay, returns the existing row's current
  status without a second write (`already_pending` / `already_sent` /
  `already_failed`); an unknown template key, oversized payload, or
  disallowed payload key returns a generic `rejected`. Enqueue commits in
  the **caller's transaction**, so an email is enqueued if and only if the
  state change that justifies it commits (a rolled-back draw enqueues
  nothing; a committed draw always leaves an enqueue behind).
- `private.claim_due_emails(p_limit integer)` returns the claimed rows:
  atomically transitions due `pending` rows (next attempt after exponential
  backoff from `attempt_count`) to a claimed state using
  `FOR UPDATE SKIP LOCKED` so concurrent workers never double-claim; returns
  id, template key, recipient user id, and payload.
- `private.record_email_result(p_id uuid, p_outcome text,
  p_provider_message_id text, p_error_category text)` marks the claim
  `sent` (storing the bounded provider id) or returns it to `pending`
  (incrementing `attempt_count`) or `failed_permanent` after the attempt
  bound. A send worker crash between Resend accepting a send and the result
  commit can, worst case, cause one duplicate delivery — the documented,
  accepted at-most-once-per-attempt residual; it can never produce an
  unbounded retry loop, because `attempt_count` is checked at claim time.
- A bounded send worker runs as a server-side route/invocation on Railway
  (not a client path), authenticated by a server-only secret, with a finite
  batch size and runtime. No Resend key or service-role credential appears
  in any client bundle, fixture, commit, log, or screenshot.

### Template: invitation

- **Idempotency key:** the 006b invitation issuance's deterministic
  reference (the invitation row id plus a version/issuance ordinal, pinned
  against the merged 006b schema in the implementation plan) so re-issuing
  or re-sharing cannot enqueue unbounded duplicates.
- Content reproduces the 006c seven-field limited preview exactly — host
  display name, group name, occasion date, budget amount and currency,
  gifting mode, joined member count — plus one call-to-action button to
  `/invite/[opaqueToken]`.
- Token hygiene: the raw token appears only in the message body's link
  construction at send time. It is never persisted (the outbox payload
  stores the invitation reference, not the token), never logged, never
  echoed in analytics, and never included in error reports. The email uses
  `Referrer-Policy: no-referrer` semantics by linking only the canonical
  raw route and adds no tracking pixels or open tracking.
- The template renders the same generic fallback content for every
  invitation state; if the invitation is revoked/expired by the time the
  recipient clicks, 006c's single unavailable state handles it. The email
  never claims a membership outcome.

### Template: assignment (givers only)

- **Idempotency key:** `(group_id, draw_version, giver_id)` — exactly the
  008c assignment identity. A retried or replayed draw cannot re-notify; a
  redraw enqueues a new key for the new version.
- **Recipients:** the givers of the current draw version, each receiving
  exactly what `my_assignment` returns to them: their recipient's display
  name (with the established generic **Member** fallback) and the group
  name/occasion. Recipient ids are resolved at enqueue time from the same
  read predicate as `my_assignment`; no organizer or operator view is
  created to produce them.
- **Validity gating:** a giver whose current assignment reads
  `is_valid = false` (recipient departed after the draw) is **not** sent an
  assignment email naming the stale recipient. If the organiser's confirmed
  redraw (008c/008d) creates a new valid version, givers of that new
  version receive the template for it. The email for a giver never states
  anything about a recipient beyond what `my_assignment` lawfully shows
  that same giver.
- **Recipient-side silence is absolute:** no email of any template tells a
  person they are being gifted with, drawn for, reserved against, or
  checked off. The tombstone rule binds: after a mode change away from
  `secret_draw`, the enqueue query (which filters on the same
  current-version, current-generation read predicate as `my_assignment`)
  returns zero readable assignments, so a late worker finds nothing to
  send; switching the mode back and redrawing re-enqueues under the new
  version's key only.
- The email links to the assignment view route owned by 008d (if merged) or
  to the group room otherwise; it never embeds assignment data in the URL.

### Template: reminder

- **Idempotency key:** `(group_id, template_key, reminder_offset)` where
  `reminder_offset` is the bounded scheduled offset from the occasion date
  (v1: one reminder, a fixed number of days before the occasion date,
  decided in the implementation plan and recorded in the PR).
- Recipients: currently `joined` members of the active group only. Content:
  group name, occasion date, and a link to the group room. It contains **no**
  per-member progress, no reservation state, no checklist state, no
  assignment hints, no member-by-member nags — a member's own checklist or
  assignment is reachable through the linked app, never enumerated in the
  message.
- Reminders are enqueued by a bounded server-side scheduler keyed so that a
  rescheduled occasion date does not double-send (the idempotency key
  changes with the occasion date, and the scheduler re-derives due
  reminders from committed state, not from fired timers).

### Template design system

- Shared branded layout consistent with the 004b branded auth email:
  approved product nouns only (`wishlist`, `group`, never "Shelfie" or
  "Circle"), dominant single call to action, plain-text alternative for
  every template, and rendering that degrades without images. Loading,
  failure, and "not sent" states are maintainer-facing (outbox status),
  not invented end-user states.
- Template variables are escaped at render time; no user-supplied string
  (group name, display name) reaches an HTML context unescaped. Bounded
  length checks mirror the 005a/006a text bounds at render time.

### Delivery observability

- Maintainer-facing observability lives in **structured server logs and the
  Resend dashboard**, not PostHog: log lines use identifiers only (outbox
  id, template key, recipient **user id**, provider message id, coarse
  error category). No line ever contains a recipient address, raw token,
  secret URL (`/invite/[opaqueToken]`), email subject, or provider response
  body. Bounces and delivery failures surface through Resend's own
  dashboard/webhook feed as an owner-maintained integration; this slice
  requires only that the failure categories above are logged and that
  `failed_permanent` rows are enumerable by the maintainer.
- **No new analytics event.** The existing `invite_sent` event remains
  owned by 006b issuance (emitted when the organizer issues/shares, not
  when the email worker sends); email delivery success/failure is
  infrastructure state, not product analytics, and adding events for it
  would risk prohibited data (addresses) and contradict the tracking
  plan's small vocabulary. The tracking plan is untouched by this slice.
- An automated log-hygiene test scans a rendered send attempt (worker unit
  test with a stubbed Resend client) for synthetic address, token, and
  secret-URL markers, mirroring the 006c scan pattern.

## Non-goals

- **Production environment, domain, sender DNS, backups, and launch
  checklist are build-sequence Phase 8 item 4 and are explicitly out of
  scope** of the Phase 8 planning mission this brief belongs to; no brief
  for item 4 is drafted here.
- No digest, digest preferences, rich reminder preferences, push
  notifications, or in-app notification center (P1 backlog).
- No open/click tracking, no per-user email preferences UI, no unsubscribe
  flows (transactional-only in v1; the invitation/assignment/reminder
  emails are service messages for groups the user joined).
- No marketing or broadcast email of any kind.
- No production Supabase/Railway/Resend configuration. Staging delivery
  configuration is an owner-approved gate, conditional on the restored
  credential (below).
- No analytics events, tracking-plan change, Magic Patterns artifacts, or
  visual-baseline change (emails are not app screens; visual evidence is
  template renders in PR, not app screenshots).

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Outbox shape and isolation (pgTAP).** `private.email_outbox` matches
   this brief: columns, bounds, status enum, unique idempotency key,
   RESTRICT recipient FK, managed timestamps; REVOKE-then-exact-GRANT
   inventory proven for every role and overload; no client role can
   SELECT/INSERT/UPDATE/DELETE the table directly, including
   `service_role` through the application API; no RLS policy substitutes
   for the absent grant (both directions tested, per the 007c pattern).
2. **Enqueue atomicity and idempotency (pgTAP).** Enqueue commits only
   inside the caller's transaction (a forced rollback leaves no row);
   replaying an idempotency key performs no second write and returns the
   existing status; unknown template keys and disallowed payloads are
   generically rejected; payload allowlist tests enumerate every allowed
   key per template and reject all others, including any key that would
   carry an email address, token, or assignment identity.
3. **Claim and retry semantics (pgTAP + worker unit tests).** Concurrent
   claims via `FOR UPDATE SKIP LOCKED` never double-claim the same row;
   backoff respects `attempt_count`; the attempt bound transitions the row
   to `failed_permanent`; a crash between send and result commit produces
   at most one duplicate and never an unbounded retry (asserted by
   bounding, not by mocking time to infinity); `record_email_result`
   accepts only bounded categories and stores bounded identifiers.
4. **Invitation template (unit + render tests).** Renders exactly the
   seven-field preview plus the canonical raw-token CTA; the token appears
   only in the rendered body and is absent from the outbox row, logs, test
   artifacts, and error reports (automated scans); revoked/expiry states
   render no extra information; both HTML and plain-text alternatives
   render; escaping tests cover hostile group names and display names.
5. **Assignment template privacy (pgTAP + unit).** Enqueue for a committed
   draw enqueues exactly one email per current valid giver with the exact
   `my_assignment` content; a giver with `is_valid = false` receives no
   stale-recipient email; a recipient/organizer/outsider/pending/declined/
   left/removed member is never enqueued an assignment email; after a mode
   change away from `secret_draw` (008c tombstone bump) no worker can
   enqueue or send an assignment email from the stored rows; after a
   confirmed redraw, only the new version's givers are enqueued under the
   new idempotency key. Every negative case is asserted against a database
   state where the hidden assignment demonstrably exists.
6. **Reminder privacy and keying (pgTAP + unit).** Reminders enqueue for
   joined members only, with no per-member gifting/reservation/assignment
   content in any payload or rendered output (asserted by payload
   allowlist and render scan); rescheduling the occasion date re-keys the
   reminder rather than duplicating or suppressing it; departed members
   receive nothing.
7. **Delivery observability and log hygiene.** A worker run against a
   stubbed provider emits structured log lines containing only the allowed
   identifier fields; an automated scan over the full test-run log,
   outbox rows, and error reports finds no synthetic address, raw token,
   secret URL, subject, or provider body. No new PostHog event is emitted
   and the tracking plan is untouched (catalog test asserts the event
   set is unchanged).
8. **Fresh migration and CI.** A reset from committed migrations and seed
   succeeds; all existing pgTAP suites pass; `smoke.sql`'s public-table
   inventory is unchanged (the new table is private-schema; if the smoke
   assertion enumerates it, the change is a deliberate, recorded scoped
   amendment); `pnpm verify` and the CI database job pass on the exact
   head, including the new suites and any added package script with
   bounded `timeout-minutes`.
9. **Conditional live-delivery gate (staging, owner-dependent).** If and
   only if the owner has restored the staging Resend/SMTP credential
   (broken since 2026-09-29 — an explicit, tracked owner action item, never
   silently skipped): a synthetic invitation, assignment, and reminder send
   to synthetic staging inboxes is evidenced from the expected sender with
   token material redacted. Until restoration, the implementation PR ships
   with criteria 1–8 green, records the gate as blocked-on-owner in its
   evidence section, and no automated test is weakened or skipped as a
   substitute. The gate does not close merely because local/CI tests pass.

## Required proof

- pgTAP suites (positive, negative, privilege inventory, replay
  idempotency), worker unit tests with a stubbed Resend client, and the
  automated log/artifact hygiene scans, all on the exact reviewed head.
- Rendered HTML and plain-text evidence for all three templates with
  synthetic content and redacted token material.
- Rollback notes: reverting the slice drops `private.email_outbox` and its
  functions in dependency order; the new status enum value set is
  **permanent once added** (`ALTER TYPE ... DROP VALUE` does not exist in
  PostgreSQL) and would remain as harmless unused values, exactly as
  documented in 008c; reverting deletes queued-but-unsent emails
  irreversibly, so a revert is a deliberate, data-destroying gate, never a
  hotfix. No rollback path silently drops undelivered state.
- Confirmation that no Resend key, service-role credential, recipient
  address, raw token, or secret URL entered any commit, fixture, log,
  screenshot, or PR body.

## Dependencies

- 006a (private schema, audit posture, migration conventions), 006b
  (invitation issuance reference for the invitation idempotency key), 006c
  (raw-token route, preview fields, token hygiene precedent), and 008c
  (assignment identity `(group_id, draw_version, giver_id)`, `my_assignment`
  semantics, `is_valid`/null-recipient state, tombstone version bump) must
  be merged. 008d (assignment view) is consumed when present and worked
  around when not (group-room link fallback).
- 004b supplies the Resend delivery path and branded-auth precedent; the
  transactional (non-SMTP) Resend API is used for application email,
  keeping auth delivery on the existing SMTP path untouched.
- Planning may complete before these dependencies merge. Implementation
  cannot start until the approved exact brief commit is linked to its
  Linear issue and the dependencies above are complete.

## Analytics, security, and privacy

- No new analytics event and no tracking-plan change; delivery telemetry is
  maintainer-facing by design. `invite_sent` remains a 006b issuance-time
  event.
- Security logging uses identifiers and coarse categories only. The outbox
  treats recipient addresses as transient send-time lookups, tokens as
  body-only material, and assignment data as governed by the 008c secrecy
  boundary. Cache behavior for any preview render used in tests is
  `no-store`.

## Implementation plan and gates

1. Review the 006a/008c migration patterns and the 004b delivery
   documentation; implement the single forward migration (table, enum,
   functions, grants) with pgTAP suites.
2. Implement templates, the worker, and the enqueue call sites behind
   merged contracts; add unit tests, render tests, and hygiene scans.
3. Wire the CI database job step (bounded timeout) and package scripts;
   amend smoke inventory only if it enumerates private tables.
4. **Staging delivery gate:** owner-approved, conditional on credential
   restoration, staging resources only, with owner approval recorded. No
   production configuration of any kind.

## Planning status

Brief only. This document does not authorize implementation, migrations,
cloud changes, Linear state changes, or merge. The owner must approve the
exact commit and link it from the matching Linear issue first.

**Explicit owner action items:** (1) restore the staging Resend/SMTP
credential broken since 2026-09-29 or provide its replacement; (2) confirm
the v1 reminder offset (single fixed pre-occasion reminder proposed);
(3) confirm that transactional email has no unsubscribe requirement for
joined-member service messages in v1.
