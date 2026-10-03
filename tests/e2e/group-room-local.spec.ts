import { expect, test } from "@playwright/test";

import {
  deleteFixtureGroupsSql,
  runStackSql,
  stackIssueTargeted,
  withIdentity,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated private group room proof (006d) against the LOCAL Supabase
 * stack, run through scripts/e2e-local-stack.sh: real sessions for the
 * organizer, a joined non-organizer, and a live targeted invitee; SQL-only
 * fixtures for the remaining roster states. The suite covers direct
 * navigation, the 006b created-state entry link, the same roster for a
 * non-organizer, denial for outsider/invited/signed-out/guessed/malformed
 * ids, no-store cache headers, no private markers on denial surfaces, and
 * a membership change followed by a fresh navigation.
 *
 * No probe prints roster or invitation material: assertions reference
 * fixed synthetic names and shapes only.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Fixture room bash";
const MEMBER_NAMES = ["Organizer Ona", "Joined Jay", "Joined Mio"];

test("the room route redirects signed-out visitors to sign-in", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(15_000);

  await page.goto("/groups/00000000-0000-4000-8000-00000000dead");
  await expect(page).toHaveURL(/\/auth/);
});

/** A SQL-only fixture member (no browser session): user, profile, row. */
function addSqlMember(
  groupId: string,
  userId: string,
  status: "invited" | "joined" | "declined" | "left" | "removed",
  displayName: string | null,
  joinedAtSql: string,
): void {
  runStackSql(`
    insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
    values ('${groupId}'::uuid, '${userId}'::uuid, '${status}', ${status === "joined"}, ${joinedAtSql}, 1);`);
  if (displayName !== null) {
    runStackSql(
      `update public.profiles set display_name = '${displayName}' where id = '${userId}'::uuid;`,
    );
  }
}

/** A SQL-only fixture user (auth.users row + trigger profile). */
function addSqlUser(userId: string, email: string): void {
  runStackSql(`
    insert into auth.users (id, aud, role, email, encrypted_password)
    values ('${userId}'::uuid, 'authenticated', 'authenticated', '${email}', '');`);
}

