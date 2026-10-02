#!/usr/bin/env bash
# Two-session race harness for the 006b create-private-group contract (brief
# docs/delivery/issues/006b-create-private-group.md, acceptance criteria 4 and
# 8: user-scoped idempotent creation and the compare-and-swap shareable link).
#
# Run with: pnpm test:db:races:006b   (CI database job step "Run 006b group
# races"; also runnable locally against a running stack).
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

psql_one() {
  "${psql_base[@]}"
}

# Synthetic fixed fixture ids (hex only). Never real users; removed on exit.
UID_A='a7000000-0000-4000-8000-00000000a701'

GROUPS_SQL='public."groups"'

tmpdir="$(mktemp -d /tmp/gmt-group-races-006b.XXXXXX)"
A_IN="$tmpdir/a.in"; A_OUT="$tmpdir/a.out"
B_IN="$tmpdir/b.in"; B_OUT="$tmpdir/b.out"
A_PID=""; B_PID=""
mkfifo "$A_IN" "$A_OUT" "$B_IN" "$B_OUT"

cleanup() {
  # Terminate both sessions first: an open blocked transaction releases its
  # locks before the fixture deletes run.
  if [ -n "$A_PID" ]; then kill "$A_PID" 2>/dev/null || true; fi
  if [ -n "$B_PID" ]; then kill "$B_PID" 2>/dev/null || true; fi
  {
    # Bounded: a failed session can leave a blocked transaction holding
    # locks; the cleanup connection must never wait behind it.
    printf "set statement_timeout = '10s';\n"
    printf "set lock_timeout = '5s';\n"
    printf 'begin;\n'
    printf "create temp table cl_g as select id from %s where organizer_id = '%s';\n" "$GROUPS_SQL" "$UID_A"
    printf "delete from public.audit_events where group_id = any(select id from cl_g);\n"
    printf "delete from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id = any(select id from cl_g));\n"
    printf "delete from public.group_invitations where group_id = any(select id from cl_g);\n"
    printf "delete from public.group_creation_receipts where group_id = any(select id from cl_g) or actor_id = '%s';\n" "$UID_A"
    printf "delete from public.group_members where group_id = any(select id from cl_g) or user_id = '%s';\n" "$UID_A"
    printf "delete from %s where id = any(select id from cl_g);\n" "$GROUPS_SQL"
    printf "delete from auth.users where id = '%s';\n" "$UID_A"
    printf 'commit;\n'
  } | psql_one >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

die() {
  echo "group-races-006b: $1" >&2
  exit 1
}

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

# create_sql KEY UUID_PAYLOAD_NAME: the canonical payload v1 JSON with the
# given name (the only varying field in the conflict scenario).
create_call() {
  printf "select result from public.create_group_v1('%s'::uuid, '{\"contract_version\":1,\"name\":\"%s\",\"occasion_type\":\"birthday\",\"occasion_date\":\"2026-12-18\",\"time_zone\":\"Asia/Kolkata\",\"location\":null,\"description\":null,\"budget_amount_minor\":\"100000\",\"budget_currency\":\"INR\",\"mode\":\"secret_draw\",\"organizer_participating\":true}'::jsonb);\n" "$1" "$2"
}

# issue_call GROUP EXPECTED: the generic compare-and-swap issue.
issue_call() {
  printf "select invitation_version from public.issue_group_invitation('%s'::uuid, %s::bigint);\n" "$1" "$2"
}

# Finite session timeouts.
send 3 'set statement_timeout = 15000;'
send 3 'set lock_timeout = 10000;'
send 3 'set idle_session_timeout = 30000;'
send 5 'set statement_timeout = 15000;'
send 5 'set lock_timeout = 10000;'
send 5 'set idle_session_timeout = 30000;'

echo "group-races-006b: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values ('%s', 'authenticated', 'authenticated', 'group-race-006b-a@example.invalid', '') on conflict (id) do nothing;\n" "$UID_A"
} | psql_one >/dev/null || die "synthetic user seeding failed"

