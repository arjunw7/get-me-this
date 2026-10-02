-- 006a: pgTAP allow/deny suite for the group security model.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/006a-group-security-model.md
-- acceptance criteria 1-5 (shape and invariants; grants and RLS; preview;
-- authority and lifecycle; acceptance and audit) plus the structural parts of
-- 6-7: the two-session race interleavings are proven by the committed
-- two-session harness (scripts/test-group-races-local.sh, pnpm
-- test:db:races), which runs in the same CI database job. The whole suite is
-- wrapped in one transaction that ends with rollback, so no synthetic user,
-- group, invitation, or audit row persists.
--
-- Role discipline: function calls run as `authenticated` with synthetic JWT
-- GUCs; direct reads of the internal tables (group_members,
-- group_invitations, group_invitation_uses, audit_events) and owner-path
-- fixture writes always `reset role` first, because those tables carry no
-- client grant at all. throws_ok assertions check the SQLSTATE only, never
-- message text.

begin;

select plan(400);

-- Synthetic test identities; rolled back at the end of the suite.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select gen_random_uuid() as uid_c \gset
select gen_random_uuid() as uid_d \gset
select gen_random_uuid() as uid_e \gset

-- Fixed synthetic 43-character canonical base64url token stand-ins for
-- direct-insert fixtures (clearly synthetic, never real bearer material).
select repeat('A', 43) as expired_tok \gset
select repeat('E', 43) as revoked_tok \gset

-- 1. Shape and invariants ---------------------------------------------------------

select has_table('public', 'groups', 'public.groups exists');
select has_table('public', 'group_members', 'public.group_members exists');
select has_table('public', 'group_invitations', 'public.group_invitations exists');
select has_table('public', 'group_invitation_uses', 'public.group_invitation_uses exists');
select has_table('public', 'audit_events', 'public.audit_events exists');

select has_column('public', 'groups', 'id', 'groups.id exists');
select has_column('public', 'groups', 'name', 'groups.name exists');
select has_column('public', 'groups', 'occasion', 'groups.occasion exists');
select has_column('public', 'groups', 'occasion_at', 'groups.occasion_at exists');
select has_column('public', 'groups', 'time_zone', 'groups.time_zone exists');
select has_column('public', 'groups', 'location', 'groups.location exists');
select has_column('public', 'groups', 'description', 'groups.description exists');
select has_column('public', 'groups', 'budget_amount_minor', 'groups.budget_amount_minor exists');
select has_column('public', 'groups', 'budget_currency', 'groups.budget_currency exists');
select has_column('public', 'groups', 'mode', 'groups.mode exists');
select has_column('public', 'groups', 'status', 'groups.status exists');
select has_column('public', 'groups', 'current_draw_version', 'groups.current_draw_version exists');
select has_column('public', 'groups', 'organizer_id', 'groups.organizer_id exists');
select has_column('public', 'groups', 'created_at', 'groups.created_at exists');
select has_column('public', 'groups', 'updated_at', 'groups.updated_at exists');

select has_column('public', 'group_members', 'group_id', 'group_members.group_id exists');
select has_column('public', 'group_members', 'user_id', 'group_members.user_id exists');
select has_column('public', 'group_members', 'status', 'group_members.status exists');
select has_column('public', 'group_members', 'participating', 'group_members.participating exists');
select has_column('public', 'group_members', 'invited_at', 'group_members.invited_at exists');
select has_column('public', 'group_members', 'joined_at', 'group_members.joined_at exists');
select has_column('public', 'group_members', 'left_at', 'group_members.left_at exists');
select has_column('public', 'group_members', 'membership_generation', 'group_members.membership_generation exists');

select has_column('public', 'group_invitations', 'id', 'group_invitations.id exists');
select has_column('public', 'group_invitations', 'group_id', 'group_invitations.group_id exists');
select has_column('public', 'group_invitations', 'creator_id', 'group_invitations.creator_id exists');
select has_column('public', 'group_invitations', 'status', 'group_invitations.status exists');
select has_column('public', 'group_invitations', 'token_hash', 'group_invitations.token_hash exists');
select has_column('public', 'group_invitations', 'expires_at', 'group_invitations.expires_at exists');
select has_column('public', 'group_invitations', 'max_uses', 'group_invitations.max_uses exists');
select has_column('public', 'group_invitations', 'use_count', 'group_invitations.use_count exists');
select has_column('public', 'group_invitations', 'target_user_id', 'group_invitations.target_user_id exists');
select has_column('public', 'group_invitations', 'target_membership_generation', 'group_invitations.target_membership_generation exists');
select has_column('public', 'group_invitations', 'created_at', 'group_invitations.created_at exists');
select has_column('public', 'group_invitations', 'updated_at', 'group_invitations.updated_at exists');

select has_column('public', 'group_invitation_uses', 'invitation_id', 'group_invitation_uses.invitation_id exists');
select has_column('public', 'group_invitation_uses', 'user_id', 'group_invitation_uses.user_id exists');
select has_column('public', 'group_invitation_uses', 'membership_generation', 'group_invitation_uses.membership_generation exists');
select has_column('public', 'group_invitation_uses', 'used_at', 'group_invitation_uses.used_at exists');

select has_column('public', 'audit_events', 'id', 'audit_events.id exists');
select has_column('public', 'audit_events', 'actor_id', 'audit_events.actor_id exists');
select has_column('public', 'audit_events', 'group_id', 'audit_events.group_id exists');
select has_column('public', 'audit_events', 'event_type', 'audit_events.event_type exists');
select has_column('public', 'audit_events', 'invitation_id', 'audit_events.invitation_id exists');
select has_column('public', 'audit_events', 'subject_user_id', 'audit_events.subject_user_id exists');
select has_column('public', 'audit_events', 'metadata', 'audit_events.metadata exists');
select has_column('public', 'audit_events', 'occurred_at', 'audit_events.occurred_at exists');

-- There is no plaintext token column anywhere.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and column_name in ('token', 'token_encrypted', 'token_plain', 'invitation_token')
  ),
  'no plaintext token column exists in the public schema'
);

select col_not_null('public', 'groups', 'name', 'groups.name is not null');
select col_not_null('public', 'groups', 'occasion', 'groups.occasion is not null');
select col_not_null('public', 'groups', 'occasion_at', 'groups.occasion_at is not null');
select col_not_null('public', 'groups', 'time_zone', 'groups.time_zone is not null');
select col_not_null('public', 'groups', 'mode', 'groups.mode is not null');
select col_not_null('public', 'groups', 'organizer_id', 'groups.organizer_id is not null');
select col_not_null('public', 'group_members', 'group_id', 'group_members.group_id is not null');
select col_not_null('public', 'group_members', 'user_id', 'group_members.user_id is not null');
select col_not_null('public', 'group_members', 'status', 'group_members.status is not null');
select col_not_null('public', 'group_members', 'membership_generation', 'group_members.membership_generation is not null');
select col_not_null('public', 'group_invitations', 'group_id', 'group_invitations.group_id is not null');
select col_not_null('public', 'group_invitations', 'creator_id', 'group_invitations.creator_id is not null');
select col_not_null('public', 'group_invitations', 'token_hash', 'group_invitations.token_hash is not null');
select col_not_null('public', 'group_invitations', 'expires_at', 'group_invitations.expires_at is not null');
select col_not_null('public', 'group_invitations', 'use_count', 'group_invitations.use_count is not null');
-- 006b: the audit actor is nullable under the exact system-revocation
-- equivalence check; every application event still requires a nonnull actor.
select ok(
  not (
    select attnotnull
    from pg_attribute
    where attrelid = 'public.audit_events'::regclass and attname = 'actor_id'
  ),
  'audit_events.actor_id is nullable (system-marked migration revocations only)'
);
select col_not_null('public', 'audit_events', 'group_id', 'audit_events.group_id is not null');
select col_not_null('public', 'audit_events', 'event_type', 'audit_events.event_type is not null');
select col_not_null('public', 'audit_events', 'metadata', 'audit_events.metadata is not null');
select col_not_null('public', 'audit_events', 'occurred_at', 'audit_events.occurred_at is not null');

select col_is_pk('public', 'groups', ARRAY['id'], 'groups.id is the primary key');
select col_is_pk(
  'public', 'group_members', ARRAY['group_id', 'user_id'],
  'group_members is keyed by the unique (group_id, user_id) pair'
);
select col_is_pk('public', 'group_invitations', ARRAY['id'], 'group_invitations.id is the primary key');
select col_is_pk(
  'public', 'group_invitation_uses', ARRAY['invitation_id', 'user_id'],
  'group_invitation_uses is keyed by the unique (invitation_id, user_id) pair'
);
select col_is_pk('public', 'audit_events', ARRAY['id'], 'audit_events.id is the primary key');

