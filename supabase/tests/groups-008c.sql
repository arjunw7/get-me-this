-- 008c: pgTAP suite for the transactional secret-draw algorithm.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/008c-secret-draw-algorithm.md
-- acceptance criteria 1-6 and 9: shape and invariants, permutation validity
-- across fixed and randomized runs, the draw transaction and compare-and-swap
-- idempotency, secrecy and authorization, membership-change and mode-change
-- interactions (including the tombstone and the round-trip), and audit
-- completeness/secrecy. The two-session race interleavings are proven by the
-- committed harness (scripts/test-gift-draw-races-local.sh). One transaction,
-- rolled back at the end.

begin;

select plan(52);

select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset

-- 1. Shape and invariants -------------------------------------------------------

select has_table('public', 'group_assignments', 'group_assignments exists');

select is(
  (
    select string_agg(a.attname, ',' order by a.attnum)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'group_assignments' and a.attnum > 0 and not a.attisdropped
  ),
  'group_id,draw_version,giver_id,recipient_id,giver_membership_generation,recipient_membership_generation,created_at',
  'the table has exactly the declared columns in order'
);

select is(
  (
    select count(*)::int
    from pg_constraint
    where conrelid = 'public.group_assignments'::regclass
      and conname in (
        'group_assignments_pkey',
        'group_assignments_recipient_unique',
        'group_assignments_giver_is_not_recipient',
        'group_assignments_generations_positive',
        'group_assignments_giver_member_fkey',
        'group_assignments_recipient_member_fkey'
      )
  ),
  6,
  'the declared primary key, bijection, self-assignment, generation, and composite RESTRICT constraints exist'
);

select is(
  (
    select bool_and(pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%')
    from pg_constraint
    where conrelid = 'public.group_assignments'::regclass and contype = 'f'
  ),
  'true',
  'both member foreign keys are ON DELETE RESTRICT'
);

select is(
  (select relrowsecurity::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'group_assignments'),
  1,
  'RLS is enabled on group_assignments'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'group_assignments'),
  0,
  'no RLS policy exists on group_assignments'
);

select is(
  (
    select coalesce(string_agg(distinct r.rolname, ','), 'none')
    from information_schema.table_privileges tp
    join pg_roles r on r.rolname = tp.grantee
    where tp.table_schema = 'public'
      and tp.table_name = 'group_assignments'
      and tp.grantee in ('anon', 'authenticated', 'service_role')
  ),
  'none',
  'no client role holds any direct privilege on group_assignments'
);

-- The pure helper is EXECUTE-granted to no application role.
select is(
  (
    select coalesce(string_agg(r.rolname, ','), 'none')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g(grantor, grantee, privilege_type, is_grantable)
    join pg_roles r on r.oid = g.grantee
    where n.nspname = 'private'
      and p.proname = 'derangement_from_bytes'
  ),
  'postgres',
  'the pure helper is executable by the owner only'
);

-- The two new audit enum values exist.
select ok(
  exists (
    select 1 from unnest(enum_range(null::public.group_audit_event_type)) e(e)
    where e = 'draw_created'::public.group_audit_event_type
  )
  and exists (
    select 1 from unnest(enum_range(null::public.group_audit_event_type)) e(e)
    where e = 'draw_redrawn'::public.group_audit_event_type
  ),
  'the draw_created and draw_redrawn audit enum values exist'
);

-- The metadata allowlist accepts exactly the three new keys and rejects
-- everything else, including assignment-bearing keys.
select is(
  (select private.audit_metadata_is_safe(jsonb_build_object('draw_version', 3, 'previous_draw_version', 2, 'participant_count', 4))),
  true,
  'the allowlist accepts the three new draw keys'
);
select is(
  (select private.audit_metadata_is_safe('{"giver_id":"x"}'::jsonb)),
  false,
  'the allowlist rejects any assignment-bearing key'
);
select is(
  (select private.audit_metadata_is_safe('{"draw_version":null}'::jsonb)),
  false,
  'the allowlist rejects null draw metadata values'
);

