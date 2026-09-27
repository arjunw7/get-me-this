# System design

## Constraints

- Hobby-scale launch with a single primary builder and agent-assisted development.
- Low operational complexity and low idle cost are more important than theoretical scale.
- India-born, globally usable product with multiple currencies and time zones.
- Privacy boundaries are core product behavior.
- Approved Magic Patterns design must remain visually recognizable.

## High-level architecture

```text
Browser
  │
  ▼
Next.js application on Railway
  ├── Server-rendered pages and route handlers
  ├── Authentication callback and intent validation
  ├── Product-link extraction
  ├── Transactional email orchestration
  └── Observability and health endpoint
  │
  ├──────────────► Resend
  │                 Auth SMTP + product email API
  │
  ├──────────────► PostHog
  │                 privacy-safe product events
  │                 feature flags + masked replay
  │
  └──────────────► Supabase
                    Auth
                    Postgres + RLS
                    Storage
                    reviewed database functions
```

Use one Railway web service for v1. Do not create microservices unless production evidence shows a separate scaling or reliability boundary.

## Application responsibilities

### Browser

- Render approved UI and optimistic states where safe.
- Hold only publishable Supabase configuration.
- Never receive service-role or Resend credentials.
- Never determine authorization solely from hidden UI.

### Next.js server

- Validate authentication callbacks and safe return intents.
- Perform product-link fetching and extraction.
- Send non-auth transactional emails through Resend.
- Execute narrowly privileged operations that cannot be safely expressed as direct client mutations.
- Apply input validation, timeouts, structured errors, and audit logging.

### Supabase

- Identity and sessions.
- Durable relational data.
- Storage for user-selected avatars and approved product snapshots where permitted.
- RLS for every exposed table.
- Transactional functions for draw generation and reservation conflicts.

### Resend

- Custom SMTP/delivery for Supabase authentication email.
- Transactional invitation, assignment, and reminder email from server-only code.
- Separate authentication and product-email sender identities where feasible.

### Railway

- Build and host the Next.js service.
- Provide staging and ephemeral PR previews.
- Store runtime secrets and expose health/deployment logs.

### PostHog

- Collect the small, versioned event vocabulary in `docs/analytics/tracking-plan.md`.
- Measure activation and critical funnels rather than raw click volume.
- Provide feature flags for controlled rollout; flags must not replace authorization.
- Use privacy-safe session replay with text inputs and sensitive elements masked.
- Never receive email addresses, product names, product URLs, wishlist notes, invitation tokens, private assignments, or reservation details.

### Linear

Linear is the execution control plane, not a runtime dependency. Issues mirror the repository-owned briefs and link to the pull request, preview, evidence, and release. Product rules, architecture, and acceptance criteria remain versioned in Git so an issue edit cannot silently redefine shipped behavior.

## Data access

Prefer server components and server actions/route handlers for application data. Requests use the authenticated user's session so RLS remains effective. Service-role access is exceptional, server-only, narrowly scoped, and prohibited for ordinary CRUD.

Sensitive multi-row operations use reviewed Postgres functions:

- Generate or replace a draw atomically.
- Reserve or release an item with conflict protection.
- Accept an invitation and create membership atomically.

## Environments

### Local

- Local Next.js and local Supabase.
- Seeded deterministic users/groups for tests and visual fixtures.
- Mail capture for auth-email tests where practical.
- PostHog disabled by default; analytics adapter test mode records events locally.

### Staging

- Dedicated Supabase staging project.
- Railway staging service and PR previews.
- Synthetic accounts and non-sensitive data only.
- Separate PostHog environment or project with synthetic analytics data.

### Production

- Separate Supabase project and Railway environment.
- Production Resend domain/keys.
- Production PostHog key and approved data-hosting configuration.
- Schema changes deployed only from committed migrations after staging verification.

## Reliability

- Product-link extraction has strict timeouts and manual fallback.
- Email send failures are retryable and observable but do not corrupt core data.
- Draws and reservations are atomic.
- Idempotency keys protect invitation acceptance, draw requests, and email-trigger endpoints.
- A `/health` endpoint checks application liveness without exposing dependency secrets.

## What to revisit with growth

- A job queue for reminders and slow extraction.
- Dedicated metadata extraction workers.
- Supabase branching per preview environment.
- CDN/image-proxy strategy.
- More advanced observability and incident response.
- Read replicas or caching only after measured need.
