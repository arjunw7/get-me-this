# Repository guide

## Product

Get Me This is a private, persistent group-wishlist product for young friend groups. Users save things they want, create occasion-based groups, browse friends' wishlists, react to items, coordinate gifting, and reserve gifts without revealing the surprise to the recipient.

The approved visual prototype is Magic Patterns Version 18:
https://magicpatterns.com/c/6mqikx9odrcmu2eke7g6bs

The deployed comparison target is:
https://project-agile-otter-357.magicpatterns.app/

Read these before changing behavior or UI:

1. `docs/product/product-spec.md`
2. `docs/product/scope-v1.md`
3. `DESIGN.md`
4. The relevant document in `docs/flows/`
5. `docs/architecture/permissions-matrix.md` for any data-access change

## Current stage

The repository is in the documentation and foundation stage. Do not scaffold the application, add dependencies, or create production infrastructure unless the active issue explicitly requests it.

## Intended stack

- Next.js App Router with strict TypeScript
- pnpm
- Tailwind CSS with semantic Get Me This design tokens
- Supabase Auth, Postgres, Storage, migrations, and Row Level Security
- Resend for authentication delivery and transactional email
- Railway for the web service and PR preview environments
- Vitest and React Testing Library for unit/component tests
- Playwright for end-to-end, accessibility, and visual-regression tests

## Expected commands after foundation scaffolding

- Install: `pnpm install --frozen-lockfile`
- Develop: `pnpm dev`
- Lint: `pnpm lint`
- Type-check: `pnpm typecheck`
- Unit tests: `pnpm test`
- Database tests: `pnpm test:db`
- End-to-end tests: `pnpm test:e2e`
- Visual tests: `pnpm test:visual`
- Build: `pnpm build`
- Full verification: `pnpm verify`

If a command is not implemented yet, do not silently substitute another command. Implement it only when the active issue includes that foundation work.

## Working rules

- Work on one bounded issue and one branch at a time.
- Preserve the approved behavior and terminology. Do not introduce “Shelfie” or “Circle” as user-visible product nouns.
- Treat Magic Patterns as a design specification, not production code. Do not copy its Vite scaffolding, mock data, contexts, routing, or preview plumbing into the application.
- Prefer small modules, server-side data access, explicit types, and semantic design tokens.
- Do not introduce a new dependency unless the current stack cannot reasonably solve the problem. Explain the need in the pull request.
- Do not put service-role credentials, Resend keys, or other secrets in client bundles, fixtures, commits, logs, or screenshots.
- Database changes must be migrations committed with matching RLS and database tests.
- Do not weaken RLS to make a feature work. Fix the policy or move narrowly privileged behavior to a reviewed server-side function.
- Never let wishlist recipients see reservations, purchase progress, or private gifting assignments about themselves.
- Link extraction must fail safely into editable manual entry.
- Converted prices are approximate; original currency and price remain available.
- No agent may update visual baselines merely to make CI pass. Baseline changes require explicit product/design approval.
- UI work must be compared at the same route, viewport, content fixture, and interaction state against the deployed prototype or the approved frozen screenshot. A different viewport or data state is not valid visual evidence.
- Keep changes scoped. Any new requirement must remove scope, extend the timeline, or be placed in the parking lot.

## Required proof before completion

Every implementation pull request must include:

1. Acceptance criteria copied from the issue and marked with evidence.
2. Relevant automated tests, including negative authorization tests where applicable.
3. `pnpm verify` passing, or a precise explanation of any unavailable check.
4. Before/after screenshots for changed UI at desktop and mobile widths.
5. A Railway preview URL when preview deployment is available.
6. Migration and rollback notes for schema changes.
7. Confirmation that no Magic Patterns mock data or editor artifacts were shipped.

## Pull-request boundaries

- Prefer one user-visible vertical slice per pull request.
- Avoid combining schema redesign, visual redesign, and unrelated refactoring.
- Generated pull requests are proposals. They require independent review before merge.
- Do not merge directly to `main` without green CI on the exact pull-request head and explicit human approval.
- Temporary exception: this private repository cannot currently configure a GitHub-required status check (branch protection and rulesets return 403), so GitHub cannot enforce the check at merge time; green CI is verified as a review input and the human approval is the merge gate. Replace this exception with the GitHub-required check as soon as it becomes available.

## Safety

- Do not run destructive database, git, cloud, or filesystem operations without explicit approval.
- Do not modify production Supabase or Railway resources from local development tasks.
- Use local Supabase for automated tests and a dedicated staging project for shared previews.
- Log sensitive failures using identifiers, not raw tokens, email contents, or secret URLs.