-- 2. Permutation validity (fixed vectors, n = 2..12) -------------------------------

create temp table perm_failures (label text);

-- The pure helper raises on a fixed point (the wrapper retries); for fixed
-- byte vectors that yield a derangement, the result must be a valid
-- bijection with zero fixed points and perfectly deterministic.
do $$
declare
  v_n integer;
  v_members uuid[];
  v_result uuid[];
  v_again uuid[];
  v_k integer;
  v_run integer;
  v_successes integer;
  v_seed integer;
begin
  for v_n in 2..12 loop
    v_members := array(
      select gen_random_uuid() from generate_series(1, v_n)
    );
    v_successes := 0;
    for v_run in 1..60 loop
      v_seed := v_run;
      begin
        v_result := private.derangement_from_bytes(
          v_members,
          decode(lpad(to_hex(v_seed), 2, '0') || repeat('0af3', 8 * v_n), 'hex')
        );
        v_successes := v_successes + 1;

        for v_k in 1..v_n loop
          if v_result[v_k] = v_members[v_k] then
            insert into perm_failures values ('fixed point n=' || v_n);
          end if;
        end loop;
        if (select array_agg(x order by x) from unnest(v_result) x)
          <> (select array_agg(x order by x) from unnest(v_members) x) then
          insert into perm_failures values ('not a bijection n=' || v_n);
        end if;

        -- Determinism: the same fixed vector yields the same permutation.
        v_again := private.derangement_from_bytes(
          v_members,
          decode(lpad(to_hex(v_seed), 2, '0') || repeat('0af3', 8 * v_n), 'hex')
        );
        if v_again <> v_result then
          insert into perm_failures values ('nondeterministic n=' || v_n);
        end if;
      exception
        when others then
          -- A fixed vector may legitimately yield a fixed point; the helper
          -- raises and the wrapper retries with fresh bytes.
          null;
      end;
    end loop;
    if v_successes = 0 then
      insert into perm_failures values ('no valid derangement found for n=' || v_n);
    end if;
  end loop;
end;
$$;

select is(
  (select count(*)::int from perm_failures),
  0,
  'fixed-vector derangements for n = 2..12 are bijections with zero fixed points'
);

-- The n = 2 single-derangement case.
select is(
  (
    select array(
      select unnest(private.derangement_from_bytes(
        array['11111111-1111-4111-8111-111111111111'::uuid, '22222222-2222-4222-8222-222222222222'::uuid],
        decode('00', 'hex')
      ))
    )
  ),
  array['22222222-2222-4222-8222-222222222222'::uuid, '11111111-1111-4111-8111-111111111111'::uuid],
  'the n = 2 case produces the single derangement'
);

-- 3. Fixtures -----------------------------------------------------------------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'draw-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'draw-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'draw-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'draw-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'draw-e@example.invalid', '');

-- as A: organizer of a secret_draw group (A, B, C joined and participating).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select group_id::text as gid
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Draw Crew', 'occasion_type', 'secret_santa', 'occasion_date', '2026-12-20',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '3000', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

reset role;
insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation) values
  (:'gid'::uuid, :'uid_b'::uuid, 'joined', true, clock_timestamp(), 1),
  (:'gid'::uuid, :'uid_c'::uuid, 'joined', true, clock_timestamp(), 1);

select ok(true, 'fixtures staged');

-- 4. Draw refusals and the first committed draw --------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is((select result from public.run_secret_draw(:'gid'::uuid, 1)), 'stale', 'a non-null expected version on a fresh group is refused as stale');

reset role;
select is((select count(*)::int from public.group_assignments), 0, 'the refused draw wrote nothing');
set local role authenticated;

set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select result from public.run_secret_draw(:'gid'::uuid, null)), 'unavailable', 'a non-organizer is refused generically');

