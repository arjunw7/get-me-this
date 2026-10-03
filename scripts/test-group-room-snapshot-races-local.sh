#!/usr/bin/env bash
# Two-session race harness for the 006d group-room snapshot projection
# (brief docs/delivery/issues/006d-private-group-room-member-and-pending-states.md,
# "Required automated proof / Database authorization tests").
#
# Run with: pnpm test:db:races:006d   (CI database job step "Run 006d room
# snapshot races"; also runnable locally against a running stack).
#
# Contract (same discipline as scripts/test-group-races-006c-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote or hosted database.
#   * Uses TWO INDEPENDENT database sessions per scenario: a holder session
#     that opens a transaction, performs the change, and holds it
#     uncommitted for a bounded window before committing itself; and a
#     reader session that reads the room snapshot on BOTH sides of the
#     commit. An explicit pg_stat_activity barrier waits until the holder's
#     write is executed and its transaction is open before any read.
#   * Every session and every read has a finite timeout; the script exits
#     nonzero on any assertion failure or timeout.
#   * The harness holds remove, accept, and targeted-invitation revoke
#     transactions uncommitted while the other session reads, then releases
#     each change and re-reads. Every result must be wholly the pre-commit
#     or post-commit state: authorization cannot survive a committed removal
#     into a later data read, acceptance cannot produce duplicate
#     joined/invited rows or mismatched counts, and revocation cannot leave
#     a pending row paired with post-revoke facts.
#   * It inspects the function definition to prove the body is one
#     data-reading SQL statement, and adds no new write endpoint.
#   * All fixtures are synthetic (fixed uuid constants); the harness cleans
#     them up on every exit path. No bearer token or other credential
#     material is ever printed: generated tokens are captured into shell
#     variables and substituted into SQL silently.

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

HOLDER_NAME='room-race-006d-holder'

HOLDER_PID=""

