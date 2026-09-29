#!/usr/bin/env bash
#
# Local Mailpit-backed end-to-end proof for the real email-code flow (004c).
#
# Builds the app against the LOCAL Supabase stack (pnpm db:start) and runs
# tests/e2e/auth-otp.spec.ts: request a code, read it from the local Mailpit
# inbox, verify, exercise sign-out and every safe failure path. The local
# stack's publishable key is a local development fixture; it is parsed
# silently and never printed, logged, or committed.
#
# Requires Docker and a running local stack. Plain `pnpm test:e2e` (fixture
# suite) does not need any of this and skips the auth-flow specs.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! pnpm exec supabase status -o json > /tmp/gmt-supabase-status.json 2>/dev/null; then
  echo "error: the local Supabase stack is not running; run 'pnpm db:start' first." >&2
  exit 1
fi

# Export the local configuration without echoing any credential material.
export NEXT_PUBLIC_SUPABASE_URL="$(node -e '
  const s = require("/tmp/gmt-supabase-status.json");
  process.stdout.write(s.API_URL);
')"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(node -e '
  const s = require("/tmp/gmt-supabase-status.json");
  process.stdout.write(s.PUBLISHABLE_KEY ?? s.ANON_KEY);
')"
export E2E_MAILPIT_URL="$(node -e '
  const s = require("/tmp/gmt-supabase-status.json");
  process.stdout.write(s.MAILPIT_URL ?? "http://127.0.0.1:54324");
')"
# Guard for the specs: absent in a plain `pnpm test:e2e` run.
export E2E_LOCAL_SUPABASE=1

pnpm build
pnpm exec playwright test tests/e2e/auth-otp.spec.ts