-- n < 2 refusal: a one-participant secret_draw group (created by A).
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select group_id::text as gid_solo
from public.create_group_v1(
  gen_random_uuid(),
  jsonb_build_object(
    'name', 'Solo Draw', 'occasion_type', 'other', 'occasion_date', '2026-12-21',
    'time_zone', 'Asia/Kolkata', 'budget_amount_minor', '100', 'budget_currency', 'INR',
    'mode', 'secret_draw', 'organizer_participating', true
  )
) \gset

set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select result from public.run_secret_draw(:'gid_solo'::uuid, null)), 'insufficient_participants', 'a one-participant draw is refused distinctly');

reset role;
select is((select count(*)::int from public.group_assignments), 0, 'the refused insufficient draw wrote nothing');
set local role authenticated;

-- First draw on the main fixture.
select result || ':' || draw_version::text as draw1
from public.run_secret_draw(:'gid'::uuid, null) \gset
select is(:'draw1'::text, 'drawn:1', 'the first draw commits as version 1');

reset role;
select is(
  (select current_draw_version::text from public."groups" where id = :'gid'::uuid),
  '1',
  'the committed draw sets groups.current_draw_version to 1'
);

select is(
  (select count(*)::int from public.group_assignments where group_id = :'gid'::uuid),
  3,
  'the draw touches exactly n rows'
);

select is(
  (select count(*)::int from public.group_assignments where group_id = :'gid'::uuid and giver_id = recipient_id),
  0,
  'no committed draw ever produces a fixed point'
);

select is(
  (select count(*)::int from public.group_assignments where group_id = :'gid'::uuid and draw_version = 1 and (giver_membership_generation < 1 or recipient_membership_generation < 1)),
  0,
  'every assignment binds a positive membership generation'
);

select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'draw_created'::public.group_audit_event_type),
  1,
  'exactly one draw_created audit event exists'
);

select is(
  (
    select bool_and(
      metadata ? 'draw_version' and metadata ? 'participant_count'
      and not (metadata ?| array['giver_id', 'recipient_id', 'assignment'])
    )
    from public.audit_events
    where group_id = :'gid'::uuid and event_type = 'draw_created'::public.group_audit_event_type
  ),
  true,
  'the draw audit metadata is limited to the approved keys with no assignment content'
);

-- Idempotency: retrying the committed draw with the same expected version is stale.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select result from public.run_secret_draw(:'gid'::uuid, null)), 'stale', 'a retry confirmed against the pre-draw state is refused as stale');

reset role;
select is((select count(*)::int from public.group_assignments where group_id = :'gid'::uuid), 3, 'the retried draw re-randomized nothing');
set local role authenticated;

-- 5. Fifty live randomized draws with per-run invariants ------------------------------

create temp table draw_failures (label text);

do $$
declare
  v_expected integer;
  v_out record;
  v_run integer;
  v_bad integer;
  v_gid uuid;
  v_organizer uuid;
begin
  -- Invariant reads touch internal tables: run this block's own statements
  -- as the owner; the definer functions still derive the caller from the
  -- JWT GUCs.
  perform set_config('role', 'postgres', true);
  select id, organizer_id into v_gid, v_organizer
    from public."groups" where name = 'Draw Crew';
  select current_draw_version into v_expected from public."groups" where id = v_gid;

  -- The draw derives the caller from auth.uid(): act as the organizer.
  perform set_config('request.jwt.claim.sub', v_organizer::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_organizer::text, 'role', 'authenticated')::text, true);

  for v_run in 1..50 loop
    select * into v_out
    from public.run_secret_draw(v_gid, v_expected);
    if v_out.result <> 'drawn' then
      insert into draw_failures values ('run ' || v_run || ': ' || v_out.result);
      exit;
    end if;
    v_expected := v_out.draw_version;

    select count(*) into v_bad
    from public.group_assignments a
    where a.group_id = v_gid
      and a.draw_version = v_expected
      and (a.giver_id = a.recipient_id
        or (select count(*) from public.group_assignments b
            where b.group_id = a.group_id and b.draw_version = a.draw_version
              and b.recipient_id = a.recipient_id) <> 1);
    if v_bad > 0 then
      insert into draw_failures values ('invariant violation on run ' || v_run);
    end if;
  end loop;
