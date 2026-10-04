#!/usr/bin/env bash
# Two-session race harness for the 007a reactions slice (brief
# docs/delivery/issues/007a-reactions-owner-summaries.md, race criterion).
#
# Run with: pnpm test:db:races:reactions
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
UID_A='a6100000-0000-4000-8000-00000000a601'
UID_B='a6100000-0000-4000-8000-00000000a602'
UID_C='a6100000-0000-4000-8000-00000000a603'
GID='a6100000-0000-4000-8000-000000000a01'
ITEM1='a6100000-0000-4000-8000-000000000101'
ITEM2='a6100000-0000-4000-8000-000000000102'

tmpdir="$(mktemp -d /tmp/gmt-reaction-races.XXXXXX)"
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
    printf "delete from public.group_item_reactions where group_id = '%s';\n" "$GID"
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
  echo "reaction-races: $1" >&2
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

# session_file FD: map a session number to its output file.
session_file() {
  case "$1" in
    3) printf '%s' "$A_OUT" ;;
    5) printf '%s' "$B_OUT" ;;
    *) die "unknown session $1" ;;
  esac
}

# await FD PATTERN [timeout]: poll the session's output file for a new line
# containing PATTERN, advancing the read offset. A dead session (ON_ERROR_STOP)
# or a timeout is fatal, with the session tail for diagnosis.
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
    if kill -0 "${A_PID}" 2>/dev/null && [ "$fd" = 3 ]; then :; fi
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

# send FD SQL: write one SQL statement (with its semicolon) to the session.
send() {
  printf '%s\n' "$2" >&"$1"
}

# as_user FD UID: switch the session's synthetic JWT identity (session-level
# SET, always issued outside an explicit transaction).
as_user() {
  send "$1" "set request.jwt.claim.sub = '${2}';"
  send "$1" "set request.jwt.claim.role = 'authenticated';"
  send "$1" "set request.jwt.claims = '{\"sub\":\"${2}\",\"role\":\"authenticated\"}';"
}

# check SESSION NAME SQL-BOOLEAN: assert a boolean expression inside the
# session. A FAIL marker or a dead session (ON_ERROR_STOP=1) is fatal.
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

# result FD PATTERN: one-shot statement whose result line must equal PATTERN.
send 3 'set statement_timeout = 15000;'
send 3 'set lock_timeout = 10000;'
send 3 'set idle_session_timeout = 30000;'
send 5 'set statement_timeout = 15000;'
send 5 'set lock_timeout = 10000;'
send 5 'set idle_session_timeout = 30000;'

# --- fixtures ------------------------------------------------------------------

echo "reaction-races: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values\n"
  printf "  ('%s', 'authenticated', 'authenticated', 'reaction-race-a@example.invalid', ''),\n" "$UID_A"
  printf "  ('%s', 'authenticated', 'authenticated', 'reaction-race-b@example.invalid', ''),\n" "$UID_B"
  printf "  ('%s', 'authenticated', 'authenticated', 'reaction-race-c@example.invalid', '')\n" "$UID_C"
  printf "on conflict (id) do nothing;\n"
  printf "insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)\n"
  printf "select '%s', w.id, '%s', 'Reaction Race Fixture Mug', 1, 'manual' from public.wishlists w where w.owner_id = '%s' on conflict (id) do nothing;\n" "$ITEM1" "$UID_A" "$UID_A"
  printf "insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)\n"
  printf "select '%s', w.id, '%s', 'Reaction Race Fixture Lamp', 2, 'manual' from public.wishlists w where w.owner_id = '%s' on conflict (id) do nothing;\n" "$ITEM2" "$UID_A" "$UID_A"
  printf "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, mode, status, organizer_id)\n"
  printf "values ('%s', 'Reaction Race Group', 'birthday', '2026-12-20 10:00:00+00', 'Asia/Kolkata', 'wishlist_only', 'active', '%s') on conflict (id) do nothing;\n" "$GID" "$UID_A"
  printf "insert into public.group_members (group_id, user_id, status, membership_generation, joined_at) values\n"
  printf "  ('%s', '%s', 'joined', 1, clock_timestamp()),\n" "$GID" "$UID_A"
  printf "  ('%s', '%s', 'joined', 1, clock_timestamp()),\n" "$GID" "$UID_B"
  printf "  ('%s', '%s', 'joined', 1, clock_timestamp())\n" "$GID" "$UID_C"
  printf "on conflict do nothing;\n"
} | psql_one >/dev/null || die "synthetic fixture seeding failed"

