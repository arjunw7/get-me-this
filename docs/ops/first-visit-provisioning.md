# Get Me This first-visit provisioning

Shared Supabase Auth accounts can belong to Ziprr without using Get Me This.
Create the Get Me This profile and wishlist when the authenticated person first
reaches the Get Me This profile gate, rather than at shared Auth signup.

## Deployment order

1. Apply `20261124000000_first_visit_account.sql`. Keep both signup triggers.
2. Deploy the application change in `src/profile/session.ts`. Existing profile
   reads remain unchanged. A missing profile invokes the authenticated-only
   `ensure_get_me_this_account()` function, then repeats the owner-only RLS read.
   Provisioning failure stops the request instead of pretending onboarding saved.
3. In an isolated test environment, remove both signup triggers and check that a
   fresh verified Auth identity has no profile or wishlist. Visit Get Me This,
   complete onboarding, and verify exactly one wishlist with its existing public
   sharing behavior. Repeat the visit and verify existing data is preserved.
4. After that application release is live and verified, run the reviewed
   `docs/ops/first-visit-cutover.sql` as a separate deployment step. This file is
   intentionally outside automatic migrations so a migration-before-code deploy
   cannot break signup for the currently deployed application.
5. Verify one fresh Ziprr account remains absent from Get Me This tables until
   its first Get Me This visit. Existing records are retained, with no backfill,
   cleanup or shared database reset.

The function accepts no user ID or profile fields. It derives the actor from
`auth.uid()`, requires a confirmed email, pins an empty search path, and grants
EXECUTE only to authenticated callers. An advisory lock and unique keys make
concurrent first visits idempotent. Existing table privileges and RLS are unchanged.

## Rollback

Before cutover, the application can be rolled back while both signup triggers
remain. After cutover, restore those triggers before rolling back the application:

```sql
begin;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
create trigger on_auth_user_wishlist_created after insert on auth.users
  for each row execute function public.handle_new_user_wishlist();
commit;
```

Keep the provisioning function and all existing rows during rollback. Restoring
signup triggers affects future identities only. Identities created during the
cutover still need the first-visit application path; do not remove that path until
those accounts have been handled explicitly. Do not bulk provision other apps'
accounts merely to roll back code.

## Proof

`src/profile/first-visit.test.ts` covers the first read, repeat reads and failed
provisioning. `supabase/tests/first_visit_account.sql` simulates cutover inside a
rollback-only transaction and checks absent signup records, repeat provisioning,
an unrelated account, anonymous execution and unverified/null actors. Existing
signup-trigger suites continue to run against phase 1 unchanged. No UI, prototype
fixtures or visual baselines are changed.

Local verification on 24 November 2026 passed 1,904 database assertions and
1,825 unit tests. Format, lint, type checks, browser-worker checks and production
build passed (two unit workers were used). A real desktop browser also passed
fresh email sign-in, first-visit onboarding, Home and logout with both signup
hooks removed from the isolated local database. Those local hooks were restored
after the test. No hosted hooks, accounts or settings were changed.
