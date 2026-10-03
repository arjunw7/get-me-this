import { expect, test, type Page } from "@playwright/test";

import {
  deleteFixtureGroupsSql,
  runStackSql,
  stackIssueTargeted,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Visual candidate capture for the private group room (brief 006d,
 * criterion 12). The three approved state families — organizer with joined
 * and pending members, joined non-organizer with the same safe roster, and
 * the joined-only state — are captured at this project's viewport.
 *
 * NO BASELINE IS ADOPTED: the frozen V18 group-room reference contains
 * invite actions, organizer tools, assignment state, member wishlists,
 * reactions, and reservations this slice forbids, so no frozen full-page
 * reference is an apple-to-apple expected image. The captures attach to the
 * test report as review candidates for independent product/design approval
 * (with the documented V18 omissions beside them); a baseline change is a
 * separate owner decision. Deterministic rendering: a fixed fixture group,
 * fixed synthetic names, a future occasion date, and the app's pinned
 * fonts; test-only fixture data never ships in production.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "ARJ-38 baseline fixture";
const OCCASION_DATE = new Date(Date.now() + 21 * 86_400_000)
  .toISOString()
  .slice(0, 10);

async function capture(page: Page, name: string): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true });
  await test.info().attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}

test("the group room's three honest state families are captured for review", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj38-visual-organizer",
      { displayName: "Organizer Ona", tasteLine: "plans the room" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page.getByLabel("Date").fill(OCCASION_DATE);
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];

    const sqlUserIds = [
      "8f380100-0000-4000-8000-00000000a401",
      "8f380100-0000-4000-8000-00000000a402",
      "8f380100-0000-4000-8000-00000000a403",
      "8f380100-0000-4000-8000-00000000a404",
    ];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId, ...sqlUserIds]);
      runStackSql(`
        delete from public.profiles where id in (${sqlUserIds.map((id) => `'${id}'::uuid`).join(",")});
        delete from auth.users where id in (${sqlUserIds.map((id) => `'${id}'::uuid`).join(",")});`);
    });
    for (const [index, id] of sqlUserIds.entries()) {
      runStackSql(`
        insert into auth.users (id, aud, role, email, encrypted_password)
        values ('${id}'::uuid, 'authenticated', 'authenticated', 'arj38-visual-${index}@example.invalid', '');`);
    }
    runStackSql(
      `update public.profiles set display_name = 'Joined Jay' where id = '${sqlUserIds[0]}'::uuid;`,
    );
    runStackSql(
      `update public.profiles set display_name = 'Joined Mio' where id = '${sqlUserIds[1]}'::uuid;`,
    );
    runStackSql(
      `update public.profiles set display_name = 'Meera Pending' where id = '${sqlUserIds[2]}'::uuid;`,
    );
    runStackSql(`
      insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
      values ('${groupId}'::uuid, '${sqlUserIds[0]}'::uuid, 'joined', true, clock_timestamp() - interval '2 hours', 1),
             ('${groupId}'::uuid, '${sqlUserIds[1]}'::uuid, 'joined', true, clock_timestamp() - interval '1 hour', 1),
             ('${groupId}'::uuid, '${sqlUserIds[2]}'::uuid, 'invited', false, clock_timestamp(), 1);`);
    stackIssueTargeted(organizerId, groupId, sqlUserIds[2]);

    // Family 1: the organizer's room with joined and pending members.
    await page.goto(`/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();
    await capture(page, "room-organizer-joined-pending");

    // Family 2: a joined non-organizer sees the same safe roster.
    const memberContext = await page.context().browser()!.newContext();
    try {
      const memberPage = await memberContext.newPage();
      await createSignedInFixture(
        memberPage,
        admin,
        "arj38-visual-member",
        { displayName: "Browser Bao", tasteLine: "reads the roster" },
        scope,
      );
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
        values ('${groupId}'::uuid, (
          select id from auth.users where email like 'arj38-visual-member-%@example.invalid' limit 1
        ), 'joined', true, clock_timestamp(), 1);`);
      await memberPage.goto(`/groups/${groupId}`);
      await expect(
        memberPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
      ).toBeVisible();
      await capture(memberPage, "room-non-organizer");

      // Family 3: the joined-only state after the pending invitation is
      // revoked — the honest shorter page.
      runStackSql(
        `update public.group_invitations set status = 'revoked' where group_id = '${groupId}'::uuid and target_user_id = '${sqlUserIds[2]}'::uuid;`,
      );
      await memberPage.reload();
      await expect(
        memberPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
      ).toBeVisible();
      await expect(memberPage.getByTestId("pending-row")).toHaveCount(0);
      await capture(memberPage, "room-joined-only");
    } finally {
      await memberContext.close();
    }

    await page.reload();
    await expect(page.getByTestId("pending-row")).toHaveCount(0);
    await capture(page, "room-organizer-joined-only");
  });
});
