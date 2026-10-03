#!/usr/bin/env bash
# Two-session race harness for the 008d assignment-view slice (brief
# docs/delivery/issues/008d-assignment-view-and-redraw.md, acceptance
# criterion 8).
#
# Scenario (a): draw-commit vs. redraw-commit concurrency — the two
# INDEPENDENT psql sessions contend on the groups row lock; exactly one
# version wins, the loser is stale with zero writes, and the email-read
# projection exposes only the winning version.
# Scenario (b): redraw vs. leave of a drawn assignee, in both orders — the
# redraw either binds fresh generations or the leave wins and the redraw
# re-derives the roster; never a half-redrawn state.
# Scenario (c): redraw vs. mode-away tombstone — the tombstone bumps the
# version, the redraw either loses the CAS or commits first and is then
# tombstoned, and the email-read projection is silent for the tombstoned
# versions either way.
#
# Run with: pnpm test:db:races:008d

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

UID_A='ab000000-0000-4000-8000-00000000a901'
UID_B='ab000000-0000-4000-8000-00000000a902'
UID_C='ab000000-0000-4000-8000-00000000a903'
GROUP_ID='ab000000-0000-4000-8000-00000000a904'

tmpdir="$(mktemp -d /tmp/gmt-008d-races.XXXXXX)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

die() {
  echo "draw-008d-races: $1" >&2
  exit 1
}

