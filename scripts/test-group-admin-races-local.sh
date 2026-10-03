#!/usr/bin/env bash
# Two-session race harness for the 006f organizer membership controls (brief
# docs/delivery/issues/006f-organizer-membership-controls.md, acceptance
# criterion 7 and "Database authorization and race tests").
#
# Run with: pnpm test:db:races:006f   (CI database job step "Run 006f member
# admin races"; also runnable locally against a running stack).
#
# Contract (same discipline as scripts/test-group-races-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote or hosted database.
#   * Opens TWO INDEPENDENT psql sessions and interleaves them with explicit
#     output barriers. Never two sequential calls on one connection.
#   * Every session and every read has a finite timeout; the script exits
#     nonzero on any assertion failure or timeout.
#   * All fixtures are synthetic (fixed uuid constants); the harness cleans
#     them up on every exit path. No bearer or credential material is ever
#     printed: generated tokens are captured into shell variables and
#     substituted into SQL silently, and no trace output is enabled.
#
# Proven here, per the brief: remove/remove, remove/transfer (both orders),
# transfer/transfer from stale sessions, reinvite/remove (both orders),
# revocation committed first versus reinvitation, revoke/revoke,
# transfer/revoke (both orders), a no-op revoke under a stale version,
# removal committed first versus a waiting acceptance, transfer committed
# first versus the outgoing organizer's stale mutation, and loser rollback
# with no partial writes. Every conflicting pair yields exactly one committed
# winner and one stale loser; the durable member_admin_version never moves by
# more than one committed mutation at a time.

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

psql_base=(docker exec -i "$db_container" psql --no-psqlrc --quiet --no-align --tuples-only
  --set ON_ERROR_STOP=1 --user postgres --dbname postgres)

psql_one() {
  "${psql_base[@]}"
}

# Synthetic fixed fixture ids (hex only). Never real users; removed on exit.
UID_A='a7000000-0000-4000-8000-00000000a701'
UID_B='a7000000-0000-4000-8000-00000000a702'
UID_C='a7000000-0000-4000-8000-00000000a703'
UID_D='a7000000-0000-4000-8000-00000000a704'

GROUPS_SQL='public."groups"'

tmpdir="$(mktemp -d /tmp/gmt-group-admin-races.XXXXXX)"
A_IN="$tmpdir/a.in"; A_OUT="$tmpdir/a.out"
B_IN="$tmpdir/b.in"; B_OUT="$tmpdir/b.out"
A_PID=""; B_PID=""
mkfifo "$A_IN" "$A_OUT" "$B_IN" "$B_OUT"

