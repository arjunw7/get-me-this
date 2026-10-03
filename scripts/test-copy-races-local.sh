#!/usr/bin/env bash
# Two-session race harness for the 007b copy-to-own-wishlist slice
# (brief docs/delivery/issues/007b-copy-to-own-wishlist.md,
# "Two-session race scenarios").
#
# Run with: pnpm test:db:races:copy   (CI database job step "Run 007b copy
# races"; also runnable locally against a running stack).
#
# Contract (same discipline as scripts/test-member-wishlist-snapshot-races-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote or hosted database.
#   * Uses TWO INDEPENDENT database sessions per scenario: a holder session
#     that opens a transaction, performs its write, and holds it uncommitted
#     for a bounded window before committing itself; and a second session
#     that performs the contending write on BOTH sides of the commit. An
#     explicit pg_stat_activity barrier waits until the holder's write is
#     executed and its transaction is open before any contending call.
#   * Every session and every call has a finite timeout; the script exits
#     nonzero on any assertion failure or timeout.
#   * The brief's race semantics proven here:
#       1. concurrent same-source copies by the same user produce exactly
#          one item and both sessions return the same id (the loser is
#          idempotent behind the wishlist lock);
#       2. copy versus the source owner hard-deleting the item, in both
#          commit orders: delete-first denies the copy uniformly;
#          copy-first lands a complete item and the later delete nulls the
#          provenance;
#       3. copy versus the copier's own concurrent manual item creation:
#          both succeed under the wishlist lock with a preserved total
#          order;
#       4. copy versus organizer removal of the copier, in both commit
#          orders: removal-first denies the copy uniformly; copy-first
#          persists a valid owned item.
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
  { printf "set statement_timeout = '30s';\nset lock_timeout = '25s';\nset request.jwt.claim.sub = '%s';\nset request.jwt.claim.role = 'authenticated';\nset request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\n" "$1" "$1"
    printf '%s\n' "$2"
  } | "${psql_base[@]}"
}

HOLDER_NAME='copy-race-007b-holder'

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
    printf "delete from public.audit_events where group_id = '%s' or actor_id::text like 'a8500000-%%';\n" "$GROUP_ID"
    printf "delete from public.wishlist_items where owner_id::text like 'a8500000-%%';\n"
    printf "delete from public.wishlists where owner_id::text like 'a8500000-%%';\n"
    printf "delete from public.group_members where group_id = '%s' or user_id::text like 'a8500000-%%';\n" "$GROUP_ID"
    printf "delete from public.\"groups\" where id = '%s' or organizer_id::text like 'a8500000-%%';\n" "$GROUP_ID"
    printf "delete from public.profiles where id::text like 'a8500000-%%';\n"
    printf "delete from auth.users where id::text like 'a8500000-%%';\n"
  } | "${psql_base[@]}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

die() {
  echo "copy-races-007b: $1" >&2
  if [ -n "$HOLDER_PID" ]; then
    kill "$HOLDER_PID" 2>/dev/null || true
  fi
  exit 1
}

# Launches the holder session in the background: begin, the write, a
# bounded hold, then a self-commit. The holder is ONE independent database
# session whose transaction stays open until the hold elapses. stdout (for
# example the function result) is captured in the named file.
launch_holder() { # uid outfile write_sql hold_seconds
  {
    printf "set application_name = '%s';\n" "$HOLDER_NAME"
    printf "set statement_timeout = '40s';\nset lock_timeout = '10s';\n"
    printf "set request.jwt.claim.sub = '%s';\nset request.jwt.claim.role = 'authenticated';\n" "$1"
    printf "set request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\n" "$1"
    printf 'begin;\n'
    printf '%s\n' "$3"
    printf "select pg_sleep(%s);\n" "$4"
    printf 'commit;\n'
  } | "${psql_base[@]}" > "$2" 2>&1 &
  HOLDER_PID=$!
}

# Explicit barrier: wait (bounded) until the holder's transaction is open
# and its first write executed — idle in transaction.
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
    if [ "$waited" -ge "${1:-60}" ]; then
      die "the holder session never committed"
    fi
    sleep 1
  done
  wait "$HOLDER_PID" 2>/dev/null || die "the holder session errored before committing"
  HOLDER_PID=""
}

# An assertion on its own connection: exits nonzero on failure.
expect() { # description expected got
  if [[ "$3" != "$2" ]]; then
    die "$1 (expected '${2}', got '${3}')"
  fi
  echo "  ok: $1"
}

# Synthetic fixed fixture ids (hex only). Never real users; removed on exit.
UID_OWNER='a8500000-0000-4000-8000-00000000a801'
UID_COPIER='a8500000-0000-4000-8000-00000000a802'
GROUP_ID='a8500000-0000-4000-8000-00000000a800'
ITEM_1='a8500000-0000-4000-8000-00000000b001'
ITEM_2='a8500000-0000-4000-8000-00000000b002'

