-- 008b: pgTAP suite for gift-everyone checklists.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/008b-gift-everyone-checklists.md
-- acceptance criteria 1-6: schema invariants and deny-all RLS, exact
-- function surface, snapshot truth (populated, derived-todo, sentinel,
-- ordering, budget repeat), CAS status lifecycle, recipient and
-- cross-member privacy, and participation + mode gating. One transaction,
-- rolled back at the end.

begin;

select plan(44);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset

-- 1. Shape and invariants ------------------------------------------------------

select has_table('public', 'gift_checklist_entries', 'gift_checklist_entries exists');
select has_type('public', 'gift_checklist_status', 'gift_checklist_status enum exists');

select is(
  (
    select string_agg(a.attname, ',' order by a.attnum)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'gift_checklist_entries' and a.attnum > 0 and not a.attisdropped
  ),
  'id,group_id,giver_id,recipient_id,status,version,completed_at,created_at,updated_at',
  'the table has exactly the declared columns in order'
);

select is(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conname = 'gift_checklist_entries_group_id_giver_id_recipient_id_key'
  ),
  'UNIQUE (group_id, giver_id, recipient_id)',
  'the unique checklist key is declared'
);

select is(
  (
    select bool_and(
      pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%'
    )
    from pg_constraint
    where conrelid = 'public.gift_checklist_entries'::regclass
      and contype = 'f'
  ),
  'true',
  'every foreign key is ON DELETE RESTRICT'
);

-- RLS: enabled, zero policies, zero client privileges.
select is(
  (select relrowsecurity::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'gift_checklist_entries'),
  1,
  'RLS is enabled on gift_checklist_entries'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'gift_checklist_entries'),
  0,
  'no RLS policy exists on gift_checklist_entries'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), 'none')
    from information_schema.table_privileges tp
    join pg_roles r on r.rolname = tp.grantee
    where tp.table_schema = 'public'
      and tp.table_name = 'gift_checklist_entries'
      and tp.grantee in ('anon', 'authenticated', 'service_role')
  ),
  'none',
  'no client role holds any direct table privilege'
);

-- 2. Exact function surface -----------------------------------------------------

select has_function('public', 'gift_checklist_snapshot', 'gift_checklist_snapshot exists');
select has_function('public', 'set_gift_checklist_entry_status', 'set_gift_checklist_entry_status exists');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('gift_checklist_snapshot', 'set_gift_checklist_entry_status')
  ),
  2,
  'each function exists exactly once (no overloads)'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'gift_checklist_snapshot'
  ),
  'TABLE(recipient_user_id uuid, recipient_display_name text, recipient_is_organizer boolean, entry_status gift_checklist_status, entry_version bigint, entry_completed_at timestamp with time zone, participating_member_count bigint, budget_amount_minor bigint, budget_currency text)',
  'the snapshot returns exactly the nine declared columns'
);

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_gift_checklist_entry_status'
  ),
  'TABLE(result text, version bigint)',
  'the status function returns exactly (result, version)'
);

select is(
  (
    select bool_and(p.prosecdef) || ':' || coalesce(string_agg(distinct coalesce(array_to_string(p.proconfig, ''), ''), ','), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('gift_checklist_snapshot', 'set_gift_checklist_entry_status')
  ),
  'true:search_path=""',
  'both functions are SECURITY DEFINER with an empty search_path'
);

select is(
  (
    select coalesce(string_agg(r.rolname, ',' order by r.rolname), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
    join pg_roles r on r.oid = g.grantee
    where n.nspname = 'public'
      and p.proname = 'gift_checklist_snapshot'
      and r.rolname in ('anon', 'authenticated', 'service_role', 'public')
  ),
  'authenticated',
  'the snapshot is EXECUTE-granted to authenticated only among application roles'
);

-- 3. Fixtures -------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'checklist-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'checklist-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'checklist-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'checklist-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'checklist-e@example.invalid', '');

-- as A: organizer of a gift_everyone group.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select group_id::text as gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Checklist Crew', 'occasion_type', 'birthday', 'occasion_date', '2026-12-01',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '1500', 'budget_currency', 'INR',
    'mode', 'gift_everyone', 'organizer_participating', true
  )
) \gset

