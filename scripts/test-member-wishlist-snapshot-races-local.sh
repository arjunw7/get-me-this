#!/usr/bin/env bash
# Two-session race harness for the 006e member-wishlist browsing projection
# (brief docs/delivery/issues/006e-member-wishlist-browsing.md,
# "Read-versus-membership-change race proof").
#
# Run with: pnpm test:db:races:006e   (CI database job step "Run 006e member
# wishlist snapshot races"; also runnable locally against a running stack).
#
# Contract (same discipline as scripts/test-group-room-snapshot-races-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote or hosted database.
#   * Uses TWO INDEPENDENT database sessions per scenario: a holder session
#     that opens a transaction, performs the membership change, and holds it
#     uncommitted for a bounded window before committing itself; and a
#     reader session that reads the member wishlist snapshot on BOTH sides
#     of the commit. An explicit pg_stat_activity barrier waits until the
#     holder's write is executed and its transaction is open before any
#     read.
#   * Every session and every read has a finite timeout; the script exits
#     nonzero on any assertion failure or timeout.
#   * The brief's race semantics: a membership change committed before the
#     reader's statement snapshot makes the reader see zero rows; a change
#     committed after the snapshot leaves the reader with the complete
#     pre-commit authorized snapshot — never a partial or half-empty
#     result. The harness holds the target's removal, the viewer's removal,
#     and the viewer's leave uncommitted while the other side reads, then
#     releases each change and re-reads.
#   * It inspects the function definition to prove the body is one
#     data-reading SQL statement, and adds no new write endpoint.
#   * All fixtures are synthetic (fixed uuid constants); the harness cleans
#     them up on every exit path. No bearer token or other credential
#     material is ever printed.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
config_file="$repo_root/supabase/config.toml"

if [[ ! -f "$config_file" ]]; then
  echo "config file not found: $config_file" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed, so the local Supabase stack cannot run." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "The Docker daemon is not reachable, so the local Supabase stack cannot run." >&2
  exit 1
fi

project_id="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p' "$config_file" | head -n 1)"

if [[ -z "$project_id" ]]; then
  echo "Could not read project_id from $config_file" >&2
  exit 1
fi

db_container_label="com.supabase.cli.project=${project_id}"
db_container_name="supabase_db_${project_id}"

db_container_count=0
db_container=""
while IFS= read -r candidate; do
  if [ -n "$candidate" ]; then
    db_container_count=$((db_container_count + 1))
    if [ "$db_container_count" -eq 1 ]; then
      db_container="$candidate"
    fi
  fi
done < <(
  docker ps --filter "label=${db_container_label}" --format '{{.Names}}' 2>/dev/null |
    grep -Fx -- "${db_container_name}" || true
)

if [ "$db_container_count" -ne 1 ]; then
  echo "Local Supabase is not running for project '${project_id}' (expected exactly one ${db_container_name})." >&2
  echo "Start it with: pnpm db:start" >&2
  exit 1
fi

psql_base=(docker exec -i "$db_container" psql --no-psqlrc --quiet --no-align --tuples-only
  --set ON_ERROR_STOP=1 --user postgres --dbname postgres)

# One identity-bound call on a fresh connection: the session GUCs that
# carry auth.uid() live only on their connection, so every identity-bound
# call must set them inline.
psql_as() { # uid sql
  { printf "set statement_timeout = '20s';\nset lock_timeout = '10s';\nset request.jwt.claim.sub = '%s';\nset request.jwt.claim.role = 'authenticated';\nset request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\n" "$1" "$1"
    printf '%s\n' "$2"
  } | "${psql_base[@]}"
}

HOLDER_NAME='wishlist-race-006e-holder'

HOLDER_PID=""

