#!/usr/bin/env bash
# Deterministic populated-state upgrade harness for the 006b migration
# (brief docs/delivery/issues/006b-create-private-group.md, acceptance
# criterion 14 and the "Required automated proof > Database and race tests"
# mandate for pnpm test:db:group-upgrade).
#
# Run with: pnpm test:db:group-upgrade   (CI database job step "Run the
# populated-state group upgrade"; also runnable locally against a running
# stack).
#
# What it proves, against a disposable LOCAL database built from the
# committed migrations alone:
#   * The exact ARJ-35 predecessor state (every committed migration through
#     20261003000000_groups.sql, never 006b) can be rebuilt from scratch.
#   * Synthetic populated fixtures cover BOTH criterion-14 kinds required
#     here: a group with generic invitation history AND a group with zero
#     generic history (plus a multiple-stored-active group and an
#     expired-only group, with targeted rows beside the generic cases).
#   * Applying supabase/migrations/20261004000000_groups_006b_shareable_
#     invitations.sql ONCE against that populated state succeeds, backfills
#     shareable_invitation_version correctly for every fixture kind, revokes
#     duplicate stored-active rows with one truthful actor-null system audit
#     row each, and preserves targeted rows byte for byte.
#   * Rollback proof: a forced migration failure leaves the predecessor
#     state exactly intact (no columns, tables, constraints, revocations,
#     or audit rows survive).
#
# Contract (same discipline as scripts/test-group-races-local.sh):
#   * Selects this repository's local Supabase database container exactly;
#     never a remote, hosted, staging, or production database.
#   * Every step has a finite timeout; the script exits nonzero on any
#     assertion failure or timeout.
#   * All fixtures are synthetic (fixed uuid constants, stand-in digests);
#     the disposable databases are dropped on every exit path. No bearer or
#     credential material is ever printed: no plaintext invitation token
#     exists anywhere in this harness (only synthetic 43-character stand-in
#     digests), and no trace output is enabled.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
config_file="$repo_root/supabase/config.toml"
migration_006b="$repo_root/supabase/migrations/20261004000000_groups_006b_shareable_invitations.sql"

if [[ ! -f "$config_file" ]]; then
  echo "config file not found: $config_file" >&2
  exit 1
fi
if [[ ! -f "$migration_006b" ]]; then
  echo "006b migration not found: $migration_006b" >&2
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

# Disposable databases inside the LOCAL stack's container only.
FORWARD_DB="gmt_006b_upgrade_forward"
ROLLBACK_DB="gmt_006b_upgrade_rollback"

docker_exec() {
  docker exec "$db_container" "$@"
}

# Bounded one-shot SQL against one of the disposable databases (or the
# default postgres database for management statements).
psql_db() {
  docker exec -i "$db_container" psql --no-psqlrc --quiet --no-align --tuples-only \
    --set ON_ERROR_STOP=1 --user postgres --dbname "$1"
}

