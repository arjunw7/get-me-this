# Profile Vibe persistence

The user-approved profile colour control is called **Vibe**. Migration
`20261022000000_profiles_vibe.sql` adds `profiles.vibe`, a non-null text
column constrained to `tomato`, `marigold`, `electric`, or `acid_lime`.
The constant `marigold` default supplies both existing profiles and future
signup-trigger inserts, preserving the prior default appearance. No data
copy, table replacement, new extension, or new application dependency is needed.

Authenticated users receive only the added `UPDATE(vibe)` privilege on
profiles. The existing owner-only SELECT and UPDATE RLS policies and the
existing managed timestamp trigger remain unchanged. The selected colour
is not a membership, eligibility, assignment, or reservation signal.

`public.group_member_vibes(p_group_id uuid)` returns exactly
`(member_user_id uuid, vibe text)`. It is a single STABLE SQL statement,
SECURITY DEFINER owned by `postgres`, with an empty search path and fully
qualified objects. EXECUTE is revoked from PUBLIC, anon, and service_role;
only authenticated callers can execute it. The query derives the viewer
from `auth.uid()` and requires current joined membership in the same
active group. Only joined targets appear; invited, declined, left, and
removed targets never contribute rows. Unknown, cross-group, archived,
and otherwise denied requests return zero rows. It exposes no additional
profile fields and does not read any gifting data. Existing RPC signatures
are unchanged.

## Validation

`supabase/tests/profiles-vibe.sql` runs within a rolled-back transaction.
It checks the column, default, constraints, narrow grants, definer shape,
owner writes, foreign write/read denial, joined viewer parity, pending and
former target exclusion, and anonymous/outsider/invited/removed/left/
declined/archived/cross-group denial. Apply and run only on the isolated
local stack for this task; no production resource is part of this work.

## Rollback and rollout

Deploy the additive migration before application code starts selecting or
writing Vibe. Reviewers should verify existing profiles read `marigold`
and validate the database suite before deploying the dependent UI.

Prefer rolling the application back while leaving the additive column and
projection in place: earlier code ignores both, and saved choices survive.
If access must be disabled, a new reviewed migration can first revoke
EXECUTE on `public.group_member_vibes(uuid)` from authenticated and revoke
`UPDATE(vibe)` on profiles from authenticated. This is a forward fix, not
an edit to an applied migration.

Only after all callers stop using the projection/column may a new migration
drop `public.group_member_vibes(uuid)` and then `profiles.vibe` (its check
constraint drops with the column). Dropping the column destroys saved
choices and requires explicit approval plus an export if those choices
must be retained. There is no automatic destructive rollback script.
