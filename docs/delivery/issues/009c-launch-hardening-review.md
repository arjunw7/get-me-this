# 009c — Accessibility, performance, security, and recovery review

## Outcome

Phase 8's hardening review: a systematic, evidence-producing audit of the
whole application against the repository's own binding standards — the
DESIGN.md interaction principles, the permissions matrix's required negative
tests, the Definition of Done, and the privacy contracts of every merged
brief — culminating in a review report whose findings are either fixed in
place (within this slice's scope) or filed as discrete, scoped follow-ups.
The review covers accessibility, performance, security, and recovery as four
named checklists with per-item evidence, so a launch candidate can be
assessed honestly rather than asserted.

This is a **review brief**: it produces evidence, findings, and minimal
in-place remediation. It introduces no feature, no schema change, no new
dependency, and no analytics event. Where remediation would require a schema
change or a contract change to a merged brief, the finding is filed, not
fixed.

## Scope

Four checklists, each with numbered items, a verification method, and an
evidence artifact. The implementation PR copies the checklists and marks
every item **Pass**, **Fixed in this PR** (with evidence), or **Filed
follow-up** (with the finding reference) — never **Skipped**.

### Checklist A — Accessibility (authority: DESIGN.md interaction principles)

- Touch targets at least 44 by 44 CSS pixels on every interactive control at
  both approved viewports, including the 006d/006e/007/008 surfaces shipped
  later than the original per-slice reviews (reserve/release, reactions,
  checklists, assignment view, organizer controls).
- Keyboard operability of every flow end to end: landing → auth →
  onboarding → wishlist → group → browse → react/reserve → checklist or
  assignment, with visible focus at every step (automated axe runs plus a
  recorded manual keyboard walkthrough per flow).
- Designed loading, empty, success, and failure states everywhere — no
  browser-default states; destructive and surprising actions (release,
  leave, redraw, logout, delete) always require confirmation.
- Reduced-motion support verified against the design contract's motion
  inventory; screen-reader announcements on every async state change
  (reservation outcome, reaction, save, delivery of auth states).
- Persistent labels on every form field (placeholders are examples, not
  labels); honest private-information explanations ("who can and cannot see
  this") present on every surface that shows private state.
- Horizontal product rows settle aligned with the page gutter after
  scrolling.
- Evidence: axe results at 390 by 844 and 1440 by 1000 for every route, the
  keyboard walkthrough recordings, and a findings register.

### Checklist B — Performance (authority: Definition of Done and system design)

- Route-level budgets recorded and met per user-facing route: server
  response for the protected routes, interaction latency for the primary
  actions (add/edit/reorder item, react, reserve, checklist toggle),
  measured with the existing Playwright/Vitest harness on deterministic
  fixtures, not sampled from ad-hoc manual runs.
- One-statement snapshot discipline re-verified: every read surface that
  must not straddle a concurrent membership change (006e browse, 007c/008c
  projections, 007d activity) demonstrably still executes as a single SQL
  statement sharing one statement snapshot (pgTAP plan/behavior checks
  re-run, not assumed from the merged briefs).
- No client bundle contains server-only material: automated scan proving
  no service-role client, Resend key, continuation-cookie secret, or
  outbox module is imported into any client component; bundle analysis
  attached.
- Image handling: snapshots/signature imagery load through the established
  short-expiry signed-URL path with stable dimensions (no layout shift
  sources introduced by later slices); long lists paginate or virtualize
  within the agreed item bounds.
- Evidence: measurement transcripts, bundle analysis, and the findings
  register.

### Checklist C — Security (authority: permissions matrix and merged briefs)

- Re-run the permissions matrix's **required negative tests in full** as a
  single consolidated suite executed on the final head: non-member
  enumeration denial, post-leave/removal denial, recipient inference
  resistance across tables/counts/activity/APIs/emails/errors, organizer
  non-omniscience (assignments and reservations), own-item reservation
  denial, cross-group reaction/reserve denial, invitation-token guessing
  revealing nothing, expired/revoked tokens creating nothing, and
  public-credential denial of service-role operations.
- **008c secrecy re-verification:** with a committed draw demonstrably in
  the database, no surface, projection, error, email, log, or analytics
  payload exposes any assignment beyond the giver's own; after a mode
  change away from `secret_draw`, the stored rows are client-unreachable;
  a redraw restores readability exactly per the tombstone contract.
- **007c owner-blindness re-verification:** with active reservations
  demonstrably present, the owner's wishlist views are byte-identical to
  the no-reservation case, and no reaction-activity surface leaks
  reservation state (007d filtering).
- **006c token hygiene re-verification:** automated scans over logs,
  analytics sink, DOM, browser storage, and PR-visible artifacts find no
  raw token, secret URL, continuation secret, or address.
- Secrets inventory: every environment variable consumed by the
  application is enumerated, classified (server-only vs public-by-design),
  and proven absent from client bundles; no credential appears in any
  commit, fixture, log, or screenshot.
- Findings that would require weakening RLS or altering a merged contract
  are filed, never applied. The repository rule stands: RLS is never
  weakened to make a feature work.
- Evidence: the consolidated suite run, scan outputs, the secrets
  inventory, and the findings register.

### Checklist D — Recovery (authority: Definition of Done and merged briefs' rollback notes)

- **Rollback-note validation:** for every merged brief that shipped a
  migration or destructive-capable change (005a, 006a, 006c, 007c, 008a,
  008b, 008c, 009a), re-walk its rollback notes against the actual
  committed migrations and confirm they are still executable as written
  (including the permanent-enum-value caveats from 008c/009a and the
  forward-fix-only paths); discrepancies are findings.
- **Failure-recovery drills (local/staging only, never production):**
  - a lost-response acceptance (006c) recovers to the honest joined state;
  - a failed email send (009a) transitions through bounded retries to
    `failed_permanent` with identifiers-only logging and is re-sendable by
    the maintainer path;
  - a rate-limited surface (009b) recovers at the next window with no
    stuck state;
  - a race-harness failure simulation (intentionally broken assertion,
    shown once) fails CI as designed.
- **Restore-path rehearsal** is documented as a procedure only; execution
  against backups belongs to Phase 8 item 4 (production, backups, launch
  checklist) and is explicitly out of scope here.
- Evidence: drill transcripts with bounded runtimes and no credential
  material, and the findings register.

### Findings register and remediation boundary

- One consolidated findings register (a PR-visible markdown table in the
  evidence directory) lists every finding with severity, checklist, exact
  evidence, and disposition: **Fixed in this PR** (only if the fix is
  within an existing slice's contract — e.g. a missing confirmation, a
  focus bug, an unbounded query), or **Filed follow-up** (any fix requiring
  a schema change, a contract change, a new dependency, or a visual
  baseline change).
- No finding may be closed by weakening a test, a contract, or RLS; no
  visual baseline changes without explicit product/design approval; no
  agent may approve its own baseline change.

## Non-goals

- **Phase 8 item 4 — production environment, domain, sender DNS, backups,
  launch checklist — is explicitly out of scope** of this planning mission;
  the launch checklist itself is item 4's deliverable, and no brief is
  drafted for it here.
- No feature work, no schema change, no new dependency, no analytics
  event, no tracking-plan change, no Magic Patterns artifact.
- No production or staging resource mutation; all drills run locally or on
  the existing staging project with synthetic data.
- No re-implementation of merged briefs' contracts; they are re-verified,
  not revised.

## Acceptance criteria

The implementation pull request copies these criteria and marks every item
with exact evidence.

1. **Checklist A executed.** Every accessibility item verified at both
   approved viewports with axe output, keyboard walkthroughs, and
   reduced-motion/announcement evidence; every finding dispositioned in
   the register; any fixed item carries before/after evidence.
2. **Checklist B executed.** Performance budgets recorded and met on
   deterministic fixtures; the one-statement snapshot discipline re-proven
   by re-run pgTAP checks for every snapshot-bound projection; the
   client-bundle scan is clean; findings dispositioned.
3. **Checklist C executed.** The consolidated permissions-matrix negative
   suite passes on the exact head; the 008c secrecy, 007c owner-blindness,
   and 006c token-hygiene re-verifications pass with hidden state
   demonstrably present during the tests; the secrets inventory is
   complete and clean; findings dispositioned.
4. **Checklist D executed.** Every applicable rollback note re-walked and
   validated or findinged; the four local/staging recovery drills
   completed with transcripts; the backup/restore rehearsal documented as
   a procedure with its item-4 boundary stated; findings dispositioned.
5. **Findings register complete.** Every finding has severity, evidence,
   and a disposition within the remediation boundary; no disposition
   weakens a test, contract, or RLS; every follow-up is filed as a scoped
   future brief reference, not a TODO in code.
6. **No regression and no scope creep.** `pnpm verify`, all existing
   suites and race harnesses pass unchanged on the exact head; the diff
   contains review code, fixes within existing contracts, and evidence
   only — no schema change, dependency, event, or baseline change.
7. **Conditional staging evidence.** Any staging-based drill requiring
   working email or CAPTCHA credentials is **conditional on the owner
   restoring the staging credentials (broken since 2026-09-29)** and is
   recorded as blocked-on-owner when unavailable — an explicit owner
   action item, never silently skipped, and never a reason to weaken the
   local automated equivalents, which must pass regardless.

## Required proof

- The four completed checklists with per-item evidence links, the findings
  register, the consolidated negative-suite transcript, drill transcripts,
  and scan outputs — all on the exact reviewed head, containing no
  credential, token, address, or secret-URL material.
- This brief produces no visual-baseline candidates; route evidence uses
  existing approved baselines, and any proposed baseline change is a filed
  follow-up requiring product/design approval.

## Dependencies

- All Phase 4–7 briefs and the 009a/009b briefs should be merged before
  implementation; the review is meaningless against a partial application.
  Planning completes now; implementation is gated on the approved exact
  brief commit linked to its Linear issue plus the dependency completion.
- Consumes, without modifying: DESIGN.md, the permissions matrix,
  `docs/delivery/definition-of-done.md`, and the contracts of 006c, 007c,
  008c, 009a, and 009b as quoted in the checklists.

## Analytics, security, and privacy

No new analytics event and no tracking-plan change; the review's own
telemetry is the PR evidence. All review activity observes the secrets and
logging rules (identifiers, not raw tokens, addresses, or secret URLs).

## Implementation plan and gates

1. Freeze the checklist versions against the merged head; build the
   consolidated negative suite from the permissions matrix and merged
   brief criteria.
2. Execute checklists A–D in order, remediating in place where within
   contract, and maintaining the findings register continuously.
3. Complete the register, attach all evidence, and file follow-ups for
   everything outside the remediation boundary.

## Planning status

Brief only. No implementation, drill, cloud change, Linear change, or merge
is authorized by this document.

**Explicit owner action items:** (1) restore staging credentials (broken
since 2026-09-29) to unblock the conditional staging drills; (2) confirm
the remediation boundary (in-contract fixes vs file-everything) before the
review executes; (3) note that the launch checklist and restore rehearsal
execution belong to Phase 8 item 4, which this planning mission excludes.
