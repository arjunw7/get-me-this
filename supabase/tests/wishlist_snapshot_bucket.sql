-- 005f: pgTAP allow/deny suite for the wishlist-item-snapshots Storage bucket.
--
-- Run with: pnpm test:db   (supabase test db --local)
--
-- Covers the binding brief docs/delivery/issues/005f-extraction-review-
-- and-manual-fallback.md database-authorization requirements: the bucket
-- exists private with the pinned size and MIME constraints; the owner can
-- INSERT/SELECT/UPDATE/DELETE objects only under their own
-- wishlist-item-snapshots/{owner_id}/ prefix; any other authenticated user
-- is denied under a foreign prefix; anon is denied everywhere. This is the
-- repository's first storage-policy suite and is written against the real
-- Supabase storage schema (storage.buckets, storage.objects,
-- storage.foldername), not the 005a table-test pattern.
--
-- The whole suite runs in one transaction ending in rollback, so no
-- synthetic storage object persists. The existing wishlist_items
-- owner-only suites run unchanged in their own files, proving no grant
-- drift from this migration.
--
-- DELETE semantics on storage.objects: Supabase's storage schema installs
-- a statement-level BEFORE DELETE trigger (storage.protect_delete) that
-- raises SQLSTATE 42501 ("Direct deletion from storage tables is not
-- allowed. Use the Storage API instead.") for EVERY role, including the
-- row's owner and the service role, unless the session sets
-- storage.allow_delete_query = 'true' (the Storage API's own escape
-- hatch). Direct-SQL DELETE therefore cannot exercise RLS at all, so the
-- pinned `wishlist_item_snapshots_delete_own` grant is NOT proven here —
-- it remains the policy of record and is exercised by the Storage API
-- path in production. This suite instead proves the guard fires for both
-- owner and foreign-user DELETE attempts and that the live row survives
-- every foreign-user attempt.

begin;

select plan(26);

-- Synthetic identities; rolled back with the transaction.
select gen_random_uuid() as uid_a \gset
select gen_random_uuid() as uid_b \gset
select '00000000-0000-4000-8000-0000000000f1' as submission \gset

-- 1. Bucket configuration ---------------------------------------------------------

select is(
  (select count(*) from storage.buckets where id = 'wishlist-item-snapshots'),
  1::bigint,
  'the wishlist-item-snapshots bucket exists'
);

select is(
  (select public::text from storage.buckets where id = 'wishlist-item-snapshots'),
  'false',
  'the wishlist-item-snapshots bucket is private'
);

select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'wishlist-item-snapshots'
  ),
  2097152::bigint,
  'the bucket file size limit is 2 MiB (the 005e normalized-output cap)'
);

select is(
  (
    select allowed_mime_types
    from storage.buckets
    where id = 'wishlist-item-snapshots'
  ),
  array['image/webp']::text[],
  'the bucket allows exactly the image/webp MIME type'
);

select is(
  (select name from storage.buckets where id = 'wishlist-item-snapshots'),
  'wishlist-item-snapshots',
  'the bucket name matches its id'
);

-- 2. Policy inventory ---------------------------------------------------------------

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'wishlist_item_snapshots_select_own',
        'wishlist_item_snapshots_insert_own',
        'wishlist_item_snapshots_update_own',
        'wishlist_item_snapshots_delete_own'
      )
  ),
  4::bigint,
  'exactly the four owner-only object policies exist'
);

select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wishlist_item_snapshots_select_own'
  ),
  'SELECT',
  'the select policy is a SELECT policy'
);
select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wishlist_item_snapshots_insert_own'
  ),
  'INSERT',
  'the insert policy is an INSERT policy'
);
select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wishlist_item_snapshots_update_own'
  ),
  'UPDATE',
  'the update policy is an UPDATE policy'
);
select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'wishlist_item_snapshots_delete_own'
  ),
  'DELETE',
  'the delete policy is a DELETE policy'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'wishlist_item_snapshots_%'
      and roles = '{authenticated}'::name[]
  ),
  4::bigint,
  'all four policies are granted to authenticated only (no anon, no service role)'
);

-- 3. Owner allow — the owner's own prefix -------------------------------------------

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

insert into storage.objects (bucket_id, name, metadata)
values (
  'wishlist-item-snapshots',
  :'uid_a'::text || '/' || :'submission'::text || '.webp',
  '{}'::jsonb
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  1::bigint,
  'the owner can INSERT an object under their own prefix'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  1::bigint,
  'the owner can SELECT their own object'
);

update storage.objects
set metadata = '{"fixture":true}'::jsonb
where bucket_id = 'wishlist-item-snapshots'
  and name = :'uid_a'::text || '/' || :'submission'::text || '.webp';

