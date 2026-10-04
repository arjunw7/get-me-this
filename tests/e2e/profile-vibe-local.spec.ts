import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  FixtureScope,
  stackAdminClient,
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
} from "../helpers/local-stack";
import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import { mailpitLogin } from "../helpers/mailpit-signin";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires migrated local Supabase and Mailpit",
);

// Approved V18 colors, independently pinned so a picker and banner using the
// same wrong fallback cannot satisfy the persistence/rendering assertions.
const vibes = [
  { value: "tomato", label: "Tomato", color: "rgb(255, 90, 54)" },
  { value: "marigold", label: "Marigold", color: "rgb(255, 179, 32)" },
  { value: "electric", label: "Electric", color: "rgb(46, 75, 255)" },
  { value: "acid_lime", label: "Acid lime", color: "rgb(198, 240, 98)" },
] as const;

async function expectProfileColor(page: Page, name: string, color: string) {
  const profile = page.getByRole("region", { name, exact: true });
  await expect(profile).toBeVisible();
  await expect(profile.locator("[data-vibe]")).toHaveCSS(
    "background-color",
    color,
  );
}

async function captureVibeState(page: Page, name: string) {
  const info = test.info();
  expect(page.viewportSize()).toEqual(info.project.use.viewport);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await info.attach(`${name}-${info.project.name}`, {
    body: await page.screenshot({
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    }),
    contentType: "image/png",
  });
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect.soft(scan.violations, `${name} accessibility`).toEqual([]);
}

for (const vibe of vibes) {
  test(`onboarding persists the ${vibe.label} Vibe through a reload`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const email = fixtureEmail(`vibe-${vibe.value}`);
      const userId = await createFixtureUser(admin, email);
      scope.register("Vibe onboarding account", () =>
        deleteFixtureUser(admin, userId),
      );
      await mailpitLogin(page, email, "onboarding");
      const name = `Vibe ${vibe.label}`;
      await page.getByLabel("What should friends call you?").fill(name);
      const picker = page.getByRole("group", {
        name: "Choose your Vibe",
        exact: true,
      });
      await picker.getByText(vibe.label, { exact: true }).click();
      await expect(
        picker.getByRole("radio", { name: vibe.label, exact: true }),
      ).toBeChecked();
      await captureVibeState(page, `vibe-${vibe.value}-onboarding`);
      await page.getByRole("button", { name: "Let’s go" }).click();
      await expect(page).toHaveURL(/\/home$/);
      const { data, error } = await admin
        .from("profiles")
        .select("vibe")
        .eq("id", userId)
        .single();
      if (error) throw new Error("Could not read the local Vibe fixture");
      expect(data.vibe).toBe(vibe.value);
      await page.goto("/wishlist");
      await expectProfileColor(page, name, vibe.color);
      await page.reload();
      await expectProfileColor(page, name, vibe.color);
      await captureVibeState(page, `vibe-${vibe.value}-owner-profile`);
      await page
        .getByRole("button", { name: "Edit profile", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Edit your profile" })
          .getByRole("radio", { name: vibe.label, exact: true }),
      ).toBeChecked();
      await captureVibeState(page, `vibe-${vibe.value}-editor`);
    });
  });
}

test("Vibe edits save, cancellation discards, and joined friends see the saved member color", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const users: string[] = [];
  const groups: string[] = [];
  scope.register("isolated Vibe group and accounts", async () => {
    deleteFixtureGroupsSql(groups, users);
    for (const userId of users) await deleteFixtureUser(admin, userId);
  });
  await scope.run(async () => {
    const ownerEmail = fixtureEmail("vibe-owner");
    const friendEmail = fixtureEmail("vibe-friend");
    for (const [email, name, vibe] of [
      [ownerEmail, "Vibe Owner", "tomato"],
      [friendEmail, "Vibe Friend", "acid_lime"],
    ]) {
      const id = await createFixtureUser(admin, email);
      users.push(id);
      const { error } = await admin
        .from("profiles")
        .update({ display_name: name, vibe })
        .eq("id", id);
      if (error) throw new Error("Could not set up the local Vibe profile");
    }
    const [ownerId, friendId] = users;
    const groupId = randomUUID();
    groups.push(groupId);
    runStackSql(`begin;
      insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id)
      values('${groupId}','Vibe friends','Birthday','2026-11-07 18:00:00+05:30','Asia/Kolkata','wishlist_only','${ownerId}');
      insert into public.group_members(group_id,user_id,status,participating,joined_at,membership_generation)
      values('${groupId}','${ownerId}','joined',true,now(),1),('${groupId}','${friendId}','joined',true,now(),1);
      commit;`);
    await mailpitLogin(page, ownerEmail);
    await page.goto("/wishlist");
    await expectProfileColor(page, "Vibe Owner", vibes[0].color);
    await captureVibeState(page, "vibe-edit-before-tomato");
    const dialog = page.getByRole("dialog", { name: "Edit your profile" });
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await dialog.getByText("Electric", { exact: true }).click();
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expectProfileColor(page, "Vibe Owner", vibes[2].color);
    await page.reload();
    await expectProfileColor(page, "Vibe Owner", vibes[2].color);
    await captureVibeState(page, "vibe-edit-after-electric");
    await page
      .getByRole("button", { name: "Account", exact: true })
      .filter({ visible: true })
      .click();
    const accountMenu = page
      .getByTestId("account-menu-content")
      .filter({ visible: true });
    await expect(accountMenu).toBeVisible();
    await captureVibeState(page, "vibe-account-menu-electric");
    await accountMenu
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await expect(
      dialog.getByRole("radio", { name: "Electric", exact: true }),
    ).toBeChecked();
    await dialog.getByText("Tomato", { exact: true }).click();
    await dialog.getByRole("button", { name: "Close edit profile" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expectProfileColor(page, "Vibe Owner", vibes[2].color);
    const { data, error } = await admin
      .from("profiles")
      .select("vibe")
      .eq("id", ownerId)
      .single();
    if (error) throw new Error("Could not read the saved local Vibe");
    expect(data.vibe).toBe("electric");

    const friendContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: page.viewportSize(),
      deviceScaleFactor: 1,
    });
    try {
      const friendPage = await friendContext.newPage();
      await mailpitLogin(friendPage, friendEmail);
      await friendPage.goto(`/groups/${groupId}/members/${ownerId}/wishlist`);
      const shared = friendPage.getByTestId("member-wishlist");
      await expect(
        shared.getByRole("heading", { name: /Vibe Owner/ }),
      ).toBeVisible();
      await expect(
        shared.locator("header > span[aria-hidden='true']"),
      ).toHaveCSS("background-color", vibes[2].color);
      await captureVibeState(friendPage, "vibe-shared-member-electric");
      await friendPage.reload();
      await expect(
        shared.locator("header > span[aria-hidden='true']"),
      ).toHaveCSS("background-color", vibes[2].color);
      await friendPage.goto("/wishlist");
      await expectProfileColor(friendPage, "Vibe Friend", vibes[3].color);
    } finally {
      await friendContext.close();
    }
  });
});
