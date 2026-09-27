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

Open [http://localhost:3000](http://localhost:3000) to view the deterministic foundation reference route.

Run the complete foundation verification command before opening a pull request:

```bash
pnpm verify
```

The verification command runs formatting checks, linting, strict TypeScript checking, unit tests, and the production build. Individual commands are also available as `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Environment

Copy `.env.example` to `.env.local` when local configuration is needed. The foundation reference route does not require environment variables, network access, or service credentials. `RESEND_API_KEY` is server-only and must never be exposed to browser code.

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
