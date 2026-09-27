# Get Me This

Production repository for **Get Me This**, a playful, private group-wishlist app.

The product specification, design contract, architecture, security rules, and delivery plan live in this repository so that human contributors, Cursor, and Factory work from the same source of truth.

## Foundation setup

Requirements:

- Node.js 24.21.0, as pinned in `.nvmrc`
- pnpm 10.28.0, as pinned in `package.json`

From a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the deterministic design foundation fixture.

Run the complete foundation verification command before opening a pull request:

```bash
pnpm verify
```

The verification command runs formatting checks, linting, strict TypeScript checking, unit tests, and the production build. Individual commands are also available as `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Test and visual-proof harness

Unit and component tests run with Vitest and React Testing Library (`pnpm test`). Component tests run in jsdom; the filesystem-based token and style tests explicitly keep the Node environment.

Browser checks run through Playwright (Chromium only) against the production build served on port 3100, at the two approved viewports: mobile 390×844 and desktop 1440×1000. Install the browser once per machine:

```bash
pnpm exec playwright install chromium
```

- `pnpm test:e2e` — renders the deterministic fixture route and runs axe accessibility checks at both viewports, including proof that a known injected violation is detected and clears after removal.
- `pnpm test:visual` — full-page screenshot comparison of the fixture against the committed baselines. Baselines live in [`tests/visual/baselines/`](tests/visual/baselines/), guarded by a SHA-256 manifest; see [`docs/delivery/visual-baselines.md`](docs/delivery/visual-baselines.md) for the reviewed creation and update workflow. Agents never update baselines to make a test pass.
- `pnpm test:db` — runs the pgTAP database suites in [`supabase/tests/`](supabase/tests/) against the local Supabase database (`supabase test db --local`). It requires the local stack; see [Local Supabase](#local-supabase) below.

Browser checks are deliberately not part of `pnpm verify` so verification stays usable on machines without installed browsers; CI composition is a later issue. On failure, Playwright preserves an HTML report in `playwright-report/` and artifacts in `test-results/` (both gitignored).

## Design foundation

Semantic design tokens live in [`app/tokens.css`](app/tokens.css) and are the single source of truth for colour, typography, spacing, radii, outline weight, elevation, and motion. They are registered in the Tailwind v4 theme, so utilities such as `bg-surface-page`, `text-content-muted`, `rounded-surface`, and `shadow-chunk` are generated from them. No other production source file may declare a raw colour value, and a unit test enforces that rule.

Interface primitives live in [`src/ui`](src/ui): `Button`, `TextField`, `TextAreaField`, `TextLink`, and `Surface`. Class composition is kept in pure functions in `src/ui/styles.ts` so every variant and state is testable without a DOM. Primitives do not accept `className`, `style`, or raw HTML.

Typefaces are vendored locally under [`app/fonts`](app/fonts/README.md) with their SIL Open Font License texts and checksums; the application never requests fonts at runtime.

The route at `/` is a deterministic component fixture, not a product page. It renders the type scale, colour swatches, every button variant and state, field states including error and disabled, links, surface elevations, and the responsive gutter behaviour.

## Local Supabase

Database work uses a local Supabase stack. It requires Docker (Desktop or Engine)
to be installed and running; nothing in this repository links to or mutates a
hosted Supabase project.

```bash
pnpm db:start   # start the local stack in Docker
pnpm db:reset   # rebuild the local database from committed migrations, then seed
pnpm db:seed    # apply supabase/seed.sql to a running stack without resetting
pnpm test:db    # run the pgTAP suites in supabase/tests/ locally
pnpm db:status  # print local URLs and ports (contains local credentials)
pnpm db:stop    # stop the stack
```

`pnpm db:reset` applies `supabase/seed.sql` automatically, so the seed does not
need a separate command after a reset. The seed is currently a non-persistent
placeholder that writes no rows.

`pnpm verify` deliberately does not touch Supabase: it runs formatting checks,
linting, strict TypeScript checking, unit tests, and the production build, and it
stays usable on a machine with no Docker daemon, no running stack, and no
environment variables. Database verification is the separate, explicit
`pnpm test:db` command. Without Docker, the database commands exit non-zero with
an explanatory message instead of silently substituting another check.

Migration rules, forward-fix guidance, and environment-variable classification
are documented in [`supabase/README.md`](supabase/README.md).

## Continuous integration and Railway previews

Every pull request runs the [`CI` workflow](.github/workflows/ci.yml) on
GitHub: `pnpm install --frozen-lockfile` followed by the same `pnpm verify`
command used locally, from a clean `ubuntu-24.04` environment. A failing
verification command fails the check. Making the check a required merge gate
on `main` needs GitHub branch protection or rulesets, which this private
repository currently cannot configure (the API returns 403 without a plan
that supports them); until that changes, merging to `main` is gated by
explicit human review with green CI as a review input — a deliberate,
temporary manual-review exception, to be replaced by the required check as
soon as branch protection becomes available. Superseded pull-request runs
are canceled automatically;
runs for direct pushes to `main` always run to completion.

Merged foundation slices also deploy to a Railway preview per pull request.
Previews are ephemeral staging deployments that wait for the green CI check and
are destroyed when the pull request closes or merges. The `/health` endpoint
returns exactly `{"status":"ok"}` as the deployment liveness signal. Required
external Railway setup, environment-variable classification, and the
no-write-access verification steps are documented in
[`docs/ops/railway-previews.md`](docs/ops/railway-previews.md).

## Environment

Copy `.env.example` to `.env.local` when local configuration is needed. The
design foundation fixture does not require environment variables, network
access, or service credentials.

`.env.example` separates values that may reach browser code (`NEXT_PUBLIC_*`)
from server-only credentials such as `RESEND_API_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`. Server-only values must never be exposed to browser
code, committed, or captured in logs, fixtures, or screenshots. Local Supabase
values come from `pnpm db:status` and are never committed.

The PostHog public values (`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`,
`NEXT_PUBLIC_POSTHOG_HOST`) activate the typed analytics boundary
([`src/analytics`](src/analytics)); without them analytics is completely
inert. See [`docs/analytics/enabling-posthog.md`](docs/analytics/enabling-posthog.md)
for the staging and production enablement boundary.

Start with:

1. [`docs/product/product-spec.md`](docs/product/product-spec.md)
2. [`DESIGN.md`](DESIGN.md)
3. [`docs/architecture/system-design.md`](docs/architecture/system-design.md)
4. [`docs/delivery/build-sequence.md`](docs/delivery/build-sequence.md)
5. [`AGENTS.md`](AGENTS.md)

Delivery and measurement:

- [`docs/delivery/software-factory.md`](docs/delivery/software-factory.md)
- [`docs/analytics/tracking-plan.md`](docs/analytics/tracking-plan.md)
- [`docs/delivery/issues/`](docs/delivery/issues/)

The application foundation is intentionally smaller than the final product. Product behavior, authentication, database access, analytics, and final design primitives will be added in later approved issues.