cleanup() {
  # Always runs: bounded, scoped deletion of the synthetic fixtures in
  # restrict-FK order. Holder backends from a killed run are terminated
  # first (their open transactions hold the fixture locks), and the cleanup
  # connection is bounded so it can never wait behind a blocked transaction.
  # Cleanup output is discarded and a cleanup failure is never allowed to
  # mask the script's own result.
  {
    printf "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid() and backend_type = 'client backend' and state = 'idle in transaction' and xact_start < clock_timestamp() - interval '5 seconds';\n"
    printf "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid() and backend_type = 'client backend' and query ilike '%%a7000000%%';\n"
    printf "set statement_timeout = '10s';\n"
    printf "set lock_timeout = '5s';\n"
    printf 'begin;\n'
    printf "create temp table cl_g as select id from %s where organizer_id = any(array['%s','%s','%s','%s']::uuid[]);\n" "$GROUPS_SQL" "$UID_A" "$UID_B" "$UID_C" "$UID_D"
    printf "delete from public.audit_events where group_id = any(select id from cl_g);\n"
    printf "delete from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id = any(select id from cl_g));\n"
    printf "delete from public.group_invitations where group_id = any(select id from cl_g);\n"
    printf "delete from public.group_creation_receipts where group_id = any(select id from cl_g) or actor_id = any(array['%s','%s','%s','%s']::uuid[]);\n" "$UID_A" "$UID_B" "$UID_C" "$UID_D"
    printf "delete from public.group_members where group_id = any(select id from cl_g) or user_id = any(array['%s','%s','%s','%s']::uuid[]);\n" "$UID_A" "$UID_B" "$UID_C" "$UID_D"
    printf "delete from %s where id = any(select id from cl_g);\n" "$GROUPS_SQL"
    printf "delete from auth.users where id = any(array['%s','%s','%s','%s']::uuid[]);\n" "$UID_A" "$UID_B" "$UID_C" "$UID_D"
    printf 'commit;\n'
  } | psql_one >/dev/null 2>&1 || true
  if [ -n "$A_PID" ]; then kill "$A_PID" 2>/dev/null || true; fi
  if [ -n "$B_PID" ]; then kill "$B_PID" 2>/dev/null || true; fi
  rm -rf "$tmpdir"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

die() {
  echo "group-admin-races: $1" >&2
  exit 1
}

# --- two persistent sessions ---------------------------------------------------

"${psql_base[@]}" < "$A_IN" > "$A_OUT" 2>&1 &
A_PID=$!
"${psql_base[@]}" < "$B_IN" > "$B_OUT" 2>&1 &
B_PID=$!

exec 3>"$A_IN"
exec 4<"$A_OUT"
exec 5>"$B_IN"
exec 6<"$B_OUT"

await() {
  local fd="$1" pattern="$2" timeout="${3:-25}"
  local line last=""
  while IFS= read -r -t "$timeout" -u "$fd" line; do
    case "$line" in
      *"$pattern"*) return 0 ;;
    esac
    case "$line" in
      *[!\ ]*) last="$line" ;;
    esac
  done
  if [ -n "$last" ]; then
    die "no '${pattern}' on fd ${fd} (last output: ${last})"
  fi
  die "no '${pattern}' on fd ${fd} (session closed; a statement errored)"
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
  local fd=$(( $1 + 1 )) name="$2" line last=""
  send "$1" "select 'CHK-${2}=' || case when (${3}) then 'pass' else 'FAIL' end;"
  while IFS= read -r -t 25 -u "$fd" line; do
    case "$line" in
      "CHK-${name}=pass") echo "  ok: ${name}"; return 0 ;;
      "CHK-${name}=FAIL") die "check failed: ${name}" ;;
    esac
    case "$line" in
      *[!\ ]*) last="$line" ;;
    esac
  done
  if [ -n "$last" ]; then
    die "check ${name} incomplete (last output: ${last})"
  fi
  die "check ${name}: session closed (a statement errored)"
}

# identity SESSION UID: re-assert a synthetic JWT identity inside the session.
identity() {
  as_user "$1" "$2"
}

# version_of GROUP: the durable member-admin version through the reviewed
# organizer-only projection, on a one-shot identity-bound connection.
version_of() {
  local v
  v="$({
    printf "set request.jwt.claim.sub = '%s';\n" "${2:-$UID_A}"
    printf "select member_admin_version from public.group_admin_version('%s'::uuid);\n" "$1"
  } | psql_one | tail -n 1)"
  case "$v" in
    ''|*[!0-9]*) die "version read failed for group ${1}" ;;
  esac
  printf '%s' "$v"
}

# new_group: create a synthetic group through the receipt-backed public API
# (autocommit), then add B and D as joined members and C as an invited member
# with a live targeted invitation. The invited member's issuance leaves the
# group at member-admin version 1.
new_group() {
  local gid token v
  gid="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "select group_id::text from public.create_group_v1(gen_random_uuid(), jsonb_build_object('contract_version',1,'name','Admin Race Fixture','occasion_type','birthday','occasion_date',to_char((clock_timestamp() + interval '30 days')::date,'YYYY-MM-DD'),'time_zone','Asia/Kolkata','location',null,'description',null,'budget_amount_minor','100000','budget_currency','INR','mode','secret_draw','organizer_participating',true));\n"
  } | psql_one | tail -n 1)"
  if [ "${#gid}" -ne 36 ]; then
    die "group creation did not return a uuid"
  fi
  psql_one >/dev/null <<SQL || die "member fixture failed"