HOLD_SECONDS=12

echo "copy-races-007b: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values ('%s', 'authenticated', 'authenticated', 'copy-race-007b-owner@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'copy-race-007b-copier@example.invalid', '');\n" "$UID_OWNER" "$UID_COPIER"
  printf "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id) values ('%s', 'Copy Race', 'Diwali', (current_date + 30)::timestamp at time zone 'Asia/Kolkata', 'Asia/Kolkata', 50000, 'INR', 'wishlist_only', '%s');\n" "$GROUP_ID" "$UID_OWNER"
  printf "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('%s', '%s', 'joined', true, clock_timestamp(), 1), ('%s', '%s', 'joined', true, clock_timestamp() + interval '1 hour', 1);\n" "$GROUP_ID" "$UID_OWNER" "$GROUP_ID" "$UID_COPIER"
  printf "insert into public.wishlist_items (id, wishlist_id, owner_id, title, original_amount_minor, original_currency, desire_level, extraction_status, sort_position) values ('%s', (select id from public.wishlists where owner_id = '%s'), '%s', 'Race kettle', '249900', 'INR', 'really_want', 'manual', 1), ('%s', (select id from public.wishlists where owner_id = '%s'), '%s', 'Race mug', null, null, 'just_an_idea', 'manual', 2);\n" "$ITEM_1" "$UID_OWNER" "$UID_OWNER" "$ITEM_2" "$UID_OWNER" "$UID_OWNER"
} | "${psql_base[@]}" >/dev/null || die "fixture seeding failed"

# --- scenario 1: concurrent same-source copies by the same user ---------------

echo "scenario 1: two concurrent same-source copies by the copier"
launch_holder "$UID_COPIER" /tmp/copy-race-007b-s1-holder.txt \
  "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_1}'::uuid)::text, 'null');" "$HOLD_SECONDS"
await_holder_open 30

HOLDER_ITEM_ID="$(psql_as "$UID_COPIER" "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_1}'::uuid)::text, 'null');" | tail -n 1)"
expect "the contending second copy returns an id" "yes" \
  "$([[ "$HOLDER_ITEM_ID" != "null" && -n "$HOLDER_ITEM_ID" ]] && echo yes)"

await_holder_exit 60

HOLDER_RESULT="$(awk 'NF{print; exit}' /tmp/copy-race-007b-s1-holder.txt 2>/dev/null || echo unreadable)"
expect "both sessions return the same copied item id" "$HOLDER_RESULT" "$HOLDER_ITEM_ID"

expect "exactly one copied item row exists for the source" "1" \
  "$(psql_as "$UID_COPIER" "select count(*)::text from public.wishlist_items where owner_id = '${UID_COPIER}'::uuid and copied_from_item_id = '${ITEM_1}'::uuid;")"

# --- scenario 2: copy versus the source owner hard-deleting the item ----------

echo "scenario 2a: the owner's committed delete precedes the copy"
"${psql_base[@]}" <<< "delete from public.wishlist_items where id = '${ITEM_2}'::uuid;" >/dev/null || die "delete failed"
expect "the copy after a committed source delete is denied uniformly" "null" \
  "$(psql_as "$UID_COPIER" "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_2}'::uuid)::text, 'null');")"

echo "scenario 2b: the owner's delete held uncommitted while the copier copies"
# Re-create the source item, then hold the delete while the copy runs. The
# copy's insert takes a KEY SHARE lock on the source row, so the copy blocks
# until the delete commits, then fails uniformly (never a partial row).
{
  printf "set application_name = '%s';\n" "$HOLDER_NAME"
  printf "set statement_timeout = '40s';\nset lock_timeout = '10s';\n"
  printf 'begin;\n'
  printf "insert into public.wishlist_items (id, wishlist_id, owner_id, title, desire_level, extraction_status, sort_position) values ('%s', (select id from public.wishlists where owner_id = '%s'), '%s', 'Race mug two', 'just_an_idea', 'manual', 3);\n" "$ITEM_2" "$UID_OWNER" "$UID_OWNER"
  printf "select pg_sleep(%s);\n" "$HOLD_SECONDS"
  printf "delete from public.wishlist_items where id = '${ITEM_2}'::uuid;\n"
  printf 'commit;\n'
} | "${psql_base[@]}" > /dev/null 2>&1 &
HOLDER_PID=$!
await_holder_open 30

expect "the copy against an uncommitted delete fails uniformly" "null" \
  "$(psql_as "$UID_COPIER" "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_2}'::uuid)::text, 'null');")"

await_holder_exit 60
expect "no partial copied row exists for the deleted source" "0" \
  "$(psql_as "$UID_COPIER" "select count(*)::text from public.wishlist_items where owner_id = '${UID_COPIER}'::uuid and copied_from_item_id = '${ITEM_2}'::uuid;")"

