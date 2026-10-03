#!/usr/bin/env bash
# Two-session race harness for the 008c secret-draw contract (brief
# docs/delivery/issues/008c-secret-draw-algorithm.md, acceptance criterion 7).
#
# Scenario (c): two concurrent draws with the same expected version. The two
# INDEPENDENT psql sessions contend on the groups row lock; exactly one draw
# commits, the loser is stale with zero writes and zero audit rows. Scenario
# (a): a member joining after a committed draw is never half-included — the
# joiner has no assignment in the committed version, and roster_in_sync flips
# false rather than any row being rewritten.
#
# Run with: pnpm test:db:races:draw

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
  echo "Local Supabase is not running (expected exactly one ${db_container_name})." >&2
  exit 1
fi

psql_base=(docker exec -i "$db_container_name" psql --no-psqlrc --quiet --no-align --tuples-only
  --set ON_ERROR_STOP=1 --user postgres --dbname postgres)

UID_A='a9000000-0000-4000-8000-00000000a901'
UID_B='a9000000-0000-4000-8000-00000000a902'
UID_C='a9000000-0000-4000-8000-00000000a903'
GROUP_ID='a9000000-0000-4000-8000-00000000a904'

tmpdir="$(mktemp -d /tmp/gmt-draw-races.XXXXXX)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

die() {
  echo "gift-draw-races: $1" >&2
  exit 1
}

cleanup_sql() {
  {
    echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
    echo "delete from public.group_assignments where group_id = '$GROUP_ID';"
    echo "delete from public.audit_events where group_id = '$GROUP_ID';"
    echo "delete from public.group_members where group_id = '$GROUP_ID';"
    echo "delete from public.group_creation_receipts where group_id = '$GROUP_ID' or actor_id = any(array['$UID_A','$UID_B']::uuid[]);"
    echo "delete from public.\"groups\" where id = '$GROUP_ID';"
    echo "delete from auth.users where id = any(array['$UID_A','$UID_B','$UID_C']::uuid[]);"
    echo "commit;"
  } | "${psql_base[@]}" >/dev/null 2>&1 || true
}
trap cleanup_sql EXIT

# Fixtures: A organizer of a secret_draw group; B a joined participating member.
{
  echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
  echo "insert into auth.users (id, aud, role, email, encrypted_password) values ('$UID_A','authenticated','authenticated','draw-race-a@example.invalid',''),('$UID_B','authenticated','authenticated','draw-race-b@example.invalid','');"
  echo "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id) values ('$GROUP_ID','Draw Race','Other','2026-12-01','Asia/Kolkata',1000,'INR','secret_draw','$UID_A');"
  echo "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('$GROUP_ID','$UID_A','joined',true,clock_timestamp(),1),('$GROUP_ID','$UID_B','joined',true,clock_timestamp(),1);"
  echo "commit;"
} | "${psql_base[@]}" >/dev/null || die "fixture setup failed"

# Pre-write the two independent session scripts. Both act as the organizer
# (the draw derives the caller from auth.uid()); the sessions contend on the
# groups row lock, so the serialization is intrinsic, never choreographed by
# sleeps on one connection.
cat > "$tmpdir/s1.sql" <<EOF
set statement_timeout = '20s';
set lock_timeout = '15s';
begin;
select set_config('request.jwt.claim.sub', '$UID_A', true);
select set_config('request.jwt.claims', '{"sub":"$UID_A","role":"authenticated"}', true);
select 's1-draw:' || result || ':' || coalesce(draw_version::text, 'null')
from public.run_secret_draw('$GROUP_ID'::uuid, null);
commit;
EOF

cat > "$tmpdir/s2.sql" <<EOF
set statement_timeout = '20s';
set lock_timeout = '15s';
begin;
select set_config('request.jwt.claim.sub', '$UID_A', true);
select set_config('request.jwt.claims', '{"sub":"$UID_A","role":"authenticated"}', true);
select 's2-draw:' || result || ':' || coalesce(draw_version::text, 'null')
from public.run_secret_draw('$GROUP_ID'::uuid, null);
commit;
EOF

"${psql_base[@]}" < "$tmpdir/s1.sql" > "$tmpdir/s1.out" 2>&1 &
S1_PID=$!
"${psql_base[@]}" < "$tmpdir/s2.sql" > "$tmpdir/s2.out" 2>&1 &
S2_PID=$!

wait "$S1_PID" 2>/dev/null || true
wait "$S2_PID" 2>/dev/null || true

if grep -q "s1-draw:drawn:1" "$tmpdir/s1.out" && grep -q "s2-draw:drawn:1" "$tmpdir/s2.out"; then
  die "scenario (c): both concurrent draws committed"
fi

committed="$("${psql_base[@]}" -t -c "select count(*) from public.group_assignments where group_id = '$GROUP_ID'::uuid;")"
[ "$committed" = "2" ] || die "scenario (c): expected exactly one committed draw (2 assignments), found $committed"

audit_count="$("${psql_base[@]}" -t -c "select count(*) from public.audit_events where group_id = '$GROUP_ID'::uuid and event_type = 'draw_created';")"
[ "$audit_count" = "1" ] || die "scenario (c): expected exactly one draw_created audit event, found $audit_count"

grep -q "drawn:1" "$tmpdir/s1.out" "$tmpdir/s2.out" || die "scenario (c): no session committed the first draw"
if grep -q "s1-draw:drawn:1" "$tmpdir/s1.out"; then
  grep -q "s2-draw:stale:" "$tmpdir/s2.out" || die "scenario (c): the losing draw did not report stale"
else
  grep -q "s1-draw:stale:" "$tmpdir/s1.out" || die "scenario (c): the losing draw did not report stale"
fi

# ---------------------------------------------------------------------------
# Scenario (a): a member joining after a committed draw is never half-in.
# The joiner owns no assignment row in the committed version; the version
# predicate hides nothing and rewrites nothing.
# ---------------------------------------------------------------------------
{
  echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
  echo "insert into auth.users (id, aud, role, email, encrypted_password) values ('$UID_C','authenticated','authenticated','draw-race-c@example.invalid','');"
  echo "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('$GROUP_ID','$UID_C','joined',true,clock_timestamp(),1);"
  echo "commit;"
} | "${psql_base[@]}" >/dev/null || die "scenario (a): the racing join failed"

joiner_assigned="$("${psql_base[@]}" -t -c "select count(*) from public.group_assignments where group_id = '$GROUP_ID'::uuid and giver_id = '$UID_C'::uuid;")"
[ "$joiner_assigned" = "0" ] || die "scenario (a): the joiner was silently half-included in a committed draw"

# The post-join roster no longer matches the bindings: roster_in_sync is the
# database-computed false for the organizer alert; no stored row changed.
sync_state="$("${psql_base[@]}" -t -c "select set_config('request.jwt.claim.sub', '$UID_A', true); select roster_in_sync from public.group_draw_state('$GROUP_ID'::uuid);" | tail -n 1 | tr -d '[:space:]')"
[ "$sync_state" = "f" ] || die "scenario (a): roster_in_sync did not flip false after the joiner arrived"

echo "gift-draw-races: all scenarios passed"
