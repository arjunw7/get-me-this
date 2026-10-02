#!/usr/bin/env bash
# Two-session race harness for the 006a group security model (brief
# docs/delivery/issues/006a-group-security-model.md, acceptance criterion 6).
#
# Run with: pnpm test:db:races   (CI database job step "Run group two-session
# races"; also runnable locally against a running stack).
#
# Contract:
#   * Selects this repository's local Supabase database container exactly
#     (same label + exact-name match as scripts/db-seed.sh); never a remote
#     or hosted database.
#   * Opens TWO INDEPENDENT psql sessions and interleaves them with explicit
#     output barriers. Never two sequential calls on one connection.
#   * Every session and every read has a finite timeout; the script exits
#     nonzero on any assertion failure or timeout.
#   * All fixtures are synthetic (fixed uuid constants); the harness cleans
#     them up on every exit path. No bearer or credential material is ever
#     printed: generated tokens are captured into shell variables and
#     substituted into SQL silently, and no trace output is enabled.

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

# Fail closed: exactly one database container for this project (Bash 3.2
# compatible; same pattern as scripts/db-seed.sh).
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

# One-shot administrative/setup/cleanup connection (autocommit).
psql_one() {
  "${psql_base[@]}"
}

# Synthetic fixed fixture ids (hex only). Never real users; removed on exit.
UID_A='a6000000-0000-4000-8000-00000000a601'
UID_B='a6000000-0000-4000-8000-00000000a602'
UID_C='a6000000-0000-4000-8000-00000000a603'
UID_E='a6000000-0000-4000-8000-00000000a605'
UID_F='a6000000-0000-4000-8000-00000000a606'

GROUPS_SQL='public."groups"'

tmpdir="$(mktemp -d /tmp/gmt-group-races.XXXXXX)"
A_IN="$tmpdir/a.in"; A_OUT="$tmpdir/a.out"
B_IN="$tmpdir/b.in"; B_OUT="$tmpdir/b.out"
A_PID=""; B_PID=""
mkfifo "$A_IN" "$A_OUT" "$B_IN" "$B_OUT"

cleanup() {
  # Always runs: bounded, scoped deletion of the synthetic fixtures in
  # restrict-FK order. Cleanup output is discarded and a cleanup failure is
  # never allowed to mask the script's own result.
  {
    printf 'begin;\n'
    printf "create temp table cl_g as select id from %s where organizer_id = any(array['%s','%s']::uuid[]);\n" "$GROUPS_SQL" "$UID_A" "$UID_B"
    printf "delete from public.audit_events where group_id = any(select id from cl_g);\n"
    printf "delete from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id = any(select id from cl_g));\n"
    printf "delete from public.group_invitations where group_id = any(select id from cl_g);\n"
    printf "delete from public.group_members where group_id = any(select id from cl_g) or user_id = any(array['%s','%s','%s','%s','%s']::uuid[]);\n" "$UID_A" "$UID_B" "$UID_C" "$UID_E" "$UID_F"
    printf "delete from %s where id = any(select id from cl_g);\n" "$GROUPS_SQL"
    printf "delete from auth.users where id = any(array['%s','%s','%s','%s','%s']::uuid[]);\n" "$UID_A" "$UID_B" "$UID_C" "$UID_E" "$UID_F"
    printf 'commit;\n'
  } | psql_one >/dev/null 2>&1 || true
  if [ -n "$A_PID" ]; then kill "$A_PID" 2>/dev/null || true; fi
  if [ -n "$B_PID" ]; then kill "$B_PID" 2>/dev/null || true; fi
  rm -rf "$tmpdir"
}
trap cleanup EXIT

die() {
  echo "group-races: $1" >&2
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

# await FD PATTERN [timeout]: read the session's output until a line contains
# PATTERN. Consumed lines are discarded silently (session output carries only
# function results and marker strings, never tokens).
await() {
  local fd="$1" pattern="$2" timeout="${3:-25}"
  local line
  while IFS= read -r -t "$timeout" -u "$fd" line; do
    case "$line" in
      *"$pattern"*) return 0 ;;
    esac
  done
  die "timeout waiting for '${pattern}' on session fd ${fd}"
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

# check FD NAME SQL-BOOLEAN: assert a boolean expression inside the session.
check() {
  send "$1" "select 'CHK-${2}=' || case when (${3}) then 'pass' else 'FAIL' end;"
  await "$1" "CHK-${2}=pass" 25
  echo "  ok: ${2}"
}

# issue_token GROUP MAX_USES [TARGET]: capture the returned token silently.
issue_token() {
  local token
  token="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "select token from public.issue_group_invitation('%s'::uuid, clock_timestamp() + interval '1 hour', %s, %s);\n" "$1" "$2" "${3:-null}"
  } | psql_one | tail -n 1)"
  if [ "${#token}" -ne 43 ]; then
    die "invitation issuance did not return a canonical 43-character token"
  fi
  printf '%s' "$token"
}