cleanup() {
  if [ -n "$HOLDER_PID" ]; then
    kill "$HOLDER_PID" 2>/dev/null || true
    wait "$HOLDER_PID" 2>/dev/null || true
  fi
  # Terminate any surviving holder backend first: an open holder
  # transaction holds row locks that would time out the teardown deletes.
  "${psql_base[@]}" <<< "select pg_terminate_backend(pid) from pg_stat_activity where application_name = '${HOLDER_NAME}';" >/dev/null 2>&1 || true
  {
    printf "set statement_timeout = '10s';\nset lock_timeout = '5s';\n"
    printf "delete from public.audit_events where group_id = '%s' or actor_id::text like 'a8200000-%%';\n" "$GROUP_ID"
    printf "delete from public.wishlist_items where owner_id::text like 'a8200000-%%';\n"
    printf "delete from public.wishlists where owner_id::text like 'a8200000-%%';\n"
    printf "delete from public.group_members where group_id = '%s' or user_id::text like 'a8200000-%%';\n" "$GROUP_ID"
    printf "delete from public.\"groups\" where id = '%s' or organizer_id::text like 'a8200000-%%';\n" "$GROUP_ID"
    printf "delete from public.profiles where id::text like 'a8200000-%%';\n"
    printf "delete from auth.users where id::text like 'a8200000-%%';\n"
  } | "${psql_base[@]}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

die() {
  echo "wishlist-races-006e: $1" >&2
  if [ -n "$HOLDER_PID" ]; then
    kill "$HOLDER_PID" 2>/dev/null || true
  fi
  exit 1
}

# Launches the holder session in the background: begin, the change, a
# bounded hold, then a self-commit. The holder is ONE independent database
# session whose transaction stays open until the hold elapses.
launch_holder() { # uid change_sql hold_seconds
  {
    printf "set application_name = '%s';\n" "$HOLDER_NAME"
    printf "set statement_timeout = '30s';\nset lock_timeout = '10s';\n"
    printf "set request.jwt.claim.sub = '%s';\nset request.jwt.claim.role = 'authenticated';\n" "$1"
    printf "set request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\n" "$1"
    printf 'begin;\n'
    printf '%s\n' "$2"
    printf "select pg_sleep(%s);\n" "$3"
    printf 'commit;\n'
  } | "${psql_base[@]}" > /dev/null 2>&1 &
  HOLDER_PID=$!
}

# Explicit barrier: wait (bounded) until the holder's transaction is open
# and idle-in-transaction — the change is executed, nothing is committed.
await_holder_open() { # timeout_seconds
  local waited=0
  while true; do
    local open
    open="$("${psql_base[@]}" <<< "select count(*)::text from pg_stat_activity where application_name = '${HOLDER_NAME}' and xact_start is not null and state in ('idle in transaction', 'active');")"
    if [[ "$open" == "1" ]]; then return 0; fi
    waited=$((waited + 1))
    if [ "$waited" -ge "${1:-30}" ]; then
      die "the holder session never opened its transaction"
    fi
    sleep 1
  done
}

await_holder_exit() { # timeout_seconds
  local waited=0
  while kill -0 "$HOLDER_PID" 2>/dev/null; do
    waited=$((waited + 1))
    if [ "$waited" -ge "${1:-40}" ]; then
      die "the holder session never committed"
    fi
    sleep 1
  done
  wait "$HOLDER_PID" 2>/dev/null || die "the holder session errored before committing"
  HOLDER_PID=""
}

# A reader assertion on its own connection: exits nonzero on failure.
read_expect() { # uid description expected sql
  local got
  got="$(psql_as "$1" "$4" | tail -n 1)"
  if [[ "$got" != "$3" ]]; then
    die "$2 (expected '${3}', got '${got}')"
  fi
  echo "  ok: $2"
}

# Synthetic fixed fixture ids (hex only). Never real users; removed on exit.
UID_A='a8200000-0000-4000-8000-00000000a821'
UID_B='a8200000-0000-4000-8000-00000000a822'
UID_C='a8200000-0000-4000-8000-00000000a823'
GROUP_ID='a8200000-0000-4000-8000-00000000a820'

HOLD_SECONDS=12

echo "wishlist-races-006e: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values ('%s', 'authenticated', 'authenticated', 'wishlist-race-006e-a@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'wishlist-race-006e-b@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'wishlist-race-006e-c@example.invalid', '');\n" "$UID_A" "$UID_B" "$UID_C"
  printf "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id) values ('%s', 'Wishlist Race', 'Diwali', (current_date + 30)::timestamp at time zone 'Asia/Kolkata', 'Asia/Kolkata', 50000, 'INR', 'wishlist_only', '%s');\n" "$GROUP_ID" "$UID_A"
  printf "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('%s', '%s', 'joined', true, clock_timestamp(), 1), ('%s', '%s', 'joined', true, clock_timestamp() + interval '1 hour', 1), ('%s', '%s', 'joined', true, clock_timestamp() + interval '2 hours', 1);\n" "$GROUP_ID" "$UID_A" "$GROUP_ID" "$UID_B" "$GROUP_ID" "$UID_C"
  printf "update public.profiles set display_name = 'Race Organizer' where id = '%s';\n" "$UID_A"
  printf "update public.profiles set display_name = 'Race Viewer' where id = '%s';\n" "$UID_B"
  printf "update public.profiles set display_name = 'Race Target' where id = '%s';\n" "$UID_C"
  printf "insert into public.wishlist_items (wishlist_id, owner_id, title, original_amount_minor, original_currency, desire_level, extraction_status, sort_position) values ((select id from public.wishlists where owner_id = '%s'), '%s', 'Race kettle', '249900', 'INR', 'really_want', 'manual', 1), ((select id from public.wishlists where owner_id = '%s'), '%s', 'Race mug', null, null, 'just_an_idea', 'manual', 2);\n" "$UID_C" "$UID_C" "$UID_C" "$UID_C"
} | "${psql_base[@]}" >/dev/null || die "fixture seeding failed"