echo "scenario 2c: copy commits first, then the source is deleted"
# A committed copy first:
"${psql_base[@]}" <<< "insert into public.wishlist_items (id, wishlist_id, owner_id, title, desire_level, extraction_status, sort_position) values ('${ITEM_2}', (select id from public.wishlists where owner_id = '${UID_OWNER}'), '${UID_OWNER}', 'Race mug three', 'just_an_idea', 'manual', 3);" >/dev/null || die "re-seed failed"
COPY_2C_ID="$(psql_as "$UID_COPIER" "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_2}'::uuid)::text, 'null');" | tail -n 1)"
expect "the copy before any delete lands complete" "yes" \
  "$([[ "$COPY_2C_ID" != "null" && -n "$COPY_2C_ID" ]] && echo yes)"
"${psql_base[@]}" <<< "delete from public.wishlist_items where id = '${ITEM_2}'::uuid;" >/dev/null || die "delete failed"
expect "the later source delete nulled the copy's provenance" "true" \
  "$(psql_as "$UID_COPIER" "select (copied_from_item_id is null)::text from public.wishlist_items where id = '${COPY_2C_ID}'::uuid;")"

# --- scenario 3: copy versus the copier's own concurrent manual creation ------

echo "scenario 3: the copier's own manual append held behind the copy's wishlist lock"
launch_holder "$UID_COPIER" /tmp/copy-race-007b-s3-holder.txt \
  "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_1}'::uuid)::text, 'null');" "$HOLD_SECONDS"
# Note: the copier already owns one copy of ITEM_1 from scenario 1, so this
# holder copy is idempotent — but it still locks the wishlist row, which is
# the serialization point under contention.
await_holder_open 30

MANUAL_RESULT="$(psql_as "$UID_COPIER" "select result::text from public.append_wishlist_item(gen_random_uuid(), 'Race manual lamp', null, null, null, 'just_an_idea', null, null);" | tail -n 1)"
expect "the concurrent manual append also succeeds" "saved" "$MANUAL_RESULT"

await_holder_exit 60

expect "the copied item sorts before the later manual append" "true" \
  "$(psql_as "$UID_COPIER" "select exists (select 1 from public.wishlist_items copied join public.wishlist_items manual on manual.owner_id = copied.owner_id where copied.owner_id = '${UID_COPIER}'::uuid and copied.copied_from_item_id is not null and manual.client_submission_id is not null and copied.sort_position < manual.sort_position)::text;")"

# --- scenario 4: copy versus organizer removal of the copier ------------------

echo "scenario 4a: the organizer's committed removal precedes the copy"
psql_as "$UID_OWNER" "select member_admin_version::text from public.remove_group_member('${GROUP_ID}'::uuid, '${UID_COPIER}'::uuid, (select member_admin_version from public.group_admin_version('${GROUP_ID}'::uuid)));" >/dev/null || die "removal failed"
expect "the copy after a committed removal is denied uniformly" "null" \
  "$(psql_as "$UID_COPIER" "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_1}'::uuid)::text, 'null');")"

echo "scenario 4b: the removal held uncommitted while the copier copies"
launch_holder "$UID_OWNER" /dev/null \
  "select member_admin_version::text from public.remove_group_member('${GROUP_ID}'::uuid, '${UID_COPIER}'::uuid, (select member_admin_version from public.group_admin_version('${GROUP_ID}'::uuid)));" "$HOLD_SECONDS"
# Restore joined first: the fixture was committed-removed in 4a; the holder
# now removes the RESTORED member while the copy runs.
"${psql_base[@]}" <<< "update public.group_members set status = 'joined', participating = true, membership_generation = membership_generation + 1 where group_id = '${GROUP_ID}'::uuid and user_id = '${UID_COPIER}'::uuid;" >/dev/null || die "restore failed"
await_holder_open 30

REMOVAL_RACE_COPY_ID="$(psql_as "$UID_COPIER" "select coalesce(public.copy_group_item('${GROUP_ID}'::uuid, '${ITEM_1}'::uuid)::text, 'null');" | tail -n 1)"
await_holder_exit 60

if [[ "$REMOVAL_RACE_COPY_ID" == "null" ]]; then
  expect "removal-first (committed before the copy's statement) denied uniformly" "0" \
    "$(psql_as "$UID_COPIER" "select count(*)::text from public.wishlist_items where owner_id = '${UID_COPIER}'::uuid and copied_from_item_id = '${ITEM_1}'::uuid and id = '${REMOVAL_RACE_COPY_ID}';")"
else
  expect "copy-first persisted a valid owned item" "1" \
    "$(psql_as "$UID_COPIER" "select count(*)::text from public.wishlist_items where id = '${REMOVAL_RACE_COPY_ID}'::uuid and owner_id = '${UID_COPIER}'::uuid and title = 'Race kettle' and extraction_status = 'manual';")"
fi

echo "copy-races-007b: all scenarios passed"
