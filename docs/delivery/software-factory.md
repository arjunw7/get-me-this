# Software factory operating model

## Systems of record

| System | Owns | Must not own |
| --- | --- | --- |
| Magic Patterns | Approved visual intent and interaction reference | Production code or business rules |
| GitHub repository | Product rules, architecture, issue briefs, code, migrations, tests, and release history | Informal status tracking |
| Linear | Priorities, status, assignment, milestones, and links to execution evidence | A divergent copy of acceptance criteria |
| Factory | One-issue implementation and automated review on an isolated branch | Product decisions or simultaneous edits to another tool's branch |
| Cursor | Focused local inspection, debugging, and acceptance review | Unreviewed broad rewrites |
| Railway | Pull-request previews, staging, production, and runtime logs | Durable product specifications |
| Supabase | Identity, durable data, storage, and database authorization | Frontend-only authorization decisions |
| Resend | Authentication and transactional email delivery | Application state |
| PostHog | Privacy-safe behavioral evidence, funnels, replay, and feature flags | Sensitive content or authorization |

## Unit of work

Every implementation begins with a repository brief and a matching Linear issue. The repository brief is binding when the two disagree.

Broad phase briefs are parent trackers, not implementation units. A parent tracker may summarize an exit gate, but Factory receives only a child issue that can be implemented and reviewed in one focused pull request.

Each issue must contain or link:

1. Outcome and scope.
2. Explicit non-goals.
3. Acceptance criteria, including negative cases.
4. Required automated and manual proof.
5. Design routes, states, and comparison viewports.
6. Analytics events affected.
7. Security and privacy considerations.

## Rolling-wave planning

- Keep the complete V1 sequence in `docs/delivery/backlog.md` and the phase exit gates in `docs/delivery/build-sequence.md`.
- Detail only the current phase and the immediately following phase. Later work remains directional until earlier technical and product evidence exists.
- Maintain three to six approved child briefs ahead of execution, but allow only one issue to be `In progress` during the first three phases.
- The product owner approves a repository brief before its Linear issue moves to `Todo` (the current workspace's ready-equivalent).
- At each phase exit, review accepted differences, technical discoveries, delivery evidence, and scope before expanding the next phase.
- Factory does not create, split, reprioritize, or broaden issues. Those decisions belong to the product owner and orchestrator.

## Workflow

1. **Ready:** product owner approves the repository brief; the Linear issue links its exact commit. Until a dedicated `Ready` state exists, use `Todo` as the ready-equivalent.
2. **In progress:** one implementation tool owns one isolated branch.
3. **In review:** a focused pull request includes passing CI, Railway preview, screenshots, and verification notes.
4. **Acceptance:** Cursor or a separate review pass checks the brief; the product owner checks behavior and the Magic Patterns comparison.
5. **Done:** merged, deployed to the intended environment, smoke-tested, and observed in PostHog when analytics applies.

Do not move work to Done because code was generated, a build passed, or a preview exists. The evidence in `definition-of-done.md` controls completion.

## Branch and pull-request rules

- `main` is releasable and protected after the foundation checkpoint.
- One issue per branch; use a short prefix such as `foundation/`, `auth/`, `wishlist/`, or `groups/`.
- Keep pull requests independently reversible and small enough to review in one sitting.
- No two tools edit the same branch concurrently.
- Database changes include migrations and authorization tests in the same pull request as the behavior that needs them.
- Feature flags may control rollout, but never provide security or authorization.

## Linear setup

Create one project named **Get Me This — V1 Launch** with milestones matching the phases in `build-sequence.md`. Use these workflow states:

- Backlog
- Ready
- In progress
- In review
- Acceptance
- Done
- Cancelled

Recommended labels: `foundation`, `design`, `auth`, `wishlist`, `groups`, `gifting`, `analytics`, `security`, `accessibility`, and `launch`.

Create Linear issues from `docs/delivery/issues/` only after the corresponding brief is approved. Preserve the repository path in every issue.

## Release evidence

For every release candidate, preserve:

- Commit and deployment identifier.
- Migration set and forward-fix plan.
- CI result and security findings.
- Railway smoke-test result.
- Approved visual comparisons.
- PostHog activation/funnel sanity check using synthetic accounts.
- Known limitations and rollback decision owner.