# --- one-statement body proof --------------------------------------------------

echo "scenario 0: the function body is one data-reading SQL statement"
# pg_get_functiondef renders the statement without a trailing separator, so
# zero semicolons proves no additional statement can hide in the body.
SEMICOLONS="$("${psql_base[@]}" <<< "select (length(body) - length(replace(body, ';', '')))::text from (select substring(pg_get_functiondef('public.member_wishlist_snapshot(uuid, uuid)'::regprocedure) from '\\\$function\\\$(.*)\\\$function\\\$') as body) b;" | tail -n 1)"
if [[ "$SEMICOLONS" != "0" ]]; then
  die "the projection body is not one SQL statement (semicolons: ${SEMICOLONS})"
fi
echo "  ok: single-statement body"

# The projection is read-only: item, membership, and audit counts never move.
read_expect "$UID_B" "the reads above wrote nothing" "0:2:3" \
  "select (select count(*)::text from public.audit_events where group_id = '${GROUP_ID}'::uuid) || ':' || (select count(*)::text from public.wishlist_items where owner_id = '${UID_C}'::uuid) || ':' || (select count(*)::text from public.group_members where group_id = '${GROUP_ID}'::uuid and status = 'joined');"

# --- scenario 1: the target's committed removal cannot survive into a later read

echo "scenario 1: target removal held uncommitted while the viewer reads"
launch_holder "$UID_A" "select result from public.remove_group_member('${GROUP_ID}'::uuid, '${UID_C}'::uuid);" "$HOLD_SECONDS"
await_holder_open 30

# Pre-commit: the viewer sees the complete authorized snapshot (sentinel
# label + both visible items in committed order).
read_expect "$UID_B" "the uncommitted target removal changes nothing for the viewer's read" "Race Target:2:Race kettle|Race mug" \
  "select (select member_display_name from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid) limit 1) || ':' || (select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid)) || ':' || (select string_agg(title, '|' order by ord) from (select title, row_number() over () as ord from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid)) r);"

await_holder_exit 45

read_expect "$UID_B" "after the commit the removed target reads zero rows" "0" \
  "select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid);"

# Restore the target so later scenarios see the fixture shape.
"${psql_base[@]}" <<< "update public.group_members set status = 'joined', participating = true where group_id = '${GROUP_ID}'::uuid and user_id = '${UID_C}'::uuid;" >/dev/null || die "target restore failed"

# --- scenario 2: the viewer's committed removal cannot survive into a later read

echo "scenario 2: viewer removal held uncommitted while the viewer reads"
launch_holder "$UID_A" "select result from public.remove_group_member('${GROUP_ID}'::uuid, '${UID_B}'::uuid);" "$HOLD_SECONDS"
await_holder_open 30

read_expect "$UID_B" "the uncommitted viewer removal changes nothing for the viewer's read" "Race Target:2" \
  "select (select member_display_name from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid) limit 1) || ':' || (select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid));"

await_holder_exit 45

read_expect "$UID_B" "after the commit the removed viewer reads zero rows" "0" \
  "select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid);"

# Restore the viewer.
"${psql_base[@]}" <<< "update public.group_members set status = 'joined', participating = true where group_id = '${GROUP_ID}'::uuid and user_id = '${UID_B}'::uuid;" >/dev/null || die "viewer restore failed"

# --- scenario 3: the viewer's committed leave cannot survive into a later read --

echo "scenario 3: viewer leave held uncommitted while the organizer reads"
launch_holder "$UID_B" "select result from public.leave_group('${GROUP_ID}'::uuid);" "$HOLD_SECONDS"
await_holder_open 30

read_expect "$UID_A" "the uncommitted leave changes nothing for the organizer's read" "Race Target:2" \
  "select (select member_display_name from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid) limit 1) || ':' || (select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid));"

await_holder_exit 45

read_expect "$UID_A" "after the commit the left viewer's own read is zero and the target still reads" "0:2" \
  "select (select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_B}'::uuid)) || ':' || (select count(*)::text from public.member_wishlist_snapshot('${GROUP_ID}'::uuid, '${UID_C}'::uuid));"

echo "wishlist-races-006e: all scenarios passed"