as_user 3 "$UID_A"
as_user 5 "$UID_A"

# --- scenario 1: same-key create/create serializes to one group --------------------

echo "scenario 1: same-key concurrent creation (same payload)"
KEY1="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"

send 3 "begin;"
send 3 "$(create_call "$KEY1" 'Race Same Key')"
await 4 "created"

# Session B blocks on the receipt table's unique (actor_id, request_key)
# index until A ends.
send 5 "$(create_call "$KEY1" 'Race Same Key')"
sleep 1
send 3 "commit;"
await 6 "replayed"

check 3 "s1-one-group" "1 = (select count(*) from ${GROUPS_SQL} where organizer_id = '${UID_A}' and name = 'Race Same Key')"
check 3 "s1-one-receipt" "1 = (select count(*) from public.group_creation_receipts where request_key = '${KEY1}'::uuid)"
check 3 "s1-one-audit" "1 = (select count(*) from public.audit_events e join ${GROUPS_SQL} g on g.id = e.group_id where g.organizer_id = '${UID_A}' and g.name = 'Race Same Key' and e.event_type = 'group_created')"

# --- scenario 2: same-key create with a changed payload conflicts ------------------

echo "scenario 2: same-key concurrent creation (changed payload)"
KEY2="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"

send 3 "begin;"
send 3 "$(create_call "$KEY2" 'Race Original')"
await 4 "created"

send 5 "$(create_call "$KEY2" 'Race Changed')"
sleep 1
send 3 "commit;"
await 6 "idempotency-conflict"

check 3 "s2-one-group" "1 = (select count(*) from ${GROUPS_SQL} where organizer_id = '${UID_A}' and name = 'Race Original')"
check 3 "s2-no-changed" "0 = (select count(*) from ${GROUPS_SQL} where name = 'Race Changed')"
check 3 "s2-one-receipt" "1 = (select count(*) from public.group_creation_receipts where request_key = '${KEY2}'::uuid)"

# --- scenario 3: create rollback, waiter success ------------------------------------

echo "scenario 3: same-key rollback, the waiting retry succeeds"
KEY3="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"

send 3 "begin;"
send 3 "$(create_call "$KEY3" 'Race Rollback')"
await 4 "created"

send 5 "$(create_call "$KEY3" 'Race Rollback')"
sleep 1
send 3 "rollback;"
await 6 "created"

check 3 "s3-one-group" "1 = (select count(*) from ${GROUPS_SQL} where organizer_id = '${UID_A}' and name = 'Race Rollback')"
check 3 "s3-one-receipt" "1 = (select count(*) from public.group_creation_receipts where request_key = '${KEY3}'::uuid)"
check 3 "s3-one-audit" "1 = (select count(*) from public.audit_events e join ${GROUPS_SQL} g on g.id = e.group_id where g.name = 'Race Rollback' and e.event_type = 'group_created')"

# --- scenario 4: same-version generic issue/issue, one winner -----------------------

echo "scenario 4: two sessions issue from the same version"
{
  printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
  printf "select result from public.create_group_v1(gen_random_uuid(), '{\"contract_version\":1,\"name\":\"Race CAS\",\"occasion_type\":\"birthday\",\"occasion_date\":\"2026-12-18\",\"time_zone\":\"Asia/Kolkata\",\"location\":null,\"description\":null,\"budget_amount_minor\":\"100000\",\"budget_currency\":\"INR\",\"mode\":\"secret_draw\",\"organizer_participating\":true}'::jsonb);\n"
} | psql_one >/dev/null || die "setup creation failed"
G4="$(psql_one <<< "select id::text from ${GROUPS_SQL} where organizer_id = '${UID_A}' and name = 'Race CAS';" | tail -n 1)"

