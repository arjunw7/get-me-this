#!/usr/bin/env bash
# Two-session race harness for the 007a reactions slice (brief
# docs/delivery/issues/007a-reactions-owner-summaries.md, race criterion).
#
# Run with: pnpm test:db:races:reservations
#
# Contract (same as scripts/test-group-races-local.sh):
#   * Selects this repository's local Supabase database container exactly.
#   * Opens TWO INDEPENDENT psql sessions interleaved with explicit barriers.
#   * Finite timeouts; nonzero exit on any assertion failure or timeout.
#   * Synthetic fixed-uuid fixtures cleaned up on every exit path; no bearer
#     or credential material is ever printed.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
  echo "Could not read project_id from $config_file." >&2
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

psql_base=(docker exec -i "$db_container" psql --no-psqlrc --no-align --tuples-only
  --set ON_ERROR_STOP=1 --user postgres --dbname postgres)

psql_one() {
  "${psql_base[@]}"
}

# Synthetic fixed fixture ids (hex only). Never real users; removed on exit.
UID_A='a6200000-0000-4000-8000-00000000a601'
UID_B='a6200000-0000-4000-8000-00000000a602'
UID_C='a6200000-0000-4000-8000-00000000a603'
GID='a6200000-0000-4000-8000-000000000a01'
ITEM1='a6200000-0000-4000-8000-000000000101'

tmpdir="$(mktemp -d /tmp/gmt-reservation-races.XXXXXX)"
A_IN="$tmpdir/a.in"
A_OUT="$tmpdir/a.out"
B_IN="$tmpdir/b.in"
B_OUT="$tmpdir/b.out"
A_PID=""; B_PID=""
mkfifo "$A_IN" "$B_IN"
touch "$A_OUT" "$B_OUT"

cleanup() {
  {
    printf 'begin;\n'
    printf "delete from public.group_item_reservations where group_id = '%s';\n" "$GID"
    printf "delete from public.audit_events where group_id = '%s';\n" "$GID"
    printf "delete from public.group_members where group_id = '%s' or user_id = any(array['%s','%s','%s']::uuid[]);\n" "$GID" "$UID_A" "$UID_B" "$UID_C"
    printf "delete from public.\"groups\" where id = '%s';\n" "$GID"
    printf "delete from public.wishlist_items where owner_id = '%s';\n" "$UID_A"
    printf "delete from public.wishlists where owner_id = '%s';\n" "$UID_A"
    printf "delete from auth.users where id = any(array['%s','%s','%s']::uuid[]);\n" "$UID_A" "$UID_B" "$UID_C"
    printf 'commit;\n'
  } | psql_one >/dev/null 2>&1 || true
  if [ -n "$A_PID" ]; then kill "$A_PID" 2>/dev/null || true; fi
  if [ -n "$B_PID" ]; then kill "$B_PID" 2>/dev/null || true; fi
  rm -rf "$tmpdir"
}
trap cleanup EXIT

die() {
  echo "reservation-races: $1" >&2
  if [ -f "$A_OUT" ]; then echo "--- session A tail ---" >&2; tail -5 "$A_OUT" >&2 || true; fi
  if [ -f "$B_OUT" ]; then echo "--- session B tail ---" >&2; tail -5 "$B_OUT" >&2 || true; fi
  exit 1
}

# --- two persistent sessions (file-based outputs; fifos for inputs only) ---------

"${psql_base[@]}" < "$A_IN" >> "$A_OUT" 2>&1 &
A_PID=$!
"${psql_base[@]}" < "$B_IN" >> "$B_OUT" 2>&1 &
B_PID=$!

exec 3>"$A_IN"
exec 5>"$B_IN"

OFF_A=0
OFF_B=0

session_file() {
  case "$1" in
    3) printf '%s' "$A_OUT" ;;
    5) printf '%s' "$B_OUT" ;;
    *) die "unknown session $1" ;;
  esac
}

await() {
  local fd="$1" pattern="$2" timeout="${3:-25}"
  local file
  file="$(session_file "$fd")"
  local off
  case "$fd" in 3) off=OFF_A ;; 5) off=OFF_B ;; esac
  local pos="${!off}"
  local start now
  start=$(date +%s)
  while :; do
    if ! kill -0 "$A_PID" 2>/dev/null && [ "$fd" = 3 ]; then
      die "session A closed (tail above); waiting for '${pattern}'"
    fi
    if ! kill -0 "$B_PID" 2>/dev/null && [ "$fd" = 5 ]; then
      die "session B closed (tail above); waiting for '${pattern}'"
    fi
    if tail -c +"$((pos + 1))" "$file" 2>/dev/null | grep -q -- "$pattern"; then
      pos=$(wc -c < "$file" | tr -d ' ')
      case "$fd" in 3) OFF_A=${pos} ;; 5) OFF_B=${pos} ;; esac
      return 0
    fi
    now=$(date +%s)
    if [ $((now - start)) -ge "$timeout" ]; then
      die "timeout waiting for '${pattern}' on fd ${fd}"
    fi
    sleep 0.2
  done
}