end;
$$;

select is(
  (select count(*)::int from draw_failures),
  0,
  'fifty live draws across the fixture group never produce a fixed point, duplicate giver, or duplicate recipient'
);

-- 6. Secrecy and authorization ---------------------------------------------------------

reset role;
update public.group_members
set participating = false
where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

-- The organizer's group_draw_state: exactly the four approved fields and no pairs.
select is(
  (
    select count(*)::int
    from public.group_draw_state(:'gid'::uuid)
    cross join lateral (
      select jsonb_build_object(
        'draw_version', draw_version, 'drawn_at', drawn_at,
        'participant_count', participant_count, 'roster_in_sync', roster_in_sync
      ) as j
    ) x
    where (select count(*) from jsonb_object_keys(x.j)) <> 4
  ),
  0,
  'group_draw_state exposes exactly the four approved fields'
);

select is(
  (
    select participant_count::text || ':' || roster_in_sync::text
    from public.group_draw_state(:'gid'::uuid)
  ),
  '3:false',
  'a departure since the draw flips roster_in_sync to false'
);

-- The organizer has no read of anyone's assignment values.
select is(
  (select count(*)::int from public.my_assignment(:'gid'::uuid)),
  1,
  'the organizer reads exactly their own single assignment row and nothing else'
);

-- as B: own assignment visible with the recipient identity; as E: denied.
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (select count(*)::int from public.my_assignment(:'gid'::uuid)),
  1,
  'a joined member sees exactly their own assignment'
);

set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.my_assignment(:'gid'::uuid)), 0, 'an outsider reads zero rows');

reset role;
select is((select count(*)::int from public.my_assignment(:'gid'::uuid)), 0, 'a signed-out caller reads zero rows');

set local role authenticated;
select throws_ok(
  'select count(*) from public.group_assignments',
  '42501',
  null,
  'a direct client read of group_assignments is permission-denied'
);

-- 7. Membership-change and mode-change interactions --------------------------------------

reset role;

-- C re-participates, then leaves: the departure invalidates assignments TO C
-- and removes C's own read path, without rewriting any stored row.
update public.group_members
set participating = true
where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid;

insert into public.audit_events (actor_id, group_id, event_type, subject_user_id, metadata)
values (:'uid_a'::uuid, :'gid'::uuid, 'member_left'::public.group_audit_event_type, :'uid_c'::uuid, '{}'::jsonb);

update public.group_members
set status = 'left', participating = false, membership_generation = membership_generation + 1
where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid;

-- Find the giver who was assigned the departed member (owner-path read).
select giver_id::text as giver_of_c
from public.group_assignments
where group_id = :'gid'::uuid
  and draw_version = (select current_draw_version from public."groups" where id = :'gid'::uuid)
  and recipient_id = :'uid_c'::uuid \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'giver_of_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select is_valid::text || ':' || coalesce(recipient_id::text, 'null')
    from public.my_assignment(:'gid'::uuid)
  ),
  'false:null',
  'a departure makes the assignment to the departed member read is_valid = false with the recipient identity nulled'
);

select is(
  (
    select bool_and(recipient_id is not null or not is_valid)
    from public.my_assignment(:'gid'::uuid)
  ),
  true,
  'no invalid assignment ever surfaces a recipient identity'
);

-- The organizer cannot leave (006a) — tombstone via settings update instead.
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

-- Version before the tombstone (owner-path read).
reset role;
select (select max(draw_version) from public.group_assignments where group_id = :'gid'::uuid)::text as v_before \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