# Both sessions issue from version 0. Session A wins the group lock and its
# uncommitted issuance holds it; session B's issue waits behind the lock and
# must see the incremented version as stale, with no token and no write.
send 3 "begin;"
send 3 "create temp table race_markers4a(marker text);"
send 3 "do \$\$ begin
  perform public.issue_group_invitation('${G4}'::uuid, 0::bigint);
  insert into race_markers4a values ('ISSUED');
end \$\$;"
send 3 "select marker from race_markers4a;"
await 4 "ISSUED"

send 5 "create temp table race_markers4(marker text);"
send 5 "do \$\$ begin
  perform public.issue_group_invitation('${G4}'::uuid, 0::bigint);
  insert into race_markers4 values ('ISSUED');
exception
  when others then
    if sqlstate = 'PT409' then
      insert into race_markers4 values ('STALE');
    else
      insert into race_markers4 values ('OTHER:' || sqlstate);
    end if;
end \$\$;"
sleep 1
send 3 "commit;"
send 5 "select marker from race_markers4;"
await 6 "STALE"

check 3 "s4-one-row" "1 = (select count(*) from public.group_invitations where group_id = '${G4}' and shareable_version is not null)"
check 3 "s4-version" "1 = (select shareable_invitation_version from ${GROUPS_SQL} where id = '${G4}')"
check 3 "s4-one-audit" "1 = (select count(*) from public.audit_events where group_id = '${G4}' and event_type = 'invitation_issued')"

# --- scenario 5: generic issue versus generic revoke ---------------------------------

echo "scenario 5: issue and revoke race from the same version"

# Session A revokes while session B issues from the same expected version:
# exactly one of them wins; the loser sees the incremented version as stale.
send 3 "begin;"
send 3 "select case when revoked then 'REVOKED' else 'NOOP' end from public.revoke_group_invitation('${G4}'::uuid, 1::bigint);"
await 4 "REVOKED"

send 5 "create temp table race_markers5(marker text);"
send 5 "do \$\$ begin
  perform public.issue_group_invitation('${G4}'::uuid, 1::bigint);
  insert into race_markers5 values ('ISSUED');
exception
  when others then
    if sqlstate = 'PT409' then
      insert into race_markers5 values ('STALE');
    else
      insert into race_markers5 values ('OTHER:' || sqlstate);
    end if;
end \$\$;"
sleep 1
send 3 "commit;"
send 5 "select marker from race_markers5;"
await 6 "STALE"

check 3 "s5-version" "2 = (select shareable_invitation_version from ${GROUPS_SQL} where id = '${G4}')"
check 3 "s5-no-new-row" "1 = (select count(*) from public.group_invitations where group_id = '${G4}' and shareable_version is not null)"
check 3 "s5-revoke-audit" "1 = (select count(*) from public.audit_events where group_id = '${G4}' and event_type = 'invitation_revoked')"
check 3 "s5-issued-audit" "1 = (select count(*) from public.audit_events where group_id = '${G4}' and event_type = 'invitation_issued')"

# --- scenario 6: rotate rollback, waiter success --------------------------------------

echo "scenario 6: rotate rollback, the waiting issue succeeds"

send 3 "begin;"
send 3 "$(issue_call "$G4" 2)"
await 4 "3"

send 5 "$(issue_call "$G4" 2)"
sleep 1
send 3 "rollback;"
await 6 "3"

check 3 "s6-version" "3 = (select shareable_invitation_version from ${GROUPS_SQL} where id = '${G4}')"
check 3 "s6-two-rows" "2 = (select count(*) from public.group_invitations where group_id = '${G4}' and shareable_version is not null)"
check 3 "s6-one-active" "1 = (select count(*) from public.group_invitations where group_id = '${G4}' and shareable_version = 3 and status = 'active')"
check 3 "s6-audits" "2 = (select count(*) from public.audit_events where group_id = '${G4}' and event_type = 'invitation_issued') and 1 = (select count(*) from public.audit_events where group_id = '${G4}' and event_type = 'invitation_revoked')"

echo "group-races-006b: all scenarios passed"