send() {
  printf '%s\n' "$2" >&"$1"
}

as_user() {
  send "$1" "set request.jwt.claim.sub = '${2}';"
  send "$1" "set request.jwt.claim.role = 'authenticated';"
  send "$1" "set request.jwt.claims = '{\"sub\":\"${2}\",\"role\":\"authenticated\"}';"
}

check() {
  local name="$2"
  send "$1" "select 'CHK-${2}=' || case when (${3}) then 'pass' else 'FAIL' end;"
  local file
  file="$(session_file "$1")"
  local off
  case "$1" in 3) off=OFF_A ;; 5) off=OFF_B ;; esac
  local pos="${!off}"
  local start now line
  start=$(date +%s)
  while :; do
    if tail -c +"$((pos + 1))" "$file" 2>/dev/null | grep -q -- "CHK-${name}="; then
      line="$(tail -c +"$((pos + 1))" "$file" | grep -- "CHK-${name}=" | head -n 1)"
      pos=$(wc -c < "$file" | tr -d ' ')
      case "$1" in 3) OFF_A=${pos} ;; 5) OFF_B=${pos} ;; esac
      case "$line" in
        "CHK-${name}=pass") echo "  ok: ${name}"; return 0 ;;
        *) die "check failed: ${name}" ;;
      esac
    fi
    now=$(date +%s)
    if [ $((now - start)) -ge 25 ]; then
      die "timeout waiting for check ${name}"
    fi
    sleep 0.2
  done
}

send 3 'set statement_timeout = 15000;'
send 3 'set lock_timeout = 10000;'
send 3 'set idle_session_timeout = 30000;'
send 5 'set statement_timeout = 15000;'
send 5 'set lock_timeout = 10000;'
send 5 'set idle_session_timeout = 30000;'

# --- fixtures ------------------------------------------------------------------

echo "reservation-races: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values\n"
  printf "  ('%s', 'authenticated', 'authenticated', 'reservation-race-a@example.invalid', ''),\n" "$UID_A"
  printf "  ('%s', 'authenticated', 'authenticated', 'reservation-race-b@example.invalid', ''),\n" "$UID_B"
  printf "  ('%s', 'authenticated', 'authenticated', 'reservation-race-c@example.invalid', '')\n" "$UID_C"
  printf "on conflict (id) do nothing;\n"
  printf "insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)\n"
  printf "select '%s', w.id, '%s', 'Reservation Race Fixture Mug', 1, 'manual' from public.wishlists w where w.owner_id = '%s' on conflict (id) do nothing;\n" "$ITEM1" "$UID_A" "$UID_A"
  printf "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, mode, status, organizer_id)\n"
  printf "values ('%s', 'Reservation Race Group', 'birthday', '2026-12-20 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'active', '%s') on conflict (id) do nothing;\n" "$GID" "$UID_A"
  printf "insert into public.group_members (group_id, user_id, status, membership_generation, joined_at) values\n"
  printf "  ('%s', '%s', 'joined', 1, clock_timestamp()),\n" "$GID" "$UID_A"
  printf "  ('%s', '%s', 'joined', 1, clock_timestamp()),\n" "$GID" "$UID_B"
  printf "  ('%s', '%s', 'joined', 1, clock_timestamp())\n" "$GID" "$UID_C"
  printf "on conflict do nothing;\n"
} | psql_one >/dev/null || die "synthetic fixture seeding failed"

claim_result() {
  printf "select result from public.reserve_group_item('%s'::uuid, '%s'::uuid);\n" "$1" "$2"
}

release_result() {
  printf "select result from public.release_group_reservation('%s'::uuid, (select id from public.group_item_reservations where group_id = '%s' and item_id = '%s' and reserver_id = '%s'));" "$1" "$1" "$2" "$3"
}

reset_reservations() {
  psql_one >/dev/null <<SQL || die "$1 failed"
delete from public.group_item_reservations where group_id = '${GID}';
SQL
}

# --- scenario 1: double-claim on the same item from two members ---------------------

echo "scenario 1: double-claim on the same item (winner reserved, loser conflict/rollback)"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(claim_result "$GID" "$ITEM1")"
await 3 "reserved"

send 5 "begin;"
as_user 5 "$UID_C"
send 5 "$(claim_result "$GID" "$ITEM1")"
sleep 1
send 3 "commit;"
await 5 "conflict"
send 5 "rollback;"
send 5 "select 'MARK-S1-RB';"
await 5 "MARK-S1-RB"