select is(
  (
    select metadata ->> 'fixture'
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  'true',
  'the owner can UPDATE their own object'
);

-- The object stays live from here on: section 4's foreign-user denials are
-- only meaningful against a row that exists (a deleted row makes 0-row
-- results pass under permissive or missing policies alike). The
-- transaction's rollback is the cleanup.
--
-- Direct-SQL DELETE is trigger-guarded for EVERY role (the statement-level
-- storage.protect_delete trigger, SQLSTATE 42501) — including the owner —
-- so a raw DELETE can never prove or disprove the delete policy. The
-- pinned wishlist_item_snapshots_delete_own grant remains the policy of
-- record and is exercised through the Storage API, which deletes via its
-- own storage.allow_delete_query escape hatch.
select throws_ok(
  format(
    'delete from storage.objects where bucket_id = %L and name = %L',
    'wishlist-item-snapshots',
    :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'a direct-SQL DELETE is trigger-guarded even for the owner (the delete policy is exercised through the Storage API, not raw SQL)'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  1::bigint,
  'the guard raised before anything was removed: the owner''s object is still live'
);

-- 4. Cross-user denial — a second authenticated user, foreign prefix ---------------
--
-- Every denial below runs against the owner's LIVE section-3 row, so a
-- 0-row result can only mean the policy denied the read/write — never that
-- the row was already gone.

set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_b'),
  true
);

-- A denied INSERT raises a policy violation; pgTAP's savepoint handling
-- keeps the suite transaction alive afterwards.
select throws_ok(
  format(
    'insert into storage.objects (bucket_id, name, metadata) values (%L, %L, %L)',
    'wishlist-item-snapshots',
    :'uid_a'::text || '/' || :'submission'::text || '.webp',
    '{}'::jsonb
  ),
  '42501',
  'a foreign authenticated user cannot INSERT into another user''s prefix'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  1::bigint,
  'only the owner''s live fixture is in the prefix after the denied INSERT'
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  0::bigint,
  'a foreign authenticated user cannot SELECT the owner''s LIVE object (the row exists; the policy hides it)'
);

update storage.objects
set metadata = '{"attacker":true}'::jsonb
where bucket_id = 'wishlist-item-snapshots'
  and name = :'uid_a'::text || '/' || :'submission'::text || '.webp';

select is(
  (
    select metadata -> 'attacker'
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  null,
  'a foreign authenticated user cannot UPDATE another user''s objects'
);

-- The same statement-level storage guard stops a foreign direct-SQL DELETE
-- (it fires before RLS is even consulted), so the delete-policy denial
-- itself is evidenced by the 0-row SELECT above; what is provable here is
-- that nothing the foreign user does removes the live row.
select throws_ok(
  format(
    'delete from storage.objects where bucket_id = %L and name = %L',
    'wishlist-item-snapshots',
    :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'a foreign user''s direct-SQL DELETE is stopped (guard first, delete policy denial beneath it)'
);

-- Back as the owner: the live row survived every foreign-user attempt,
-- byte-for-byte unchanged.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_a';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_a'),
  true
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  1::bigint,
  'the owner''s object survives the foreign user''s SELECT, UPDATE, and DELETE attempts'
);

select is(
  (
    select metadata ->> 'fixture'
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_a'::text || '/' || :'submission'::text || '.webp'
  ),
  'true',
  'the foreign attempts changed nothing on the owner''s live row'
);

-- A foreign user writing under their OWN prefix is allowed by design (each
-- owner is confined to their prefix); prove the insert landed under uid_b,
-- not uid_a, so the prefix — not a role grant — is what confined writes.
set local role authenticated;
set local "request.jwt.claim.sub" = :'uid_b';
set local "request.jwt.claim.role" = 'authenticated';
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'uid_b'),
  true
);

insert into storage.objects (bucket_id, name, metadata)
values (
  'wishlist-item-snapshots',
  :'uid_b'::text || '/' || :'submission'::text || '.webp',
  '{}'::jsonb
);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
      and name = :'uid_b'::text || '/' || :'submission'::text || '.webp'
  ),
  1::bigint,
  'a second user may write under their own prefix only (prefix-scoped, not role-scoped)'
);

-- 5. Anon denial ---------------------------------------------------------------------
--
-- Live owner and uid_b fixture objects exist in the bucket at this point;
-- an anon count of 0 is therefore a real policy denial, not an empty bucket.

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claim.role" = 'anon';
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (
    select count(*)
    from storage.objects
    where bucket_id = 'wishlist-item-snapshots'
  ),
  0::bigint,
  'anon cannot SELECT any snapshot object'
);

select throws_ok(
  format(
    'insert into storage.objects (bucket_id, name) values (%L, %L)',
    'wishlist-item-snapshots',
    :'uid_a'::text || '/anon.webp'
  ),
  '42501',
  'anon cannot INSERT into any snapshot prefix'
);

rollback;
