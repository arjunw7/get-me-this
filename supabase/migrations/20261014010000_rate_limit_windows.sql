-- 009b: rate limiting and abuse controls — the durable fixed-window limiter.
--
-- Forward-only migration implementing the binding repository brief
-- docs/delivery/issues/009b-rate-limiting-and-abuse-controls.md. Never edit
-- this file once it has been applied anywhere; fix forward with a new
-- migration (see supabase/README.md).
--
-- Design record (the brief's required implementation-plan selection): the
-- zero-schema option is a free-tier external key-value dependency; the
-- owner's dependency preference is unrecorded and the repository working
-- rules forbid new dependencies without demonstrated need, so the brief's
-- DOCUMENTED FALLBACK ships instead: private.rate_limit_windows — one
-- private-schema counter table, no client grants, SECURITY DEFINER
-- read/increment, bounded indexed cleanup, pgTAP privilege proof. The
-- per-instance in-process counter layer (src/rate-limit) is best-effort
-- only: per-instance counters are probabilistic across Railway's
-- multi-instance deployments, and this durable table is the authoritative
-- layer.
--
-- What this adds:
--   * private.rate_limit_windows: one row per (limit_key, window_start).
--     Keys are bounded identifiers — route family plus a coarse key (hashed
--     IP prefix for anon traffic, internal user id for authenticated) — and
--     never contain raw tokens, addresses, or secret URLs.
--   * private.rate_limit_increment(p_limit_key, p_window_seconds, p_max):
--     the authoritative atomic test-and-increment. Returns true when the
--     request is admitted within the fixed window, false when the window is
--     exhausted. Concurrent increments serialize on the row.
--   * private.rate_limit_cleanup(p_max_age_seconds): bounded, indexed
--     cleanup of expired windows, called by the same server-side paths.
--
-- Rollback / forward-fix note: this migration is forward-only; any
-- correction ships as a NEW migration. The revert path, in dependency
-- order, is: drop private.rate_limit_increment and
-- private.rate_limit_cleanup, then the private.rate_limit_windows table.
-- Reverting deletes limiter counters (transient abuse-control state, no
-- product data), so a revert is safe and configuration-equivalent; the
-- limiter then fails open unless the call sites are reverted with it.

-------------------------------------------------------------------------------
-- 1. The counter table (private schema, deny-by-default).
-------------------------------------------------------------------------------

create table private.rate_limit_windows (
  limit_key text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  count integer not null default 0,

  primary key (limit_key, window_start),

  constraint rate_limit_windows_key_bounded
    check (char_length(limit_key) <= 128),
  constraint rate_limit_windows_window_seconds_bounded
    check (window_seconds >= 1),
  constraint rate_limit_windows_count_non_negative
    check (count >= 0)
);

comment on table private.rate_limit_windows is
  'Authoritative durable fixed-window rate-limit counters (009b). Keys are bounded coarse identifiers (route family + hashed IP prefix or internal user id) and never contain raw tokens, addresses, or secret URLs. No client role holds any privilege; increments go through the SECURITY DEFINER function below. Cleanup judges expiry against each row''s own window_seconds.';

revoke all on private.rate_limit_windows from public;
revoke all on private.rate_limit_windows from anon;
revoke all on private.rate_limit_windows from authenticated;
revoke all on private.rate_limit_windows from service_role;

alter table private.rate_limit_windows enable row level security;

-- Deliberately no policy: application roles have no direct table privilege
-- or permissive RLS policy on the counters; only the definer functions
-- below touch them.

-- Cleanup looks up by window_start; the composite primary key covers it as
-- the second column, and an explicit index keeps the bounded deletion cheap.
create index rate_limit_windows_window_start
  on private.rate_limit_windows (window_start);

-------------------------------------------------------------------------------
-- 2. The authoritative test-and-increment.
--
-- Fixed window: the bucket start is derived from the database clock as
-- floor(now / window_seconds) * window_seconds, so every instance computes
-- the same bucket. Admission and the count bump are one atomic statement:
-- the insert-on-conflict update carries the max check, so concurrent
-- increments serialize on the row and can never exceed p_max in the window.
-- A new window (a fresh bucket row) restores access by construction.
-------------------------------------------------------------------------------

create function private.rate_limit_increment(
  p_limit_key text,
  p_window_seconds integer,
  p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket timestamptz;
  v_now timestamptz;
  v_admitted boolean := false;
begin
  if p_limit_key is null
    or char_length(p_limit_key) = 0
    or char_length(p_limit_key) > 128
    or p_window_seconds is null
    or p_window_seconds < 1
    or p_max is null
    or p_max < 1
  then
    -- Malformed input fails closed: a control must never admit on error.
    return false;
  end if;

  v_now := clock_timestamp();
  v_bucket := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_windows (limit_key, window_start, window_seconds, count)
  values (p_limit_key, v_bucket, p_window_seconds, 1)
  on conflict (limit_key, window_start) do update
    set count = private.rate_limit_windows.count + 1
    where private.rate_limit_windows.count < p_max
  returning (private.rate_limit_windows.count <= p_max) into v_admitted;

  if found and v_admitted is null then
    v_admitted := true;
  end if;
  return coalesce(v_admitted, false);
end;
$$;

comment on function private.rate_limit_increment(text, integer, integer) is
  'Authoritative fixed-window test-and-increment: admitted exactly when the window''s counter is under the max; concurrent increments serialize on the row and can never exceed the max; a fresh window restores access. Malformed input fails closed.';

-------------------------------------------------------------------------------
-- 3. Bounded indexed cleanup.
-------------------------------------------------------------------------------

create function private.rate_limit_cleanup(p_max_age_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  if p_max_age_seconds is null or p_max_age_seconds < 60 then
    return 0;
  end if;

  delete from private.rate_limit_windows
  where window_start + make_interval(secs => window_seconds::double precision)
        < clock_timestamp() - (p_max_age_seconds || ' seconds')::interval;

  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

comment on function private.rate_limit_cleanup(integer) is
  'Bounded cleanup of expired fixed-window counters, judged against each row''s own window_seconds (a bucket is deletable only after its window fully expired plus the age grace); called by the server-side limiter paths. Refuses to run more aggressively than once a minute of age.';

-------------------------------------------------------------------------------
-- 4. Exact privilege inventory.
--
-- The limiter functions are server-side infrastructure: the callers run with
-- the service role (a server-only secret that never reaches any client
-- bundle). No browser-facing role receives EXECUTE, and no role receives any
-- table privilege.
-------------------------------------------------------------------------------

revoke execute on function private.rate_limit_increment(text, integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function private.rate_limit_cleanup(integer)
  from public, anon, authenticated, service_role;

grant execute on function private.rate_limit_increment(text, integer, integer)
  to service_role;
grant execute on function private.rate_limit_cleanup(integer)
  to service_role;