reaction_result() {
  printf "select very_you_count || ',' || questionable_count || ',' || want_it_too_count || ',' || coalesce(viewer_reaction::text, 'none') from public.set_group_item_reaction('%s'::uuid, '%s'::uuid, %s);\n" "$1" "$2" "$3"
}

# --- scenario 1: replace vs replace with different kinds --------------------------

echo "scenario 1: replace vs replace with different kinds (same context, two sessions)"
send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
await 3 "1,0,0,very_you"

send 5 "begin;"
as_user 5 "$UID_B"
send 5 "$(reaction_result "$GID" "$ITEM1" "'want_it_too'")"
sleep 1
send 3 "commit;"
await 5 "0,0,1,want_it_too"
send 5 "commit;"
send 5 "select 'MARK-S1-COMMIT';"
await 5 "MARK-S1-COMMIT"

check 3 "s1-one-row" "1 = (select count(*) from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}' and user_id = '${UID_B}')"
check 3 "s1-valid-kind" "(select reaction::text from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}' and user_id = '${UID_B}') in ('very_you','questionable','want_it_too')"

psql_one >/dev/null <<SQL || die "scenario 1 cleanup failed"
delete from public.group_item_reactions where group_id = '${GID}';
SQL

# --- scenario 2: replace vs remove, both commit orders ----------------------------

echo "scenario 2: replace vs remove (remove commits first, then replace commits first)"

# Seed B's reaction, committed.
send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
await 3 "1,0,0,very_you"
send 3 "commit;"
send 3 "select 'MARK-S2-SEED';"
await 3 "MARK-S2-SEED"

# Order 1: B's removal commits while B's second-session replace waits on the row.
send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(reaction_result "$GID" "$ITEM1" "null")"
await 3 "0,0,0,none"

send 5 "begin;"
as_user 5 "$UID_B"
send 5 "$(reaction_result "$GID" "$ITEM1" "'questionable'")"
sleep 1
send 3 "commit;"
await 5 "0,1,0,questionable"
send 5 "commit;"
send 5 "select 'MARK-S2-O1';"
await 5 "MARK-S2-O1"

check 3 "s2-o1-state" "(select reaction::text from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}' and user_id = '${UID_B}') = 'questionable'"
check 3 "s2-o1-rows" "1 = (select count(*) from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}')"

psql_one >/dev/null <<SQL || die "scenario 2 reset failed"
delete from public.group_item_reactions where group_id = '${GID}';
SQL

# Order 2: B's replace commits while B's second-session remove waits.
send 5 "begin;"
as_user 5 "$UID_B"
send 5 "$(reaction_result "$GID" "$ITEM1" "'want_it_too'")"
await 5 "0,0,1,want_it_too"
send 5 "commit;"
send 5 "select 'MARK-S2-O2';"
await 5 "MARK-S2-O2"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(reaction_result "$GID" "$ITEM1" "null")"
await 3 "0,0,0,none"
send 3 "commit;"
send 3 "select 'MARK-S2-O2B';"
await 3 "MARK-S2-O2B"

check 3 "s2-o2-state" "not exists (select 1 from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}' and user_id = '${UID_B}')"
check 3 "s2-o2-gone" "not exists (select 1 from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}')"

# --- scenario 3: same-kind double set from two tabs --------------------------------

echo "scenario 3: same-kind double set from two tabs"
psql_one >/dev/null <<SQL || die "scenario 3 reset failed"
delete from public.group_item_reactions where group_id = '${GID}';
SQL

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
await 3 "1,0,0,very_you"

send 5 "begin;"
as_user 5 "$UID_B"
send 5 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
sleep 1
send 3 "commit;"
await 5 "1,0,0,very_you"
send 5 "commit;"
send 5 "select 'MARK-S3-COMMIT';"
await 5 "MARK-S3-COMMIT"

check 3 "s3-one-row" "1 = (select count(*) from public.group_item_reactions where group_id = '${GID}' and item_id = '${ITEM1}' and user_id = '${UID_B}')"

# --- scenario 4: reaction set vs organizer removal of the reactor -------------------

echo "scenario 4: reaction set vs organizer removal of the reactor (both commit orders)"
psql_one >/dev/null <<SQL || die "scenario 4 reset failed"
delete from public.group_item_reactions where group_id = '${GID}';
SQL

# Order 1: the removal commits first; the reactor's write is denied.
send 3 "begin;"
as_user 3 "$UID_A"
send 3 "select member_admin_version::text from public.remove_group_member('${GID}'::uuid, '${UID_C}'::uuid, (select member_admin_version from public.group_admin_version('${GID}'::uuid)));"
await 3 "1"
send 3 "commit;"
send 3 "select 'MARK-S4-REMOVED';"
await 3 "MARK-S4-REMOVED"