select col_is_unique(
  'public', 'group_invitations', 'token_hash',
  'group_invitations.token_hash is UNIQUE'
);
select col_is_unique(
  'public', 'group_invitations', ARRAY['group_id', 'id'],
  'group_invitations (group_id, id) is UNIQUE (declared FK target for the audit composite)'
);

select has_type('public', 'group_mode', 'the group_mode enum type exists');
select enum_has_labels(
  'public', 'group_mode',
  ARRAY['secret_draw', 'gift_everyone', 'wishlist_only'],
  'the mode enum has exactly the approved labels in order'
);
select has_type('public', 'group_status', 'the group_status enum type exists');
select enum_has_labels(
  'public', 'group_status',
  ARRAY['active', 'archived'],
  'the group status enum has exactly the pinned labels in order'
);
select has_type('public', 'group_member_status', 'the group_member_status enum type exists');
select enum_has_labels(
  'public', 'group_member_status',
  ARRAY['invited', 'joined', 'declined', 'left', 'removed'],
  'the member status enum has exactly the pinned labels in order'
);
select has_type('public', 'group_invitation_status', 'the group_invitation_status enum type exists');
select enum_has_labels(
  'public', 'group_invitation_status',
  ARRAY['active', 'revoked'],
  'the invitation status enum has exactly the pinned labels in order'
);
select has_type('public', 'group_audit_event_type', 'the group_audit_event_type enum type exists');
select enum_has_labels(
  'public', 'group_audit_event_type',
  ARRAY[
    'group_created',
    'organizer_transferred',
    'invitation_issued',
    'invitation_revoked',
    'invitation_accepted',
    'member_left',
    'invitation_declined',
    'member_removed',
    'member_reinvited'
  ],
  'the audit event enum has exactly the pinned labels in order'
);

select is(
  (
    select array_agg(conname::text order by conname)
    from pg_constraint
    where conrelid = 'public."groups"'::regclass
      and contype = 'c'
  ),
  ARRAY[
    'groups_budget_amount_non_negative',
    'groups_budget_currency_iso',
    'groups_budget_pair',
    'groups_description_bounded',
    'groups_draw_version_positive',
    'groups_location_bounded',
    'groups_name_bounded',
    'groups_occasion_bounded',
    'groups_shareable_invitation_version_non_negative',
    'groups_time_zone_bounded'
  ]::text[],
  'exactly the pinned CHECK constraints exist on groups (006b adds the shareable version check)'
);

select is(
  (
    select array_agg(conname::text order by conname)
    from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and contype = 'c'
  ),
  ARRAY['group_members_generation_positive']::text[],
  'exactly the pinned CHECK constraints exist on group_members'
);

select is(
  (
    select array_agg(conname::text order by conname)
    from pg_constraint
    where conrelid = 'public.group_invitations'::regclass
      and contype = 'c'
  ),
  ARRAY[
    'group_invitations_max_uses_positive',
    'group_invitations_shareable_target_pairing',
    'group_invitations_shareable_version_positive',
    'group_invitations_target_pair',
    'group_invitations_token_hash_sha256',
    'group_invitations_use_count_non_negative'
  ]::text[],
  'exactly the pinned CHECK constraints exist on group_invitations (006b adds the shareable pairing and version checks)'
);

select is(
  (
    select array_agg(conname::text order by conname)
    from pg_constraint
    where conrelid = 'public.group_invitation_uses'::regclass
      and contype = 'c'
  ),
  ARRAY['group_invitation_uses_generation_positive']::text[],
  'exactly the pinned CHECK constraints exist on group_invitation_uses'
);

select is(
  (
    select array_agg(conname::text order by conname)
    from pg_constraint
    where conrelid = 'public.audit_events'::regclass
      and contype = 'c'
  ),
  ARRAY['audit_events_actor_null_iff_system_revocation', 'audit_events_metadata_safe']::text[],
  'exactly the pinned CHECK constraints exist on audit_events (bounded typed metadata, 006b actor equivalence)'
);

-- Every FK introduced here restricts on delete; no CASCADE or SET NULL.
select is(
  (
    select string_agg(conname::text || ':' || confdeltype::text, ', ' order by conname)
    from pg_constraint
    where conrelid = 'public."groups"'::regclass
      and contype = 'f'
  ),
  'groups_organizer_id_fkey:r',
  'groups.organizer_id references auth.users with ON DELETE RESTRICT only'
);

select is(
  (
    select string_agg(conname::text || ':' || confdeltype::text, ', ' order by conname)
    from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and contype = 'f'
  ),
  'group_members_group_id_fkey:r, group_members_user_id_fkey:r',
  'group_members group and user FKs both use ON DELETE RESTRICT'
);

select is(
  (
    select string_agg(conname::text || ':' || confdeltype::text, ', ' order by conname)
    from pg_constraint
    where conrelid = 'public.group_invitations'::regclass
      and contype = 'f'
  ),
  'group_invitations_creator_id_fkey:r, group_invitations_group_id_fkey:r, group_invitations_target_user_id_fkey:r',
  'group_invitations group, creator, and nullable target FKs all use ON DELETE RESTRICT'
);

select is(
  (
    select string_agg(conname::text || ':' || confdeltype::text, ', ' order by conname)
    from pg_constraint
    where conrelid = 'public.group_invitation_uses'::regclass
      and contype = 'f'
  ),
  'group_invitation_uses_invitation_id_fkey:r, group_invitation_uses_user_id_fkey:r',
  'group_invitation_uses invitation and user FKs both use ON DELETE RESTRICT'
);

select is(
  (
    select string_agg(conname::text || ':' || confdeltype::text, ', ' order by conname)
    from pg_constraint
    where conrelid = 'public.audit_events'::regclass
      and contype = 'f'
  ),
  'audit_events_actor_id_fkey:r, audit_events_group_id_fkey:r, audit_events_group_invitation_fkey:r, audit_events_group_subject_fkey:r, audit_events_subject_user_id_fkey:r',
  'all five audit FKs (actor, group, composite invitation, composite subject, subject user) use ON DELETE RESTRICT'
);

select fk_ok(
  'public', 'groups', 'organizer_id', 'auth', 'users', 'id',
  'groups.organizer_id references auth.users(id)'
);
select fk_ok(
  'public', 'group_members', 'group_id', 'public', 'groups', 'id',
  'group_members.group_id references groups(id)'
);
select fk_ok(
  'public', 'group_members', 'user_id', 'auth', 'users', 'id',
  'group_members.user_id references auth.users(id)'
);
select fk_ok(
  'public', 'group_invitations', 'group_id', 'public', 'groups', 'id',
  'group_invitations.group_id references groups(id)'
);
select fk_ok(
  'public', 'group_invitations', 'creator_id', 'auth', 'users', 'id',
  'group_invitations.creator_id references auth.users(id)'
);
select fk_ok(
  'public', 'group_invitations', 'target_user_id', 'auth', 'users', 'id',
  'group_invitations.target_user_id references auth.users(id)'
);
select fk_ok(
  'public', 'group_invitation_uses', 'invitation_id', 'public', 'group_invitations', 'id',
  'group_invitation_uses.invitation_id references group_invitations(id)'
);
select fk_ok(
  'public', 'group_invitation_uses', 'user_id', 'auth', 'users', 'id',
  'group_invitation_uses.user_id references auth.users(id)'
);
select fk_ok(
  'public', 'audit_events', ARRAY['group_id', 'invitation_id'],
  'public', 'group_invitations', ARRAY['group_id', 'id'],
  'audit_events (group_id, invitation_id) references the declared unique invitation pair'
);
select fk_ok(
  'public', 'audit_events', ARRAY['group_id', 'subject_user_id'],
  'public', 'group_members', ARRAY['group_id', 'user_id'],
  'audit_events (group_id, subject_user_id) references the unique membership pair'
);

select has_index(
  'public', 'group_invitations', 'group_invitations_group_id_idx',
  'group_invitations has a group_id lookup index'
);
select has_index(
  'public', 'group_invitation_uses', 'group_invitation_uses_user_id_idx',
  'group_invitation_uses has a user_id lookup index'
);
select has_index(
  'public', 'audit_events', 'audit_events_group_id_idx',
  'audit_events has a group_id lookup index'
);
select has_index(
  'public', 'groups', 'groups_organizer_id_idx',
  'groups has an organizer_id lookup index'
);

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname in ('groups', 'group_members', 'group_invitations', 'group_invitation_uses', 'audit_events')
  ),
  0,
  'no sequences back the group tables (uuid keys only)'
);

select col_default_is('public', 'groups', 'created_at', 'clock_timestamp()', 'groups.created_at defaults to clock_timestamp()');
select col_default_is('public', 'groups', 'updated_at', 'clock_timestamp()', 'groups.updated_at defaults to clock_timestamp()');
select col_default_is('public', 'group_invitations', 'use_count', '0', 'group_invitations.use_count defaults to 0');
select col_default_is('public', 'audit_events', 'metadata', '{}', 'audit_events.metadata defaults to an empty object');
select col_default_is('public', 'audit_events', 'occurred_at', 'clock_timestamp()', 'audit_events.occurred_at defaults to clock_timestamp()');

