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

## Design foundation

Semantic design tokens live in [`app/tokens.css`](app/tokens.css) and are the single source of truth for colour, typography, spacing, radii, outline weight, elevation, and motion. They are registered in the Tailwind v4 theme, so utilities such as `bg-surface-page`, `text-content-muted`, `rounded-surface`, and `shadow-chunk` are generated from them. No other production source file may declare a raw colour value, and a unit test enforces that rule.

Interface primitives live in [`src/ui`](src/ui): `Button`, `TextField`, `TextAreaField`, `TextLink`, and `Surface`. Class composition is kept in pure functions in `src/ui/styles.ts` so every variant and state is testable without a DOM. Primitives do not accept `className`, `style`, or raw HTML.

Typefaces are vendored locally under [`app/fonts`](app/fonts/README.md) with their SIL Open Font License texts and checksums; the application never requests fonts at runtime.

The route at `/` is a deterministic component fixture, not a product page. It renders the type scale, colour swatches, every button variant and state, field states including error and disabled, links, surface elevations, and the responsive gutter behaviour.

## Environment

Copy `.env.example` to `.env.local` when local configuration is needed. The design foundation fixture does not require environment variables, network access, or service credentials. `RESEND_API_KEY` is server-only and must never be exposed to browser code.

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