# invitation_of GROUP TOKEN: resolve an invitation id for revocation.
invitation_of() {
  local id
  id="$({
    printf "select id::text from public.group_invitations where group_id = '%s' and token_hash = extensions.digest(convert_to('%s', 'UTF8'), 'sha256');\n" "$1" "$2"
  } | psql_one | tail -n 1)"
  if [ "${#id}" -ne 36 ]; then
    die "invitation lookup did not return a uuid"
  fi
  printf '%s' "$id"
}

# new_group: create a synthetic group through the public API (autocommit).
new_group() {
  local gid
  gid="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$UID_A"
    printf "select group_id::text from public.create_group('Race Fixture', 'Birthday', clock_timestamp() + interval '30 days', 'Asia/Kolkata', null, null, 100000, 'INR', 'secret_draw');\n"
  } | psql_one | tail -n 1)"
  if [ "${#gid}" -ne 36 ]; then
    die "group creation did not return a uuid"
  fi
  printf '%s' "$gid"
}

# join_token GROUP TOKEN UID: one-shot autocommit acceptance for setup.
join_token() {
  local result
  result="$({
    printf "set request.jwt.claim.sub = '%s';\n" "$3"
    printf "select result from public.accept_group_invitation('%s');\n" "$2"
  } | psql_one | tail -n 1)"
  if [ "$result" != "joined" ]; then
    die "setup acceptance failed (got: ${result})"
  fi
}

# --- finite session timeouts -----------------------------------------------------
#
# Statements and lock waits must resolve, and an idle session (a lost
# barrier) can never hang the harness.
send 3 'set statement_timeout = 15000;'
send 3 'set lock_timeout = 10000;'
send 3 'set idle_session_timeout = 30000;'
send 5 'set statement_timeout = 15000;'
send 5 'set lock_timeout = 10000;'
send 5 'set idle_session_timeout = 30000;'

# --- fixtures ------------------------------------------------------------------

echo "group-races: seeding synthetic fixtures"

# The scenarios accept and organize as synthetic users; seed them
# idempotently so reruns against a warm database are safe (profiles rows
# come from the on-auth-user trigger).
{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values\n"
  printf "  ('%s', 'authenticated', 'authenticated', 'group-race-a@example.invalid', ''),\n" "$UID_A"
  printf "  ('%s', 'authenticated', 'authenticated', 'group-race-b@example.invalid', ''),\n" "$UID_B"
  printf "  ('%s', 'authenticated', 'authenticated', 'group-race-c@example.invalid', ''),\n" "$UID_C"
  printf "  ('%s', 'authenticated', 'authenticated', 'group-race-e@example.invalid', ''),\n" "$UID_E"
  printf "  ('%s', 'authenticated', 'authenticated', 'group-race-f@example.invalid', '')\n" "$UID_F"
  printf "on conflict (id) do nothing;\n"
} | psql_one >/dev/null || die "synthetic user seeding failed"

# --- scenario 1: accept/accept at a one-use limit --------------------------------

echo "scenario 1: accept/accept at a one-use limit"
G1="$(new_group)"; T1="$(issue_token "$G1" 1)"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "select result from public.accept_group_invitation('${T1}');"
await 4 "joined"

as_user 5 "$UID_C"
send 5 "select result from public.accept_group_invitation('${T1}');"
sleep 1
send 3 "commit;"
await 6 "unavailable"

check 3 "s1-uses" "1 = (select use_count from public.group_invitations where token_hash = extensions.digest(convert_to('${T1}', 'UTF8'), 'sha256'))"
check 3 "s1-member-b" "exists (select 1 from public.group_members where group_id = '${G1}' and user_id = '${UID_B}' and status = 'joined')"
check 3 "s1-no-member-c" "not exists (select 1 from public.group_members where group_id = '${G1}' and user_id = '${UID_C}')"
check 3 "s1-audit" "1 = (select count(*) from public.audit_events where group_id = '${G1}' and event_type = 'invitation_accepted')"

