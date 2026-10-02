#!/usr/bin/env bash
# Two-session race harness for the 006c invitation continuation contract
# (brief docs/delivery/issues/006c-invitation-preview-and-acceptance.md,
# "Multitab and real races" and the lifecycle/reconciliation criteria).
#
# Run with: pnpm test:db:races:006c   (CI database job step "Run 006c
# continuation races"; also runnable locally against a running stack).
#
# Contract (same discipline as scripts/test-group-races-006b-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote or hosted database.
#   * Opens TWO INDEPENDENT psql sessions and interleaves them with explicit
#     output barriers. Never two sequential calls on one connection.
#   * Every session and every read has a finite timeout; the script exits
#     nonzero on any assertion failure or timeout.
#   * All fixtures are synthetic (fixed uuid constants); the harness cleans
#     them up on every exit path. No bearer token, email, browser secret,
#     coordinator secret, nonce, or other credential material is ever
#     printed: generated secrets are captured into shell variables and
#     substituted into SQL silently.

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
UID_A='a8000000-0000-4000-8000-00000000a801'
UID_B='a8000000-0000-4000-8000-00000000a802'
UID_C='a8000000-0000-4000-8000-00000000a804'
GROUP_ID='a8000000-0000-4000-8000-00000000a803'

GROUPS_SQL='public."groups"'

tmpdir="$(mktemp -d /tmp/gmt-group-races-006c.XXXXXX)"
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
    # The private rows hold restrict foreign keys to the coordinators and
    # the invitations, so they go first, scoped to this run's two
    # coordinator digests.
    printf "delete from private.invitation_continuations where coordinator_id in (select id from private.invitation_coordinators where coordinator_digest in (select private.invitation_digest(x) from unnest(array['%s','%s']) as t(x)));\n" "$COORD" "$COORDB"
    printf "delete from private.invitation_pending_starts where invitation_id in (select id from public.group_invitations where group_id = '%s');\n" "$GROUP_ID"
    printf "delete from private.invitation_coordinators where coordinator_digest in (select private.invitation_digest(x) from unnest(array['%s','%s']) as t(x));\n" "$COORD" "$COORDB"
    printf "delete from public.audit_events where group_id = '%s' or actor_id = any(array['%s','%s']::uuid[]);\n" "$GROUP_ID" "$UID_A" "$UID_B"
    printf "delete from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id = '%s');\n" "$GROUP_ID"
    printf "delete from public.group_invitations where group_id = '%s';\n" "$GROUP_ID"
    printf "delete from public.group_members where group_id = '%s' or user_id = any(array['%s','%s']::uuid[]);\n" "$GROUP_ID" "$UID_A" "$UID_B"
    printf "delete from %s where id = '%s' or organizer_id = any(array['%s','%s']::uuid[]);\n" "$GROUPS_SQL" "$GROUP_ID" "$UID_A" "$UID_B"
    printf "delete from public.profiles where id = any(array['%s','%s']::uuid[]);\n" "$UID_A" "$UID_B"
    printf "delete from auth.users where id = any(array['%s','%s']::uuid[]);\n" "$UID_A" "$UID_B"
    printf 'commit;\n'
  } | psql_one >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

