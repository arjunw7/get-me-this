-- 004e: profiles taste_line, blank normalization, and non-blank constraints.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/004e-onboarding-protected-routes-and-session-lifecycle.md
-- (the owner's taste-line and whitespace decisions, 2026-09-28/29). Never
-- edit this file once it has been applied anywhere; fix forward with a new
-- migration (see supabase/README.md).
--
-- What ships here:
--   * `taste_line text` — the optional one-line taste note, nullable,
--     bounded to 60 characters by a CHECK constraint, and normalized
--     blank-to-null by a BEFORE INSERT OR UPDATE trigger.
--   * The one whitespace rule: a value is BLANK when it is null, the empty
--     string, or consists solely of characters from the PINNED 26-code-
--     point blank set (Unicode White_Space plus U+FEFF), enumerated in the
--     bracket expression below. PostgreSQL's `\s` / `[[:space:]]` are
--     ASCII-only and locale-dependent, and `btrim()` with no trim
--     characters removes spaces only — none of them implements the rule,
--     and all three are prohibited by the brief. The bracket expression
--     below is the CANONICAL text of the rule; the server-side predicate
--     (src/profile/blank.ts) enumerates the identical set, and a unit test
--     proves the two classifications agree code point for code point.
--   * A CHECK constraint on display_name: null (incomplete) or non-blank
--     under the same rule — no blank value can mark a profile complete,
--     on every write path including direct authenticated updates.
--   * The authenticated column-limited UPDATE grant extended to
--     taste_line. Owner-only RLS is unchanged from 004a; id, created_at,
--     and updated_at remain non-updatable.
--   * Normalization of pre-existing blank display_name and taste_line
--     values to null BEFORE the constraints are added (004a permitted
--     blank values; such rows would otherwise block the constraints).
--     Blank display names become null — correctly marked incomplete.
--
-- Non-blank values pass through untouched: nothing here trims, rewrites,
-- or otherwise normalizes them; only wholly blank values are affected.

alter table public.profiles add column taste_line text;

comment on column public.profiles.taste_line is
  'Optional one-line taste note; blank normalizes to null, at most 60 characters.';

-- Normalize pre-existing blank values first: 004a permitted blank values,
-- and the constraints below must not be blocked by them (and a blank
-- display_name must not count as complete after this migration).
update public.profiles
set display_name = null
where display_name is not null
  and display_name ~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$';

update public.profiles
set taste_line = null
where taste_line is not null
  and taste_line ~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$';

-- Blank-to-null normalization in the DATABASE, for every write path: the
-- 004a grant lets an authenticated user update the column directly,
-- bypassing the onboarding server action, so the guarantee must hold
-- there too.
create function public.normalize_profiles_taste_line()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.taste_line is not null
    and new.taste_line ~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
  then
    new.taste_line := null;
  end if;
  return new;
end;
$$;

create trigger profiles_normalize_taste_line
  before insert or update on public.profiles
  for each row
  execute function public.normalize_profiles_taste_line();

-- No client role needs EXECUTE on the normalization function (the same
-- rule the 004a trigger functions follow).
revoke execute on function public.normalize_profiles_taste_line()
  from public, anon, authenticated;

-- The taste line bound: nullable, at most 60 characters, never blank.
alter table public.profiles add constraint profiles_taste_line_bounded
  check (
    taste_line is null
    or (
      taste_line !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
      and char_length(taste_line) <= 60
    )
  );

-- A blank display_name can never mark a profile complete, on every write
-- path (null stays the incomplete marker).
alter table public.profiles add constraint profiles_display_name_non_blank
  check (
    display_name is null
    or display_name !~ '^[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
  );

-- The authenticated column-limited UPDATE grant extends to taste_line.
grant update (display_name, avatar_path, taste_line) on public.profiles
  to authenticated;

-- Rollback / forward-fix note: this migration is forward-only. A rollback
-- is a NEW migration that drops the two CHECK constraints, the trigger,
-- and the column; the pre-migration normalization above (blank display
-- names and taste lines set to null) is a deliberate data change and is
-- not reversible — the affected rows had no meaningful value.