select has_trigger('public', 'groups', 'groups_set_updated_at', 'the groups updated_at trigger exists');
select has_trigger('public', 'group_invitations', 'group_invitations_set_updated_at', 'the group_invitations updated_at trigger exists');

select ok(
  to_regprocedure('extensions.digest(bytea, text)') is not null,
  'the schema-qualified pgcrypto digest is available in extensions'
);

-- 2. Grants and RLS ---------------------------------------------------------------

-- No table privileges for anon on any new table.
select ok(not has_table_privilege('anon', 'public."groups"', 'SELECT'), 'anon has no SELECT on groups');
select ok(not has_table_privilege('anon', 'public."groups"', 'INSERT'), 'anon has no INSERT on groups');
select ok(not has_table_privilege('anon', 'public.group_members', 'SELECT'), 'anon has no SELECT on group_members');
select ok(not has_table_privilege('anon', 'public.group_invitations', 'SELECT'), 'anon has no SELECT on group_invitations');
select ok(not has_table_privilege('anon', 'public.group_invitation_uses', 'SELECT'), 'anon has no SELECT on group_invitation_uses');
select ok(not has_table_privilege('anon', 'public.audit_events', 'SELECT'), 'anon has no SELECT on audit_events');

-- The only direct client read: column-limited groups SELECT for authenticated.
select ok(has_any_column_privilege('authenticated', 'public."groups"', 'SELECT'), 'authenticated has column-limited SELECT on groups');
select ok(not has_table_privilege('authenticated', 'public."groups"', 'INSERT'), 'authenticated has no INSERT on groups');
select ok(not has_table_privilege('authenticated', 'public."groups"', 'UPDATE'), 'authenticated has no UPDATE on groups');
select ok(not has_table_privilege('authenticated', 'public."groups"', 'DELETE'), 'authenticated has no DELETE on groups');
select ok(not has_table_privilege('authenticated', 'public."groups"', 'TRUNCATE'), 'authenticated has no TRUNCATE on groups');

select ok(has_column_privilege('authenticated', 'public."groups"', 'id', 'SELECT'), 'authenticated can read groups.id');
select ok(has_column_privilege('authenticated', 'public."groups"', 'organizer_id', 'SELECT'), 'authenticated can read groups.organizer_id');
select ok(has_column_privilege('authenticated', 'public."groups"', 'name', 'SELECT'), 'authenticated can read groups.name');
select ok(has_column_privilege('authenticated', 'public."groups"', 'occasion', 'SELECT'), 'authenticated can read groups.occasion');
select ok(has_column_privilege('authenticated', 'public."groups"', 'occasion_at', 'SELECT'), 'authenticated can read groups.occasion_at');
select ok(has_column_privilege('authenticated', 'public."groups"', 'time_zone', 'SELECT'), 'authenticated can read groups.time_zone');
select ok(has_column_privilege('authenticated', 'public."groups"', 'location', 'SELECT'), 'authenticated can read groups.location');
select ok(has_column_privilege('authenticated', 'public."groups"', 'description', 'SELECT'), 'authenticated can read groups.description');
select ok(has_column_privilege('authenticated', 'public."groups"', 'budget_amount_minor', 'SELECT'), 'authenticated can read groups.budget_amount_minor');
select ok(has_column_privilege('authenticated', 'public."groups"', 'budget_currency', 'SELECT'), 'authenticated can read groups.budget_currency');
select ok(has_column_privilege('authenticated', 'public."groups"', 'mode', 'SELECT'), 'authenticated can read groups.mode');
select ok(has_column_privilege('authenticated', 'public."groups"', 'status', 'SELECT'), 'authenticated can read groups.status');

select ok(not has_column_privilege('authenticated', 'public."groups"', 'current_draw_version', 'SELECT'), 'authenticated cannot read the internal draw version');
select ok(not has_column_privilege('authenticated', 'public."groups"', 'created_at', 'SELECT'), 'authenticated cannot read the managed created_at');
select ok(not has_column_privilege('authenticated', 'public."groups"', 'updated_at', 'SELECT'), 'authenticated cannot read the managed updated_at');

-- Internal tables have no client SELECT grant at all.
select ok(not has_table_privilege('authenticated', 'public.group_members', 'SELECT'), 'authenticated has no SELECT on group_members');
select ok(not has_table_privilege('authenticated', 'public.group_invitations', 'SELECT'), 'authenticated has no SELECT on group_invitations');
select ok(not has_table_privilege('authenticated', 'public.group_invitation_uses', 'SELECT'), 'authenticated has no SELECT on group_invitation_uses');

-- Audit is append-only for application roles: no write privilege at all,
-- including TRUNCATE, for every application role.
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'INSERT'), 'authenticated has no audit INSERT');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'UPDATE'), 'authenticated has no audit UPDATE');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'DELETE'), 'authenticated has no audit DELETE');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'TRUNCATE'), 'authenticated has no audit TRUNCATE');
select ok(not has_table_privilege('anon', 'public.audit_events', 'TRUNCATE'), 'anon has no audit TRUNCATE');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'INSERT'), 'service_role has no audit INSERT');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'UPDATE'), 'service_role has no audit UPDATE');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'DELETE'), 'service_role has no audit DELETE');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'TRUNCATE'), 'service_role has no audit TRUNCATE');
select ok(not has_table_privilege('service_role', 'public."groups"', 'SELECT'), 'service_role has no direct groups grant through the application API');
select ok(not has_table_privilege('service_role', 'public.group_members', 'SELECT'), 'service_role has no direct group_members grant');
select ok(not has_table_privilege('service_role', 'public.group_invitations', 'SELECT'), 'service_role has no direct group_invitations grant');
select ok(not has_table_privilege('service_role', 'public.group_invitation_uses', 'SELECT'), 'service_role has no direct group_invitation_uses grant');

-- Grants and RLS are distinct properties: audit_events proves both.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass),
  'RLS is enabled on audit_events'
);
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_events'
  ),
  0,
  'audit_events has no permissive client policy (the missing grant denies first; RLS denies even with a grant)'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.group_members'::regclass),
  'RLS is enabled on group_members'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.group_invitations'::regclass),
  'RLS is enabled on group_invitations'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.group_invitation_uses'::regclass),
  'RLS is enabled on group_invitation_uses'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public."groups"'::regclass),
  'RLS is enabled on groups'
);
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'groups'
      and policyname = 'groups_select_joined'
      and cmd = 'SELECT'
      and roles = '{authenticated}'
  ),
  1,
  'groups has exactly the one joined-member SELECT policy for authenticated'
);

-- Private schema: USAGE for authenticated only, exact helper EXECUTE.
select ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has USAGE on the private helper schema');
select ok(not has_schema_privilege('authenticated', 'private', 'CREATE'), 'authenticated cannot create in the private schema');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no USAGE on the private schema');
select ok(not has_schema_privilege('public', 'private', 'USAGE'), 'PUBLIC has no USAGE on the private schema');

select ok(has_function_privilege('authenticated', 'private.is_joined_group_member(uuid)', 'EXECUTE'), 'authenticated can execute the joined-member helper');
select ok(has_function_privilege('authenticated', 'private.is_group_organizer(uuid)', 'EXECUTE'), 'authenticated can execute the organizer helper');
select ok(not has_function_privilege('anon', 'private.is_joined_group_member(uuid)', 'EXECUTE'), 'anon cannot execute the joined-member helper');
select ok(not has_function_privilege('service_role', 'private.is_joined_group_member(uuid)', 'EXECUTE'), 'service_role cannot execute the joined-member helper');
select ok(not has_function_privilege('public', 'private.is_group_organizer(uuid)', 'EXECUTE'), 'PUBLIC has no default EXECUTE on the organizer helper');
select ok(not has_function_privilege('authenticated', 'private.append_group_event(uuid, uuid, public.group_audit_event_type, uuid, uuid, jsonb)', 'EXECUTE'), 'authenticated cannot execute the audit appender');
select ok(not has_function_privilege('service_role', 'private.append_group_event(uuid, uuid, public.group_audit_event_type, uuid, uuid, jsonb)', 'EXECUTE'), 'service_role cannot execute the audit appender');
select ok(not has_function_privilege('public', 'private.append_group_event(uuid, uuid, public.group_audit_event_type, uuid, uuid, jsonb)', 'EXECUTE'), 'PUBLIC has no default EXECUTE on the audit appender');
select ok(not has_function_privilege('authenticated', 'private.token_is_canonical(text)', 'EXECUTE'), 'authenticated cannot execute the token validator directly');
select ok(not has_function_privilege('authenticated', 'private.group_fields_are_valid(text, text, text, text, text, bigint, text)', 'EXECUTE'), 'authenticated cannot execute the field validator directly');

