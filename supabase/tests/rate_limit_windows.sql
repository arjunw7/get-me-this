-- 009b: pgTAP suite for the durable fixed-window rate limiter.
--
-- Run with: pnpm test:db (as part of pnpm test:db).
--
-- Covers the 009b brief's database-slice criteria: the deny-all posture of
-- private.rate_limit_windows (no client grant, RLS enabled, no permissive
-- policy, server-only EXECUTE), the authoritative fixed-window semantics
-- (the Nth admitted, the N+1th denied within the window, a new window
-- restoring access, concurrent increments never exceeding the window),
-- per-key isolation (one coarse key's sustained traffic never consumes
-- another key's budget), bounded keys, fail-closed malformed input, and the
-- bounded indexed cleanup.

begin;

select plan(41);

-------------------------------------------------------------------------------
-- 1. Shape and deny-all isolation.
-------------------------------------------------------------------------------

select has_table('private', 'rate_limit_windows', 'the limiter table exists');
select has_column('private', 'rate_limit_windows', 'limit_key', 'limit_key exists');
select has_column('private', 'rate_limit_windows', 'window_start', 'window_start exists');
select has_column('private', 'rate_limit_windows', 'count', 'count exists');
select has_column('private', 'rate_limit_windows', 'window_seconds', 'window_seconds exists');
select col_is_pk(
  'private', 'rate_limit_windows', ARRAY['limit_key', 'window_start'],
  'counters are keyed by (limit_key, window_start)'
);

-- No token/address/secret-URL-bearing column exists.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'rate_limit_windows'
      and column_name in ('token', 'token_hash', 'email', 'ip', 'address', 'url')
  ),
  'no raw token, address, or URL column exists on the limiter table'
);

select ok(not has_table_privilege('anon', 'private.rate_limit_windows', 'SELECT'), 'anon has no SELECT on the limiter table');
select ok(not has_table_privilege('anon', 'private.rate_limit_windows', 'INSERT'), 'anon has no INSERT on the limiter table');
select ok(not has_table_privilege('authenticated', 'private.rate_limit_windows', 'SELECT'), 'authenticated has no SELECT on the limiter table');
select ok(not has_table_privilege('authenticated', 'private.rate_limit_windows', 'UPDATE'), 'authenticated has no UPDATE on the limiter table');
select ok(not has_table_privilege('authenticated', 'private.rate_limit_windows', 'DELETE'), 'authenticated has no DELETE on the limiter table');
select ok(not has_table_privilege('service_role', 'private.rate_limit_windows', 'SELECT'), 'service_role has no direct SELECT on the limiter table');
select ok(not has_table_privilege('service_role', 'private.rate_limit_windows', 'INSERT'), 'service_role has no direct INSERT on the limiter table');
select ok(
  (select relrowsecurity from pg_class where oid = 'private.rate_limit_windows'::regclass),
  'RLS is enabled on the limiter table'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'private' and tablename = 'rate_limit_windows'),
  0,
  'no permissive RLS policy substitutes for the absent grants'
);
select ok(
  not has_function_privilege('anon', 'private.rate_limit_increment(text, integer, integer)', 'EXECUTE'),
  'anon cannot execute rate_limit_increment'
);
select ok(
  not has_function_privilege('authenticated', 'private.rate_limit_increment(text, integer, integer)', 'EXECUTE'),
  'authenticated cannot execute rate_limit_increment'
);
select ok(
  has_function_privilege('service_role', 'private.rate_limit_increment(text, integer, integer)', 'EXECUTE'),
  'the server-side caller role executes rate_limit_increment'
);
select ok(
  has_function_privilege('service_role', 'private.rate_limit_cleanup(integer)', 'EXECUTE'),
  'the server-side caller role executes rate_limit_cleanup'
);

select has_index(
  'private', 'rate_limit_windows', 'rate_limit_windows_window_start',
  'the bounded cleanup index exists'
);

-------------------------------------------------------------------------------
-- 2. Fixed-window semantics.
-------------------------------------------------------------------------------

