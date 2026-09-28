-- 004a: profiles schema, grants, RLS, and triggers.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/004a-profiles-schema-grants-rls-and-tests.md
-- (planning commit 24541c9). Never edit this file once it has been applied
-- anywhere; fix forward with a new migration (see supabase/README.md).
--
-- Guarantees:
--   * 1:1 profile-per-user: the primary key on profiles.id (= auth.users.id)
--     caps the relation at one row per user, an insert trigger creates the
--     row for every new user, and the backfill below covers users that
--     predate this migration. The trigger alone does not establish the
--     invariant.
--   * Trigger failure blocks signup: the AFTER INSERT trigger runs inside
--     the signup transaction, so a failure aborts the signup and no auth
--     user survives without its profile row.
--   * Least privilege: anon has no privileges; authenticated may SELECT the
--     table (RLS narrows rows to the owner) and UPDATE only the
--     display_name and avatar_path columns of their own row. No client
--     INSERT or DELETE. Service-role credentials stay server-only.
--   * Function EXECUTE is revoked from PUBLIC, anon, and authenticated on
--     both trigger functions: Postgres grants EXECUTE to PUBLIC by default,
--     and trigger-function EXECUTE is checked at CREATE TRIGGER time, not
--     when the trigger fires, so no client role needs it.
--   * updated_at is database-managed by a BEFORE UPDATE trigger using
--     clock_timestamp(), which advances within a transaction, unlike the
--     transaction-fixed now(). A column default would fire on insert only
--     and never on later profile edits.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

comment on table public.profiles is
  'One durable profile per authenticated user (1:1 with auth.users).';
comment on column public.profiles.id is
  'The auth user this profile belongs to; the primary key keeps the 1:1 shape.';
comment on column public.profiles.display_name is
  'Required display name; null marks an incomplete profile until onboarding.';
comment on column public.profiles.avatar_path is
  'Nullable storage path for the avatar; no upload UI exists yet (004e).';

-- Creates the profile row for every new auth user. Runs inside the signup
-- transaction: a failure here aborts the signup, so no auth user exists
-- without its profile row (the Supabase-recommended pattern).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
    values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Keeps updated_at owned by the database on every row update.
create function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- Backfill: users that predate this migration also get exactly one profile
-- row. ON CONFLICT DO NOTHING keeps the statement idempotent when re-run.
insert into public.profiles (id)
  select id
  from auth.users
  on conflict (id) do nothing;

-- Explicit grants regardless of any default privileges in the stack.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
revoke all on public.profiles from public;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

-- Functions are EXECUTE-granted to PUBLIC by default, and Supabase default
-- privileges extend that to anon, authenticated, and service_role. No client
-- role needs EXECUTE on either function: these triggers are only ever
-- reached through signup and profile updates themselves, and PostgreSQL
-- checks trigger-function EXECUTE at CREATE TRIGGER time, not when the
-- trigger fires. The function owner retains implicit EXECUTE.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_profiles_updated_at() from public, anon, authenticated;

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