insert into public.group_members (group_id, user_id, status, participating, membership_generation)
values ('${gid}', '${UID_B}', 'joined', true, 1),
       ('${gid}', '${UID_D}', 'joined', true, 1),
       ('${gid}', '${UID_C}', 'invited', false, 1);
SQL
  token="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "select token from public.issue_group_invitation('%s'::uuid, '%s'::uuid, (select member_admin_version from public.group_admin_version('%s'::uuid)));\n" "$gid" "$UID_C" "$gid"
  } | psql_one | tail -n 1)"
  if [ "${#token}" -ne 43 ]; then
    die "fixture targeted issuance did not return a canonical token"
  fi
  v="$(version_of "$gid")"
  if [ "$v" -ne 1 ]; then
    die "fixture group did not land at version 1 (got ${v})"
  fi
  printf '%s' "$gid"
}

# live_invitation_of GROUP TARGET: the live targeted invitation's id for the
# invited member, through the owner view (no token material is printed).
live_invitation_of() {
  local id raw
  raw="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "select invitation_id::text from public.group_admin_live_invitations('%s'::uuid) where target_user_id = '%s'::uuid;\n" "$1" "$2"
  } | psql_one)"
  id="$(printf '%s\n' "$raw" | tail -n 1)"
  if [ "${#id}" -ne 36 ]; then
    die "live invitation lookup failed"
  fi
  printf '%s' "$id"
}

# revoke_live GROUP: one-shot autocommit revocation of the invited member's
# live targeted invitation at the current version; prints revoked/noop.
revoke_live() {
  local result
  result="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "begin;\nselect revoked::text from public.revoke_group_invitation('%s'::uuid, '%s'::uuid, (select member_admin_version from public.group_admin_version('%s'::uuid)));\ncommit;\n" "$1" "$(live_invitation_of "$1" "$UID_C")" "$1"
  } | psql_one | tail -n 1)"
  printf '%s' "$result"
}

# target_token GROUP TARGET: a fresh targeted token for an invited member
# whose invitation is no longer live (the token is captured, never printed).
target_token() {
  local token v
  v="$(version_of "$1")"
  token="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "select token from public.issue_group_invitation('%s'::uuid, '%s'::uuid, ${v}::bigint);\n" "$1" "$2"
  } | psql_one | tail -n 1)"
  if [ "${#token}" -ne 43 ]; then
    die "targeted token issuance failed"
  fi
  printf '%s' "$token"
}

# loser_do SESSION MARKER-TABLE SQL: a DO block whose exception handler
# converts the loser's deterministic PT409 into a marker row. The loser's
# writes (if any) roll back with the block's subtransaction.
loser_do() {
  send "$1" "create temp table ${2}(marker text);"
  send "$1" "do \$\$ begin
  ${3}
  insert into ${2} values ('WINNER-UNEXPECTED');
exception when others then
  insert into ${2} values (case when sqlstate = 'PT409' then 'STALE' else 'ERROR:' || sqlstate end);
end \$\$;"
}

# The loser DO-block bodies (perform-only; the marker insert is appended by
# loser_do).
LOSS_REMOVE="perform public.remove_group_member('%s'::uuid, '%s'::uuid, %s::bigint);"
LOSS_TRANSFER="perform public.transfer_group_organizer('%s'::uuid, '%s'::uuid, %s::bigint);"
LOSS_ISSUE="perform public.issue_group_invitation('%s'::uuid, '%s'::uuid, %s::bigint);"
LOSS_REVOKE="perform public.revoke_group_invitation('%s'::uuid, '%s'::uuid, %s::bigint);"