-- The Nth admitted, the N+1th denied, within one window.
select is(
  (
    select count(*)::int
    from (
      select private.rate_limit_increment('suite:landing', 3600, 5) as ok
      from generate_series(1, 5)
    ) firsts
    where firsts.ok
  ),
  5,
  'the first five increments in the window are admitted'
);
select is(
  private.rate_limit_increment('suite:landing', 3600, 5),
  false,
  'the sixth increment within the window is denied'
);
select is(
  private.rate_limit_increment('suite:landing', 3600, 5),
  false,
  'further increments within the window stay denied'
);
select is(
  (select count from private.rate_limit_windows where limit_key = 'suite:landing'),
  5,
  'the denied increments did not exceed the window budget'
);

-- A new window restores access (a different bucket start).
update private.rate_limit_windows
set window_start = window_start - interval '2 hours'
where limit_key = 'suite:landing';
select is(
  private.rate_limit_increment('suite:landing', 3600, 5),
  true,
  'a new window restores access'
);

-- Concurrent increments serialize on the row: a tight simulated burst
-- against one key admits exactly the max.
delete from private.rate_limit_windows where limit_key = 'suite:burst';
select is(
  (
    select count(*)::int
    from (
      select private.rate_limit_increment('suite:burst', 3600, 10)
      from generate_series(1, 25)
    ) bursts
    where rate_limit_increment
  ),
  10,
  'a 25-increment burst against one window admits exactly the max of 10'
);

-- Per-key isolation: one coarse key's sustained traffic never consumes
-- another key's budget (a global-keyed implementation fails by
-- construction).
delete from private.rate_limit_windows where limit_key like 'suite:iso-%';
select is(
  (
    select count(*)::int
    from (
      select private.rate_limit_increment('suite:iso-a', 3600, 8) as ok
      from generate_series(1, 8)
    ) eights
    where eights.ok
  ),
  8,
  'key A exhausts its own full budget'
);
select is(
  private.rate_limit_increment('suite:iso-b', 3600, 8),
  true,
  'key B keeps its full budget after key A is exhausted (per-key isolation)'
);

-- Fail-closed malformed input: the control never admits on error.
select is(private.rate_limit_increment(null, 60, 5), false, 'a null key fails closed');
select is(private.rate_limit_increment('', 60, 5), false, 'an empty key fails closed');
select is(private.rate_limit_increment(repeat('k', 129), 60, 5), false, 'an unbounded key fails closed');
select is(private.rate_limit_increment('suite:bad', 0, 5), false, 'a zero window fails closed');
select is(private.rate_limit_increment('suite:bad', -5, 5), false, 'a negative window fails closed');
select is(private.rate_limit_increment('suite:bad', 60, 0), false, 'a zero max fails closed');
select is(private.rate_limit_increment('suite:bad', 60, null), false, 'a null max fails closed');

-- Bounded cleanup: only buckets whose own window fully expired (plus the
-- age grace) are deleted; current and recent windows survive regardless of
-- where the clock boundary falls.
delete from private.rate_limit_windows where limit_key like 'suite:clean-%';
insert into private.rate_limit_windows (limit_key, window_start, window_seconds, count)
values
  -- Expired long ago under a 60s window: deletable at any age grace >= 60.
  ('suite:clean-old', clock_timestamp() - interval '1 hour', 60, 3),
  -- The CURRENT hour bucket of a 1-hour window: not expired, must survive
  -- even though window_start itself may be older than the age grace.
  ('suite:clean-current', date_trunc('hour', clock_timestamp()), 3600, 1),
  -- A short window that started 90 seconds ago: expired by 30s, but inside
  -- the 60s grace: survives.
  ('suite:clean-grace', clock_timestamp() - interval '90 seconds', 60, 2);
select is(
  private.rate_limit_cleanup(60),
  2,
  'cleanup deletes the fully expired rows (the fixture expired bucket and the earlier test''s row whose window was rolled two hours into the past)'
);
select is(
  (select count(*)::int from private.rate_limit_windows where limit_key = 'suite:clean-current'),
  1,
  'a current-window bucket survives cleanup however old its boundary is'
);
select is(
  (select count(*)::int from private.rate_limit_windows where limit_key = 'suite:clean-grace'),
  1,
  'a recently expired bucket inside the age grace survives cleanup'
);
select is(
  (select count(*)::int from private.rate_limit_windows where limit_key = 'suite:clean-old'),
  0,
  'the fully expired bucket is gone'
);
select is(private.rate_limit_cleanup(30), 0, 'cleanup refuses sub-minute ages');

select *
from finish();

rollback;
