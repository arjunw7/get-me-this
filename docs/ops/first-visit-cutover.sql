-- PHASE 2 ONLY. Run after the phase-1 migration and application release
-- have passed first-visit checks. Keep this out of automatic migrations
-- until that release is live. Never reset or backfill the shared project.
begin;
drop trigger on_auth_user_created on auth.users;
drop trigger on_auth_user_wishlist_created on auth.users;
commit;