echo "group-admin-races: seeding synthetic fixtures"
{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values ('%s', 'authenticated', 'authenticated', 'group-admin-race-a@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'group-admin-race-b@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'group-admin-race-c@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'group-admin-race-d@example.invalid', '');\n" "$UID_A" "$UID_B" "$UID_C" "$UID_D"
  printf "update public.profiles set display_name = 'Admin Race Organizer' where id = '%s';\n" "$UID_A"
  printf "update public.profiles set display_name = 'Admin Race B' where id = '%s';\n" "$UID_B"
  printf "update public.profiles set display_name = 'Admin Race C' where id = '%s';\n" "$UID_C"
  printf "update public.profiles set display_name = 'Admin Race D' where id = '%s';\n" "$UID_D"
} | psql_one >/dev/null || die "synthetic user seeding failed"

identity 3 "$UID_A"
identity 5 "$UID_A"

# --- scenario 1: remove versus remove on one target ------------------------------

echo "scenario 1: remove/remove on one target (one winner, one stale loser, one audit)"
G1="$(new_group)"
V1="$(version_of "$G1")"

send 3 "begin;"
send 3 "select member_admin_version::text from public.remove_group_member('${G1}'::uuid, '${UID_B}'::uuid, ${V1}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers1" "$(printf "$LOSS_REMOVE" "$G1" "$UID_B" "$V1")"
send 5 "select marker from race_markers1;"
sleep 1
send 3 "commit;"
await 4 "$((V1 + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s1-one-removal" "1 = (select count(*) from public.audit_events where group_id = '${G1}' and event_type = 'member_removed')"
check 3 "s1-version" "$((V1 + 1)) = (select member_admin_version from public.group_admin_version('${G1}'::uuid))"
check 3 "s1-removed" "exists (select 1 from public.group_members where group_id = '${G1}' and user_id = '${UID_B}' and status = 'removed')"

# --- scenario 2: remove versus transfer on the same target, both orders ----------

echo "scenario 2: remove/transfer on the same target (both orders)"

# Order 1: the removal commits; the transfer of the now-removed target is
# stale (CAS first, so PT409 rather than a state denial).
G2="$(new_group)"
V2="$(version_of "$G2")"
send 3 "begin;"
send 3 "select member_admin_version::text from public.remove_group_member('${G2}'::uuid, '${UID_B}'::uuid, ${V2}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers2" "$(printf "$LOSS_TRANSFER" "$G2" "$UID_B" "$V2")"
send 5 "select marker from race_markers2;"
sleep 1
send 3 "commit;"
await 4 "$((V2 + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s2-o1-organizer" "'${UID_A}' = (select organizer_id from public.\"groups\" where id = '${G2}')"

# Order 2: the transfer of the joined target commits; the removal from the
# stale session is denied with the deterministic PT409.
G2B="$(new_group)"
V2B="$(version_of "$G2B")"
send 3 "begin;"
send 3 "select member_admin_version::text from public.transfer_group_organizer('${G2B}'::uuid, '${UID_B}'::uuid, ${V2B}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers2b" "$(printf "$LOSS_REMOVE" "$G2B" "$UID_B" "$V2B")"
send 5 "select marker from race_markers2b;"
sleep 1
send 3 "commit;"
await 4 "$((V2B + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s2-o2-organizer" "'${UID_B}' = (select organizer_id from public.\"groups\" where id = '${G2B}')"
check 3 "s2-o2-joined" "exists (select 1 from public.group_members where group_id = '${G2B}' and user_id = '${UID_B}' and status = 'joined')"

# --- scenario 3: transfer versus transfer from stale sessions --------------------

echo "scenario 3: transfer/transfer from two stale sessions of one organizer (one winner)"
G3="$(new_group)"
V3="$(version_of "$G3")"

send 3 "begin;"
send 3 "select member_admin_version::text from public.transfer_group_organizer('${G3}'::uuid, '${UID_B}'::uuid, ${V3}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers3" "$(printf "$LOSS_TRANSFER" "$G3" "$UID_D" "$V3")"
send 5 "select marker from race_markers3;"
sleep 1
send 3 "commit;"
await 4 "$((V3 + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s3-one-transfer" "1 = (select count(*) from public.audit_events where group_id = '${G3}' and event_type = 'organizer_transferred')"
check 3 "s3-organizer" "'${UID_B}' = (select organizer_id from public.\"groups\" where id = '${G3}')"

# --- scenario 4: reinvite versus remove, both orders -----------------------------

echo "scenario 4: reinvite/remove on the same target (both orders)"

# Order 1: the target's row is removed; the reinvitation commits (the only
# reinstatement path) and the stale removal is denied by the CAS.
G4="$(new_group)"
V4="$(version_of "$G4")"
send 3 "begin;"
send 3 "select member_admin_version::text from public.remove_group_member('${G4}'::uuid, '${UID_D}'::uuid, ${V4}::bigint);"
send 3 "commit;"
await 4 "$((V4 + 1))"

V4B="$(version_of "$G4")"
send 3 "begin;"
send 3 "select target_membership_generation::text from public.issue_group_invitation('${G4}'::uuid, '${UID_D}'::uuid, ${V4B}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers4" "$(printf "$LOSS_REMOVE" "$G4" "$UID_D" "$V4B")"
send 5 "select marker from race_markers4;"
sleep 1
send 3 "commit;"
await 4 "$((V4B + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s4-o1-invited" "exists (select 1 from public.group_members where group_id = '${G4}' and user_id = '${UID_D}' and status = 'invited')"

# Order 2: the target's row is joined; the removal commits and the stale
# reinvitation is denied by the CAS (evaluated before the joined refusal).
G4B="$(new_group)"
V4C="$(version_of "$G4B")"
send 3 "begin;"
send 3 "select member_admin_version::text from public.remove_group_member('${G4B}'::uuid, '${UID_B}'::uuid, ${V4C}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers4b" "$(printf "$LOSS_ISSUE" "$G4B" "$UID_B" "$V4C")"
send 5 "select marker from race_markers4b;"
sleep 1
send 3 "commit;"
await 4 "$((V4C + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s4-o2-removed" "exists (select 1 from public.group_members where group_id = '${G4B}' and user_id = '${UID_B}' and status = 'removed')"

# --- scenario 5: revocation committed first versus reinvitation ------------------

echo "scenario 5: revocation committed first versus reinvitation of the invited member"
G5="$(new_group)"
INV5="$(live_invitation_of "$G5" "$UID_C")"
V5="$(version_of "$G5")"

# The revocation runs first and holds the group lock; the reinvitation waits
# on that lock. The revocation commits first, bumping the version, so the
# waiting reinvitation is stale; the fresh reinvitation proceeds only once
# the revocation is committed.
send 3 "begin;"
send 3 "select revoked::text from public.revoke_group_invitation('${G5}'::uuid, '${INV5}'::uuid, ${V5}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers5" "$(printf "$LOSS_ISSUE" "$G5" "$UID_C" "$V5")"
send 5 "select marker from race_markers5;"
sleep 1
send 3 "commit;"
await 4 "true"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s5-invited" "exists (select 1 from public.group_members where group_id = '${G5}' and user_id = '${UID_C}' and status = 'invited')"
check 3 "s5-one-revoke" "1 = (select count(*) from public.audit_events where group_id = '${G5}' and event_type = 'invitation_revoked')"

V5B="$(version_of "$G5")"
send 3 "begin;"
send 3 "select target_membership_generation::text from public.issue_group_invitation('${G5}'::uuid, '${UID_C}'::uuid, ${V5B}::bigint);"
send 3 "commit;"
await 4 "1"

check 3 "s5-reinvited" "2 = (select count(*) from public.audit_events where group_id = '${G5}' and event_type = 'member_reinvited')"

# --- scenario 6: revoke versus revoke on one invitation ---------------------------

echo "scenario 6: revoke/revoke on the same live invitation (one winner)"
G6="$(new_group)"
INV6="$(live_invitation_of "$G6" "$UID_C")"
V6="$(version_of "$G6")"

send 3 "begin;"
send 3 "select revoked::text from public.revoke_group_invitation('${G6}'::uuid, '${INV6}'::uuid, ${V6}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers6" "$(printf "$LOSS_REVOKE" "$G6" "$INV6" "$V6")"
send 5 "select marker from race_markers6;"
sleep 1
send 3 "commit;"
await 4 "true"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s6-one-revoke" "1 = (select count(*) from public.audit_events where group_id = '${G6}' and event_type = 'invitation_revoked')"
check 3 "s6-revoked" "'revoked' = (select status::text from public.group_invitations where id = '${INV6}')"
check 3 "s6-invited-row" "exists (select 1 from public.group_members where group_id = '${G6}' and user_id = '${UID_C}' and status = 'invited')"

# --- scenario 7: transfer versus revocation, both orders -------------------------

echo "scenario 7: transfer/revoke (both orders)"

# Order 1: the revocation commits; the transfer from the stale session is denied.
G7="$(new_group)"
INV7="$(live_invitation_of "$G7" "$UID_C")"
V7="$(version_of "$G7")"

send 3 "begin;"
send 3 "select revoked::text from public.revoke_group_invitation('${G7}'::uuid, '${INV7}'::uuid, ${V7}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers7" "$(printf "$LOSS_TRANSFER" "$G7" "$UID_B" "$V7")"
send 5 "select marker from race_markers7;"
sleep 1
send 3 "commit;"
await 4 "true"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s7-o1-organizer" "'${UID_A}' = (select organizer_id from public.\"groups\" where id = '${G7}')"

# Order 2: the transfer commits; the revocation from the stale session is denied.
G7B="$(new_group)"
INV7B="$(live_invitation_of "$G7B" "$UID_C")"
V7B="$(version_of "$G7B")"

send 3 "begin;"
send 3 "select member_admin_version::text from public.transfer_group_organizer('${G7B}'::uuid, '${UID_B}'::uuid, ${V7B}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers7b" "$(printf "$LOSS_REVOKE" "$G7B" "$INV7B" "$V7B")"
send 5 "select marker from race_markers7b;"
sleep 1
send 3 "commit;"
await 4 "$((V7B + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s7-o2-organizer" "'${UID_B}' = (select organizer_id from public.\"groups\" where id = '${G7B}')"

# --- scenario 8: no-op revoke under a stale version -------------------------------

echo "scenario 8: no-op revoke of an already-revoked invitation under a stale version"
G8="$(new_group)"
INV8="$(live_invitation_of "$G8" "$UID_C")"
V8="$(version_of "$G8")"

# Revoke for real, then probe the already-revoked invitation with a stale
# expected version: the CAS is still evaluated, so PT409 is deterministic
# despite the write being a no-op.
send 3 "begin;"
send 3 "select revoked::text from public.revoke_group_invitation('${G8}'::uuid, '${INV8}'::uuid, ${V8}::bigint);"
send 3 "commit;"
await 4 "true"

V8B="$(version_of "$G8")"
send 3 "begin;"
loser_do 3 "race_markers8" "$(printf "$LOSS_REVOKE" "$G8" "$INV8" "$((V8B - 1))")"
send 3 "select marker from race_markers8;"
await 4 "STALE" 20
send 3 "rollback;"

check 3 "s8-version" "$V8B = (select member_admin_version from public.group_admin_version('${G8}'::uuid))"
check 3 "s8-one-event" "1 = (select count(*) from public.audit_events where group_id = '${G8}' and event_type = 'invitation_revoked')"
check 3 "s8-invited-row" "exists (select 1 from public.group_members where group_id = '${G8}' and user_id = '${UID_C}' and status = 'invited')"

# --- scenario 9: removal committed first versus a waiting acceptance --------------

echo "scenario 9: removal committed first versus a waiting acceptance"
G9="$(new_group)"
# C joins through the generic shareable link first (committed), so the
# organizer can remove them; the waiting acceptance is C's late replay of
# the same link, which must fail once the removal is committed.
revoke_live "$G9" > /dev/null
TOKG9="$({
  printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
  printf "select token from public.issue_group_invitation('%s'::uuid, (select shareable_invitation_version from public.\"groups\" where id = '%s'::uuid));\n" "$G9" "$G9"
} | psql_one | tail -n 1)"
if [ "${#TOKG9}" -ne 43 ]; then
  die "scenario 9 generic token issuance failed"
