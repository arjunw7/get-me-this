import { expect, test, type Page } from "@playwright/test";
import {
  deleteFixtureGroupsSql,
  runStackSql,
  stackIssueGeneric,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/** ARJ-68 replaces inline invitation-state cards with the shared modal. The
 * visible families are confirmation, recoverable link, and explicit legacy
 * replacement. Authorization, expiry, stale and revoked handling remain
 * covered by the functional and database suites. Baselines require product
 * approval; these names retain their corresponding route/fixture provenance.
 */
const GROUP_NAME = "ARJ-37 baseline fixture";
test.skip(!process.env.E2E_LOCAL_SUPABASE, "requires local Supabase");
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  // Always retain a redacted candidate, including states within the tolerance,
  // so the existing CI evidence collector can present the complete review set.
  await page.screenshot({
    path: test.info().outputPath(name.replace(".png", "-actual.png")),
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
  await expect.soft(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.03,
  });
}
test("the created confirmation and shared invitation modal match approved states", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const owner = await createSignedInFixture(
      page,
      stackAdminClient(),
      "groups-visual-created",
      { displayName: "Organizer Ona", tasteLine: "planner of parties" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page
      .getByLabel("Date", { exact: true })
      .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    await page
      .getByRole("button", { name: "Create group", exact: true })
      .click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    scope.register("visual group", async () => {
      deleteFixtureGroupsSql([id], [owner]);
    });
    await expect(
      page.getByRole("heading", { level: 1, name: `${GROUP_NAME} is ready.` }),
    ).toBeVisible();
    await capture(page, `groups-created-never-issued-${info.project.name}.png`);
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `${GROUP_NAME} is ready.`,
    });
    const input = dialog.getByLabel("Invite link");
    await expect(input).toBeVisible();
    await input.evaluate((el) => {
      (el as HTMLInputElement).value =
        `https://example.invalid/invite/${"R".repeat(43)}`;
    });
    await capture(
      page,
      `groups-created-token-present-${info.project.name}.png`,
    );
    await dialog.getByRole("button", { name: "Close invite dialog" }).click();
    // Another session makes an unrecoverable legacy link. Opening the modal
    // must show confirmation and must not rotate the invitation itself.
    const version = stackIssueGeneric(owner, id);
    // Remove recovery material only for this synthetic fixture to model a legacy digest-only row.
    runStackSql(
      `delete from private.group_shareable_invitation_tokens where invitation_id in (select id from public.group_invitations where group_id='${id}' and shareable_version is not null);`,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await expect(
      dialog.getByText(/stop the old link from working/),
    ).toBeVisible();
    expect(
      runStackSql(
        `select shareable_invitation_version::text from public.groups where id='${id}';`,
      ).trim(),
    ).toBe(version);
    await capture(
      page,
      `groups-created-replacement-confirmation-${info.project.name}.png`,
    );
  });
});
