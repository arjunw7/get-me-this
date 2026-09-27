-- Synthetic seed entry point for the local database.
--
-- Applied automatically by `pnpm db:reset` (see [db.seed] sql_paths in
-- supabase/config.toml), and on demand against a running stack with
-- `pnpm db:seed`.
--
-- This file is deliberately non-persistent: it writes no rows and creates no
-- objects, so a reset leaves the local database with no application data. The
-- deterministic synthetic fixtures described in docs/architecture/system-design.md
-- are added by the product slice that owns the tables they populate.
--
-- Rules for this file:
--   * Synthetic data only. Never real user data.
--   * No credentials, tokens, password hashes, or personal data.
--   * Every statement must be safe to re-run.

do $$
begin
  raise notice '002d seed: non-persistent placeholder, no rows were written.';
end
$$;