send 5 "begin;"
as_user 5 "$UID_C"
send 5 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
send 5 "select 'MARK-S4-DENIED';"
await 5 "MARK-S4-DENIED"
send 5 "rollback;"
send 5 "select 'MARK-S4-RB';"
await 5 "MARK-S4-RB"

check 3 "s4-o1-no-row" "not exists (select 1 from public.group_item_reactions where group_id = '${GID}' and user_id = '${UID_C}')"

# Reinstate C (joined again via direct fixture write) for order 2.
psql_one >/dev/null <<SQL || die "scenario 4 reinstate failed"
update public.group_members set status = 'joined', membership_generation = membership_generation + 1
where group_id = '${GID}' and user_id = '${UID_C}';
SQL

# Order 2: the write commits first; the row persists but the summary excludes
# it while the author is not joined.
send 3 "begin;"
as_user 3 "$UID_C"
send 3 "$(reaction_result "$GID" "$ITEM1" "'want_it_too'")"
await 3 "0,0,1,want_it_too"
send 3 "commit;"
send 3 "select 'MARK-S4-O2';"
await 3 "MARK-S4-O2"

send 5 "begin;"
as_user 5 "$UID_A"
send 5 "select member_admin_version::text from public.remove_group_member('${GID}'::uuid, '${UID_C}'::uuid, (select member_admin_version from public.group_admin_version('${GID}'::uuid)));"
await 5 "2"
send 5 "commit;"
send 5 "select 'MARK-S4-O2R';"
await 5 "MARK-S4-O2R"

check 3 "s4-o2-row-persists" "exists (select 1 from public.group_item_reactions where group_id = '${GID}' and user_id = '${UID_C}')"
check 3 "s4-o2-summary-excludes" "0 = (select count(*) from public.group_item_reaction_snapshot('${GID}'::uuid, '${UID_A}'::uuid) s where s.item_id = '${ITEM1}'::uuid and s.very_you_count + s.questionable_count + s.want_it_too_count > 0)"

# --- scenario 5: reaction set vs owner hard-deleting the item -----------------------

echo "scenario 5: reaction set vs owner hard-deleting the item"
psql_one >/dev/null <<SQL || die "scenario 5 reset failed"
delete from public.group_item_reactions where group_id = '${GID}';
SQL

# Order 1: the delete commits first; the waiting write fails atomically.
send 3 "begin;"
as_user 3 "$UID_A"
send 3 "delete from public.wishlist_items where id = '${ITEM1}';"
send 3 "select 'MARK-S5-DEL';"
await 3 "MARK-S5-DEL"
send 3 "commit;"
send 3 "select 'MARK-S5-DELC';"
await 3 "MARK-S5-DELC"

send 5 "begin;"
as_user 5 "$UID_B"
send 5 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
send 5 "select 'MARK-S5-DENIED';"
await 5 "MARK-S5-DENIED"
send 5 "rollback;"
send 5 "select 'MARK-S5-RB';"
await 5 "MARK-S5-RB"

check 3 "s5-o1-no-orphan" "not exists (select 1 from public.group_item_reactions where item_id = '${ITEM1}')"

# Order 2: the write commits first; the delete still succeeds and cascades.
psql_one >/dev/null <<SQL || die "scenario 5 item reset failed"
insert into public.wishlist_items (id, wishlist_id, owner_id, title, sort_position, extraction_status)
select '${ITEM1}', w.id, '${UID_A}', 'Reaction Race Fixture Mug', 1, 'manual' from public.wishlists w where w.owner_id = '${UID_A}';
SQL

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "$(reaction_result "$GID" "$ITEM1" "'very_you'")"
await 3 "1,0,0,very_you"
send 3 "commit;"
send 3 "select 'MARK-S5-O2';"
await 3 "MARK-S5-O2"

send 5 "begin;"
as_user 5 "$UID_A"
send 5 "delete from public.wishlist_items where id = '${ITEM1}';"
send 5 "select 'MARK-S5-DEL2';"
await 5 "MARK-S5-DEL2"
send 5 "commit;"
send 5 "select 'MARK-S5-DEL2C';"
await 5 "MARK-S5-DEL2C"

check 3 "s5-o2-no-orphan" "not exists (select 1 from public.group_item_reactions where item_id = '${ITEM1}')"

echo "reaction-races: all scenarios passed"