check 3 "s1-one-active" "1 = (select count(*) from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}' and status = 'active')"
check 3 "s1-winner" "(select reserver_id from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}' and status = 'active') = '${UID_B}'"
check 3 "s1-no-history" "1 = (select count(*) from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}')"

# --- scenario 2: claim vs release, release commits first ----------------------------

echo "scenario 2: claim vs release, release commits first"
reset_reservations "scenario 2 reset"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(claim_result "$GID" "$ITEM1")"
await 3 "reserved"
send 3 "commit;"
send 3 "select 'MARK-S2-SEED';"
await 3 "MARK-S2-SEED"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(release_result "$GID" "$ITEM1" "$UID_B")"
await 3 "released"

send 5 "begin;"
as_user 5 "$UID_C"
send 5 "$(claim_result "$GID" "$ITEM1")"
sleep 1
send 3 "commit;"
await 5 "reserved"
send 5 "commit;"
send 5 "select 'MARK-S2-O1';"
await 5 "MARK-S2-O1"

check 3 "s2-o1-holder" "(select reserver_id from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}' and status = 'active') = '${UID_C}'"
check 3 "s2-o1-rows" "2 = (select count(*) from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}')"

# --- scenario 3: claim vs release, claim commits first (loser rollback)
echo "scenario 3: claim vs release, claim commits first (loser rollback)"
reset_reservations "scenario 3 reset"

# Session A claims the item but does not commit yet.
send 3 "begin;"
as_user 3 "$UID_C"
send 3 "$(claim_result "$GID" "$ITEM1")"
await 3 "reserved"

# Session B (same reserver, second tab) attempts a release before the claim is
# visible; it must fail atomically rather than block or half-apply.
send 5 "begin;"
as_user 5 "$UID_C"
send 5 "$(release_result "$GID" "$ITEM1" "$UID_C")"
send 5 "select 'MARK-S3-UNAVAIL';"
await 5 "MARK-S3-UNAVAIL"
send 5 "rollback;"
send 5 "select 'MARK-S3-RB';"
await 5 "MARK-S3-RB"

send 3 "commit;"
send 3 "select 'MARK-S3-DONE';"
await 3 "MARK-S3-DONE"

check 3 "s3-active" "(select status::text from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}' and reserver_id = '${UID_C}') = 'active'"
check 3 "s3-one-row" "1 = (select count(*) from public.group_item_reservations where group_id = '${GID}' and item_id = '${ITEM1}')"

# --- scenario 4: claim vs owner item-delete, delete commits first -------------------

echo "scenario 4: claim vs owner item-delete, delete commits first"
reset_reservations "scenario 4 reset"

send 3 "begin;"
as_user 3 "$UID_A"
send 3 "delete from public.wishlist_items where id = '${ITEM1}';"
send 3 "select 'MARK-S4-DEL';"
await 3 "MARK-S4-DEL"
send 3 "commit;"
send 3 "select 'MARK-S4-DELC';"
await 3 "MARK-S4-DELC"

send 5 "begin;"
as_user 5 "$UID_B"
send 5 "$(claim_result "$GID" "$ITEM1")"
send 5 "select 'MARK-S4-DENIED';"
await 5 "MARK-S4-DENIED"
send 5 "rollback;"
send 5 "select 'MARK-S4-RB';"
await 5 "MARK-S4-RB"

check 3 "s4-no-orphan" "not exists (select 1 from public.group_item_reservations where item_id = '${ITEM1}')"

# --- scenario 5: claim vs owner item-delete, claim commits first --------------------

echo "scenario 5: claim vs owner item-delete, claim commits first"
psql_one >/dev/null <<SQL || die "scenario 5 item reset failed"
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)
select '${ITEM1}', w.id, '${UID_A}', 'Reservation Race Fixture Mug', 1, 'manual' from public.wishlists w where w.owner_id = '${UID_A}' on conflict (id) do nothing;
SQL

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(claim_result "$GID" "$ITEM1")"
await 3 "reserved"

send 5 "begin;"
as_user 5 "$UID_A"
send 5 "delete from public.wishlist_items where id = '${ITEM1}';"
sleep 1
send 3 "commit;"
send 5 "select 'MARK-S5-DEL';"
await 5 "MARK-S5-DEL"
send 5 "commit;"
send 5 "select 'MARK-S5-DONE';"
await 5 "MARK-S5-DONE"

check 3 "s5-released" "(select status::text || ':' || released_reason::text from public.group_item_reservations where reserver_id = '${UID_B}' and item_id is null) = 'released:item_deleted'"
check 3 "s5-item-null" "(select item_id is null from public.group_item_reservations where item_id is null and reserver_id = '${UID_B}')"

echo "reservation-races: all scenarios passed"