-- Exact EXECUTE inventory for the public API (006b shapes).
select ok(has_function_privilege('authenticated', 'public.create_group_v1(uuid, jsonb)', 'EXECUTE'), 'authenticated can execute create_group_v1');
select ok(has_function_privilege('authenticated', 'public.update_group_settings(uuid, text, text, timestamptz, text, text, text, bigint, text, text)', 'EXECUTE'), 'authenticated can execute update_group_settings');
select ok(has_function_privilege('authenticated', 'public.issue_group_invitation(uuid, bigint)', 'EXECUTE'), 'authenticated can execute the generic issue overload');
select ok(has_function_privilege('authenticated', 'public.issue_group_invitation(uuid, uuid)', 'EXECUTE'), 'authenticated can execute the targeted issue overload');
select ok(has_function_privilege('authenticated', 'public.revoke_group_invitation(uuid, bigint)', 'EXECUTE'), 'authenticated can execute the generic revoke overload');
select ok(has_function_privilege('authenticated', 'public.revoke_group_invitation(uuid, uuid)', 'EXECUTE'), 'authenticated can execute the targeted revoke overload');
select ok(has_function_privilege('authenticated', 'public.group_shareable_invitation_state(uuid)', 'EXECUTE'), 'authenticated can execute the organizer invitation-state projection');
select ok(has_function_privilege('authenticated', 'public.accept_group_invitation(text)', 'EXECUTE'), 'authenticated can execute accept_group_invitation');
select ok(has_function_privilege('authenticated', 'public.remove_group_member(uuid, uuid)', 'EXECUTE'), 'authenticated can execute remove_group_member');
select ok(has_function_privilege('authenticated', 'public.transfer_group_organizer(uuid, uuid)', 'EXECUTE'), 'authenticated can execute transfer_group_organizer');
select ok(has_function_privilege('authenticated', 'public.leave_group(uuid)', 'EXECUTE'), 'authenticated can execute leave_group');
select ok(has_function_privilege('authenticated', 'public.decline_group_invitation(uuid)', 'EXECUTE'), 'authenticated can execute decline_group_invitation');
select ok(has_function_privilege('authenticated', 'public.group_detail(uuid)', 'EXECUTE'), 'authenticated can execute group_detail');
select ok(has_function_privilege('authenticated', 'public.group_roster(uuid)', 'EXECUTE'), 'authenticated can execute group_roster');
select ok(has_function_privilege('authenticated', 'public.group_admin_members(uuid)', 'EXECUTE'), 'authenticated can execute group_admin_members');

select ok(not has_function_privilege('anon', 'public.create_group_v1(uuid, jsonb)', 'EXECUTE'), 'anon cannot execute create_group_v1');
select ok(not has_function_privilege('anon', 'public.group_shareable_invitation_state(uuid)', 'EXECUTE'), 'anon cannot execute the organizer invitation-state projection');
select ok(not has_function_privilege('anon', 'public.accept_group_invitation(text)', 'EXECUTE'), 'anon cannot execute accept_group_invitation');
select ok(not has_function_privilege('anon', 'public.group_detail(uuid)', 'EXECUTE'), 'anon cannot execute group_detail');
select ok(not has_function_privilege('service_role', 'public.create_group_v1(uuid, jsonb)', 'EXECUTE'), 'service_role has no application EXECUTE on create_group_v1');
select ok(not has_function_privilege('service_role', 'public.group_shareable_invitation_state(uuid)', 'EXECUTE'), 'service_role has no application EXECUTE on the invitation-state projection');
select ok(not has_function_privilege('service_role', 'public.accept_group_invitation(text)', 'EXECUTE'), 'service_role has no application EXECUTE on accept_group_invitation');
select ok(not has_function_privilege('public', 'public.accept_group_invitation(text)', 'EXECUTE'), 'PUBLIC has no default EXECUTE on accept_group_invitation');
select ok(has_function_privilege('anon', 'public.preview_group_invitation(text)', 'EXECUTE'), 'anon can execute the invitation preview');
select ok(has_function_privilege('authenticated', 'public.preview_group_invitation(text)', 'EXECUTE'), 'authenticated can execute the invitation preview');
select ok(not has_function_privilege('service_role', 'public.preview_group_invitation(text)', 'EXECUTE'), 'service_role has no application EXECUTE on the invitation preview');

-- Every public API function has exactly one overload, so the privilege
-- assertions above enumerate every overload of every function name.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_group'),
  0, 'the 006a receipt-less create_group is fully removed'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_group_v1'),
  1, 'create_group_v1 has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_group_settings'),
  1, 'update_group_settings has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_group_invitation'),
  2, 'issue_group_invitation has exactly the generic and targeted overloads'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'revoke_group_invitation'),
  2, 'revoke_group_invitation has exactly the generic and targeted overloads'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'group_shareable_invitation_state'),
  1, 'group_shareable_invitation_state has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'accept_group_invitation'),
  1, 'accept_group_invitation has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'remove_group_member'),
  1, 'remove_group_member has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'transfer_group_organizer'),
  1, 'transfer_group_organizer has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'leave_group'),
  1, 'leave_group has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'decline_group_invitation'),
  1, 'decline_group_invitation has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'group_detail'),
  1, 'group_detail has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'group_roster'),
  1, 'group_roster has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'group_admin_members'),
  1, 'group_admin_members has exactly one overload'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'preview_group_invitation'),
  1, 'preview_group_invitation has exactly one overload'
);

-- All SECURITY DEFINER functions are definer with an explicit (empty)
-- search_path.
select is(
  (
    select count(*)::int
    from pg_proc p
    where p.oid in (
        'public.create_group_v1(uuid, jsonb)'::regprocedure,
        'public.update_group_settings(uuid, text, text, timestamptz, text, text, text, bigint, text, text)'::regprocedure,
        'public.group_shareable_invitation_state(uuid)'::regprocedure,
        'public.issue_group_invitation(uuid, bigint)'::regprocedure,
        'public.issue_group_invitation(uuid, uuid)'::regprocedure,
        'public.revoke_group_invitation(uuid, bigint)'::regprocedure,
        'public.revoke_group_invitation(uuid, uuid)'::regprocedure,
        'public.accept_group_invitation(text)'::regprocedure,
        'public.remove_group_member(uuid, uuid)'::regprocedure,
        'public.transfer_group_organizer(uuid, uuid)'::regprocedure,
        'public.leave_group(uuid)'::regprocedure,
        'public.decline_group_invitation(uuid)'::regprocedure,
        'public.group_detail(uuid)'::regprocedure,
        'public.group_roster(uuid)'::regprocedure,
        'public.group_admin_members(uuid)'::regprocedure,
        'public.preview_group_invitation(text)'::regprocedure,
        'private.is_joined_group_member(uuid)'::regprocedure,
        'private.is_group_organizer(uuid)'::regprocedure,
        'private.append_group_event(uuid, uuid, public.group_audit_event_type, uuid, uuid, jsonb)'::regprocedure
      )
      and (p.prosecdef = false or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%')
  ),
  0,
  'every security-definer function is definer with an explicit (empty) search_path'
);

-- Declared result shapes are closed; no extra fields. The runtime shapes are
-- probed into temp tables (each projection called with a null argument
-- returns zero rows, so only the column list is captured).
create temp table shape_group_detail as
  select * from public.group_detail(null::uuid);
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_group_detail'::regclass and attnum > 0
  ),
  'id,organizer_id,name,occasion,occasion_at,time_zone,location,description,budget_amount_minor,budget_currency,mode,status,joined_member_count',
  'group_detail returns exactly the approved columns'
);

create temp table shape_group_roster as
  select * from public.group_roster(null::uuid);
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_group_roster'::regclass and attnum > 0
  ),
  'user_id,display_name,participating,joined_at',
  'group_roster returns exactly the approved columns'
);

create temp table shape_group_admin_members as
  select * from public.group_admin_members(null::uuid);
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_group_admin_members'::regclass and attnum > 0
  ),
  'user_id,display_name,status,participating,joined_at,left_at',
  'group_admin_members returns exactly the approved columns'
);

create temp table shape_preview as
  select * from public.preview_group_invitation(null);
select is(
  (
    select string_agg(attname, ',' order by attnum)
    from pg_attribute
    where attrelid = 'shape_preview'::regclass and attnum > 0
  ),
  'host_display_name,group_name,occasion_at,budget_amount_minor,budget_currency,mode,joined_member_count',
  'preview_group_invitation returns exactly the seven approved fields'
);

-- 3. Fixtures (all synthetic; the transaction rolls back at the end) --------------