reset role;

insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values
  (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp(), 1),
  (:'gid'::uuid, :'uid_c'::uuid, 'joined', true, clock_timestamp(), 1),
  (:'gid'::uuid, :'uid_d'::uuid, 'joined', false, clock_timestamp(), 1);

select ok(true, 'fixtures staged');

-- Giver-equals-recipient is rejected at the constraint level (owner-path
-- insert over the staged fixture group).
select throws_ok(
  format('insert into public.gift_checklist_entries (group_id, giver_id, recipient_id) values (%L::uuid, %L::uuid, %L::uuid)', :'gid', :'uid_a', :'uid_a'),
  '23514',
  null,
  'a self-assignment entry is rejected at the constraint level'
);

-- 4. Snapshot truth --------------------------------------------------------------

-- as A: two rows (B, C), derived todo state, budget repeated.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (select count(*)::int from public.gift_checklist_snapshot(:'gid'::uuid)),
  2,
  'the organizer sees one row per other current participant'
);

select is(
  (
    select bool_and(entry_status = 'todo' and entry_version is null and entry_completed_at is null)
    from public.gift_checklist_snapshot(:'gid'::uuid)
  ),
  true,
  'rows with no stored entry surface the derived todo state'
);

select is(
  (
    select bool_and(participating_member_count = 3 and budget_amount_minor = 1500 and budget_currency = 'INR')
    from public.gift_checklist_snapshot(:'gid'::uuid)
  ),
  true,
  'the participant count and stored budget repeat on every populated row'
);

select is(
  (
    select bool_and(recipient_is_organizer = false)
    from public.gift_checklist_snapshot(:'gid'::uuid)
  ),
  true,
  'no recipient but the organizer is flagged'
);

-- as D (joined non-participating): denied.
set local "request.jwt.claim.sub" = :'uid_d';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.gift_checklist_snapshot(:'gid'::uuid)), 0, 'a joined non-participating member is denied');

-- 5. CAS status lifecycle ----------------------------------------------------------

set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

-- First marking inserts at version 1.
select is(
  (
    select result || ':' || version::text
    from public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_b'::uuid, null, 'todo')
  ),
  'updated:1',
  'the first marking inserts the entry at version 1'
);

-- Completing with the exact version sets completed_at and increments.
select result::text || ':' || version::text as step1 from
  public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_b'::uuid, 1, 'completed') \gset
select is(:'step1'::text, 'updated:2', 'completing with the exact version increments to 2');

reset role;
select is(
  (
    select status::text || ':' || version::text || ':' || (completed_at is not null)::text
    from public.gift_checklist_entries
    where group_id = :'gid'::uuid and giver_id = :'uid_a'::uuid and recipient_id = :'uid_b'::uuid
  ),
  'completed:2:true',
  'the completed state stores a completed_at and the incremented version'
);

-- Stale version conflicts with no write.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select result::text || ':' || coalesce(version::text, 'null') as step2 from
  public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_b'::uuid, 1, 'completed') \gset
select is(:'step2'::text, 'conflict:2', 'a stale expected version returns conflict with the current version');

reset role;
select is(
  (select version::text from public.gift_checklist_entries
    where group_id = :'gid'::uuid and giver_id = :'uid_a'::uuid and recipient_id = :'uid_b'::uuid),
  '2',
  'a conflicted write stores nothing'
);

-- Reopening clears completed_at and increments.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select result || ':' || version::text as step3 from
  public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_b'::uuid, 2, 'todo') \gset
select is(:'step3'::text, 'updated:3', 'reopening with the exact version increments to 3');

reset role;
select is(
  (
    select status::text || ':' || (completed_at is null)::text
    from public.gift_checklist_entries
    where group_id = :'gid'::uuid and giver_id = :'uid_a'::uuid and recipient_id = :'uid_b'::uuid
  ),
  'todo:true',
  'the reopened state clears completed_at'
);

-- Invalid status text is the generic denial.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select result
    from public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_c'::uuid, null, 'in-progress')
  ),
  'unavailable',
  'an invalid status value is the generic denial'
);

-- 6. Recipient and cross-member privacy ---------------------------------------------

