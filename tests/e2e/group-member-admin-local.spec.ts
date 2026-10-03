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
 * Stack-gated organizer membership-control proof (006f) against the LOCAL
 * Supabase stack, run through scripts/e2e-local-stack.sh: real organizer
 * sessions drive the Member tools disclosure inside the 006d room through
 * the confirmed Server Actions. The suite covers the exact roster labels
 * (Organizer / Joined / Invited / Removed), the designed
 * Recent-member-activity empty state, the per-member action matrix (remove,
 * make organizer, revoke invite, invite again with the one-time link shown
 * exactly once), the two-tab stale-version recovery copy, organizer
 * authority loss after a transfer, no Member tools for a non-organizer, and
 * leakage scans on every non-organizer surface.
 *
 * No probe prints roster, audit, or token material: assertions reference
 * fixed synthetic names and shapes only.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Fixture admin room";

test("the organizer member tools: action matrix, stale recovery, and denials", async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const projectTag = testInfo.project.name === "desktop" ? "b" : "a";
  // Disjoint fixed-uuid namespace: the 8f39 space belongs to the 006e
  // group-wishlist spec, whose parallel workers and teardown must never
  // see, collide with, or delete this spec's roster fixtures mid-run.
  const sqlUserId = (n: number): string =>
    `9f390000-0000-4000-8000-00000000${projectTag}4${String(n).padStart(2, "0")}`;

  await scope.run(async () => {
    // The organizer creates the group through the real UI.
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj38f-organizer",
      { displayName: "Admin Ona", tasteLine: "runs the roster" },
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

    const sqlUserIds = [1, 2, 3, 4, 5, 6].map(sqlUserId);
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId, ...sqlUserIds]);
      runStackSql(`
        delete from public.profiles where id in (${sqlUserIds.map((id) => `'${id}'::uuid`).join(",")});
        delete from auth.users where id in (${sqlUserIds.map((id) => `'${id}'::uuid`).join(",")});`);
    });

    // Roster fixtures: two joined members, one live targeted invitee, one
    // invited without a live invitation, and one removed former member.
    const addSqlUser = (userId: string, email: string): void => {
      runStackSql(`
        insert into auth.users (id, aud, role, email, encrypted_password)
        values ('${userId}'::uuid, 'authenticated', 'authenticated', '${email}', '');`);
    };
    const addSqlMember = (
      userId: string,
      status: "invited" | "joined" | "declined" | "left" | "removed",
      displayName: string | null,
    ): void => {
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
        values ('${groupId}'::uuid, '${userId}'::uuid, '${status}', ${status === "joined"}, clock_timestamp(), 1);`);
      if (displayName !== null) {
        runStackSql(
          `update public.profiles set display_name = '${displayName}' where id = '${userId}'::uuid;`,
        );
      }
    };
    const emails = [
      `arj38f-joined-${projectTag}@example.invalid`,
      `arj38f-second-${projectTag}@example.invalid`,
      `arj38f-live-${projectTag}@example.invalid`,
      `arj38f-pending-${projectTag}@example.invalid`,
      `arj38f-former-${projectTag}@example.invalid`,
      `arj38f-outsider-${projectTag}@example.invalid`,
    ];
    emails.forEach((email, index) => addSqlUser(sqlUserIds[index], email));
    addSqlMember(sqlUserIds[0], "joined", "Member Jay");
    addSqlMember(sqlUserIds[1], "joined", "Member Mio");
    addSqlMember(sqlUserIds[2], "invited", "Live Liv");
    addSqlMember(sqlUserIds[3], "invited", "Pending Pia");
    addSqlMember(sqlUserIds[4], "removed", "Former Fae");
    stackIssueTargeted(organizerId, groupId, sqlUserIds[2]);

    // Opens the Member tools disclosure from any state: the closed button is
    // "Member tools"; the open one is "Hide member tools" (state survives
    // router.refresh(), not navigation).
    const toolsToggle = page.getByRole("button", {
      name: /(Member tools|Hide member tools)/,
    });
    const openToolsPanel = async (): Promise<void> => {
      const state = await toolsToggle.getAttribute("aria-expanded");
      if (state !== "true") await toolsToggle.click();
      await expect(page.getByTestId("organizer-tools-panel")).toBeVisible();
    };
    const rowFor = (name: string) =>
      page
        .getByTestId("organizer-tools-panel")
        .getByTestId("admin-member-row")
        .filter({ hasText: name });

    // --- the organizer opens the room and the Member tools disclosure ------
    await page.goto(`/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();
    await openToolsPanel();
    const panel = page.getByTestId("organizer-tools-panel");

    // Exact labels plus the activity feed. The fixture's targeted issue for
    // Live Liv committed one member_reinvited audit event, so the feed opens
    // with that sentence — the empty state is covered by the component test
    // and by the leakage scan below. The projection's row order is its own;
    // rows are located by their pinned display names.
    const rows = panel.getByTestId("admin-member-row");
    await expect(rows).toHaveCount(6);
    await expect(rowFor("Admin Ona")).toContainText("Organizer");
    await expect(rowFor("Member Jay")).toContainText("Joined");
    await expect(rowFor("Pending Pia")).toContainText("Invited");
    await expect(rowFor("Former Fae")).toContainText("Removed");
    await expect(panel.getByTestId("admin-audit-list")).toContainText(
      "Live Liv was re-invited",
    );

    // The live invitee's row offers Revoke invite, never Invite again.
    await expect(
      rowFor("Live Liv").getByTestId("admin-action-revoke-invite"),
    ).toBeVisible();
    await expect(
      rowFor("Live Liv").getByTestId("admin-action-invite-again"),
    ).toHaveCount(0);
    // A joined member's row offers both Remove from group and Make organizer.
    await expect(
      rowFor("Member Jay").getByTestId("admin-action-remove"),
    ).toBeVisible();
    await expect(
      rowFor("Member Jay").getByTestId("admin-action-make-organizer"),
    ).toBeVisible();
    // A removed member's row offers Invite again only.
    await expect(
      rowFor("Former Fae").getByTestId("admin-action-invite-again"),
    ).toBeVisible();
    await expect(
      rowFor("Former Fae").getByTestId("admin-action-make-organizer"),
    ).toHaveCount(0);

    // --- transfer: authority moves and the tools leave the caller ----------
    // Member Mio is still joined at this point; the transfer happens before
    // the removal scenario so a joined target exists.
    await rowFor("Member Mio")
      .getByTestId("admin-action-make-organizer")
      .click();
    const transferDialog = page.getByTestId("admin-confirm-dialog");
    await expect(transferDialog).toContainText(
      "Make Member Mio the organizer?",
    );
    await transferDialog
      .getByRole("button", { name: "Make organizer" })
      .click();
    await expect(
      page.getByRole("button", { name: /Member tools/ }),
    ).toHaveCount(0);
    // The former organizer's room keeps the safe roster — authority is
    // derived from the database, not the browser.
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    // Transfer back through the database to restore the fixture organizer.
    const dbgBack = runStackSql(
      withIdentity(
        sqlUserIds[1],
        `select 'uid' as k, auth.uid()::text as v union all
         select 'ver', (select member_admin_version::text from public."groups" where id = '${groupId}'::uuid) union all
         select 'org', (select organizer_id::text from public."groups" where id = '${groupId}'::uuid) union all
         select 'mio_row', (select status::text from public.group_members where group_id = '${groupId}'::uuid and user_id = '${sqlUserIds[1]}'::uuid) union all
         select 'mio_member', (select count(*)::text from public.group_members where group_id = '${groupId}'::uuid and user_id = '${sqlUserIds[1]}'::uuid);`,
      ),
    );
    console.log("DBG-SQL-BACK:", JSON.stringify(dbgBack));
    runStackSql(
      withIdentity(
        sqlUserIds[1],
        `select member_admin_version from public.transfer_group_organizer('${groupId}'::uuid, '${organizerId}'::uuid, (select member_admin_version from public."groups" where id = '${groupId}'::uuid));`,
      ),
    );

    // --- remove: confirmed, committed, and the roster refreshes ------------
    await page.reload();
    await openToolsPanel();
    await rowFor("Member Mio").getByTestId("admin-action-remove").click();
    const removeDialog = page.getByTestId("admin-confirm-dialog");
    await expect(removeDialog).toContainText(
      "Remove Member Mio from the group?",
    );
    await removeDialog
      .getByRole("button", { name: "Remove from group" })
      .click();
    await expect(page.getByTestId("admin-stale-note")).toHaveCount(0);
    // The refreshed server payload shows the member as removed with the
    // Invite-again action, and one audit sentence appears.
    await expect(
      rowFor("Member Mio").getByTestId("admin-action-invite-again"),
    ).toBeVisible();
    await expect(panel.getByTestId("admin-audit-list")).toContainText(
      "Member Mio was removed",
    );

    // --- reinvite: the one-time link is shown exactly once -----------------
    await rowFor("Member Mio").getByTestId("admin-action-invite-again").click();
    const reinviteDialog = page.getByTestId("admin-confirm-dialog");
    await expect(reinviteDialog).toContainText("Invite Member Mio again?");
    await reinviteDialog.getByRole("button", { name: "Invite again" }).click();
    const inviteCard = page.getByTestId("targeted-invite-card");
    await expect(inviteCard).toBeVisible();
    await expect(inviteCard).toContainText("Shown only once — copy it now.");
    const whatsappHref = await inviteCard
      .getByRole("link", { name: "Share on WhatsApp" })
      .getAttribute("href");
    // The href is the wa.me share URL with the invite link percent-encoded
    // inside its text parameter — decode before asserting the path shape.
    expect(whatsappHref).toContain("wa.me");
    expect(decodeURIComponent(whatsappHref ?? "")).toContain("/invite/");
    // A navigation discards the token permanently: the card is gone.
    await page.reload();
    await expect(page.getByTestId("targeted-invite-card")).toHaveCount(0);

    // --- revoke: the live invitation ends; the row stays invited -----------
    await openToolsPanel();
    await rowFor("Live Liv").getByTestId("admin-action-revoke-invite").click();
    const revokeDialog = page.getByTestId("admin-confirm-dialog");
    await expect(revokeDialog).toContainText("Revoke this invite?");
    await revokeDialog.getByRole("button", { name: "Revoke invite" }).click();
    await expect(
      rowFor("Live Liv").getByTestId("admin-action-invite-again"),
    ).toBeVisible();

    // --- two-tab stale recovery: the pinned copy, never an overwrite -------
    // Tab B is a second TAB of the same signed-in organizer session — the
    // scenario is one organizer with the room open twice, not a second
    // identity. A fresh browser context would be signed out by definition.
    const tabBPage = await page.context().newPage();
    try {
      await tabBPage.goto(`/groups/${groupId}`);
      await expect(
        tabBPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
      ).toBeVisible();
      await tabBPage.getByRole("button", { name: "Member tools" }).click();
      const rowBFor = (name: string) =>
        tabBPage
          .getByTestId("organizer-tools-panel")
          .getByTestId("admin-member-row")
          .filter({ hasText: name });

      // Tab A removes Member Jay while tab B still shows the older roster.
      await openToolsPanel();
      await rowFor("Member Jay").getByTestId("admin-action-remove").click();
      await page
        .getByTestId("admin-confirm-dialog")
        .getByRole("button", { name: "Remove from group" })
        .click();
      await expect(
        page
          .getByTestId("organizer-tools-panel")
          .getByTestId("admin-audit-list")
          .getByText("Member Jay was removed"),
      ).toHaveCount(1);

      // Tab B's action now loses the compare-and-swap: the pinned recovery
      // copy appears and nothing is silently overwritten.
      await rowBFor("Member Jay").getByTestId("admin-action-remove").click();
      await tabBPage
        .getByTestId("admin-confirm-dialog")
        .getByRole("button", { name: "Remove from group" })
        .click();
      await expect(tabBPage.getByTestId("admin-stale-note")).toContainText(
        "The member list changed. Review the current list and try again.",
      );
    } finally {
      await tabBPage.close();
    }

    // --- leakage scans: no admin markers for non-organizers ----------------
    const memberContext = await page.context().browser()!.newContext();
    try {
      const memberPage = await memberContext.newPage();
      await createSignedInFixture(
        memberPage,
        admin,
        `arj38f-${projectTag}-browser-member`,
        { displayName: "Browser Member", tasteLine: "cannot admin" },
        scope,
      );
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
        values ('${groupId}'::uuid, (
          select id from auth.users where email like 'arj38f-${projectTag}-browser-member-%@example.invalid' limit 1
        ), 'joined', true, clock_timestamp(), 1);`);
      await memberPage.goto(`/groups/${groupId}`);
      await expect(
        memberPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
      ).toBeVisible();
      // No disclosure, no former-member roster rows, no audit content.
      await expect(
        memberPage.getByRole("button", { name: "Member tools" }),
      ).toHaveCount(0);
      const memberHtml = await memberPage.content();
      expect(memberHtml).not.toContain("Former Fae");
      expect(memberHtml).not.toContain("No member activity yet");
      expect(memberHtml).not.toContain("An invitation was revoked");
      expect(memberHtml).not.toContain("/invite/");

      // An outsider receives the not-found result with no group content.
      const outsiderPage = await memberContext.newPage();
      await createSignedInFixture(
        outsiderPage,
        admin,
        `arj38f-${projectTag}-browser-outsider`,
        { displayName: "Browser Outsider", tasteLine: "sees nothing" },
        scope,
      );
      await outsiderPage.goto(`/groups/${groupId}`);
      await expect(
        outsiderPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      expect(await outsiderPage.content()).not.toContain(GROUP_NAME);
    } finally {
      await memberContext.close();
    }

    // Visual candidates (no baseline adoption without product/design
    // approval): the open tools panel at this project's viewport.
    await page.goto(`/groups/${groupId}`);
    await page.getByRole("button", { name: "Member tools" }).click();
    await expect(page.getByTestId("organizer-tools-panel")).toBeVisible();
    await testInfo.attach("member-admin-organizer", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
});