# --- scenario 2: duplicate accept by the same user --------------------------------

echo "scenario 2: duplicate accept by the same user"
G2="$(new_group)"; T2="$(issue_token "$G2" 1)"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "select result from public.accept_group_invitation('${T2}');"
await 4 "joined"

as_user 5 "$UID_B"
send 5 "select result from public.accept_group_invitation('${T2}');"
sleep 1
send 3 "commit;"
await 6 "replayed"

check 3 "s2-uses" "1 = (select use_count from public.group_invitations where token_hash = extensions.digest(convert_to('${T2}', 'UTF8'), 'sha256'))"
check 3 "s2-audit" "1 = (select count(*) from public.audit_events where group_id = '${G2}' and event_type = 'invitation_accepted')"

# --- scenario 3: accept/revoke, both commit orders ---------------------------------

echo "scenario 3: accept/revoke (revoke commits first, then accept commits first)"
G3="$(new_group)"
T3="$(issue_token "$G3" "null")"
INV3="$(invitation_of "$G3" "$T3")"

# Order 1: the revoke commits while a fresh acceptance waits on the group lock.
send 3 "begin;"
as_user 3 "$UID_A"
send 3 "select result from public.revoke_group_invitation('${G3}'::uuid, '${INV3}'::uuid);"
await 4 "revoked"

as_user 5 "$UID_C"
send 5 "select result from public.accept_group_invitation('${T3}');"
sleep 1
send 3 "commit;"
await 6 "unavailable"

check 3 "s3-no-member" "not exists (select 1 from public.group_members where group_id = '${G3}' and user_id = '${UID_C}')"
check 3 "s3-audit" "1 = (select count(*) from public.audit_events where group_id = '${G3}' and event_type = 'invitation_revoked')"

# Order 2: the acceptance commits while the revoke waits on the group lock.
T3B="$(issue_token "$G3" "null")"
INV3B="$(invitation_of "$G3" "$T3B")"

send 3 "begin;"
as_user 3 "$UID_C"
send 3 "select result from public.accept_group_invitation('${T3B}');"
await 4 "joined"

as_user 5 "$UID_A"
send 5 "select result from public.revoke_group_invitation('${G3}'::uuid, '${INV3B}'::uuid);"
sleep 1
send 3 "commit;"
await 6 "revoked"

check 3 "s3-member-joined" "exists (select 1 from public.group_members where group_id = '${G3}' and user_id = '${UID_C}' and status = 'joined')"
check 3 "s3-inv-revoked" "exists (select 1 from public.group_invitations where id = '${INV3B}' and status = 'revoked')"
check 3 "s3-uses" "1 = (select use_count from public.group_invitations where id = '${INV3B}')"

# --- scenario 4: accept/remove, both commit orders ----------------------------------

echo "scenario 4: accept/remove (remove commits first, then accept commits first)"
G4="$(new_group)"
T4="$(issue_token "$G4" "null")"
join_token "$G4" "$T4" "$UID_B"

# Order 1: the removal commits while the removed member's replay waits.
send 3 "begin;"
as_user 3 "$UID_A"
send 3 "select result from public.remove_group_member('${G4}'::uuid, '${UID_B}'::uuid);"
await 4 "removed"

as_user 5 "$UID_B"
send 5 "select result from public.accept_group_invitation('${T4}');"
sleep 1
send 3 "commit;"
await 6 "unavailable"

check 3 "s4-removed" "exists (select 1 from public.group_members where group_id = '${G4}' and user_id = '${UID_B}' and status = 'removed')"
check 3 "s4-audit" "1 = (select count(*) from public.audit_events where group_id = '${G4}' and event_type = 'member_removed')"

# Order 2: the acceptance commits while the removal waits on the group lock.
T4B="$(issue_token "$G4" "null")"
send 3 "begin;"
as_user 3 "$UID_C"
send 3 "select result from public.accept_group_invitation('${T4B}');"
await 4 "joined"

as_user 5 "$UID_A"
send 5 "select result from public.remove_group_member('${G4}'::uuid, '${UID_C}'::uuid);"
sleep 1
send 3 "commit;"
await 6 "removed"

