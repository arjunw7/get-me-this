#!/usr/bin/env bash
# Regression tests for the database-container selection in scripts/db-seed.sh.
#
# Runs the real seed script against a stubbed `docker`, so it needs no Docker and
# no running Supabase stack. It exists because the selection logic must fail
# closed: seeding an arbitrary `supabase_db_` container, or picking the wrong
# project's database, would be destructive.
#
# Written for the Bash 3.2 that macOS ships as /bin/bash, so it can run on any
# contributor machine. Run it directly or with: bash scripts/db-seed-selection-test.sh

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
seed_script="$repo_root/scripts/db-seed.sh"

if [[ ! -f "$seed_script" ]]; then
  echo "seed script not found: $seed_script" >&2
  exit 1
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/db-seed-selection.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

# A stub `docker` that reports success for `info`, echoes a canned container list
# for `ps`, and never really seeds anything.
stub_dir="$work_dir/stub"
mkdir -p "$stub_dir"
cat > "$stub_dir/docker" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  info) exit 0 ;;
  ps)   printf '%b' "${STUB_PS_OUTPUT:-}" ; exit 0 ;;
  exec) echo "RESULT: would seed container $3" ; exit 0 ;;
  *) exit 0 ;;
esac
STUB
chmod +x "$stub_dir/docker"

failures=0

run_case() {
  local description="$1"
  local ps_output="$2"
  local expected_exit="$3"
  local expected_needle="$4"

  local output
  local status

  output="$(STUB_PS_OUTPUT="$ps_output" PATH="$stub_dir:$PATH" bash "$seed_script" 2>&1)"
  status=$?

  local problems=""

  if [[ "$status" -ne "$expected_exit" ]]; then
    problems="${problems}  expected exit ${expected_exit}, got ${status}"$'\n'
  fi

  if ! printf '%s' "$output" | grep -Fq -- "$expected_needle"; then
    problems="${problems}  expected output to contain: ${expected_needle}"$'\n'
  fi

  if [[ -n "$problems" ]]; then
    failures=$((failures + 1))
    echo "FAIL: ${description}"
    printf '%s' "$problems"
    printf '  actual output:\n%s\n' "$output"
  else
    echo "ok: ${description} (exit ${status})"
  fi
}

echo "shell: bash ${BASH_VERSION}"

run_case \
  "exactly one matching database container seeds it" \
  'supabase_db_get-me-this\n' \
  0 \
  "RESULT: would seed container supabase_db_get-me-this"

run_case \
  "two matching database containers are refused" \
  'supabase_db_get-me-this\nsupabase_db_get-me-this\n' \
  1 \
  "Refusing to seed: 2 database containers match this project."

run_case \
  "zero matching database containers are refused" \
  '' \
  1 \
  "Local Supabase is not running for project 'get-me-this'."

run_case \
  "another project's database containers are never eligible" \
  'supabase_db_other-project\nsupabase_db_other-project\n' \
  1 \
  "Local Supabase is not running for project 'get-me-this'."

if [[ "$failures" -ne 0 ]]; then
  echo ""
  echo "${failures} selection case(s) failed."
  exit 1
fi

echo ""
echo "All selection cases passed."
