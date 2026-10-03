#!/usr/bin/env bash
# Two-session race harness for the 008b gift-everyone checklist contract
# (brief docs/delivery/issues/008b-gift-everyone-checklists.md, acceptance
# criterion 9a and 9b): concurrent first markings of the same pair produce
# exactly one row and one counted change, and concurrent same-version CAS
# changes serialize so exactly one wins with the loser reporting conflict.
#
# Run with: pnpm test:db:races:gifting   (runnable locally against a running
# stack; CI wiring is an explicit orchestrator decision on this head).
#
# Contract (same discipline as scripts/test-group-races-006b-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote or hosted database.
#   * Opens TWO INDEPENDENT psql sessions per scenario and interleaves them
#     with explicit barriers. Never two sequential calls on one connection.
#   * Every session has finite statement/lock timeouts; the script exits
#     nonzero on any assertion failure or timeout.
#   * All fixtures are synthetic (fixed uuid constants); the harness cleans
#     them up on every exit path. No token or credential material is printed.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
config_file="$repo_root/supabase/config.toml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed, so the local Supabase stack cannot run." >&2
  exit 1
fi

project_id="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p' "$config_file" | head -n 1)"
db_container_name="supabase_db_${project_id}"

if [ "$(docker ps -q --filter "name=${db_container_name}" | wc -l | tr -d ' ')" -ne 1 ]; then
  echo "Local Supabase is not running (expected exactly one ${db_container_name}). Start it with: pnpm db:start" >&2
  exit 1
fi

psql_base=(docker exec -i "$db_container_name" psql --no-psqlrc --quiet --no-align --tuples-only
  --set ON_ERROR_STOP=1 --user postgres --dbname postgres)

# Synthetic fixed fixture ids (hex only). Removed on every exit path.
UID_A='a8000000-0000-4000-8000-00000000a801'
UID_B='a8000000-0000-4000-8000-00000000a802'
GROUP_ID='a8000000-0000-4000-8000-00000000a803'

tmpdir="$(mktemp -d /tmp/gmt-gift-races.XXXXXX)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

mkfifo "$tmpdir/a1.in" "$tmpdir/a1.out" "$tmpdir/b1.in" "$tmpdir/b1.out" \
       "$tmpdir/a2.in" "$tmpdir/a2.out" "$tmpdir/b2.in" "$tmpdir/b2.out"

fixture_sql() {
  {
    echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
    echo "insert into auth.users (id, aud, role, email, encrypted_password) values ('$UID_A','authenticated','authenticated','gift-race-a@example.invalid',''),('$UID_B','authenticated','authenticated','gift-race-b@example.invalid','');"
    echo "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id) values ('$GROUP_ID','Race Crew','Other','2026-12-01','Asia/Kolkata',1000,'INR','gift_everyone','$UID_A');"
    echo "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('$GROUP_ID','$UID_A','joined',true,clock_timestamp(),1),('$GROUP_ID','$UID_B','joined',true,clock_timestamp(),1);"
    echo "commit;"
  } | "${psql_base[@]}" >/dev/null
}

cleanup_sql() {
  {
    echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
    echo "delete from public.gift_checklist_entries where group_id = '$GROUP_ID';"
    echo "delete from public.audit_events where group_id = '$GROUP_ID';"
    echo "delete from public.group_members where group_id = '$GROUP_ID';"
    echo "delete from public.group_creation_receipts where group_id = '$GROUP_ID' or actor_id = any(array['$UID_A','$UID_B']::uuid[]);"
    echo "delete from public.\"groups\" where id = '$GROUP_ID';"
    echo "delete from auth.users where id = any(array['$UID_A','$UID_B']::uuid[]);"
    echo "commit;"
  } | "${psql_base[@]}" >/dev/null 2>&1 || true
}
trap cleanup_sql EXIT

die() {
  echo "gift-checklist-races: $1" >&2
  exit 1
}

fixture_sql

# Both racing sessions act as the SAME giver (A) for the same recipient (B):
# the unique (group, giver, recipient) key and the CAS version are what the
# two sessions contend on.
claim_a="select set_config('request.jwt.claim.sub', '$UID_A', true); select set_config('request.jwt.claims', '{\"sub\":\"$UID_A\",\"role\":\"authenticated\"}', true);"

# ---------------------------------------------------------------------------
# Scenario (a): two concurrent FIRST markings of the same pair. Exactly one
# row and one counted change; the loser reports conflict with version 1.
# ---------------------------------------------------------------------------
"${psql_base[@]}" < "$tmpdir/a1.in" > "$tmpdir/a1.out" 2>&1 &
A1_PID=$!
"${psql_base[@]}" < "$tmpdir/b1.in" > "$tmpdir/b1.out" 2>&1 &
B1_PID=$!