cleanup_sql() {
  {
    echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
    echo "delete from public.group_assignment_views where group_id = '$GROUP_ID';"
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

# Fixtures: A organizer of a secret_draw group; B and C joined participants.
{
  echo "set statement_timeout = '10s'; set lock_timeout = '5s'; begin;"
  echo "insert into auth.users (id, aud, role, email, encrypted_password) values ('$UID_A','authenticated','authenticated','008d-race-a@example.invalid',''),('$UID_B','authenticated','authenticated','008d-race-b@example.invalid',''),('$UID_C','authenticated','authenticated','008d-race-c@example.invalid','');"
  echo "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id) values ('$GROUP_ID','008d Race','Other','2026-12-01','Asia/Kolkata',1000,'INR','secret_draw','$UID_A');"
  echo "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('$GROUP_ID','$UID_A','joined',true,clock_timestamp(),1),('$GROUP_ID','$UID_B','joined',true,clock_timestamp(),1),('$GROUP_ID','$UID_C','joined',true,clock_timestamp(),1);"
  echo "commit;"
} | "${psql_base[@]}" >/dev/null || die "fixture setup failed"

as_organizer() {
  echo "set statement_timeout = '20s'; set lock_timeout = '15s'; begin;"
  echo "select set_config('request.jwt.claim.sub', '$UID_A', true);"
  echo "select set_config('request.jwt.claims', '{\"sub\":\"$UID_A\",\"role\":\"authenticated\"}', true);"
}

# ---------------------------------------------------------------------------
# Scenario (a): draw-commit vs. redraw-commit. Session 1 commits the first
# draw; session 2's confirmed redraw races it on the same expected version.
# Exactly one version wins; the loser is stale.
# ---------------------------------------------------------------------------
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
select 's2-redraw:' || result || ':' || coalesce(draw_version::text, 'null')
from public.run_secret_draw('$GROUP_ID'::uuid, 0);
commit;
EOF

"${psql_base[@]}" < "$tmpdir/s1.sql" > "$tmpdir/s1.out" 2>&1 &
S1_PID=$!
"${psql_base[@]}" < "$tmpdir/s2.sql" > "$tmpdir/s2.out" 2>&1 &
S2_PID=$!
wait "$S1_PID" 2>/dev/null || true
wait "$S2_PID" 2>/dev/null || true

grep -q "s1-draw:drawn:1" "$tmpdir/s1.out" || die "scenario (a): the first draw did not commit as version 1"
grep -q "s2-redraw:stale:" "$tmpdir/s2.out" || die "scenario (a): the concurrent redraw was not stale"

committed="$("${psql_base[@]}" -t -c "select count(*) from public.group_assignments where group_id = '$GROUP_ID'::uuid;")"
[ "$committed" = "3" ] || die "scenario (a): expected exactly one committed draw (3 assignments), found $committed"

email_rows="$("${psql_base[@]}" -t -c "select set_config('request.jwt.claim.sub', '$UID_A', true); select count(*) from public.draw_assignments_for_email('$GROUP_ID'::uuid);" | tail -n 1 | tr -d '[:space:]')"
[ "$email_rows" = "3" ] || die "scenario (a): the email projection must expose only the winning version's rows"

echo "draw-008d-races: scenario (a) passed"

# ---------------------------------------------------------------------------
# Scenario (b): redraw vs. leave of a drawn assignee, both orders. Either
# the redraw binds fresh generations or the leave wins and the redraw
# re-derives the roster; never a half-redrawn state.
# ---------------------------------------------------------------------------

run_redraw_vs_leave() {
  local order="$1"
  local redraw_sql leave_sql
  redraw_sql=$(cat <<EOF
set statement_timeout = '20s';
set lock_timeout = '15s';
begin;
select set_config('request.jwt.claim.sub', '$UID_A', true);
select set_config('request.jwt.claims', '{"sub":"$UID_A","role":"authenticated"}', true);
select 'redraw:' || result || ':' || coalesce(draw_version::text, 'null')
from public.run_secret_draw('$GROUP_ID'::uuid, 1);
commit;
EOF
)
  leave_sql=$(cat <<EOF
set statement_timeout = '20s';
set lock_timeout = '15s';
begin;
select set_config('request.jwt.claim.sub', '$UID_A', true);
select set_config('request.jwt.claims', '{"sub":"$UID_A","role":"authenticated"}', true);
insert into public.audit_events (actor_id, group_id, event_type, subject_user_id, metadata)
values ('$UID_A'::uuid, '$GROUP_ID'::uuid, 'member_left'::public.group_audit_event_type, '$UID_C'::uuid, '{}'::jsonb);
update public.group_members
set status = 'left', participating = false, membership_generation = membership_generation + 1
where group_id = '$GROUP_ID'::uuid and user_id = '$UID_C'::uuid;
select 'leave:done';
commit;
EOF
)

  if [ "$order" = "leave-first" ]; then
    echo "$leave_sql" > "$tmpdir/x1.sql"
    echo "$redraw_sql" > "$tmpdir/x2.sql"
  else
    echo "$redraw_sql" > "$tmpdir/x1.sql"
    echo "$leave_sql" > "$tmpdir/x2.sql"
  fi

  "${psql_base[@]}" < "$tmpdir/x1.sql" > "$tmpdir/x1.out" 2>&1 &
  X1_PID=$!
  "${psql_base[@]}" < "$tmpdir/x2.sql" > "$tmpdir/x2.out" 2>&1 &
  X2_PID=$!
  wait "$X1_PID" 2>/dev/null || true
  wait "$X2_PID" 2>/dev/null || true

  # Invariant: the current version is either absent, or complete over its
  # bound roster with unique givers and recipients — never half-redrawn.
  "${psql_base[@]}" -t -c "
  select
    coalesce(g.current_draw_version, 0) || ':' ||
    (select count(*) from public.group_assignments a
      where a.group_id = g.id and a.draw_version = g.current_draw_version)::text || ':' ||
    (select count(*) from public.group_assignments a
      where a.group_id = g.id and a.draw_version = g.current_draw_version
        and (a.giver_id = a.recipient_id))::text
  from public.\"groups\" g where g.id = '$GROUP_ID'::uuid;" > "$tmpdir/state.out"
  local state
  state="$(tr -d '[:space:]' < "$tmpdir/state.out")"
  local version count fixed
  version="${state%%:*}"
  local rest="${state#*:}"
  count="${rest%%:*}"
  fixed="${rest##*:}"
  [ "$fixed" = "0" ] || die "scenario (b) [$order]: a half-redrawn state contained a fixed point"
  # 3 participants assigned completely (leave lost) or a tombstoned /
  # re-derived state is not half: the count is either 0 or 3.
  case "$count" in
    0|3) ;;
    *) die "scenario (b) [$order]: half-redrawn state (version $version has $count assignments)" ;;
  esac

  # Every current-version assignment binds each side to a member row that
  # still matches its bound generation, unless the member left after.
  local bad
  bad="$("${psql_base[@]}" -t -c "
  select count(*)
  from public.group_assignments a
  join public.group_members m on m.group_id = a.group_id and m.user_id = a.giver_id
  where a.group_id = '$GROUP_ID'::uuid
    and a.draw_version = (select current_draw_version from public.\"groups\" where id = '$GROUP_ID'::uuid)
    and m.status = 'left'
    and m.membership_generation = a.giver_membership_generation;")"
  [ "$bad" = "0" ] || die "scenario (b) [$order]: a left member stayed bound as the current giver"
}

run_redraw_vs_leave "redraw-first"
run_redraw_vs_leave "leave-first"

echo "draw-008d-races: scenario (b) passed (both orders)"

# ---------------------------------------------------------------------------
# Scenario (c): redraw vs. mode-away tombstone. The tombstone bumps the
# version; the redraw either loses the CAS or commits first and is then
# tombstoned; the email projection is silent for the tombstoned versions.
# ---------------------------------------------------------------------------
as_organizer > "$tmpdir/t1.sql"
cat >> "$tmpdir/t1.sql" <<EOF
select 'redraw:' || result || ':' || coalesce(draw_version::text, 'null')
from public.run_secret_draw('$GROUP_ID'::uuid, 2);
commit;
EOF

cat > "$tmpdir/t2.sql" <<EOF
set statement_timeout = '20s';
set lock_timeout = '15s';
begin;
select set_config('request.jwt.claim.sub', '$UID_A', true);
select set_config('request.jwt.claims', '{"sub":"$UID_A","role":"authenticated"}', true);
select 'tombstone:' || result
from public.update_group_settings(
  '$GROUP_ID'::uuid, '008d Race', 'Other', '2026-12-01 00:00:00+05:30'::timestamptz,
  'Asia/Kolkata', null, null, 1000::bigint, 'INR', 'gift_everyone'
);
commit;
EOF

"${psql_base[@]}" < "$tmpdir/t1.sql" > "$tmpdir/t1.out" 2>&1 &
T1_PID=$!
"${psql_base[@]}" < "$tmpdir/t2.sql" > "$tmpdir/t2.out" 2>&1 &
T2_PID=$!
wait "$T1_PID" 2>/dev/null || true
wait "$T2_PID" 2>/dev/null || true

grep -q "tombstone:updated" "$tmpdir/t2.out" || die "scenario (c): the tombstone did not commit"
if ! grep -qE "redraw:(stale|drawn):" "$tmpdir/t1.out"; then
  die "scenario (c): the racing redraw neither committed nor lost the CAS"
fi

# After the tombstone every surface is silent: no email rows either way.
mode="$("${psql_base[@]}" -t -c "select mode from public.\"groups\" where id = '$GROUP_ID'::uuid;" | tr -d '[:space:]')"
[ "$mode" = "gift_everyone" ] || die "scenario (c): the group did not end in the tombstoned-away mode"

email_rows="$("${psql_base[@]}" -t -c "select set_config('request.jwt.claim.sub', '$UID_A', true); select count(*) from public.draw_assignments_for_email('$GROUP_ID'::uuid);" | tail -n 1 | tr -d '[:space:]')"
[ "$email_rows" = "0" ] || die "scenario (c): the email projection must be silent after the tombstone"

version="$("${psql_base[@]}" -t -c "select current_draw_version from public.\"groups\" where id = '$GROUP_ID'::uuid;" | tr -d '[:space:]')"
if grep -q "redraw:drawn:" "$tmpdir/t1.out"; then
  # The redraw committed first: the tombstone bumped over its version.
  redraw_version="$(grep -o 'redraw:drawn:[0-9]*' "$tmpdir/t1.out" | cut -d: -f3)"
  [ "$version" = "$((redraw_version + 1))" ] || die "scenario (c): the tombstone did not bump over the committed redraw"
else
  grep -q "redraw:stale:" "$tmpdir/t1.out" || die "scenario (c): the redraw lost the CAS with an unexpected result"
fi

echo "draw-008d-races: scenario (c) passed"
echo "draw-008d-races: all scenarios passed"