insert into auth.users (id, aud, role, email, encrypted_password)
values
  (:'uid_a'::uuid, 'authenticated', 'authenticated', 'group-fixture-a@example.invalid', ''),
  (:'uid_b'::uuid, 'authenticated', 'authenticated', 'group-fixture-b@example.invalid', ''),
  (:'uid_c'::uuid, 'authenticated', 'authenticated', 'group-fixture-c@example.invalid', ''),
  (:'uid_d'::uuid, 'authenticated', 'authenticated', 'group-fixture-d@example.invalid', ''),
  (:'uid_e'::uuid, 'authenticated', 'authenticated', 'group-fixture-e@example.invalid', '');

update public.profiles
set display_name = 'Fixture Organizer'
where id = :'uid_a'::uuid;

-- as A (organizer)
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select gen_random_uuid() as req_key \gset

select result::text as create_result, group_id::text as gid, created_now as create_now
from public.create_group_v1(
  :'req_key'::uuid,
  jsonb_build_object(
    'contract_version', 1,
    'name', 'Friday Gifts',
    'occasion_type', 'birthday',
    'occasion_date', '2026-12-18',
    'time_zone', 'Asia/Kolkata',
    'location', null,
    'description', null,
    'budget_amount_minor', '200000',
    'budget_currency', 'INR',
    'mode', 'secret_draw',
    'organizer_participating', true
  )
) \gset

select is(:'create_result'::text, 'created', 'create_group_v1 returns the created result');
select is(:'create_now'::text, 'true', 'the first committed creation reports created_now');
select is((select count(*)::int from public."groups"), 1, 'exactly one group row exists');

-- Owner view: internal rows.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_a'::uuid
  ),
  'joined:1:true',
  'the organizer row is joined, participating, at generation 1'
);

select is(
  (
    select count(*)::int
    from public.audit_events
    where group_id = :'gid'::uuid and event_type = 'group_created'
  ),
  1,
  'exactly one group_created audit event was appended atomically'
);

select is(
  (
    select count(*)::int
    from public.audit_events
    where group_id = :'gid'::uuid and metadata = '{}'::jsonb
  ),
  1,
  'the group_created event carries empty identifier-only metadata'
);

-- The occasion is the selected calendar date at local midnight in the
-- validated zone: reading it back in that zone reproduces the exact date.
select is(
  (
    select to_char(occasion_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
    from public."groups" where id = :'gid'::uuid
  ),
  '2026-12-18 00:00:00',
  'the occasion instant is local midnight of the selected calendar date, never UTC-shifted'
);

-- Same user, same key, same payload: the safe idempotent replay.
select is(
  (
    select result::text || ':' || coalesce(group_id::text, 'none') || ':' || created_now::text
    from public.create_group_v1(
      :'req_key'::uuid,
      jsonb_build_object(
        'contract_version', 1,
        'name', 'Friday Gifts',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'location', null,
        'description', null,
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'replayed:' || :'gid' || ':false',
  'the same key and payload replay the original group without recreating it'
);
select is((select count(*)::int from public."groups"), 1, 'the replay created no second group');

-- Same user, same key, different payload: the typed conflict, changing nothing.
select is(
  (
    select result::text from public.create_group_v1(
      :'req_key'::uuid,
      jsonb_build_object(
        'contract_version', 1,
        'name', 'A Different Group',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'location', null,
        'description', null,
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'idempotency-conflict',
  'the same key with a different payload is the typed idempotency conflict'
);
select is((select count(*)::int from public."groups"), 1, 'the conflict created nothing');

-- The same UUID under a different authenticated user is an independent request.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);
select is(
  (
    select result::text from public.create_group_v1(
      :'req_key'::uuid,
      jsonb_build_object(
        'contract_version', 1,
        'name', 'Friday Gifts',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'location', null,
        'description', null,
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'created',
  'the same request key under another user is an independent creation'
);
select is((select count(*)::int from public."groups"), 2, 'the independent request created its own group');

-- Remove the second fixture group so later RLS assertions stay pinned to the
-- single main group (receipt first: its group reference restricts deletes).
reset role;
delete from public.group_creation_receipts where actor_id = :'uid_b'::uuid;
delete from public.audit_events
where group_id in (select id from public."groups" where organizer_id = :'uid_b'::uuid);
delete from public.group_members
where group_id in (select id from public."groups" where organizer_id = :'uid_b'::uuid);
delete from public."groups" where organizer_id = :'uid_b'::uuid;
select is((select count(*)::int from public."groups"), 1, 'only the main fixture group remains');

-- Group creation with invalid input fails generically (as A again).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', '   ',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a blank group name is rejected generically'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Mars/Olympus_Mons',
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a non-IANA time zone is rejected generically'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-02-30',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a non-existent calendar date is rejected generically'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '-5',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a negative budget is rejected generically'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '0',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a zero budget is rejected (v1 requires a positive amount)'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '200000',
        'budget_currency', 'inr',
        'mode', 'secret_draw',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a lowercase currency is rejected generically'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'auction',
        'organizer_participating', true
      )
    )
  ),
  'invalid',
  'a mode outside the approved set is rejected generically'
);
select is(
  (
    select result::text from public.create_group_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'contract_version', 1,
        'name', 'X',
        'occasion_type', 'birthday',
        'occasion_date', '2026-12-18',
        'time_zone', 'Asia/Kolkata',
        'budget_amount_minor', '200000',
        'budget_currency', 'INR',
        'mode', 'secret_draw',
        'organizer_participating', false
      )
    )
  ),
  'invalid',
  'a payload without confirmed organizer participation is rejected'
);
select is((select count(*)::int from public."groups"), 1, 'no invalid group row was created');

-- The receipt table has no client grant and no permissive policy.
reset role;
select throws_ok(
  'select count(*) from public.group_creation_receipts',
  '42501', NULL, 'receipts have no client grant (missing grant, not only RLS)'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.group_creation_receipts'::regclass),
  'RLS is enabled on the receipt table'
);
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and tablename = 'group_creation_receipts'
  ),
  0,
  'the receipt table has no permissive client policy'
);

-- 4. Direct writes cannot forge authority ----------------------------------------

select throws_ok(
  format(
    'insert into public."groups" (name, occasion, occasion_at, time_zone, mode, organizer_id) values (''forged'', ''x'', clock_timestamp(), ''Asia/Kolkata'', ''secret_draw'', %L)',
    :'uid_a'
  ),
  '42501', NULL, 'a direct INSERT into groups is denied by the missing grant'
);
select throws_ok(
  format('update public."groups" set organizer_id = %L where id = %L', :'uid_b', :'gid'),
  '42501', NULL, 'a direct UPDATE of organizer_id is denied by the missing grant'
);
select throws_ok(
  format(
    'insert into public.group_members (group_id, user_id, status, membership_generation) values (%L, %L, ''joined'', 1)',
    :'gid', :'uid_d'
  ),
  '42501', NULL, 'a direct INSERT into group_members is denied by the missing grant'
);
select throws_ok(
  format(
    'insert into public.audit_events (actor_id, group_id, event_type) values (%L, %L, ''group_created'')',
    :'uid_a', :'gid'
  ),
  '42501', NULL, 'a direct audit INSERT is denied by the missing grant'
);
select throws_ok(
  format('update public.audit_events set event_type = ''group_created'' where group_id = %L', :'gid'),
  '42501', NULL, 'a direct audit UPDATE is denied by the missing grant'
);
select throws_ok(
  'truncate public.audit_events',
  '42501', NULL, 'a direct audit TRUNCATE is denied by the missing grant'
);
select throws_ok(
  format('delete from public.audit_events where group_id = %L', :'gid'),
  '42501', NULL, 'a direct audit DELETE is denied by the missing grant'
);

-- 5. Invitations and the preview ---------------------------------------------------

-- as A (organizer): issue a shareable invitation through the generic
-- compare-and-swap overload, starting from the initial version 0.
select invitation_version::text as issue1_version, token as tok1, expires_at as tok1_expiry
from public.issue_group_invitation(:'gid'::uuid, 0::bigint) \gset

select is(:'issue1_version'::text, '1', 'the first issuance creates version 1');
select is(char_length(:'tok1'), 43, 'the raw token is the canonical 43-character base64url encoding of 32 bytes');
select is(
  (select right(:'tok1', 1) similar to '[AEIMQUYcgkosw048]'),
  'true',
  'the raw token is canonically padded (the final character carries two zero bits)'
);

-- Owner view: only the digest is stored, and it is the digest of the token.
reset role;

select id::text as inv1_id from public.group_invitations
where token_hash = extensions.digest(convert_to(:'tok1', 'UTF8'), 'sha256') \gset
select is(:'inv1_id' is not null, 'true', 'the issued token resolves to its stored digest row');
select is(
  (select octet_length(token_hash) from public.group_invitations where id = :'inv1_id'::uuid),
  32,
  'the stored token hash is a 32-byte SHA-256 digest'
);
select is(
  (
    select shareable_version::text || ':' || status::text
    from public.group_invitations where id = :'inv1_id'::uuid
  ),
  '1:active',
  'the generic row carries shareable version 1 with stored status active'
);
select is(
  (select shareable_invitation_version::text from public."groups" where id = :'gid'::uuid),
  '1',
  'the durable group version advanced to 1'
);
select is(
  (select max_uses from public.group_invitations where id = :'inv1_id'::uuid),
  null,
  'a generic link has no use limit'
);

-- The organizer-only state projection reports active with the stored expiry.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);
select is(
  (
    select invitation_version::text || ':' || state || ':' || (expires_at = :'tok1_expiry'::timestamptz)
    from public.group_shareable_invitation_state(:'gid'::uuid)
  ),
  '1:active:true',
  'the projection reports active with the authoritative stored expiry'
);

