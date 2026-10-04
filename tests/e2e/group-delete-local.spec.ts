import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

test("admin confirms deletion; cancellation preserves the group and members lose access only after confirmation", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const memberContext = await browser.newContext({
    viewport: testInfo.project.use.viewport,
  });
  try {
    await scope.run(async () => {
      const organizerId = await createSignedInFixture(
        page,
        admin,
        "delete-organizer",
        { displayName: "Organizer Ona" },
        scope,
      );
      const memberPage = await memberContext.newPage();
      const memberId = await createSignedInFixture(
        memberPage,
        admin,
        "delete-member",
        { displayName: "Member Jay" },
        scope,
      );
      await page.goto("/groups/new");
      await page.getByLabel("Group name").fill("Birthday crew");
      await page
        .getByLabel("Date", { exact: true })
        .fill(
          new Date(Date.now() + 399 * 86_400_000).toISOString().slice(0, 10),
        );
      await page.getByRole("button", { name: "Create group" }).click();
      await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
      const groupId = new URL(page.url()).pathname.split("/")[2];
      scope.register("fixture group", async () =>
        deleteFixtureGroupsSql([groupId], [organizerId, memberId]),
      );
      runStackSql(
        `insert into public.group_members(group_id,user_id,status,participating,joined_at,membership_generation) values ('${groupId}','${memberId}','joined',true,clock_timestamp(),1);`,
      );
      await page.goto(`/groups/${groupId}`);
      await page.getByRole("button", { name: /Organizer tools/ }).click();
      const evidenceDirectory = process.env.GMT_DELETE_EVIDENCE_DIR;
      const capture = async (name: string) => {
        const fullPage = name !== "delete-confirmation";
        const body = await page.screenshot({
          fullPage,
          animations: "disabled",
        });
        await testInfo.attach(name, { body, contentType: "image/png" });
        if (evidenceDirectory) {
          await mkdir(evidenceDirectory, { recursive: true });
          await page.screenshot({
            path: path.join(
              evidenceDirectory,
              `${name}-${testInfo.project.name}.png`,
            ),
            fullPage,
            animations: "disabled",
          });
        }
      };
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (process.env.GMT_DELETE_CAPTURE_BEFORE) {
        await capture("organizer-before");
        return;
      }
      const panel = page.getByTestId("organizer-tools-panel");
      const trigger = panel.getByRole("button", {
        name: "Delete group",
        exact: true,
      });
      await expect(trigger).toBeVisible();
      await expect(panel.getByRole("button").last()).toHaveText("Delete group");
      await capture("organizer-after");
      await trigger.click();
      const dialog = page.getByRole("dialog", {
        name: "Delete Birthday crew?",
      });
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      await expect(dialog).toContainText(
        "Everyone keeps their personal wishlist",
      );
      await capture("delete-confirmation");
      expect(
        (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
          .violations,
      ).toEqual([]);
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(trigger).toBeFocused();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Birthday crew", exact: true }),
      ).toBeVisible();
      await memberPage.goto(`/groups/${groupId}`);
      await expect(
        memberPage.getByRole("heading", { name: "Birthday crew", exact: true }),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", {
          name: /Organizer tools|Delete group/,
        }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: /Organizer tools/ }).click();
      await trigger.click();
      await dialog
        .getByRole("button", { name: "Delete group", exact: true })
        .click();
      await expect(page).toHaveURL(/\/groups$/);
      await expect(
        page.getByRole("link", { name: /Birthday crew/ }),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByRole("link", { name: /Birthday crew/ }),
      ).toHaveCount(0);
      await memberPage.reload();
      await expect(
        memberPage.getByRole("heading", { name: "Birthday crew", exact: true }),
      ).toHaveCount(0);
      await memberPage.goto("/groups");
      await expect(
        memberPage.getByRole("link", { name: /Birthday crew/ }),
      ).toHaveCount(0);
      await page.goto(`/groups/${groupId}`);
      await expect(
        page.getByRole("heading", { name: "Birthday crew", exact: true }),
      ).toHaveCount(0);
      expect(
        runStackSql(`select status from public.groups where id='${groupId}'`),
      ).toBe("deleted\n");
      expect(
        runStackSql(
          `select count(*) from public.wishlists where owner_id in ('${organizerId}','${memberId}')`,
        ),
      ).toBe("2\n");
    });
  } finally {
    await memberContext.close();
  }
});
