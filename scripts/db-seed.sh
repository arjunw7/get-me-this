#!/usr/bin/env bash
# Apply the synthetic local seed (supabase/seed.sql) to the running local
# Supabase database without resetting it.
#
# `pnpm db:reset` already applies supabase/seed.sql as part of the reset; this
# script exists for the case where the stack is already running and only the
# seed is wanted.
#
# Scope and safety:
#   * Local only. It connects to the local database container started by
#     `pnpm db:start`; it never contacts a hosted or linked project.
#   * It prints the seed file's own notices and nothing else. No API keys,
#     tokens, connection strings, or passwords are read or written.
#   * The seed file itself is non-persistent, so this command is safe to repeat.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
seed_file="$repo_root/supabase/seed.sql"

if [[ ! -f "$seed_file" ]]; then
  echo "seed file not found: $seed_file" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed, so local Supabase cannot run." >&2
  echo "Install Docker, then run: pnpm db:start" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "The Docker daemon is not reachable, so local Supabase cannot run." >&2
  echo "Start Docker, then run: pnpm db:start" >&2
  exit 1
fi

db_container="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -n 1)"

if [[ -z "$db_container" ]]; then
  echo "Local Supabase is not running." >&2
  echo "Start it with: pnpm db:start" >&2
  exit 1
fi

docker exec -i "$db_container" \
  psql --no-psqlrc --set ON_ERROR_STOP=1 --user postgres --dbname postgres < "$seed_file"