as_user 5 "$UID_C"
send 5 "select result from public.accept_group_invitation('${T4B}');"
await 6 "unavailable"

check 3 "s4b-removed" "exists (select 1 from public.group_members where group_id = '${G4}' and user_id = '${UID_C}' and status = 'removed')"

# --- scenario 5: transfer/remove, both commit orders ---------------------------------

echo "scenario 5: transfer/remove (transfer commits first, then remove-first order)"
G5="$(new_group)"
T5="$(issue_token "$G5" "null")"
join_token "$G5" "$T5" "$UID_B"

# Order 1: the transfer commits; the old organizer's removal then fails.
send 3 "begin;"
as_user 3 "$UID_A"
send 3 "select result from public.transfer_group_organizer('${G5}'::uuid, '${UID_B}'::uuid);"
await 4 "transferred"

as_user 5 "$UID_A"
send 5 "select result from public.remove_group_member('${G5}'::uuid, '${UID_B}'::uuid);"
sleep 1
send 3 "commit;"
await 6 "unavailable"

check 3 "s5-organizer" "'${UID_B}' = (select organizer_id from ${GROUPS_SQL} where id = '${G5}')"
check 3 "s5-b-joined" "exists (select 1 from public.group_members where group_id = '${G5}' and user_id = '${UID_B}' and status = 'joined')"
check 3 "s5-audit" "1 = (select count(*) from public.audit_events where group_id = '${G5}' and event_type = 'organizer_transferred')"

# Order 2: the removal commits; the transfer to the removed member then fails.
G6="$(new_group)"
T6="$(issue_token "$G6" "null")"
join_token "$G6" "$T6" "$UID_C"

send 3 "begin;"
as_user 3 "$UID_A"
send 3 "select result from public.remove_group_member('${G6}'::uuid, '${UID_C}'::uuid);"
await 4 "removed"

as_user 5 "$UID_A"
send 5 "select result from public.transfer_group_organizer('${G6}'::uuid, '${UID_C}'::uuid);"
sleep 1
send 3 "commit;"
await 6 "unavailable"

check 3 "s6-organizer" "'${UID_A}' = (select organizer_id from ${GROUPS_SQL} where id = '${G6}')"

# --- scenario 6: expiry behind the group lock ----------------------------------------

echo "scenario 6: an accept held behind the group lock past expiry is rejected"
G7="$(new_group)"
T7="$(issue_token "$G7" "null")"

# Shorten the token's life to three seconds from now, then hold the group
# lock for five seconds while the waiting acceptance sits behind it.
{
  printf "update public.group_invitations set expires_at = clock_timestamp() + interval '3 seconds' where token_hash = extensions.digest(convert_to('%s', 'UTF8'), 'sha256');\n" "$T7"
} | psql_one >/dev/null

send 3 "begin;"
send 3 "select 1 from ${GROUPS_SQL} where id = '${G7}' for update;"
await 4 "1"

as_user 5 "$UID_B"
send 5 "select result from public.accept_group_invitation('${T7}');"
sleep 5
send 3 "commit;"
await 6 "unavailable"

check 3 "s6-no-member" "not exists (select 1 from public.group_members where group_id = '${G7}' and user_id = '${UID_B}')"
check 3 "s6-no-audit" "0 = (select count(*) from public.audit_events where group_id = '${G7}' and event_type = 'invitation_accepted')"

# --- scenario 7: the critical one-use rollback interleave ------------------------------

echo "scenario 7: one-use rollback interleave (A rolls back, B succeeds)"
G8="$(new_group)"
T8="$(issue_token "$G8" 1)"

send 3 "begin;"
as_user 3 "$UID_B"
send 3 "select result from public.accept_group_invitation('${T8}');"
await 4 "joined"

as_user 5 "$UID_C"
send 5 "select result from public.accept_group_invitation('${T8}');"
sleep 1
send 3 "rollback;"
await 6 "joined"

check 3 "s7-uses" "1 = (select use_count from public.group_invitations where token_hash = extensions.digest(convert_to('${T8}', 'UTF8'), 'sha256'))"
check 3 "s7-c-joined" "exists (select 1 from public.group_members where group_id = '${G8}' and user_id = '${UID_C}' and status = 'joined')"
check 3 "s7-b-nothing" "not exists (select 1 from public.group_members where group_id = '${G8}' and user_id = '${UID_B}')"
check 3 "s7-audit" "1 = (select count(*) from public.audit_events where group_id = '${G8}' and event_type = 'invitation_accepted')"