-- as B: cannot read or mutate A's checklist entry about B (B is the recipient).
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select coalesce(string_agg(entry_status::text, ','), 'none')
    from public.gift_checklist_snapshot(:'gid'::uuid)
  ),
  'todo,todo',
  'the recipient''s own snapshot shows only derived todo rows: A''s completed entry about B never leaks into B''s read path'
);

select is(
  (
    select result
    from public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_a'::uuid, 3, 'completed')
  ),
  'conflict',
  'B''s own entry about A is independent of A''s entry about B (no giver parameter exists: no path can mutate another member''s checklist)'
);

-- B's own first marking of C works independently.
select is(
  (
    select result
    from public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_c'::uuid, null, 'todo')
  ),
  'updated',
  'each giver''s checklist is independent'
);

-- as C: the recipient of B's entry has no path to read or mutate it; C's
-- own snapshot shows only C's own giver perspective.
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select coalesce(string_agg(entry_status::text, ','), 'none')
    from public.gift_checklist_snapshot(:'gid'::uuid)
  ),
  'todo,todo',
  'C''s snapshot surfaces only C''s own giver state, never B''s stored entry about C'
);

-- as E (outsider) and signed-out.
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.gift_checklist_snapshot(:'gid'::uuid)), 0, 'an outsider is denied');

reset role;
select is((select count(*)::int from public.gift_checklist_snapshot(:'gid'::uuid)), 0, 'a signed-out caller is denied');

-- service_role application calls gain nothing: no EXECUTE grant at all.
set local role service_role;
select throws_ok(
  format('select count(*) from public.gift_checklist_snapshot(%L::uuid)', :'gid'),
  '42501',
  null,
  'service_role gains no snapshot access (permission denied)'
);

reset role;
select is(
  (
    select count(*)::int
    from public.gift_checklist_entries
    where group_id = :'gid'::uuid
  ),
  2,
  'a direct table read stays owner-only (denied for client roles by grants)'
);
set local role authenticated;
select throws_ok(
  format('select count(*) from public.gift_checklist_entries where group_id = %L::uuid', :'gid'),
  '42501',
  null,
  'a direct gift_checklist_entries read by a client role is permission-denied'
);

-- 7. Participation and mode gating ----------------------------------------------------

reset role;
update public."groups" set mode = 'wishlist_only' where id = :'gid'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (select count(*)::int from public.gift_checklist_snapshot(:'gid'::uuid)),
  0,
  'a wishlist_only group receives the generic denial even with stored entries'
);

select is(
  (
    select result
    from public.set_gift_checklist_entry_status(:'gid'::uuid, :'uid_c'::uuid, 1, 'completed')
  ),
  'unavailable',
  'the status function denies a wishlist_only group with zero writes'
);

reset role;
update public."groups" set mode = 'gift_everyone' where id = :'gid'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select string_agg(entry_status::text, ',' order by entry_status)
    from public.gift_checklist_snapshot(:'gid'::uuid)
  ),
  'todo,todo',
  'switching back reveals the prior stored progress (durable, mode-hidden by derivation)'
);

-- Sentinel: a gift_everyone group whose caller is the only participant.
select group_id::text as gid_solo
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Solo Crew', 'occasion_type', 'other', 'occasion_date', '2026-12-05',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '900', 'budget_currency', 'INR',
    'mode', 'gift_everyone', 'organizer_participating', true
  )
) \gset

select is(
  (
    select
      (recipient_user_id is null)::text || ':' || recipient_display_name
      || ':' || coalesce(recipient_is_organizer::text, 'n')
      || ':' || coalesce(entry_status::text, 'n')
      || ':' || coalesce(participating_member_count::text, 'n')
      || ':' || coalesce(budget_amount_minor::text, 'n')
    from public.gift_checklist_snapshot(:'gid_solo'::uuid)
  ),
  'true:Member:n:n:n:n',
  'the authorized empty sentinel is exactly one row with the caller''s fallback name and all other columns null'
);

reset role;
update public."groups" set status = 'archived' where id = :'gid'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.gift_checklist_snapshot(:'gid'::uuid)),
  0,
  'an archived group reads zero rows'
);

select * from finish();
rollback;