cleanup() {
  docker_exec dropdb -U postgres --if-exists "$FORWARD_DB" >/dev/null 2>&1 || true
  docker_exec dropdb -U postgres --if-exists "$ROLLBACK_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

die() {
  echo "group-upgrade: $1" >&2
  exit 1
}

# expect_eq VALUE EXPECTED LABEL: fail unless they match exactly.
expect_eq() {
  if [ "$1" != "$2" ]; then
    die "${3}: expected '${2}', got '${1}'"
  fi
  echo "  ok: ${3}"
}

# predecessor_schema_sql: the minimal Supabase-owned surface (auth, storage,
# extensions) the committed migrations assume from the hosted stack, then the
# committed migrations through 20261003000000 (006a) — NEVER 006b. Piped into
# a fresh disposable database.
build_predecessor_db() {
  local dbname="$1"
  docker_exec createdb -U postgres "$dbname"
  {
    cat <<'STUB_SQL'
-- Minimal hosted-stack surface for the committed migrations only.
create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema if not exists extensions;
create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid default auth.uid(),
  owner_id text,
  metadata jsonb
);
create or replace function storage.foldername(p_name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(p_name, '/')
$$;
STUB_SQL
    local migration
    for migration in "$repo_root"/supabase/migrations/*.sql; do
      case "$(basename "$migration")" in
        # The exact ARJ-35 predecessor: every committed migration BEFORE 006b.
        20261004000000_groups_006b_shareable_invitations.sql) ;;
        *) cat "$migration" ;;
      esac
    done
  } | psql_db "$dbname" >/dev/null || die "predecessor build failed for ${dbname}"
}

echo "group-upgrade: building the 006a predecessor state in disposable local databases"

build_predecessor_db "$FORWARD_DB"
build_predecessor_db "$ROLLBACK_DB"

# --- synthetic populated fixtures -------------------------------------------------
#
# Fixed uuid constants (hex only). Stand-in token digests are synthetic
# 43-character repeated letters — clearly not bearer material; only their
# SHA-256 digests are stored, exactly like production rows.
#
# UID_G1: organizer of G1 (zero generic history, one targeted row).
# UID_G2: organizer of G2 (generic history: revoked row + one active unexpired).
# UID_G3: organizer of G3 (two stored-active rows: mixed expiry + tie cases).
# UID_G4: organizer of G4 (one stored-active expired row) and the target of
#         G1's targeted invitation.
FIXTURE_SQL=$(cat <<'SQL'
begin;
insert into auth.users (id, aud, role, email, encrypted_password) values
  ('a8000000-0000-4000-8000-00000000aa01', 'authenticated', 'authenticated', 'upgrade-g1@example.invalid', ''),
  ('a8000000-0000-4000-8000-00000000aa02', 'authenticated', 'authenticated', 'upgrade-g2@example.invalid', ''),
  ('a8000000-0000-4000-8000-00000000aa03', 'authenticated', 'authenticated', 'upgrade-g3@example.invalid', ''),
  ('a8000000-0000-4000-8000-00000000aa04', 'authenticated', 'authenticated', 'upgrade-g4@example.invalid', '');

insert into public."groups" (
  id, name, occasion, occasion_at, time_zone, budget_amount_minor,
  budget_currency, mode, organizer_id, created_at, updated_at
) values
  ('b8000000-0000-4000-8000-00000000ba01', 'Upgrade G1', 'Birthday', '2026-12-18 00:00:00+00', 'Asia/Kolkata', 100000, 'INR', 'secret_draw', 'a8000000-0000-4000-8000-00000000aa01', '2026-09-01 10:00:00+00', '2026-09-01 10:00:00+00'),
  ('b8000000-0000-4000-8000-00000000ba02', 'Upgrade G2', 'Birthday', '2026-12-18 00:00:00+00', 'Asia/Kolkata', 100000, 'INR', 'secret_draw', 'a8000000-0000-4000-8000-00000000aa02', '2026-09-01 10:00:00+00', '2026-09-01 10:00:00+00'),
  ('b8000000-0000-4000-8000-00000000ba03', 'Upgrade G3', 'Birthday', '2026-12-18 00:00:00+00', 'Asia/Kolkata', 100000, 'INR', 'secret_draw', 'a8000000-0000-4000-8000-00000000aa03', '2026-09-01 10:00:00+00', '2026-09-01 10:00:00+00'),
  ('b8000000-0000-4000-8000-00000000ba04', 'Upgrade G4', 'Birthday', '2026-12-18 00:00:00+00', 'Asia/Kolkata', 100000, 'INR', 'secret_draw', 'a8000000-0000-4000-8000-00000000aa04', '2026-09-01 10:00:00+00', '2026-09-01 10:00:00+00');

insert into public.group_members (
  group_id, user_id, status, participating, joined_at, membership_generation, invited_at
) values
  ('b8000000-0000-4000-8000-00000000ba01', 'a8000000-0000-4000-8000-00000000aa01', 'joined', true, '2026-09-01 10:00:00+00', 1, '2026-09-01 10:00:00+00'),
  ('b8000000-0000-4000-8000-00000000ba02', 'a8000000-0000-4000-8000-00000000aa02', 'joined', true, '2026-09-01 10:00:00+00', 1, '2026-09-01 10:00:00+00'),
  ('b8000000-0000-4000-8000-00000000ba03', 'a8000000-0000-4000-8000-00000000aa03', 'joined', true, '2026-09-01 10:00:00+00', 1, '2026-09-01 10:00:00+00'),
  ('b8000000-0000-4000-8000-00000000ba04', 'a8000000-0000-4000-8000-00000000aa04', 'joined', true, '2026-09-01 10:00:00+00', 1, '2026-09-01 10:00:00+00');

-- G1: zero generic history; one targeted row that must survive byte for byte.
insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation, created_at, updated_at
) values
  ('c8000000-0000-4000-8000-00000000ca01', 'b8000000-0000-4000-8000-00000000ba01', 'a8000000-0000-4000-8000-00000000aa01', 'active',
   extensions.digest(convert_to(repeat('T', 43), 'UTF8'), 'sha256'),
   '2027-01-01 00:00:00+00', 1, 0,
   'a8000000-0000-4000-8000-00000000aa04', 1, '2026-09-02 10:00:00+00', '2026-09-02 10:00:00+00');

-- G2: generic history — an older revoked row and one stored-active unexpired
-- row. Expect versions 1 and 2 by created_at asc, id asc; group version 2.
insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation, created_at, updated_at
) values
  ('c8000000-0000-4000-8000-00000000ca02', 'b8000000-0000-4000-8000-00000000ba02', 'a8000000-0000-4000-8000-00000000aa02', 'revoked',
   extensions.digest(convert_to(repeat('U', 43), 'UTF8'), 'sha256'),
   '2026-10-01 00:00:00+00', null, 0,
   null, null, '2026-09-03 10:00:00+00', '2026-09-04 10:00:00+00'),
  ('c8000000-0000-4000-8000-00000000ca03', 'b8000000-0000-4000-8000-00000000ba02', 'a8000000-0000-4000-8000-00000000aa02', 'active',
   extensions.digest(convert_to(repeat('V', 43), 'UTF8'), 'sha256'),
   '2027-06-01 00:00:00+00', null, 0,
   null, null, '2026-09-05 10:00:00+00', '2026-09-05 10:00:00+00');

-- G3: two stored-active generic rows created at the SAME instant (the id
-- tie-break decides) and one older expired-active row. The pinned ranking
-- keeps the highest id as the winner; the other two are revoked with one
-- system audit row each. Legacy versions 1..3 are assigned; the group
-- version = max 3 + 1 normalization epoch = 4.
insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation, created_at, updated_at
) values
  ('c8000000-0000-4000-8000-00000000ca04', 'b8000000-0000-4000-8000-00000000ba03', 'a8000000-0000-4000-8000-00000000aa03', 'active',
   extensions.digest(convert_to(repeat('W', 43), 'UTF8'), 'sha256'),
   '2026-09-10 00:00:00+00', null, 0,
   null, null, '2026-09-06 10:00:00+00', '2026-09-06 10:00:00+00'),
  ('c8000000-0000-4000-8000-00000000ca05', 'b8000000-0000-4000-8000-00000000ba03', 'a8000000-0000-4000-8000-00000000aa03', 'active',
   extensions.digest(convert_to(repeat('X', 43), 'UTF8'), 'sha256'),
   '2027-06-01 00:00:00+00', null, 0,
   null, null, '2026-09-07 11:00:00+00', '2026-09-07 11:00:00+00'),
  ('c8000000-0000-4000-8000-00000000ca06', 'b8000000-0000-4000-8000-00000000ba03', 'a8000000-0000-4000-8000-00000000aa03', 'active',
   extensions.digest(convert_to(repeat('Y', 43), 'UTF8'), 'sha256'),
   '2027-06-02 00:00:00+00', null, 0,
   null, null, '2026-09-07 11:00:00+00', '2026-09-07 11:00:00+00');

-- G4: exactly one stored-active but EXPIRED generic row; preserved so the
-- organizer state honestly becomes issued_expired. Group version 1.
insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation, created_at, updated_at
) values
  ('c8000000-0000-4000-8000-00000000ca07', 'b8000000-0000-4000-8000-00000000ba04', 'a8000000-0000-4000-8000-00000000aa04', 'active',
   extensions.digest(convert_to(repeat('Z', 43), 'UTF8'), 'sha256'),
   '2026-09-15 00:00:00+00', null, 0,
   null, null, '2026-09-08 10:00:00+00', '2026-09-08 10:00:00+00');

insert into public.audit_events (
  actor_id, group_id, event_type, metadata, occurred_at
) values
  ('a8000000-0000-4000-8000-00000000aa01', 'b8000000-0000-4000-8000-00000000ba01', 'group_created', '{}', '2026-09-01 10:00:00+00'),
  ('a8000000-0000-4000-8000-00000000aa02', 'b8000000-0000-4000-8000-00000000ba02', 'group_created', '{}', '2026-09-01 10:00:00+00'),
  ('a8000000-0000-4000-8000-00000000aa03', 'b8000000-0000-4000-8000-00000000ba03', 'group_created', '{}', '2026-09-01 10:00:00+00'),
  ('a8000000-0000-4000-8000-00000000aa04', 'b8000000-0000-4000-8000-00000000ba04', 'group_created', '{}', '2026-09-01 10:00:00+00');
commit;
SQL
)

echo "$FIXTURE_SQL" | psql_db "$FORWARD_DB" >/dev/null || die "fixture seeding failed for ${FORWARD_DB}"
echo "$FIXTURE_SQL" | psql_db "$ROLLBACK_DB" >/dev/null || die "fixture seeding failed for ${ROLLBACK_DB}"

# --- proof 1: the migration applies once to the populated state --------------------

echo "group-upgrade: applying 006b once to the populated predecessor state"
docker exec -i "$db_container" psql --no-psqlrc --quiet --no-align --tuples-only \
  --set ON_ERROR_STOP=1 --user postgres --dbname "$FORWARD_DB" \
  < "$migration_006b" >/dev/null || die "006b migration failed on the populated state"
echo "  ok: migration applied to the populated state"

# Assertions. Query outputs are scalars compared with expect_eq; no token or
# digest material is selected anywhere.
G1='b8000000-0000-4000-8000-00000000ba01'
G2='b8000000-0000-4000-8000-00000000ba02'
G3='b8000000-0000-4000-8000-00000000ba03'
G4='b8000000-0000-4000-8000-00000000ba04'
T1='c8000000-0000-4000-8000-00000000ca01'
G2_REVOKED='c8000000-0000-4000-8000-00000000ca02'
G2_ACTIVE='c8000000-0000-4000-8000-00000000ca03'
G3_LOSER_EXPIRED='c8000000-0000-4000-8000-00000000ca04'
G3_TIE_LOSER='c8000000-0000-4000-8000-00000000ca05'
G3_TIE_WINNER='c8000000-0000-4000-8000-00000000ca06'
G4_EXPIRED='c8000000-0000-4000-8000-00000000ca07'

scalar() {
  psql_db "$FORWARD_DB" <<< "$1" | tail -n 1
}

echo "group-upgrade: asserting the backfilled versions and normalization"

# Zero generic history: the counter must be 0 (the grouped-inner-join bug would
# leave NULL here and the set-not-null would have failed the migration above).
expect_eq "$(scalar "select shareable_invitation_version::text from public.\"groups\" where id = '${G1}';")" "0" \
  "zero-history group initialized to version 0"

expect_eq "$(scalar "select shareable_invitation_version::text from public.\"groups\" where id = '${G2}';")" "2" \
  "generic-history group initialized to the max assigned version"

expect_eq "$(scalar "select shareable_invitation_version::text from public.\"groups\" where id = '${G3}';")" "4" \
  "multiple-active group gets max version plus one normalization epoch"

expect_eq "$(scalar "select shareable_invitation_version::text from public.\"groups\" where id = '${G4}';")" "1" \
  "expired-only group initialized to the max assigned version"

expect_eq "$(scalar "select count(*)::text from public.\"groups\" where shareable_invitation_version is null;")" "0" \
  "no group counter left NULL"

# Legacy generic rows are versioned by created_at asc, id asc.
expect_eq "$(scalar "select shareable_version::text from public.group_invitations where id = '${G2_REVOKED}';")" "1" \
  "older generic row assigned version 1"
expect_eq "$(scalar "select shareable_version::text from public.group_invitations where id = '${G2_ACTIVE}';")" "2" \
  "newer generic row assigned version 2"
expect_eq "$(scalar "select count(*)::text from public.group_invitations where group_id = '${G2}' and shareable_version is null and target_user_id is null;")" "0" \
  "every generic row carries a shareable version"

# Multiple stored-active: the pinned ranking keeps created/id-descending
# winners; every loser is revoked with exactly one actor-null system audit.
expect_eq "$(scalar "select status::text from public.group_invitations where id = '${G3_TIE_WINNER}';")" "active" \
  "the ranked winner (newest id at the tied clock) stays active"
expect_eq "$(scalar "select string_agg(id::text, ',' order by id) from public.group_invitations where group_id = '${G3}' and status = 'revoked';")" \
  "${G3_LOSER_EXPIRED},${G3_TIE_LOSER}" \
  "both ranked losers revoked"
expect_eq "$(scalar "select count(*)::text from public.audit_events where group_id = '${G3}' and event_type = 'invitation_revoked' and actor_id is null
  and metadata = '{\"migration_version\":\"006b\",\"reason\":\"multiple_stored_active\"}'::jsonb
  and invitation_id in ('${G3_LOSER_EXPIRED}','${G3_TIE_LOSER}');")" "2" \
  "one truthful actor-null system audit per revoked loser"
expect_eq "$(scalar "select count(*)::text from public.audit_events where actor_id is null and (group_id <> '${G3}' or event_type <> 'invitation_revoked');")" "0" \
  "no system audit rows outside the normalization"

# Zero/one active groups: no normalization audit.
expect_eq "$(scalar "select count(*)::text from public.audit_events where group_id in ('${G1}','${G2}','${G4}') and actor_id is null;")" "0" \
  "no migration audit for zero or one stored-active groups"

# Targeted rows are preserved byte for byte.
expect_eq "$(scalar "select status::text || '/' || coalesce(shareable_version::text, 'null') || '/' || target_membership_generation::text || '/' || use_count::text from public.group_invitations where id = '${T1}';")" \
  "active/null/1/0" \
  "targeted row preserved with null shareable version"

# Expired-only active row is preserved (honest issued_expired).
expect_eq "$(scalar "select status::text from public.group_invitations where id = '${G4_EXPIRED}';")" "active" \
  "the single expired stored-active row is preserved"

# Final constraints exist and hold.
expect_eq "$(scalar "select count(*)::text from information_schema.table_constraints where table_name = 'groups' and constraint_name = 'groups_shareable_invitation_version_non_negative';")" "1" \
  "the nonnegative group-version check exists"
expect_eq "$(scalar "select count(*)::text from pg_indexes where indexname = 'group_invitations_one_active_generic';")" "1" \
  "the one-active-generic partial unique index exists"
expect_eq "$(scalar "select count(*)::text from (select group_id from public.group_invitations where shareable_version is not null and status = 'active' group by group_id having count(*) > 1) violating_groups;")" "0" \
  "at most one stored-active generic row per group"

# --- proof 2: the rollback (forced-failure) gate ------------------------------------

echo "group-upgrade: forcing a migration failure and proving full rollback"
# Apply 006b inside an explicit transaction, then force a failure against a
# constraint the migration itself added. ON_ERROR_STOP aborts the session, so
# the whole migration transaction is rolled back by the disconnect.
{
  printf 'begin;\n'
  cat "$migration_006b"
  printf "update public.\"groups\" set shareable_invitation_version = -1 where id = '${G1}';\n"
} | docker exec -i "$db_container" psql --no-psqlrc --quiet --no-align --tuples-only \
  --set ON_ERROR_STOP=1 --user postgres --dbname "$ROLLBACK_DB" \
  >/dev/null 2>&1 && die "the forced failure did not fail (rollback proof is vacuous)"

scalar_rb() {
  psql_db "$ROLLBACK_DB" <<< "$1" | tail -n 1
}

expect_eq "$(scalar_rb "select count(*)::text from information_schema.columns where table_name = 'groups' and column_name = 'shareable_invitation_version';")" "0" \
  "rollback proof: the group version column is gone"
expect_eq "$(scalar_rb "select count(*)::text from information_schema.columns where table_name = 'group_invitations' and column_name = 'shareable_version';")" "0" \
  "rollback proof: the invitation shareable-version column is gone"
expect_eq "$(scalar_rb "select count(*)::text from information_schema.tables where table_name = 'group_creation_receipts';")" "0" \
  "rollback proof: the receipt table is gone"
expect_eq "$(scalar_rb "select count(*)::text from public.group_invitations where group_id = '${G3}' and status = 'active';")" "3" \
  "rollback proof: every stored-active fixture row is still active"
expect_eq "$(scalar_rb "select count(*)::text from public.audit_events where actor_id is null;")" "0" \
  "rollback proof: no system audit row survived"
expect_eq "$(scalar_rb "select count(*)::text from public.group_invitations where id = '${T1}';")" "1" \
  "rollback proof: fixtures intact"
expect_eq "$(scalar_rb "select count(*)::text from information_schema.columns where table_name = 'audit_events' and column_name = 'actor_id' and is_nullable = 'NO';")" "1" \
  "rollback proof: audit actor_id is still not-null"

echo "group-upgrade: all proofs passed"