test("the private group room: honest header, safe roster, denial matrix, and entry links", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    // The organizer creates the group through the real UI.
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj38-organizer",
      { displayName: MEMBER_NAMES[0], tasteLine: "plans the room" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page
      .getByLabel("Date")
      .fill(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];

    const sqlUserIds = [
      "8f380000-0000-4000-8000-00000000a381",
      "8f380000-0000-4000-8000-00000000a382",
      "8f380000-0000-4000-8000-00000000a383",
      "8f380000-0000-4000-8000-00000000a384",
      "8f380000-0000-4000-8000-00000000a385",
      "8f380000-0000-4000-8000-00000000a386",
    ];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId, ...sqlUserIds]);
      // The SQL-only fixture users are not admin-API fixtures: their
      // trigger-created profiles and auth rows go last, after the group
      // teardown has removed the restricting references.
      runStackSql(`
        delete from public.profiles where id in (${sqlUserIds.map((id) => `'${id}'::uuid`).join(",")});
        delete from auth.users where id in (${sqlUserIds.map((id) => `'${id}'::uuid`).join(",")});`);
    });

    // Roster: two more joined members (with and without a display name),
    // a live targeted invitee, a generic-link-only invitee, an outsider,
    // and durable former-member rows.
    addSqlUser(sqlUserIds[0], "arj38-joined@example.invalid");
    addSqlUser(sqlUserIds[1], "arj38-fallback@example.invalid");
    addSqlUser(sqlUserIds[2], "arj38-invited@example.invalid");
    addSqlUser(sqlUserIds[3], "arj38-generic@example.invalid");
    addSqlUser(sqlUserIds[4], "arj38-outsider@example.invalid");
    addSqlUser(sqlUserIds[5], "arj38-former@example.invalid");
    addSqlMember(
      groupId,
      sqlUserIds[0],
      "joined",
      MEMBER_NAMES[1],
      "clock_timestamp() - interval '2 hours'",
    );
    addSqlMember(
      groupId,
      sqlUserIds[1],
      "joined",
      null,
      "clock_timestamp() - interval '1 hour'",
    );
    addSqlMember(
      groupId,
      sqlUserIds[2],
      "invited",
      MEMBER_NAMES[2],
      "clock_timestamp()",
    );
    addSqlMember(
      groupId,
      sqlUserIds[3],
      "invited",
      "Generic Only Gale",
      "clock_timestamp()",
    );
    addSqlMember(
      groupId,
      sqlUserIds[5],
      "removed",
      "Former Fae",
      "clock_timestamp()",
    );

    // The live targeted invitation is issued through the real organizer RPC
    // (token material is discarded inside the database; never selected).
    stackIssueTargeted(organizerId, groupId, sqlUserIds[2]);

    // --- the organizer's room: entry link, header, roster ------------------
    await page.getByTestId("open-group").click();
    await page.waitForURL(`**/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    const documentResponse = await page.reload();
    expect(documentResponse?.headers()["cache-control"]).toContain("no-store");

    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();
    await expect(page.getByText("Draw names privately")).toBeVisible();
    await expect(page.getByText("2500.00 INR per person")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Who's in" }),
    ).toBeVisible();
    // Four joined (organizer, two SQL members, fallback row) and one live
    // targeted pending row; the generic-link-only invitee appears nowhere.
    await expect(page.getByText("4 joined, 1 invited")).toBeVisible();
    await expect(page.getByTestId("pending-row")).toHaveCount(1);
    await expect(page.getByTestId("joined-row")).toHaveCount(3);
    await expect(page.getByText("You · Organizer")).toBeVisible();
    await expect(page.getByText(MEMBER_NAMES[1])).toBeVisible();
    await expect(page.getByText("Member", { exact: true })).toBeVisible();
    await expect(page.getByText("Invited", { exact: true })).toBeVisible();
    await expect(page.getByText("Generic Only Gale")).toHaveCount(0);
    await expect(page.getByText("Former Fae")).toHaveCount(0);

    // The room surface is blocked from autocapture and session replay.
    expect(
      await page.getByTestId("group-room").getAttribute("data-ph-no-capture"),
    ).toBe("");

    // The in-room Home action is a real link to the existing /home.
    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL("**/home");

    // --- a joined non-organizer sees the same safe roster ------------------
    const memberContext = await page.context().browser()!.newContext();
    try {
      const memberPage = await memberContext.newPage();
      await createSignedInFixture(
        memberPage,
        admin,
        "arj38-browser-member",
        { displayName: MEMBER_NAMES[2], tasteLine: "reads the roster" },
        scope,
      );
      // A signed-in user with no membership receives the not-found result;
      // no group name, count, budget, or roster marker may appear.
      await memberPage.goto(`/groups/${groupId}`);
      await expect(
        memberPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      await expect(memberPage.getByText(GROUP_NAME)).toHaveCount(0);
      await expect(memberPage.getByText(MEMBER_NAMES[0])).toHaveCount(0);

      // Membership is granted by the database, not the browser: after the
      // insert, a fresh navigation shows the honest room.
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
        values ('${groupId}'::uuid, (
          select id from auth.users where email like 'arj38-browser-member-%@example.invalid' limit 1
        ), 'joined', true, clock_timestamp(), 1);`);
      await memberPage.goto(`/groups/${groupId}`);
      await expect(
        memberPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
      ).toBeVisible();
      await expect(memberPage.getByText("5 joined, 1 invited")).toBeVisible();
      await expect(memberPage.getByText("You", { exact: true })).toBeVisible();
      await expect(
        memberPage.getByText("Organizer", { exact: true }),
      ).toBeVisible();

      // A committed removal ends the access on the next navigation: the
      // same URL now renders the same not-found result as an outsider.
      const memberId = runStackSql(
        `select id::text from auth.users where email like 'arj38-browser-member-%@example.invalid' limit 1;`,
      ).trim();
      runStackSql(
        withIdentity(
          organizerId,
          `select result from public.remove_group_member('${groupId}'::uuid, '${memberId}'::uuid);`,
        ),
      );
      await memberPage.goto(`/groups/${groupId}`);
      await expect(
        memberPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      await expect(memberPage.getByText(GROUP_NAME)).toHaveCount(0);

      // --- malformed and guessed ids receive the same result ---------------
      await page.goto(`/groups/not-a-uuid`);
      await expect(
        page.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      await page.goto(`/groups/00000000-0000-4000-8000-00000000dead`);
      await expect(
        page.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
    } finally {
      await memberContext.close();
    }

    // --- a live targeted invitee still cannot open the room ---------------
    const invitedContext = await page.context().browser()!.newContext();
    try {
      const invitedPage = await invitedContext.newPage();
      await createSignedInFixture(
        invitedPage,
        admin,
        "arj38-browser-invited",
        { displayName: "Browser Invitee", tasteLine: "sees the preview only" },
        scope,
      );
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, membership_generation)
        values ('${groupId}'::uuid, (
          select id from auth.users where email like 'arj38-browser-invited-%@example.invalid' limit 1
        ), 'invited', false, 1);`);
      stackIssueTargeted(
        organizerId,
        groupId,
        runStackSql(
          `select id::text from auth.users where email like 'arj38-browser-invited-%@example.invalid' limit 1;`,
        ).trim(),
      );

      await invitedPage.goto(`/groups/${groupId}`);
      await expect(
        invitedPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      const html = await invitedPage.content();
      expect(html).not.toContain(GROUP_NAME);
      expect(html).not.toContain(MEMBER_NAMES[0]);
      expect(html).not.toContain("2500.00 INR");
    } finally {
      await invitedContext.close();
    }

    // Visual candidates (no baseline adoption without product/design
    // approval): the three approved state families at this project's
    // viewport are captured as review-only artifacts.
    await page.goto(`/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();
    await testInfo.attach("room-organizer-pending", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