fi
identity 5 "$UID_C"
send 5 "select result from public.accept_group_invitation('${TOKG9}');"
await 6 "joined"
identity 3 "$UID_A"
V9="$(version_of "$G9")"

# The removal holds the group lock while C's replay waits on it.
send 3 "begin;"
send 3 "select member_admin_version::text from public.remove_group_member('${G9}'::uuid, '${UID_C}'::uuid, ${V9}::bigint);"
sleep 1
identity 5 "$UID_C"
send 5 "begin;"
send 5 "select result from public.accept_group_invitation('${TOKG9}');"
sleep 1
send 3 "commit;"
await 4 "$((V9 + 1))"
await 6 "unavailable" 20
send 5 "rollback;"
identity 3 "$UID_A"

check 3 "s9-removed" "exists (select 1 from public.group_members where group_id = '${G9}' and user_id = '${UID_C}' and status = 'removed')"
check 3 "s9-one-removal" "1 = (select count(*) from public.audit_events where group_id = '${G9}' and event_type = 'member_removed')"

# --- scenario 10: transfer committed first versus the outgoing organizer ----------

echo "scenario 10: transfer committed first versus the outgoing organizer's stale mutation"
G10="$(new_group)"
V10="$(version_of "$G10")"

send 3 "begin;"
send 3 "select member_admin_version::text from public.transfer_group_organizer('${G10}'::uuid, '${UID_B}'::uuid, ${V10}::bigint);"
send 3 "commit;"
await 4 "$((V10 + 1))"