{
  echo "set statement_timeout = '20s'; set lock_timeout = '15s'; begin;"
  echo "$claim_a"
  # Runs the function, which blocks on the group row lock held by session B1.
  echo "select 'a-first:' || result || ':' || version::text from public.set_gift_checklist_entry_status('$GROUP_ID'::uuid, '$UID_B'::uuid, null, 'todo');"
  echo "commit;"
} > "$tmpdir/a1.in" &

{
  echo "set statement_timeout = '20s'; set lock_timeout = '15s'; begin;"
  echo "$claim_a"
  # Barrier: hold the group row lock; A1 blocks inside its function call.
  echo "select 1 from public.\"groups\" where id = '$GROUP_ID'::uuid for update;"
  echo "select 'b1-ready';"
  sleep 2
  echo "select 'b-first:' || result || ':' || version::text from public.set_gift_checklist_entry_status('$GROUP_ID'::uuid, '$UID_B'::uuid, null, 'todo');"
  echo "commit;"
} > "$tmpdir/b1.in" &

sleep 8

grep -q "b1-ready" "$tmpdir/b1.out" || die "scenario (a): session B1 never acquired the group lock"
grep -q "b-first:updated:1" "$tmpdir/b1.out" || die "scenario (a): the lock-holding first marking did not commit as updated:1"
grep -q "a-first:conflict:1" "$tmpdir/a1.out" || die "scenario (a): the blocked first marking did not report conflict with the winner's version"

kill "$A1_PID" "$B1_PID" 2>/dev/null || true
wait "$A1_PID" 2>/dev/null || true
wait "$B1_PID" 2>/dev/null || true

row_count="$("${psql_base[@]}" -t -c "select count(*) from public.gift_checklist_entries where group_id = '$GROUP_ID'::uuid and giver_id = '$UID_A'::uuid and recipient_id = '$UID_B'::uuid;")"
[ "$row_count" = "1" ] || die "scenario (a): expected exactly one stored row for the pair, found $row_count"

# ---------------------------------------------------------------------------
# Scenario (b): concurrent complete/complete with the same expected version.
# Exactly one wins (version 2); the loser reports conflict with version 2.
# ---------------------------------------------------------------------------
"${psql_base[@]}" < "$tmpdir/a2.in" > "$tmpdir/a2.out" 2>&1 &
A2_PID=$!
"${psql_base[@]}" < "$tmpdir/b2.in" > "$tmpdir/b2.out" 2>&1 &
B2_PID=$!

{
  echo "set statement_timeout = '20s'; set lock_timeout = '15s'; begin;"
  echo "$claim_a"
  echo "select 'a-cas:' || result || ':' || version::text from public.set_gift_checklist_entry_status('$GROUP_ID'::uuid, '$UID_B'::uuid, 1, 'completed');"
  echo "commit;"
} > "$tmpdir/a2.in" &

{
  echo "set statement_timeout = '20s'; set lock_timeout = '15s'; begin;"
  echo "$claim_a"
  echo "select 1 from public.\"groups\" where id = '$GROUP_ID'::uuid for update;"
  echo "select 'b2-ready';"
  sleep 2
  echo "select 'b-cas:' || result || ':' || version::text from public.set_gift_checklist_entry_status('$GROUP_ID'::uuid, '$UID_B'::uuid, 1, 'completed');"
  echo "commit;"
} > "$tmpdir/b2.in" &

sleep 8

grep -q "b2-ready" "$tmpdir/b2.out" || die "scenario (b): session B2 never acquired the group lock"
grep -q "b-cas:updated:2" "$tmpdir/b2.out" || die "scenario (b): the lock-holding CAS did not commit as updated:2"
grep -q "a-cas:conflict:2" "$tmpdir/a2.out" || die "scenario (b): the stale CAS did not report conflict with the current version"

final_version="$("${psql_base[@]}" -t -c "select version from public.gift_checklist_entries where group_id = '$GROUP_ID'::uuid and giver_id = '$UID_A'::uuid and recipient_id = '$UID_B'::uuid;")"
[ "$final_version" = "2" ] || die "scenario (b): the loser's write landed; final version is $final_version"

kill "$A2_PID" "$B2_PID" 2>/dev/null || true
wait "$A2_PID" 2>/dev/null || true
wait "$B2_PID" 2>/dev/null || true

echo "gift-checklist-races: all scenarios passed"
