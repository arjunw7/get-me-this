#!/usr/bin/env bash
#
# CI-facing runner for the E2E_LOCAL_SUPABASE-gated Playwright suites (005h).
#
# The CI `database` job starts and resets the local Supabase stack in earlier
# steps; this script then wires the local-stack environment exactly the way
# scripts/e2e-auth-local.sh does (silent `supabase status -o json` parsing of
# the API URL, publishable key, and Mailpit URL; a per-run
# AUTH_LINK_COOKIE_SECRET), builds the production bundle against that
# environment, and runs ONLY the specs gated by
# `test.skip(!process.env.E2E_LOCAL_SUPABASE, ...)`, named as explicit
# Playwright paths.
#
# Coupling rule (brief 005h): any PR adding a new E2E_LOCAL_SUPABASE-gated
# spec must add it to the explicit list below in the same PR, and that PR's
# description must cite the green `database` job.
#
# The local stack's publishable key is a development fixture, but it is
# treated as secret anyway: parsed silently through node, exported, and never
# printed, logged, or committed. Plain `pnpm test:e2e` (no gate set) does not
# use this script and stays untouched.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! pnpm exec supabase status -o json > /tmp/gmt-supabase-status.json 2>/dev/null; then
  echo "error: the local Supabase stack is not running; the CI database job starts it in an earlier step (locally, run 'pnpm db:start' where a container runtime exists)." >&2
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
# The service-role key of the LOCAL stack: a development fixture used ONLY
# by the stack-gated specs' fixture management (tests/helpers/local-stack.ts)
# for synthetic setup/teardown — the same pattern as the local-stack status
# keys above: parsed silently through node, exported, and never printed,
# logged, or committed. Never present in application code or client bundles.
export SUPABASE_SERVICE_ROLE_KEY="$(node -e '
  const s = require("/tmp/gmt-supabase-status.json");
  const key = s.SERVICE_KEY ?? s.SERVICE_ROLE_KEY ?? s.SECRET_KEY;
  if (!key) {
    process.stderr.write("error: no service-role key in the local stack status; the stack-gated wishlist specs cannot manage their fixtures.\n");
    process.exit(1);
  }
  process.stdout.write(key);
')"
# The 009a/008d server-side service configuration for the built server: the
# SAME local development fixture key, treated as secret (parsed silently,
# never printed). The assignment-email enqueue in the draw action requires
# it; without it the enqueue fails safe to silence.
export SUPABASE_URL="$(node -e '
  const s = require("/tmp/gmt-supabase-status.json");
  process.stdout.write(s.API_URL);
')"
export SUPABASE_SERVICE_KEY="$(node -e '
  const s = require("/tmp/gmt-supabase-status.json");
  const key = s.SERVICE_KEY ?? s.SERVICE_ROLE_KEY ?? s.SECRET_KEY;
  if (!key) process.exit(1);
  process.stdout.write(key);
')"
# Guard for the specs: absent in a plain `pnpm test:e2e` run.
export E2E_LOCAL_SUPABASE=1

# The 004d link-carriage secret: a local development fixture generated per
# run when not already provided. It protects only the local stack's parked
# token hashes; it is never printed, logged, or committed.
if [ -z "${AUTH_LINK_COOKIE_SECRET:-}" ]; then
  AUTH_LINK_COOKIE_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  export AUTH_LINK_COOKIE_SECRET
fi

# The 006c invitation continuation sealing secret: the same pattern — a
# per-run canonical opaque token (43 base64url chars) generated when not
# already provided. Without it the entire invitation surface is disabled
# (every landing maps to the generic unavailable state). Never printed,
# logged, or committed.
if [ -z "${INVITATION_CONTINUATION_COOKIE_SECRET:-}" ]; then
  INVITATION_CONTINUATION_COOKIE_SECRET="$(node -e '
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    const bytes = require("node:crypto").randomBytes(42);
    for (const byte of bytes) out += alphabet[byte % 64];
    process.stdout.write(out + "A");
  ')"
  export INVITATION_CONTINUATION_COOKIE_SECRET
fi

pnpm build

# Test-only outbound transport controller. It has no Supabase credentials and
# is reachable only from this runner's loopback network namespace. The port
# defaults to the CI pin; a concurrent local lane may pre-set a free port.
export E2E_WISHLIST_CONTROL_URL="http://127.0.0.1:${E2E_WISHLIST_CONTROL_PORT:-3199}"
E2E_WISHLIST_CONTROL_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export E2E_WISHLIST_CONTROL_TOKEN
env -i PATH="$PATH" E2E_WISHLIST_CONTROL_TOKEN="$E2E_WISHLIST_CONTROL_TOKEN" \
  E2E_WISHLIST_CONTROL_PORT="${E2E_WISHLIST_CONTROL_PORT:-3199}" node tests/helpers/wishlist-test-control.mjs \
  >/tmp/gmt-arj28-control.log 2>&1 &
