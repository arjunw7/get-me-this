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

# Identify this project's database container. The project id is read from
# supabase/config.toml so the container name can never drift from configuration,
# and the selection requires both:
#   * the Supabase CLI label for this exact project, and
#   * a container name belonging to this project's database service.
# Any other running stack, including another project's or a hosted-linked one,
# is therefore never eligible.
config_file="$repo_root/supabase/config.toml"

if [[ ! -f "$config_file" ]]; then
  echo "config file not found: $config_file" >&2
  exit 1
fi

project_id="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p' "$config_file" | head -n 1)"

if [[ -z "$project_id" ]]; then
  echo "Could not read project_id from $config_file." >&2
  exit 1
fi

db_container_label="com.supabase.cli.project=${project_id}"
db_container_name="supabase_db_${project_id}"

# Fail closed: the script needs exactly one database container for this project.
# The CLI label narrows the list to this project's stack; the exact whole-name
# match then picks its database service. Matching in the shell keeps the result
# independent of Docker's filter-regex semantics.
mapfile -t db_containers < <(
  docker ps --filter "label=${db_container_label}" --format '{{.Names}}' 2>/dev/null |
    grep -x -- "${db_container_name}" || true
)

case "${#db_containers[@]}" in
0)
  echo "Local Supabase is not running for project '${project_id}'." >&2
  echo "Expected exactly one running container labelled ${db_container_label} named ${db_container_name}." >&2
  echo "Start it with: pnpm db:start" >&2
  exit 1
  ;;
1)
  ;;
*)
  echo "Refusing to seed: ${#db_containers[@]} database containers match this project." >&2
  printf '  %s\n' "${db_containers[@]}" >&2
  echo "Expected exactly one. Stop the extra stack, then run: pnpm db:start" >&2
  exit 1
  ;;
esac

db_container="${db_containers[0]}"

docker exec -i "$db_container" \
  psql --no-psqlrc --set ON_ERROR_STOP=1 --user postgres --dbname postgres < "$seed_file"