die() {
  echo "group-races-006c: $1" >&2
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

# One identity-bound call on a fresh connection: the session GUCs that
# carry auth.uid() live only on their connection, so every identity-bound
# standalone call must set them inline.
psql_as() { # uid sql
  { printf "set request.jwt.claim.sub = '%s';\nset request.jwt.claim.role = 'authenticated';\nset request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\n" "$1" "$1"
    printf '%s\n' "$2"
  } | psql_one
}

# Deterministic canonical base64url stand-ins (43 characters; the final
# character carries the canonical two zero bits). Never real secrets: they
# exist only inside this harness's database session arguments.
COORD='BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAE'
COORDB='CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCAE'
SECRET_A='DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDAE'
SECRET_B='EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEAE'
SECRET_C='FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFAE'
LEASE='GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGAE'

# Finite session timeouts.
send 3 'set statement_timeout = 15000;'
send 3 'set lock_timeout = 10000;'
send 3 'set idle_session_timeout = 30000;'
send 5 'set statement_timeout = 15000;'
send 5 'set lock_timeout = 10000;'
send 5 'set idle_session_timeout = 30000;'

echo "group-races-006c: seeding synthetic fixtures"

{
  printf "insert into auth.users (id, aud, role, email, encrypted_password) values ('%s', 'authenticated', 'authenticated', 'group-race-006c-a@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'group-race-006c-b@example.invalid', ''), ('%s', 'authenticated', 'authenticated', 'group-race-006c-c@example.invalid', '');\n" "$UID_A" "$UID_B" "$UID_C"
} | psql_one >/dev/null || die "synthetic user seeding failed"

{
  # Owner-path group and membership fixtures (synthetic, removed on exit).
  # The group starts never_issued (version 0): the first generic issue is a
  # compare-and-swap from exactly this version.
  printf "insert into public.\"groups\" (id, name, occasion, occasion_at, time_zone, budget_amount_minor, budget_currency, mode, organizer_id, shareable_invitation_version) values ('%s', 'Continuation Race', 'Diwali', (current_date + 30)::timestamp at time zone 'Asia/Kolkata', 'Asia/Kolkata', 50000, 'INR', 'wishlist_only', '%s', 0);\n" "$GROUP_ID" "$UID_A"
  printf "insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values ('%s', '%s', 'joined', true, clock_timestamp(), 1);\n" "$GROUP_ID" "$UID_A"
  printf "update public.profiles set display_name = 'Race Organizer' where id = '%s';\n" "$UID_A"
  # The acceptance path rechecks profile completeness inside the
  # transaction, so the accepting fixture user needs a complete profile too
  # (the signup trigger created the row at user insertion).
  printf "update public.profiles set display_name = 'Race Joiner' where id = '%s';\n" "$UID_B"
  printf "update public.profiles set display_name = 'Race Joiner Two' where id = '%s';\n" "$UID_C"
} | psql_one >/dev/null || die "group fixture seeding failed"

# The generic shareable token: issued through the real RPC and captured
# silently into a shell variable (never printed). The issuance is
# identity-bound: it runs on one fresh connection carrying the organizer's
# session GUCs inline.
TOKEN="$(psql_as "$UID_A" "select token from public.issue_group_invitation('${GROUP_ID}'::uuid, 0::bigint);" | tail -n 1)"
if [[ -z "$TOKEN" || ${#TOKEN} -ne 43 ]]; then
  die "fixture token issuance failed"
fi

# Established coordinators for both sessions.
psql_one <<< "select result from public.establish_group_invitation_coordinator('${COORD}', '${LEASE}');" >/dev/null \
  || die "coordinator A establishment failed"
psql_one <<< "select result from public.establish_group_invitation_coordinator('${COORDB}', '${LEASE}');" >/dev/null \
  || die "coordinator B establishment failed"

# --- scenario 1: different-email binds on one flow, exactly one winner ---------

echo "scenario 1: concurrent different-email bindings, one winner"
FLOW1="$(psql_one <<< "select flow_id::text from public.begin_group_invitation_flow('${TOKEN}', '${SECRET_A}', '${COORD}');" | tail -n 1)"
if [[ -z "$FLOW1" ]]; then die "flow1 begin failed"; fi

send 3 "begin;"
send 3 "select result from public.bind_group_invitation_flow_email('${FLOW1}'::uuid, '${SECRET_A}', 'group-race-006c-a@example.invalid');"
await 4 "bound"

# Session B binds a different email on the same flow: it blocks on the
# continuation row lock until A commits, then loses to the first binding.
send 5 "begin;"
send 5 "select result from public.bind_group_invitation_flow_email('${FLOW1}'::uuid, '${SECRET_A}', 'group-race-006c-b@example.invalid');"
sleep 1
send 3 "commit;"
await 6 "restart"
send 5 "rollback;"

check 3 "s1-one-binding" "'$(psql_one <<< "select coalesce(encode(email_binding_digest,'hex'),'null') from private.invitation_continuations where flow_id = '${FLOW1}'::uuid;")' = encode(private.invitation_email_binding('group-race-006c-a@example.invalid', '${SECRET_A}'), 'hex')"

# --- scenario 2: duplicate acceptance through two flows, one use ---------------

echo "scenario 2: the same user accepts through two independent flows"
FLOW2="$(psql_one <<< "select flow_id::text from public.begin_group_invitation_flow('${TOKEN}', '${SECRET_B}', '${COORD}');" | tail -n 1)"
FLOW2B="$(psql_one <<< "select flow_id::text from public.begin_group_invitation_flow('${TOKEN}', '${SECRET_C}', '${COORD}');" | tail -n 1)"
if [[ -z "$FLOW2" || -z "$FLOW2B" ]]; then die "flow2 begins failed"; fi

# Both flows are bound and verified for user B's identity.
for pair in "${FLOW2}:${SECRET_B}" "${FLOW2B}:${SECRET_C}"; do
  f="${pair%%:*}"; s="${pair##*:}"
  psql_one <<< "select result from public.bind_group_invitation_flow_email('${f}'::uuid, '${s}', 'group-race-006c-b@example.invalid');" >/dev/null
done
as_user 3 "$UID_B"
as_user 5 "$UID_B"
for pair in "${FLOW2}:${SECRET_B}" "${FLOW2B}:${SECRET_C}"; do
  f="${pair%%:*}"; s="${pair##*:}"
  psql_as "$UID_B" "select result from public.verify_group_invitation_flow('${f}'::uuid, '${s}');" >/dev/null
done

send 3 "begin;"
send 3 "select result || ':' || accepted_now::text from public.accept_group_invitation_flow('${FLOW2}'::uuid, '${SECRET_B}');"
await 4 "joined:true"

# Session B's second flow: blocks behind the group lock; the winner's use
# makes the second acceptance a continuation-only replay.
send 5 "begin;"
send 5 "select result || ':' || accepted_now::text from public.accept_group_invitation_flow('${FLOW2B}'::uuid, '${SECRET_C}');"
sleep 1
send 3 "commit;"
await 6 "replayed:false"
send 5 "commit;"

check 3 "s2-one-use" "1 = (select use_count from public.group_invitations where token_hash = private.invitation_digest('${TOKEN}'))"
check 3 "s2-one-audit" "1 = (select count(*) from public.audit_events where group_id = '${GROUP_ID}'::uuid and event_type = 'invitation_accepted')"
check 3 "s2-both-accepted" "2 = (select count(*) from private.invitation_continuations where flow_id::text in ('${FLOW2}','${FLOW2B}') and accepted_at is not null)"

# Rotate to a fresh generic token for the revoke scenario (the CAS issue
# revokes the prior generic row and returns the new token once).
TOKEN2="$(psql_as "$UID_A" "select token from public.issue_group_invitation('${GROUP_ID}'::uuid, 1::bigint);" | tail -n 1)"
if [[ -z "$TOKEN2" || ${#TOKEN2} -ne 43 ]]; then
  die "second fixture token issuance failed"
fi

echo "scenario 3: accept versus revoke (revoke-first order)"
FLOW3="$(psql_one <<< "select flow_id::text from public.begin_group_invitation_flow('${TOKEN2}', '${SECRET_A}', '${COORD}');" | tail -n 1)"
psql_as "$UID_B" "select result from public.bind_group_invitation_flow_email('${FLOW3}'::uuid, '${SECRET_A}', 'group-race-006c-b@example.invalid'); select result from public.verify_group_invitation_flow('${FLOW3}'::uuid, '${SECRET_A}');" >/dev/null

# Organizer revokes while an acceptance waits on the group lock.
as_user 5 "$UID_A"
send 5 "begin;"
send 5 "select invitation_version::text || ':' || revoked::text from public.revoke_group_invitation('${GROUP_ID}'::uuid, 2::bigint);"
sleep 1
send 3 "begin;"
send 3 "select result from public.accept_group_invitation_flow('${FLOW3}'::uuid, '${SECRET_A}');"
sleep 1
send 5 "commit;"
await 4 "unavailable"
send 3 "rollback;"

check 3 "s3-revoked" "'revoked' = (select status::text from public.group_invitations where token_hash = private.invitation_digest('${TOKEN2}'))"
check 3 "s3-no-second-use" "0 = (select use_count from public.group_invitations where token_hash = private.invitation_digest('${TOKEN2}'))"
check 3 "s3-no-new-accept-audit" "1 = (select count(*) from public.audit_events where group_id = '${GROUP_ID}'::uuid and event_type = 'invitation_accepted')"

# --- scenario 4: accept versus logout, both lock orders ------------------------

echo "scenario 4: accept versus confirmed-logout invalidation (logout-first order)"
# Rotate to a live generic invitation for this scenario (expected version is
# now 3 after the scenario-3 revocation).
TOKEN3="$(psql_as "$UID_A" "select token from public.issue_group_invitation('${GROUP_ID}'::uuid, 3::bigint);" | tail -n 1)"
FLOW4="$(psql_one <<< "select flow_id::text from public.begin_group_invitation_flow('${TOKEN3}', '${SECRET_A}', '${COORD}');" | tail -n 1)"
psql_as "$UID_B" "select result from public.bind_group_invitation_flow_email('${FLOW4}'::uuid, '${SECRET_A}', 'group-race-006c-b@example.invalid'); select result from public.verify_group_invitation_flow('${FLOW4}'::uuid, '${SECRET_A}');" >/dev/null

# Logout-first: the invalidation commits before the acceptance begins, so
# the acceptance always observes the invalidated continuation.
send 3 "begin;"
send 3 "select result from public.invalidate_group_invitation_flows_for_logout(array['${FLOW4}'::uuid], array['${SECRET_A}'], '${COORD}');"
await 4 "invalidated"
send 3 "commit;"

# The accepting session carries uid_b's identity (the verified user).
as_user 5 "$UID_B"
send 5 "begin;"
send 5 "select result from public.accept_group_invitation_flow('${FLOW4}'::uuid, '${SECRET_A}');"
await 6 "unavailable"
send 5 "rollback;"

check 3 "s4-released" "1 = (select count(*) from private.invitation_continuations where flow_id = '${FLOW4}'::uuid and envelope_released_at is not null and invalidated_at is not null)"
check 3 "s4-no-accept" "0 = (select count(*) from private.invitation_continuations where flow_id = '${FLOW4}'::uuid and accepted_at is not null)"

echo "scenario 4b: logout versus an already-accepted flow (accept-first order)"
FLOW5="$(psql_one <<< "select flow_id::text from public.begin_group_invitation_flow('${TOKEN3}', '${SECRET_B}', '${COORD}');" | tail -n 1)"
psql_as "$UID_C" "select result from public.bind_group_invitation_flow_email('${FLOW5}'::uuid, '${SECRET_B}', 'group-race-006c-c@example.invalid'); select result from public.verify_group_invitation_flow('${FLOW5}'::uuid, '${SECRET_B}');" >/dev/null

# The accepting session carries uid_c's identity (the verified user, who is
# not yet a member: an already-member replay would return already_joined).
as_user 3 "$UID_C"
send 3 "begin;"
send 3 "select result || ':' || accepted_now::text from public.accept_group_invitation_flow('${FLOW5}'::uuid, '${SECRET_B}');"
await 4 "joined:true"

send 5 "begin;"
send 5 "select result from public.invalidate_group_invitation_flows_for_logout(array['${FLOW5}'::uuid], array['${SECRET_B}'], '${COORD}');"
sleep 1
send 3 "commit;"
await 6 "invalidated"
send 5 "commit;"

check 3 "s4b-member-remains" "1 = (select count(*) from public.group_members where group_id = '${GROUP_ID}'::uuid and user_id = '${UID_C}'::uuid and status = 'joined')"
check 3 "s4b-released-not-invalidated" "1 = (select count(*) from private.invitation_continuations where flow_id = '${FLOW5}'::uuid and envelope_released_at is not null and invalidated_at is null and accepted_at is not null)"

# --- scenario 5: the eight-envelope cap under concurrent creation --------------

echo "scenario 5: concurrent creation at the envelope cap"
# A FRESH coordinator (COORDB was established and never used): the cap
# counts every unreleased envelope of the browser, including accepted
# flows, so the earlier scenarios' envelopes must not be in this count.
i=""
for i in 1 2 3 4 5 6 7; do
  psql_one <<< "select count(*) from public.begin_group_invitation_flow('${TOKEN3}', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA${i}E', '${COORDB}');" >/dev/null
done

send 3 "begin;"
send 3 "select count(*) from public.begin_group_invitation_flow('${TOKEN3}', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8E', '${COORDB}');"
await 4 "1"
send 5 "begin;"
send 5 "select count(*) from public.begin_group_invitation_flow('${TOKEN3}', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9E', '${COORDB}');"
sleep 1
send 3 "commit;"
await 6 "0"
send 5 "rollback;"

check 3 "s5-cap" "8 = (select count(*) from private.invitation_continuations where coordinator_id = (select id from private.invitation_coordinators where coordinator_digest = private.invitation_digest('${COORDB}')) and envelope_released_at is null)"

echo "group-races-006c: all scenarios passed"