-- Invalid expected versions are rejected with the pinned SQLSTATEs and no write.
select throws_ok(
  format('select * from public.issue_group_invitation(%L::uuid, null)', :'gid'),
  '22023', NULL, 'a null expected version is rejected with 22023'
);
select throws_ok(
  format('select * from public.issue_group_invitation(%L::uuid, -1)', :'gid'),
  '22023', NULL, 'a negative expected version is rejected with 22023'
);
select throws_ok(
  format('select * from public.issue_group_invitation(%L::uuid, 5)', :'gid'),
  'PT409', NULL, 'a stale expected version is rejected with PT409 and no write'
);

-- as B (non-organizer): no authority over invitations or settings.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select count(*)::int from public.issue_group_invitation(:'gid'::uuid, 1::bigint)),
  0, 'a non-member cannot issue invitations (no rows, no enumeration)'
);
select is(
  (select count(*)::int from public.group_shareable_invitation_state(:'gid'::uuid)),
  0, 'a non-member cannot read the organizer invitation state'
);
select is(
  (select result::text from public.update_group_settings(:'gid'::uuid, 'New', 'Occasion', clock_timestamp() + interval '30 days', 'Asia/Kolkata', null, null, null, null, 'wishlist_only')),
  'unavailable', 'a non-organizer cannot update group settings'
);

-- as anon: the preview shows exactly the approved fields for a valid token.
reset role;
set local role anon;

select is(
  (select count(*)::int from public.preview_group_invitation(:'tok1')),
  1,
  'a canonical valid token yields exactly one preview row'
);
select is(
  (select group_name from public.preview_group_invitation(:'tok1')),
  'Friday Gifts',
  'the preview exposes the group name'
);
select is(
  (select host_display_name from public.preview_group_invitation(:'tok1')),
  'Fixture Organizer',
  'the preview exposes the host display name'
);
select is(
  (select joined_member_count from public.preview_group_invitation(:'tok1')),
  1,
  'the preview exposes the joined member count'
);
select is(
  (select budget_amount_minor::text from public.preview_group_invitation(:'tok1')),
  '200000',
  'the preview exposes the minor-unit budget'
);
select is(
  (select mode from public.preview_group_invitation(:'tok1')),
  'secret_draw',
  'the preview exposes the gifting mode'
);

-- Every invalid token state yields the same empty result.
select is(
  (select count(*)::int from public.preview_group_invitation('short')),
  0, 'a malformed token yields the empty preview'
);
select is(
  (select count(*)::int from public.preview_group_invitation(repeat('A', 42))),
  0, 'a 42-character token yields the empty preview'
);
select is(
  (select count(*)::int from public.preview_group_invitation(repeat('A', 44))),
  0, 'a 44-character token yields the empty preview'
);
select is(
  (select count(*)::int from public.preview_group_invitation(repeat('B', 43))),
  0, 'a non-canonical 43-character token yields the empty preview'
);
select is(
  (select count(*)::int from public.preview_group_invitation(repeat('F', 43))),
  0, 'a well-formed but unknown token yields the empty preview'
);

-- Owner path: direct-insert fixtures for expired and revoked states (the
-- fixed tokens are synthetic placeholders, hashed like real ones). They are
-- targeted rows: generic rows are governed by the compare-and-swap version,
-- and the active generic slot belongs to the issued link.
reset role;

insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation
)
values (
  '00000000-0000-4000-8000-000000006a01', :'gid'::uuid, :'uid_a'::uuid, 'active',
  extensions.digest(convert_to(:'expired_tok', 'UTF8'), 'sha256'),
  clock_timestamp() - interval '1 hour', 5, 0,
  :'uid_d'::uuid, 1
);
insert into public.group_invitations (
  id, group_id, creator_id, status, token_hash, expires_at, max_uses, use_count,
  target_user_id, target_membership_generation
)
values (
  '00000000-0000-4000-8000-000000006a02', :'gid'::uuid, :'uid_a'::uuid, 'revoked',
  extensions.digest(convert_to(:'revoked_tok', 'UTF8'), 'sha256'),
  clock_timestamp() + interval '1 hour', 5, 0,
  :'uid_d'::uuid, 1
);

select is(
  (select count(*)::int from public.preview_group_invitation(:'expired_tok')),
  0, 'a genuinely expired token yields the empty preview'
);
select is(
  (select count(*)::int from public.preview_group_invitation(:'revoked_tok')),
  0, 'a genuinely revoked token yields the empty preview'
);
select is(
  (select use_count from public.group_invitations where id = :'inv1_id'::uuid),
  0,
  'the preview never changes the use count'
);

-- 6. Acceptance and audit ----------------------------------------------------------

-- as B: accept the shareable token.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select result::text as accept1_result, group_id::text as accept1_group
from public.accept_group_invitation(:'tok1') \gset

select is(:'accept1_result'::text, 'joined', 'a new member accepting a valid token is joined');
select is(:'accept1_group'::text, :'gid', 'acceptance returns the group id');

-- Owner view: membership, use, count, audit.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_b'::uuid
  ),
  'joined:1:true',
  'the accepted member row is joined at generation 1'
);
select is(
  (select use_count from public.group_invitations where id = :'inv1_id'::uuid),
  1,
  'the use count incremented exactly once'
);
select is(
  (select membership_generation from public.group_invitation_uses where invitation_id = :'inv1_id'::uuid and user_id = :'uid_b'::uuid),
  1,
  'the use row records the membership generation reached'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_accepted'),
  1,
  'exactly one acceptance audit event was appended'
);

-- Safe idempotent replay by the same user (as B again).
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select result::text as replay1_result
from public.accept_group_invitation(:'tok1') \gset

select is(:'replay1_result'::text, 'replayed', 'a same-user replay in the same joined generation succeeds idempotently');

-- Owner view: nothing changed.
reset role;

select is(
  (select use_count from public.group_invitations where id = :'inv1_id'::uuid),
  1,
  'the replay did not consume another use'
);
select is(
  (select count(*)::int from public.group_invitation_uses where invitation_id = :'inv1_id'::uuid and user_id = :'uid_b'::uuid),
  1,
  'the replay did not insert another use row'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_accepted'),
  1,
  'the replay appended no audit event'
);

-- Owner path: simulate exhaustion directly (the generic link has no use
-- limit by default, but the column semantics still hold), then prove a
-- fresh user cannot join and nothing was written.
reset role;

insert into public.group_invitation_uses (invitation_id, user_id, membership_generation)
values (:'inv1_id'::uuid, :'uid_d'::uuid, 1);
update public.group_invitations set use_count = 2, max_uses = 2 where id = :'inv1_id'::uuid;

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_e';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_e'), true);

select is(
  (select result::text from public.accept_group_invitation(:'tok1')),
  'unavailable', 'an exhausted token cannot create membership for a new user'
);

reset role;

select is(
  (select count(*)::int from public.group_members where group_id = :'gid'::uuid and user_id = :'uid_e'::uuid),
  0,
  'the exhausted acceptance left no membership row'
);
delete from public.group_invitation_uses where invitation_id = :'inv1_id'::uuid and user_id = :'uid_d'::uuid;
update public.group_invitations set use_count = 1, max_uses = null where id = :'inv1_id'::uuid;

-- as A (organizer): the explicit confirmed rotation revokes the active link
-- and creates version 2 atomically.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select invitation_version::text as issue2_version, token as tok2, expires_at as tok2_expiry
from public.issue_group_invitation(:'gid'::uuid, 1::bigint) \gset

select is(:'issue2_version'::text, '2', 'the confirmed rotation creates version 2');
select is(char_length(:'tok2'), 43, 'the rotated token is canonical base64url');

-- Owner view: exactly one stored-active generic row, the old one revoked.
reset role;

select id::text as inv2_id from public.group_invitations
where token_hash = extensions.digest(convert_to(:'tok2', 'UTF8'), 'sha256') \gset

