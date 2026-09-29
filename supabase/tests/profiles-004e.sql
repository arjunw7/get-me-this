-- 004e: pgTAP suite for the taste_line column, blank-to-null
-- normalization, and the non-blank display_name constraint.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief's 004e migration/permission criteria: the
-- column and its CHECK constraint exist; the authenticated UPDATE grant
-- covers it; anon is denied; cross-user read and write are denied;
-- over-60-character writes are rejected by the database; blank taste_line
-- input is stored as null proven by DIRECT AUTHENTICATED UPDATEs over the
-- full blank corpus (mixtures and non-ASCII entries included, not only
-- through the onboarding action); the display_name non-blank CHECK
-- rejects the same corpus by direct UPDATEs; non-blank controls are
-- accepted and stored verbatim, untrimmed. The whole suite is wrapped in
-- one transaction that ends with rollback.

begin;

select plan(19);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset

-- 1. Schema shape ----------------------------------------------------------------

select has_column(
  'public', 'profiles', 'taste_line',
  'profiles.taste_line exists'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_taste_line_bounded'
      and contype = 'c'
  ),
  'the taste_line CHECK constraint (non-blank, <= 60 chars) exists'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_display_name_non_blank'
      and contype = 'c'
  ),
  'the display_name non-blank CHECK constraint exists'
);

select has_trigger(
  'public', 'profiles', 'profiles_normalize_taste_line',
  'the blank-to-null normalization trigger exists on public.profiles'
);

-- 2. Permissions ------------------------------------------------------------------

select ok(
  has_column_privilege(
    'authenticated', 'public.profiles', 'taste_line', 'UPDATE'
  ),
  'the authenticated column-limited UPDATE grant covers taste_line'
);

select ok(
  not has_column_privilege('anon', 'public.profiles', 'taste_line', 'UPDATE'),
  'anon holds no UPDATE on taste_line'
);

-- The normalization function grants: no client role needs EXECUTE.
select ok(
  not has_function_privilege(
    'authenticated', 'public.normalize_profiles_taste_line()', 'EXECUTE'
  ),
  'authenticated cannot execute public.normalize_profiles_taste_line()'
);

-- 3. Cross-user denial on the new column ------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_b'::uuid,
  'authenticated',
  'authenticated',
  'profile-004e-b@example.invalid',
  ''
);

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

select is(
  (select count(*)::int from public.profiles where id = :'uid_b'::uuid),
  0,
  'a cross-user profile read (with taste_line in the table) returns no rows'
);

update public.profiles
set taste_line = 'hijacked taste'
where id = :'uid_b'::uuid;

reset role;

select is(
  (select taste_line from public.profiles where id = :'uid_b'::uuid),
  null,
  'a cross-user taste_line update did not change the other profile'
);

-- 4. Anon denial on the new column -------------------------------------------------

set local role anon;

select throws_ok(
  format(
    'update public.profiles set taste_line = ''X'' where id = %L',
    :'uid_a'
  ),
  '42501'
);

reset role;

-- 5. Direct authenticated updates over the blank corpus ----------------------------
--
-- The corpus from the brief: the empty string; a single space; a tab; a
-- line feed; a carriage return; mixtures in one value (space + tab + line
-- feed together; a tab wrapped in spaces); U+00A0 alone; U+00A0 mixed with
-- ASCII whitespace; U+3000; and U+FEFF. These run as DIRECT authenticated
-- UPDATEs (the 004a grant path that bypasses the onboarding server
-- action), which is the proof the brief requires.

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  :'uid_a'::uuid,
  'authenticated',
  'authenticated',
  'profile-004e-a@example.invalid',
  ''
);

create temp table blank_corpus_results (
  entry text not null,
  column_name text not null,
  ok boolean not null,
  stored text,
  detail text
);

-- The DO block below switches to the authenticated role, which needs
-- write access to this session-local results table.
grant insert on table blank_corpus_results to authenticated;

do $$
declare
  entry text;
  target_id uuid;
  stored text;
begin
  select id into target_id
    from auth.users where email = 'profile-004e-a@example.invalid';

  -- A complete display name so later taste_line updates touch a real row.
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', target_id::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config(
    'request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', target_id),
    false
  );
  update public.profiles set display_name = 'Ada' where id = target_id;

  foreach entry in array array[
    '',
    ' ',
    E'\t',
    E'\n',
    E'\r',
    E' \t\n',
    E'\t \t',
    E'\u00A0',
    E'\u00A0 \t',
    E'\u3000',
    E'\uFEFF'
  ]
  loop
    -- taste_line: every blank entry normalizes to null, never stored as a
    -- blank string.
    begin
      update public.profiles
        set taste_line = entry
        where id = target_id
        returning taste_line into stored;
      insert into blank_corpus_results
        values (entry, 'taste_line', stored is null, stored, null);
    exception when others then
      insert into blank_corpus_results
        values (entry, 'taste_line', false, null, SQLERRM);
    end;

    -- display_name: every blank entry is REJECTED by the CHECK constraint.
    begin
      update public.profiles
        set display_name = entry
        where id = target_id;
      insert into blank_corpus_results
        values (entry, 'display_name', false, null, 'accepted');
    exception
      when check_violation then
        insert into blank_corpus_results
          values (entry, 'display_name', true, null, null);
      when others then
        insert into blank_corpus_results
          values (entry, 'display_name', false, null, SQLERRM);
    end;
  end loop;

  perform set_config('role', 'postgres', false);
end $$;

select is(
  (
    select count(*)::int from blank_corpus_results
    where column_name = 'taste_line'
  ),
  11,
  'the full blank corpus was exercised for taste_line'
);

select ok(
  not exists (
    select 1 from blank_corpus_results
    where column_name = 'taste_line' and not ok
  ),
  'every blank-corpus entry stored null via direct authenticated UPDATE'
);

select is(
  (
    select count(*)::int from blank_corpus_results
    where column_name = 'display_name'
  ),
  11,
  'the full blank corpus was exercised for display_name'
);

select ok(
  not exists (
    select 1 from blank_corpus_results
    where column_name = 'display_name' and not ok
  ),
  'every blank-corpus display_name UPDATE was rejected by the database'
);

-- Any unexpected failure detail would show here; keep it assertable.
select is(
  (
    select array_agg(detail order by entry) from blank_corpus_results
    where detail is not null
  ),
  null,
  'no corpus entry failed for an unexpected reason'
);

-- 6. Over-limit writes are rejected by the database ----------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

select throws_ok(
  format(
    'update public.profiles set taste_line = repeat(''x'', 61) where id = %L',
    :'uid_a'
  ),
  '23514',
  NULL,
  'an over-60-character taste_line write is rejected by the CHECK constraint'
);

-- 7. Non-blank controls are stored verbatim, untrimmed --------------------------------

update public.profiles
set taste_line = 'x y'
where id = :'uid_a'::uuid;

select is(
  (select taste_line from public.profiles where id = :'uid_a'::uuid),
  'x y',
  'a taste line with an internal space is stored verbatim'
);

update public.profiles
set taste_line = '  x  '
where id = :'uid_a'::uuid;

select is(
  (select taste_line from public.profiles where id = :'uid_a'::uuid),
  '  x  ',
  'a taste line with leading and trailing spaces is stored untrimmed'
);

update public.profiles
set display_name = '  Ada  '
where id = :'uid_a'::uuid;

select is(
  (select display_name from public.profiles where id = :'uid_a'::uuid),
  '  Ada  ',
  'a display name with leading and trailing spaces is stored untrimmed'
);

select *
from finish();

rollback;