WISHLIST_CONTROL_PID=$!
cleanup_control() {
  kill "$WISHLIST_CONTROL_PID" 2>/dev/null || true
  wait "$WISHLIST_CONTROL_PID" 2>/dev/null || true
  pnpm exec supabase db query --local \
    "drop trigger if exists arj28_test_reject_item_delete on public.wishlist_items;" \
    >/dev/null 2>&1 || true
  pnpm exec supabase db query --local \
    "drop function if exists public.arj28_test_reject_item_delete();" \
    >/dev/null 2>&1 || true
}
trap cleanup_control EXIT
for attempt in $(seq 1 50); do
  if grep -q 'wishlist test control ready' /tmp/gmt-arj28-control.log; then break; fi
  if ! kill -0 "$WISHLIST_CONTROL_PID" 2>/dev/null; then
    echo "error: local wishlist test controller failed to start" >&2
    exit 1
  fi
  sleep 0.1
done
if ! grep -q 'wishlist test control ready' /tmp/gmt-arj28-control.log; then
  echo "error: local wishlist test controller did not become ready" >&2
  exit 1
fi

# Install a disposable local-only trigger so the delete action handles a real
# PostgreSQL SQLSTATE response, not a fabricated PostgREST-shaped test value.
pnpm exec supabase db query --local \
  --file tests/fixtures/arj28-delete-rejection-function.sql >/dev/null
pnpm exec supabase db query --local \
  "drop trigger if exists arj28_test_reject_item_delete on public.wishlist_items;" \
  >/dev/null
pnpm exec supabase db query --local \
  --file tests/fixtures/arj28-delete-rejection-trigger.sql >/dev/null

# Gated-spec explicit list (brief 005h): keep in sync with the
# E2E_LOCAL_SUPABASE skip guards in tests/e2e and tests/visual. 005b adds
# the wishlist specs: the plain signed-out protection spec (environment-
# agnostic assertions) and the stack-gated e2e, axe, and visual specs
# whose fixtures need the running local stack. 005g adds the dormant
# price-presentation spec (tests/e2e/wishlist-price-local.spec.ts).
# 006b adds the private-group creation spec
# (tests/e2e/groups-local.spec.ts). 006c adds the invitation
# preview-and-acceptance spec (tests/e2e/invitations-local.spec.ts).
# 006d adds the private group room spec
# (tests/e2e/group-room-local.spec.ts). 007d adds the group activity spec
# (tests/e2e/group-activity-local.spec.ts). 006e adds the member wishlist
# browsing spec (tests/e2e/group-wishlist-local.spec.ts). The fast-lane
# real-authenticated-home slice adds the home spec
# (tests/e2e/home-local.spec.ts) and its review-only visual captures
# (tests/visual/home.visual.spec.ts). 008d adds the assignment view and
# confirmed redraw spec (tests/e2e/draw-assignment-local.spec.ts).
pnpm exec playwright test \
  tests/e2e/auth-otp.spec.ts \
  tests/e2e/home-local.spec.ts \
  tests/e2e/wishlist.spec.ts \
  tests/e2e/wishlist-local.spec.ts \
  tests/e2e/wishlist-items-local.spec.ts \
  tests/e2e/wishlist-items-races-local.spec.ts \
  tests/e2e/wishlist-price-local.spec.ts \
  tests/e2e/wishlist-reorder-local.spec.ts \
  tests/e2e/wishlist-extract-local.spec.ts \
  tests/e2e/groups-local.spec.ts \
  tests/e2e/invitations-local.spec.ts \
  tests/e2e/group-room-local.spec.ts \
  tests/e2e/group-activity-local.spec.ts \
  tests/e2e/group-wishlist-local.spec.ts \
  tests/e2e/group-copy-local.spec.ts \
  tests/e2e/draw-assignment-local.spec.ts \
  tests/visual/wishlist-empty.visual.spec.ts \
  tests/visual/wishlist-filled.visual.spec.ts \
  tests/visual/wishlist-items.visual.spec.ts \
  tests/visual/wishlist-extract.visual.spec.ts \
  tests/visual/groups-new.visual.spec.ts \
  tests/visual/groups-created.visual.spec.ts \
  tests/visual/group-room.visual.spec.ts \
  tests/visual/group-wishlist.visual.spec.ts \
  tests/visual/home.visual.spec.ts