# --- scenario 8: auth-user deletion vs acceptance, both commit orders ------------------

echo "scenario 8: auth-user deletion vs acceptance (restrictive FK, both orders)"
G9="$(new_group)"
T9="$(issue_token "$G9" "null")"

# Order 1: the deletion commits while the invitee's acceptance waits inside
# its foreign-key check.
send 3 "begin;"
send 3 "delete from auth.users where id = '${UID_E}' returning 'DELETED-USER';"
await 4 "DELETED-USER"

as_user 5 "$UID_E"
send 5 "select result from public.accept_group_invitation('${T9}');"
sleep 1
send 3 "commit;"
await 6 "unavailable"

check 3 "s8-no-member" "not exists (select 1 from public.group_members where group_id = '${G9}' and user_id = '${UID_E}')"
check 3 "s8-uses" "0 = (select use_count from public.group_invitations where token_hash = extensions.digest(convert_to('${T9}', 'UTF8'), 'sha256'))"
check 3 "s8-no-audit" "0 = (select count(*) from public.audit_events where group_id = '${G9}' and event_type = 'invitation_accepted')"

# Order 2: the acceptance commits first; the deletion is then denied.
T9B="$(issue_token "$G9" "null")"
as_user 5 "$UID_F"
send 5 "begin;"
send 5 "select result from public.accept_group_invitation('${T9B}');"
await 6 "joined"

send 3 "create temp table race_markers(marker text);"
send 3 "do \$\$ begin
  delete from auth.users where id = '${UID_F}';
  insert into race_markers values ('DELETE-SUCCEEDED-UNEXPECTEDLY');
exception when foreign_key_violation then
  insert into race_markers values ('DELETE-DENIED');
end \$\$;"
sleep 1
send 5 "commit;"
send 3 "select marker from race_markers;"
await 4 "DELETE-DENIED" 20

check 3 "s8b-user-exists" "exists (select 1 from auth.users where id = '${UID_F}')"
check 3 "s8b-member" "exists (select 1 from public.group_members where group_id = '${G9}' and user_id = '${UID_F}' and status = 'joined')"
check 3 "s8b-audit" "1 = (select count(*) from public.audit_events where group_id = '${G9}' and event_type = 'invitation_accepted')"

# --- scenario 9: auth-user deletion vs organizer transfer ------------------------------

echo "scenario 9: auth-user deletion vs organizer transfer (restrictive FK)"
G10="$(new_group)"
T10="$(issue_token "$G10" "null")"
join_token "$G10" "$T10" "$UID_B"

# The transfer commits first (deletion-first is impossible here: the joined
# destination's membership FK already denies it). The committed transfer then
# leaves the destination user fully referenced.
send 3 "begin;"
as_user 3 "$UID_A"
send 3 "select result from public.transfer_group_organizer('${G10}'::uuid, '${UID_B}'::uuid);"
await 4 "transferred"
send 3 "commit;"

send 5 "create temp table race_markers9(marker text);"
send 5 "do \$\$ begin
  delete from auth.users where id = '${UID_B}';
  insert into race_markers9 values ('DELETE-SUCCEEDED-UNEXPECTEDLY');
exception when foreign_key_violation then
  insert into race_markers9 values ('DELETE-DENIED');
end \$\$;"
send 5 "select marker from race_markers9;"
await 6 "DELETE-DENIED" 20

check 3 "s9-organizer" "'${UID_B}' = (select organizer_id from ${GROUPS_SQL} where id = '${G10}')"
check 3 "s9-user-exists" "exists (select 1 from auth.users where id = '${UID_B}')"
check 3 "s9-no-dangling" "0 = (select count(*) from ${GROUPS_SQL} g left join auth.users u on u.id = g.organizer_id where g.id in ('${G1}','${G2}','${G3}','${G4}','${G5}','${G6}','${G7}','${G8}','${G9}','${G10}') and u.id is null)"
check 3 "s9-audit-intact" "0 = (select count(*) from public.audit_events e left join auth.users u on u.id = e.actor_id where e.group_id in ('${G1}','${G2}','${G3}','${G4}','${G5}','${G6}','${G7}','${G8}','${G9}','${G10}') and u.id is null)"

echo "group-races: all scenarios passed"