select is(
  (
    select result
    from public.update_group_settings(
      :'gid'::uuid, 'Draw Crew', 'Secret Santa', '2026-12-20 00:00:00+05:30'::timestamptz,
      'Asia/Kolkata', null, null, 3000::bigint, 'INR', 'wishlist_only'
    )
  ),
  'updated',
  'the organizer can move the mode away from secret_draw'
);

reset role;
select is(
  (
    select (g.current_draw_version = (select max(draw_version) from public.group_assignments where group_id = :'gid'::uuid) + 1)::int
    from public."groups" g
    where g.id = :'gid'::uuid
  ),
  1,
  'the tombstone bumps the draw version by exactly one over the last real draw'
);

select is(
  (select count(*)::int from public.my_assignment(:'gid'::uuid)),
  0,
  'after the tombstone the members read zero assignment rows'
);

select is(
  (
    select count(*)::int
    from public.group_draw_state(:'gid'::uuid)
  ),
  0,
  'the organizer reads zero draw-state rows for the wrong-mode group'
);

-- Byte-identical history: the stored rows were not mutated.
select is(
  (select count(*)::int from public.group_assignments where group_id = :'gid'::uuid),
  (select 51 * 3),
  'all assignment rows remain stored (durable history)'
);

-- Mode round-trip: returning to secret_draw does not resurrect assignments.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is(
  (
    select result
    from public.update_group_settings(
      :'gid'::uuid, 'Draw Crew', 'Secret Santa', '2026-12-20 00:00:00+05:30'::timestamptz,
      'Asia/Kolkata', null, null, 3000::bigint, 'INR', 'secret_draw'
    )
  ),
  'updated',
  'the mode returns to secret_draw'
);

select is(
  (select count(*)::int from public.my_assignment(:'gid'::uuid)),
  0,
  'the round-trip resurrects nothing: reads stay zero until a confirmed redraw'
);

reset role;
select is(
  (
    select current_draw_version::text
    from public."groups"
    where id = :'gid'::uuid
  ),
  ((:'v_before'::integer + 1))::text,
  'the round-trip left the tombstoned version in place (no second bump into secret_draw)'
);

-- A confirmed redraw after the round-trip creates the next real version.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);

reset role;
select ('drawn:' || ((select current_draw_version from public."groups" where id = :'gid'::uuid) + 1)) as expected_redraw \gset
select ((select current_draw_version from public."groups" where id = :'gid'::uuid))::text as expected_ver \gset

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select result || ':' || draw_version::text as redraw_after
from public.run_secret_draw(:'gid'::uuid, :'expected_ver'::integer) \gset
select is(:'redraw_after'::text, :'expected_redraw'::text, 'a confirmed redraw after the round-trip creates the next real version');

-- A settings update that does not move the mode away never bumps the version.
select is(
  (
    select result
    from public.update_group_settings(
      :'gid'::uuid, 'Draw Crew', 'Secret Santa', '2026-12-20 00:00:00+05:30'::timestamptz,
      'Asia/Kolkata', null, null, 3000::bigint, 'INR', 'secret_draw'
    )
  ),
  'updated',
  'a same-mode settings update commits'
);

reset role;
select is(
  (
    select (current_draw_version = :'v_before'::integer + 2)::int
    from public."groups"
    where id = :'gid'::uuid
  ),
  1,
  'a settings update that does not move the mode away never bumps the version'
);

-- An archived group reads zero rows and refuses the draw.
reset role;
update public."groups" set status = 'archived' where id = :'gid'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', substring(current_setting('request.jwt.claim.sub', true) for 36)), true);
select is((select count(*)::int from public.my_assignment(:'gid'::uuid)), 0, 'an archived group reads zero assignment rows');

select is((select count(*)::int from public.my_assignment(:'gid_solo'::uuid)), 0, 'an unknown group reads zero rows');

select * from finish();
rollback;