select is(
  (
    select status::text from public.group_invitations where id = :'inv1_id'::uuid
  ),
  'revoked',
  'the rotation revoked the prior stored-active generic row'
);
select is(
  (
    select status::text || ':' || shareable_version::text
    from public.group_invitations where id = :'inv2_id'::uuid
  ),
  'active:2',
  'the rotated row is the stored-active generic row at version 2'
);
select is(
  (select shareable_invitation_version::text from public."groups" where id = :'gid'::uuid),
  '2',
  'the durable group version advanced exactly once'
);
select is(
  (select count(*)::int from public.group_invitations where group_id = :'gid'::uuid and status = 'active' and shareable_version is not null),
  1,
  'exactly one stored-active generic row exists'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_issued'),
  2,
  'both issuances are audited'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_revoked'),
  1,
  'the rotation revoke is audited'
);

-- as C: accept the rotated token.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select result::text as accept_c_result
from public.accept_group_invitation(:'tok2') \gset

select is(:'accept_c_result'::text, 'joined', 'member C joins through the rotated shareable token');

-- as B: the revoked old link is refused; the active token they never used
-- gets the honest already_joined result.
select set_config('request.jwt.claim.sub', :'uid_b', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select result::text from public.accept_group_invitation(:'tok1')),
  'unavailable', 'a revoked former link can no longer be replayed'
);
select is(
  (select result::text from public.accept_group_invitation(:'tok2')),
  'already_joined', 'an already joined user with no use of the active token gets already_joined'
);

-- 7. Projections and privacy -------------------------------------------------------

-- as C (joined member): the group detail and roster projections.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (select name from public.group_detail(:'gid'::uuid)),
  'Friday Gifts', 'a joined member sees the group detail'
);
select is(
  (select joined_member_count from public.group_detail(:'gid'::uuid)),
  3, 'the detail count covers the three joined members'
);
select is(
  (select count(*)::int from public.group_roster(:'gid'::uuid)),
  3, 'the roster lists only joined members'
);
select is(
  (select display_name from public.group_roster(:'gid'::uuid) where user_id = :'uid_b'::uuid),
  'Member', 'a missing display name falls back to the generic member label'
);
select is(
  (select display_name from public.group_roster(:'gid'::uuid) where user_id = :'uid_a'::uuid),
  'Fixture Organizer', 'the organizer profile display name is used when present'
);
select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid)),
  0, 'a non-organizer member gets no admin membership view'
);

-- as B: a joined member sees the same limited projections and no more.
select set_config('request.jwt.claim.sub', :'uid_b', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid)),
  0, 'a non-organizer member still gets no admin membership view'
);
select is(
  (select count(*)::int from public."groups"),
  1, 'a joined member can see only the permitted group through RLS'
);

-- as D (outsider): no enumeration, no projection, no counts.
select set_config('request.jwt.claim.sub', :'uid_d', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);

select is((select count(*)::int from public."groups"), 0, 'an outsider can enumerate no groups');
select is((select count(*)::int from public.group_detail(:'gid'::uuid)), 0, 'an outsider gets no group detail');
select is((select count(*)::int from public.group_roster(:'gid'::uuid)), 0, 'an outsider gets no roster');
select is((select count(*)::int from public.group_admin_members(:'gid'::uuid)), 0, 'an outsider gets no admin membership view');

-- as anon (null auth): the write functions are not even executable, and no
-- table is readable.
reset role;
set local role anon;
select throws_ok(
  format('select result from public.accept_group_invitation(%L)', :'tok1'),
  '42501', NULL, 'a null-auth caller cannot execute accept_group_invitation'
);
select throws_ok(
  format('select result from public.leave_group(%L)', :'gid'),
  '42501', NULL, 'a null-auth caller cannot execute leave_group'
);
select throws_ok(
  'select count(*) from public."groups"',
  '42501', NULL, 'anon cannot read groups even to count them (missing grant, not only RLS)'
);
select throws_ok(
  'select count(*) from public.group_members',
  '42501', NULL, 'anon cannot read group_members (missing grant, not only RLS)'
);

-- as E: a forged JWT for a user with no membership learns nothing.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_e';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_e'), true);

select is((select count(*)::int from public."groups"), 0, 'a forged identity can enumerate no groups');
select is((select count(*)::int from public.group_detail(:'gid'::uuid)), 0, 'a forged identity gets no group detail');
select is(
  (select result::text from public.update_group_settings(:'gid'::uuid, 'X', 'Y', clock_timestamp() + interval '30 days', 'Asia/Kolkata', null, null, null, null, 'wishlist_only')),
  'unavailable', 'a forged identity cannot update group settings'
);

-- 8. Lifecycle: settings, leave, decline, removal, reinvitation, transfer ---------

-- as A (organizer): settings update works.
reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (select result::text from public.update_group_settings(:'gid'::uuid, 'Friday Gifts', 'Housewarming', clock_timestamp() + interval '40 days', 'Asia/Kolkata', 'Studio 4', 'Bring snacks', 300000, 'INR', 'gift_everyone')),
  'updated', 'the joined organizer can update group settings'
);
select is(
  (select occasion || ':' || mode from public.group_detail(:'gid'::uuid)),
  'Housewarming:gift_everyone', 'the settings update took effect'
);

-- The organizer cannot leave, decline, or remove self before a transfer.
select is(
  (select result::text from public.leave_group(:'gid'::uuid)),
  'unavailable', 'the organizer cannot leave before a successful transfer'
);
select is(
  (select result::text from public.decline_group_invitation(:'gid'::uuid)),
  'unavailable', 'the organizer cannot decline (not an invited row)'
);
select is(
  (select result::text from public.remove_group_member(:'gid'::uuid, :'uid_a'::uuid)),
  'unavailable', 'the organizer cannot remove self'
);

-- The organizer can remove a joined member; the row is durable history.
select is(
  (select result::text from public.remove_group_member(:'gid'::uuid, :'uid_c'::uuid)),
  'removed', 'the organizer can remove a joined member'
);

-- Owner view: the removed row and its audit event.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid
  ),
  'removed:2:false',
  'the removed row keeps its history, advances the generation, and loses participation'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'member_removed'),
  1, 'exactly one removal audit event was appended'
);

-- as C: the removed member loses access and cannot use any link.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is((select count(*)::int from public.group_detail(:'gid'::uuid)), 0, 'a removed member loses group detail access');
select is((select count(*)::int from public.group_roster(:'gid'::uuid)), 0, 'a removed member loses roster access');
select is((select count(*)::int from public."groups"), 0, 'a removed member can enumerate no groups through RLS');
select is(
  (select result::text from public.accept_group_invitation(:'tok2')),
  'unavailable', 'a removed member cannot use their old generic link (sticky removal, no replay)'
);

-- A generic link issued after removal still cannot reinstate the removed row.
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select invitation_version::text as issue3_version, token as tok3
from public.issue_group_invitation(:'gid'::uuid, 2::bigint) \gset

select is(:'issue3_version'::text, '3', 'the organizer can issue a fresh generic link at version 3');

select id::text as inv3_id from public.group_invitations
where token_hash = extensions.digest(convert_to(:'tok3', 'UTF8'), 'sha256') \gset

select set_config('request.jwt.claim.sub', :'uid_c', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (select result::text from public.accept_group_invitation(:'tok3')),
  'unavailable', 'a generic link issued after removal cannot move a removed row to joined'
);

-- as A: an explicit targeted reinvitation binds the exact generation.
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select token as tok4, target_membership_generation::text as issue4_generation
from public.issue_group_invitation(:'gid'::uuid, :'uid_c'::uuid) \gset

select is(:'issue4_generation'::text, '3', 'the organizer can issue a targeted reinvitation bound to generation 3');

-- Owner view: the targeted pair and the untouched durable status.
reset role;

select id::text as inv4_id from public.group_invitations
where token_hash = extensions.digest(convert_to(:'tok4', 'UTF8'), 'sha256') \gset

select is(
  (
    select coalesce(target_user_id::text, 'none') || ':' || coalesce(target_membership_generation::text, 'none') || ':' || coalesce(shareable_version::text, 'none')
    from public.group_invitations where id = :'inv4_id'::uuid
  ),
  :'uid_c'::text || ':3:none',
  'the targeted reinvitation binds the target user and the exact incremented generation, with no shareable version'
);
select is(
  (select status::text from public.group_members where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid),
  'removed', 'issuing a targeted invitation does not rewrite the durable status'
);

-- as B: a targeted token for another user cannot be consumed.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select result::text from public.accept_group_invitation(:'tok4')),
  'unavailable', 'a targeted token cannot be consumed by another user'
);

-- as A: a second targeted invitation supersedes the first.
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select token as tok5, target_membership_generation::text as issue5_generation
from public.issue_group_invitation(:'gid'::uuid, :'uid_c'::uuid) \gset

select is(:'issue5_generation'::text, '4', 'a second targeted invitation supersedes the first and advances the generation again');

-- as C: the stale token fails, the matching one works.
select set_config('request.jwt.claim.sub', :'uid_c', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (select result::text from public.accept_group_invitation(:'tok4')),
  'unavailable', 'a stale targeted token bound to an older generation cannot reinstate'
);
select is(
  (select result::text from public.accept_group_invitation(:'tok5')),
  'joined', 'the matching targeted reinvitation reinstates exactly that user'
);

