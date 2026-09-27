# Build sequence

Each phase produces reviewable vertical slices. Do not begin a later product phase while the preceding foundation is unverified.

## Phase 0 — source-of-truth pack

- Review and approve this Production Build Pack.
- Export the final Magic Patterns project into a non-production reference location.
- Capture approved mobile and desktop screenshots from `https://project-agile-otter-357.magicpatterns.app/` for every route/state.
- Complete `docs/design-reference/route-map.md` and freeze the Version 18 visual baselines.
- Resolve blocking decisions required for scaffolding.
- Create the Linear project and mirror the first approved issue briefs without changing their repository-owned acceptance criteria.
- Approve the initial PostHog tracking plan and privacy exclusions.

Exit: product scope, architecture, terminology, routes, permissions, and Definition of Done are approved.

## Phase 1 — repository foundation

1. Scaffold Next.js, strict TypeScript, pnpm, linting, formatting, and production build.
2. Add semantic design tokens, fonts, base layout, and accessible primitives.
3. Add Vitest, React Testing Library, Playwright, accessibility checks, and visual baselines.
4. Initialize local Supabase, migrations, seeds, and pgTAP test command.
5. Add GitHub CI and Railway configuration/health endpoint.
6. Add a typed analytics adapter, PostHog provider, consent/privacy defaults, and development test sink.

Exit: a trivial reference page passes `pnpm verify` locally and in CI, and deploys to a Railway preview.

## Phase 2 — static fidelity pilot

1. Implement landing page from the approved design.
2. Implement static email entry, verification, confirmation, and onboarding screens.
3. Implement responsive public layout and visual tests.

No real authentication yet.

Exit: the first visual slice receives explicit approval. This validates the agent instructions and screenshot-review workflow before backend work.

## Phase 3 — identity vertical slice

1. Profiles migration, RLS, and tests.
2. Supabase email auth with OTP and magic link.
3. Resend authentication delivery configuration.
4. Intent-preserving redirects, protected routes, onboarding, session restoration, and logout.

Exit: new and returning users complete the full email flow in staging.

## Phase 4 — persistent wishlist

1. Wishlist/item migrations, RLS, seed data, and tests.
2. Wishlist display, empty state, item editing, deletion, and reordering.
3. Manual item creation.
4. Product-link extraction and manual fallback.
5. Price/original-currency behavior.

Exit: a user can maintain a real persistent wishlist without group functionality.

## Phase 5 — groups and invitations

1. Groups, membership, invitation, and audit migrations with RLS tests.
2. Group creation flow.
3. Signed-out invitation preview and intent-preserving join.
4. Member and pending states.
5. Browse member wishlists.

Exit: four seeded users can join and browse a private group without leaking data to a fifth user.

## Phase 6 — coordination and social layer

1. Reactions and read-only owner summaries.
2. Copy to own wishlist.
3. Atomic private reservations with race tests.
4. Activity summaries that never leak private gifting state.

Exit: reactions and reservations behave correctly across owner, giver, member, and outsider roles.

## Phase 7 — gifting modes

1. Share-wishlists-only mode.
2. Gift-everyone checklists.
3. Transactional secret-draw algorithm and tests.
4. Assignment view, viewed state, redraw confirmation/audit, and member-leaves handling.

Exit: all three modes pass deterministic invariants and privacy tests.

## Phase 8 — communication and launch hardening

1. Invitation, assignment, and reminder email templates.
2. Idempotency, retry, and delivery observability.
3. Rate limiting, free/low-cost CAPTCHA selection, and abuse controls.
4. Production environment, domain, sender DNS, backups, and launch checklist.
5. Accessibility, performance, security, and recovery review.

Exit: launch candidate passes the full Definition of Done and a manual rehearsal with a real test group.

## Agent operating model

- Factory implements one approved issue on an isolated branch and opens a pull request.
- CI supplies deterministic evidence.
- Factory automated review/security review provides an independent pass.
- Cursor is used for local inspection, focused debugging, and a separate acceptance-criteria review.
- The product owner reviews the Railway preview and approves visual/behavioral outcomes.
- No two tools make concurrent edits on the same branch.
- Linear status follows branch and pull-request evidence; it does not substitute for repository acceptance criteria.
- PostHog events are introduced only through the typed event catalog and reviewed for sensitive data before merge.
