#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Explicit empty values must win over any developer or repository dotenv file.
export NEXT_PUBLIC_SUPABASE_URL=''
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=''
export SUPABASE_SERVICE_ROLE_KEY=''
export AUTH_LINK_COOKIE_SECRET=''
export E2E_MAILPIT_URL=''
export E2E_LOCAL_SUPABASE=''
export E2E_WISHLIST_CONTROL_URL=''
export E2E_WISHLIST_CONTROL_TOKEN=''
export E2E_ACTION_REFERENCE=1
export E2E_NO_PROVIDER=1
export SEO_INDEXING_ENABLED=false

pnpm build
# The public landing journey includes the explicit no-provider auth recovery
# state. Keep it here rather than in the configured-Supabase stack suite.
pnpm exec playwright test \
  tests/e2e/wishlist-items-no-provider.spec.ts \
  tests/e2e/landing.spec.ts \
  tests/e2e/seo.spec.ts \
  tests/e2e/how-it-works.spec.ts \
  tests/e2e/search-guides.spec.ts \
  tests/visual/landing.visual.spec.ts