cleanup() {
  if [ -n "$HOLDER_PID" ]; then
    kill "$HOLDER_PID" 2>/dev/null || true
    wait "$HOLDER_PID" 2>/dev/null || true
  fi
  {
    printf "set statement_timeout = '10s';\nset lock_timeout = '5s';\n"
    printf "delete from public.audit_events where group_id = '%s' or actor_id::text like 'a8100000-%%';\n" "$GROUP_ID"
    printf "delete from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id = '%s');\n" "$GROUP_ID"
    printf "delete from public.group_invitations where group_id = '%s';\n" "$GROUP_ID"
    printf "delete from public.group_members where group_id = '%s' or user_id::text like 'a8100000-%%';\n" "$GROUP_ID"
    printf "delete from public.\"groups\" where id = '%s' or organizer_id::text like 'a8100000-%%';\n" "$GROUP_ID"
    printf "delete from public.profiles where id::text like 'a8100000-%%';\n"
    printf "delete from auth.users where id::text like 'a8100000-%%';\n"
  } | "${psql_base[@]}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

die() {
  echo "room-races-006d: $1" >&2
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
UID_A='a8100000-0000-4000-8000-00000000a811'
UID_B='a8100000-0000-4000-8000-00000000a812'
UID_C='a8100000-0000-4000-8000-00000000a813'
UID_D='a8100000-0000-4000-8000-00000000a814'
GROUP_ID='a8100000-0000-4000-8000-00000000a810'

HOLD_SECONDS=12

echo "room-races-006d: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values ('%s', 'authenticated', 'authenticated', 'room-race-006d-a@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'room-race-006d-b@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'room-race-006d-c@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'room-race-006d-d@example.invalid', '');\n" "$UID_A" "$UID_B" "$UID_C" "$UID_D"
  printf "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id) values ('%s', 'Room Race', 'Diwali', (current_date + 30)::timestamp at time zone 'Asia/Kolkata', 'Asia/Kolkata', 50000, 'INR', 'secret_draw', '%s');\n" "$GROUP_ID" "$UID_A"
  printf "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('%s', '%s', 'joined', true, clock_timestamp(), 1), ('%s', '%s', 'joined', true, clock_timestamp() + interval '1 hour', 1), ('%s', '%s', 'invited', false, clock_timestamp(), 1), ('%s', '%s', 'invited', false, clock_timestamp(), 1);\n" "$GROUP_ID" "$UID_A" "$GROUP_ID" "$UID_B" "$GROUP_ID" "$UID_C" "$GROUP_ID" "$UID_D"
  printf "update public.profiles set display_name = 'Race Organizer' where id = '%s';\n" "$UID_A"
  printf "update public.profiles set display_name = 'Race Member' where id = '%s';\n" "$UID_B"
  printf "update public.profiles set display_name = 'Race Invitee' where id = '%s';\n" "$UID_C"
  printf "update public.profiles set display_name = 'Race Revoked' where id = '%s';\n" "$UID_D"
} | "${psql_base[@]}" >/dev/null || die "fixture seeding failed"

# Live targeted invitations for C and D, issued through the real RPC as the
# organizer. Token material is captured silently and never printed.
TOKEN_C="$(psql_as "$UID_A" "select token from public.issue_group_invitation('${GROUP_ID}'::uuid, '${UID_C}'::uuid);" | tail -n 1)"
TOKEN_D="$(psql_as "$UID_A" "select token from public.issue_group_invitation('${GROUP_ID}'::uuid, '${UID_D}'::uuid);" | tail -n 1)"
if [[ -z "$TOKEN_C" || ${#TOKEN_C} -ne 43 || -z "$TOKEN_D" || ${#TOKEN_D} -ne 43 ]]; then
  die "fixture token issuance failed"
fi

# --- one-statement body proof --------------------------------------------------

echo "scenario 0: the function body is one data-reading SQL statement"
# pg_get_functiondef renders the statement without a trailing separator, so
# zero semicolons proves no additional statement can hide in the body.
SEMICOLONS="$("${psql_base[@]}" <<< "select (length(body) - length(replace(body, ';', '')))::text from (select substring(pg_get_functiondef('public.group_room_snapshot(uuid)'::regprocedure) from '\\\$function\\\$(.*)\\\$function\\\$') as body) b;" | tail -n 1)"
if [[ "$SEMICOLONS" != "0" ]]; then
  die "the projection body is not one SQL statement (semicolons: ${SEMICOLONS})"
fi
echo "  ok: single-statement body"

# --- scenario 1: a committed removal cannot survive into a later data read -----

echo "scenario 1: removal held uncommitted while the other session reads"
launch_holder "$UID_A" "select result from public.remove_group_member('${GROUP_ID}'::uuid, '${UID_B}'::uuid);" "$HOLD_SECONDS"
await_holder_open 30

# The removed member's own read is wholly the pre-commit state.
read_expect "$UID_B" "the uncommitted removal changes nothing for the member's read" "4:1" \
  "select count(*)::text || ':' || coalesce(sum(case when member_user_id = '${UID_B}'::uuid then 1 else 0 end)::text, '0') from public.group_room_snapshot('${GROUP_ID}'::uuid);"

await_holder_exit 45

read_expect "$UID_B" "after the commit the removed member reads zero rows" "0" \
  "select count(*)::text from public.group_room_snapshot('${GROUP_ID}'::uuid);"

# --- scenario 2: an uncommitted acceptance produces no mixed rows ---------------

echo "scenario 2: acceptance held uncommitted while the organizer reads"
launch_holder "$UID_C" "select result from public.accept_group_invitation('${TOKEN_C}');" "$HOLD_SECONDS"
await_holder_open 30

read_expect "$UID_A" "the uncommitted acceptance shows C still invited, once" "3:1:0" \
  "select count(*)::text || ':' || coalesce(sum(case when member_user_id = '${UID_C}'::uuid and member_state = 'invited' then 1 else 0 end)::text, '0') || ':' || coalesce(sum(case when member_user_id = '${UID_C}'::uuid and member_state = 'joined' then 1 else 0 end)::text, '0') from public.group_room_snapshot('${GROUP_ID}'::uuid);"

await_holder_exit 45

read_expect "$UID_A" "after the commit C is joined exactly once and the count matches" "3:1:2" \
  "select count(*)::text || ':' || coalesce(sum(case when member_user_id = '${UID_C}'::uuid and member_state = 'joined' then 1 else 0 end)::text, '0') || ':' || (select joined_member_count::text from public.group_room_snapshot('${GROUP_ID}'::uuid) limit 1) from public.group_room_snapshot('${GROUP_ID}'::uuid);"

# --- scenario 3: a committed revocation cannot leave a pending row -------------

echo "scenario 3: targeted-invitation revoke held uncommitted while the organizer reads"
launch_holder "$UID_A" "select result from public.revoke_group_invitation('${GROUP_ID}'::uuid, (select id from public.group_invitations where group_id = '${GROUP_ID}'::uuid and target_user_id = '${UID_D}'::uuid limit 1));" "$HOLD_SECONDS"
await_holder_open 30

read_expect "$UID_A" "the uncommitted revoke still shows the pending row" "1" \
  "select count(*)::text from public.group_room_snapshot('${GROUP_ID}'::uuid) where member_user_id = '${UID_D}'::uuid;"

await_holder_exit 45

read_expect "$UID_A" "after the commit the revoked invitee produces no row" "0" \
  "select count(*)::text from public.group_room_snapshot('${GROUP_ID}'::uuid) where member_user_id = '${UID_D}'::uuid;"

# --- reads never write ----------------------------------------------------------
# The audit events here are exactly the harness's own mutations: two
# targeted issuances (member_reinvited), one acceptance, one removal, and
# one revocation. The room reads themselves appended nothing.
AUDITS="$("${psql_base[@]}" <<< "select count(*)::text from public.audit_events where group_id = '${GROUP_ID}'::uuid;" | tail -n 1)"
if [[ "$AUDITS" != "5" ]]; then
  die "unexpected audit events from room reads (got ${AUDITS})"
fi
echo "  ok: the harness's reads appended no audit event"

echo "room-races-006d: all scenarios passed"