# The outgoing organizer's next mutation uses the pre-transfer version: the
# deterministic PT409, never an authority revival.
identity 5 "$UID_A"
send 5 "begin;"
loser_do 5 "race_markers10" "$(printf "$LOSS_REMOVE" "$G10" "$UID_D" "$V10")"
send 5 "select marker from race_markers10;"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s10-organizer" "'${UID_B}' = (select organizer_id from public.\"groups\" where id = '${G10}')"
check 3 "s10-no-write" "$((V10 + 1)) = (select member_admin_version from public.\"groups\" where id = '${G10}')"
check 3 "s10-no-removal" "0 = (select count(*) from public.audit_events where group_id = '${G10}' and event_type = 'member_removed')"

# --- scenario 11: loser rollback leaves no partial change -------------------------

echo "scenario 11: the stale loser's rollback leaves no partial writes"
G11="$(new_group)"
V11="$(version_of "$G11")"

send 3 "begin;"
send 3 "select member_admin_version::text from public.remove_group_member('${G11}'::uuid, '${UID_B}'::uuid, ${V11}::bigint);"
sleep 1
send 5 "begin;"
loser_do 5 "race_markers11" "$(printf "$LOSS_ISSUE" "$G11" "$UID_C" "$V11")"
send 5 "select marker from race_markers11;"
sleep 1
send 3 "commit;"
await 4 "$((V11 + 1))"
await 6 "STALE" 20
send 5 "rollback;"

check 3 "s11-version" "$((V11 + 1)) = (select member_admin_version from public.group_admin_version('${G11}'::uuid))"
check 3 "s11-no-reinvite" "0 = (select count(*) from public.audit_events where group_id = '${G11}' and event_type = 'member_reinvited' and metadata->>'invitation_id' is null)"
check 3 "s11-invitations" "1 = (select count(*) from public.group_invitations where group_id = '${G11}')"
check 3 "s11-members" "4 = (select count(*) from public.group_members where group_id = '${G11}')"
check 3 "s11-removed-row" "exists (select 1 from public.group_members where group_id = '${G11}' and user_id = '${UID_B}' and status = 'removed')"

echo "group-admin-races: all scenarios passed"