-- Owner view: the reinstated row.
reset role;

select is(
  (
    select status::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_c'::uuid
  ),
  'joined:true', 'the reinstated member is joined and participating again'
);

-- as A: the organizer admin view covers the current membership.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid)),
  3, 'the organizer admin view covers the three membership rows'
);
select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid) where status <> 'joined'),
  0, 'all three membership rows are currently joined'
);

-- Leave: a joined non-organizer member can leave; the row is durable history.
select set_config('request.jwt.claim.sub', :'uid_b', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is(
  (select result::text from public.leave_group(:'gid'::uuid)),
  'left', 'a joined member can leave'
);

-- Owner view: the left row.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text || ':' || (left_at is not null)::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_b'::uuid
  ),
  'left:2:true', 'the left row keeps history, advances the generation, and stamps left_at'
);

-- as B: a left member loses access, then rejoins through a valid generic link.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_b'), true);

select is((select count(*)::int from public.group_detail(:'gid'::uuid)), 0, 'a left member loses group detail access');
select is(
  (select result::text from public.accept_group_invitation(:'tok2')),
  'joined', 'a left member can rejoin through a valid generic link (only removal is sticky)'
);

-- Owner view: the rejoined row advanced again.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text || ':' || participating::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_b'::uuid
  ),
  'joined:3:true', 'the rejoined member is joined, participating, at generation 3'
);

-- Decline: a targeted issue creates an invited row; the invited user may decline.
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select token as tok6, target_membership_generation::text as issue6_generation
from public.issue_group_invitation(:'gid'::uuid, :'uid_d'::uuid) \gset

select is(:'issue6_generation'::text, '1', 'a targeted invitation for a known user with no row creates an invited row at generation 1');

-- Owner view: the invited row at generation 1.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_d'::uuid
  ),
  'invited:1', 'the targeted issue created the invited row at generation 1'
);

-- as D: decline; the outstanding targeted token becomes stale.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);

select is(
  (select result::text from public.decline_group_invitation(:'gid'::uuid)),
  'declined', 'an invited user can decline'
);

-- Owner view: the declined row.
reset role;

select is(
  (
    select status::text || ':' || membership_generation::text
    from public.group_members
    where group_id = :'gid'::uuid and user_id = :'uid_d'::uuid
  ),
  'declined:2', 'the declined row keeps history and advances the generation'
);

-- as D: invalid transition, then the targeted rejoin.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_d';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_d'), true);

select is(
  (select result::text from public.leave_group(:'gid'::uuid)),
  'unavailable', 'a declined user cannot leave (status transition is invalid)'
);
select is(
  (select result::text from public.accept_group_invitation(:'tok6')),
  'unavailable', 'a decline advances the generation, invalidating the outstanding targeted token'
);

-- Transfer: sole authority moves with exactly one audit event.
select set_config('request.jwt.claim.sub', :'uid_a', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (select result::text from public.transfer_group_organizer(:'gid'::uuid, :'uid_e'::uuid)),
  'unavailable', 'transfer to a non-joined destination is denied'
);
select is(
  (select result::text from public.transfer_group_organizer(:'gid'::uuid, :'uid_a'::uuid)),
  'unavailable', 'transfer to self is denied'
);
select is(
  (select result::text from public.transfer_group_organizer(:'gid'::uuid, :'uid_c'::uuid)),
  'transferred', 'transfer to a joined member succeeds'
);

-- Owner view: the authority field and the single transfer event.
reset role;

select is(
  (select organizer_id::text from public."groups" where id = :'gid'::uuid),
  :'uid_c', 'groups.organizer_id is the sole authority field and moved'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'organizer_transferred'),
  1, 'exactly one transfer audit event was appended'
);

-- as A: the previous organizer cannot continue admin operations.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_a'), true);

select is(
  (select count(*)::int from public.issue_group_invitation(:'gid'::uuid, 4::bigint)),
  0, 'the previous organizer cannot issue invitations (no rows, no enumeration)'
);
select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid)),
  0, 'the previous organizer loses the admin membership view'
);

-- as C: the new organizer can administer and also cannot leave.
select set_config('request.jwt.claim.sub', :'uid_c', true);
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (select result::text from public.update_group_settings(:'gid'::uuid, 'Friday Gifts', 'Housewarming', clock_timestamp() + interval '40 days', 'Asia/Kolkata', null, null, null, null, 'wishlist_only')),
  'updated', 'the new organizer can update group settings'
);
select is(
  (select result::text from public.leave_group(:'gid'::uuid)),
  'unavailable', 'the new organizer also cannot leave before transferring'
);

-- The new organizer can remove the previous organizer; access is lost again.
select is(
  (select result::text from public.remove_group_member(:'gid'::uuid, :'uid_a'::uuid)),
  'removed', 'the new organizer can remove the previous organizer'
);

-- Owner view: the former-organizer row and the second removal event.
reset role;

select is(
  (select status::text from public.group_members where group_id = :'gid'::uuid and user_id = :'uid_a'::uuid),
  'removed', 'the previous organizer is removed with durable history'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'member_removed'),
  2, 'both removals are audited'
);

-- as C: the admin view includes the former (removed) row.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_c';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_c'), true);

select is(
  (select count(*)::int from public.group_admin_members(:'gid'::uuid) where status <> 'joined'),
  2, 'the admin view includes the removed and declined membership rows'
);

-- 9. Restrictive foreign keys and append-only audit --------------------------------

reset role;

select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid),
  16,
  'the audit trail has the expected sixteen events before the deletion denials'
);

-- Deleting any referenced auth user is denied.
select throws_ok(
  format('delete from auth.users where id = %L', :'uid_a'),
  '23503', NULL, 'deleting an organizer referenced by groups.organizer_id is denied'
);
select throws_ok(
  format('delete from auth.users where id = %L', :'uid_c'),
  '23503', NULL, 'deleting a referenced member is denied'
);

-- Deleting the referenced group, invitation, or member row is denied.
select throws_ok(
  format('delete from public."groups" where id = %L', :'gid'),
  '23503', NULL, 'deleting a group referenced by audit history is denied'
);
select throws_ok(
  format('delete from public.group_invitations where id = %L', :'inv5_id'),
  '23503', NULL, 'deleting an invitation referenced by uses and audit is denied'
);
select throws_ok(
  format('delete from public.group_members where group_id = %L and user_id = %L', :'gid', :'uid_c'),
  '23503', NULL, 'deleting a member row referenced by the audit composite FK is denied'
);

select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid),
  16,
  'every audit row is unchanged after the denied deletions'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'organizer_transferred'),
  1, 'the transfer audit row specifically survived the denied deletions'
);

-- The metadata CHECK holds the bounded typed shape even on the owner path.
select throws_ok(
  format(
    'insert into public.audit_events (actor_id, group_id, event_type, metadata) values (%L, %L, ''group_created'', ''{"smuggled_secret":"value"}''::jsonb)',
    :'uid_a', :'gid'
  ),
  '23514', NULL, 'audit metadata with unapproved keys is rejected'
);
select throws_ok(
  format(
    'insert into public.audit_events (actor_id, group_id, event_type, metadata) values (%L, %L, ''group_created'', ''["array"]''::jsonb)',
    :'uid_a', :'gid'
  ),
  '23514', NULL, 'non-object audit metadata is rejected'
);

-- Audit rows contain no email or token material.
select ok(
  not exists (
    select 1
    from public.audit_events,
         jsonb_each_text(metadata) as m(k, v)
    where v like '%@%' or k like '%token%' or k like '%email%'
  ),
  'audit metadata contains no email or token material'
);

-- The full acceptance transaction is atomic with the caller's transaction:
-- writes made by the function disappear together on rollback.
savepoint acceptance_atomicity;
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_e';
set local "request.jwt.claim.role" = 'authenticated';
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :'uid_e'), true);

select result::text as atomic_result
from public.accept_group_invitation(:'tok3') \gset

select is(:'atomic_result'::text, 'joined', 'the fresh member accepts the valid generic token inside the savepoint');

reset role;

select is(
  (select count(*)::int from public.group_members where group_id = :'gid'::uuid and user_id = :'uid_e'::uuid),
  1, 'the acceptance wrote the membership inside the caller transaction'
);

rollback to savepoint acceptance_atomicity;

select is(
  (select count(*)::int from public.group_members where group_id = :'gid'::uuid and user_id = :'uid_e'::uuid),
  0, 'the rollback removed the membership'
);
select is(
  (select use_count from public.group_invitations where id = :'inv3_id'::uuid),
  0, 'the rollback restored the use count'
);
select is(
  (select count(*)::int from public.audit_events where group_id = :'gid'::uuid and event_type = 'invitation_accepted' and invitation_id = :'inv3_id'::uuid),
  0, 'the rollback removed the audit event'
);

select *
from finish();

rollback;
