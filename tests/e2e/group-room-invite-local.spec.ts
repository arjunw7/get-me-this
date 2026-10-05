import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";
import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import { mailpitLogin } from "../helpers/mailpit-signin";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires local Supabase and Mailpit",
);

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const dir = process.env.E2E_INTERACTION_EVIDENCE_DIR;
  if (dir) await mkdir(dir, { recursive: true });
  await test.info().attach(`${name}-${test.info().project.name}`, {
    body: await page.screenshot({
      ...(dir
        ? { path: path.join(dir, `${name}-${test.info().project.name}.png`) }
        : {}),
      fullPage: !(await page.getByRole("dialog").count()),
      animations: "disabled",
      style:
        "input[readonly] { color: transparent !important; caret-color: transparent !important; }",
    }),
    contentType: "image/png",
  });
}

test("organizers can invite from the room and hovering avatars stays inside the scrolling roster", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const users: Array<{ id: string; email: string }> = [];
  const groupId = randomUUID();
  scope.register("invitation room fixtures", async () => {
    deleteFixtureGroupsSql(
      [groupId],
      users.map((user) => user.id),
    );
    for (const user of users) await deleteFixtureUser(admin, user.id);
  });
  await scope.run(async () => {
    for (let index = 0; index < 5; index++) {
      const email = fixtureEmail(`room-invite-${index}`);
      const id = await createFixtureUser(admin, email);
      users.push({ id, email });
      const { error } = await admin
        .from("profiles")
        .update({ display_name: `Room Friend ${index + 1}` })
        .eq("id", id);
      if (error) throw new Error("Could not prepare the local group profile");
    }
    runStackSql(`begin;
      insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id)
      values('${groupId}','Invitation test group','Birthday','2026-11-07 18:00:00+05:30','Asia/Kolkata','wishlist_only','${users[0].id}');
      insert into public.group_members(group_id,user_id,status,participating,joined_at,membership_generation)
      values ${users.map((user) => `('${groupId}','${user.id}','joined',true,now(),1)`).join(",")};
      commit;`);
    await mailpitLogin(page, users[0].email);
    const roomPath = `/groups/${groupId}`;
    const beforeOrigin = process.env.E2E_PUBLIC_BEFORE_ORIGIN;
    if (beforeOrigin) {
      const before = new URL(beforeOrigin);
      if (
        before.protocol !== "http:" ||
        !["localhost", "127.0.0.1"].includes(before.hostname) ||
        before.hostname !== new URL(page.url()).hostname
      ) {
        throw new Error("Before evidence requires the same local host");
      }
      await page.goto(new URL(roomPath, before).href);
      await page.getByTestId("roster-member-link").first().hover();
      await capture(page, "room-invite-hover-before");
      await page
        .getByRole("link", { name: "Invite people", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname === `${roomPath}/created`);
      await expect(
        page.getByRole("heading", {
          name: "Invitation test group is ready.",
          exact: true,
        }),
      ).toBeVisible();
      await capture(page, "room-invitation-page-before");
    }
    await page.goto(roomPath);
    const invite = page.getByRole("button", {
      name: "Invite people",
      exact: true,
    });
    await expect(invite).toBeVisible();
    const tools = page.getByRole("button", {
      name: "Organizer tools",
      exact: true,
    });
    await tools.hover();
    await expect(tools).toHaveCSS("cursor", "pointer");
    await tools.click();
    await expect(page.getByTestId("organizer-tools-panel")).toBeVisible();
    await tools.click();
    await expect(invite).toHaveAttribute("aria-haspopup", "dialog");
    const region = page.getByTestId("roster-region");
    const member = page.getByTestId("roster-member-link").first();
    await member.hover();
    // Use measured rendered bounds, not implementation class assertions:
    // the hovered avatar must remain below the scrollport's clipping edge.
    await expect
      .poll(async () =>
        member.evaluate((element) => {
          const rail = element.closest('[data-testid="roster-region"]')!;
          const avatar = element.firstElementChild!;
          return (
            avatar.getBoundingClientRect().top -
            rail.getBoundingClientRect().top
          );
        }),
      )
      .toBeGreaterThanOrEqual(2);
    await member.focus();
    await expect
      .poll(async () =>
        member.evaluate((element) => {
          const rail = element.closest('[data-testid="roster-region"]')!;
          return (
            element.getBoundingClientRect().left -
            rail.getBoundingClientRect().left
          );
        }),
      )
      .toBeGreaterThanOrEqual(4);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (testInfo.project.name === "mobile") {
      expect(
        await region.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
      await region.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      expect(await region.evaluate((element) => element.scrollLeft > 0)).toBe(
        true,
      );
      await region.evaluate((element) => {
        element.scrollLeft = 0;
      });
    }
    await capture(page, "room-invite-hover-after");
    const roomUrl = page.url();
    await invite.click();
    const dialog = page.getByRole("dialog", {
      name: "Invitation test group is ready.",
      exact: true,
    });
    const close = dialog.getByRole("button", {
      name: "Close invite dialog",
      exact: true,
    });
    const input = dialog.getByRole("textbox", {
      name: "Invite link",
      exact: true,
    });
    const copy = dialog.getByRole("button", {
      name: "Copy invite link",
      exact: true,
    });
    const whatsapp = dialog.getByRole("link", {
      name: "Share on WhatsApp",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("readonly", "");
    await expect(copy).toBeVisible();
    await expect(whatsapp).toBeVisible();
    await expect(dialog.getByRole("button")).toHaveCount(2); // Close and Copy only.
    await expect(dialog.getByRole("link")).toHaveCount(1); // No extra navigation.
    expect(page.url()).toBe(roomUrl);
    const link = await input.inputValue();
    const parsed = new URL(link);
    // Avoid including invitation capability values in ordinary assertion output.
    expect(parsed.origin === new URL(roomUrl).origin).toBe(true);
    expect(/^\/invite\/[A-Za-z0-9_-]+$/.test(parsed.pathname)).toBe(true);
    const whatsappUrl = new URL((await whatsapp.getAttribute("href"))!);
    expect(whatsappUrl.origin).toBe("https://wa.me");
    expect(
      whatsappUrl.searchParams.get("text") ===
        `Join Invitation test group on Get Me This: ${link}`,
    ).toBe(true);
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    await expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await copy.click();
    await expect(dialog.getByRole("status")).toHaveText("Invite link copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied === link).toBe(true);
    expect(page.url()).toBe(roomUrl);

    await expect
      .poll(() =>
        dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight &&
            element.scrollWidth <= element.clientWidth
          );
        }),
      )
      .toBe(true);
    await capture(page, "room-invitation-dialog-after");
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(whatsapp).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(invite).toBeFocused();
    expect(page.url()).toBe(roomUrl);

    await invite.click();
    await expect(input).toBeVisible();
    await expect
      .poll(async () => (await input.inputValue()) === link)
      .toBe(true);
    await close.click();
    await expect(invite).toBeFocused();
    await page.reload();
    await invite.click();
    await expect(input).toBeVisible();
    await expect
      .poll(async () => (await input.inputValue()) === link)
      .toBe(true);
    expect(page.url()).toBe(roomUrl);
    await close.click();
    await expect(invite).toBeFocused();

    const memberContext = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: page.viewportSize(),
      deviceScaleFactor: 1,
    });
    try {
      const memberPage = await memberContext.newPage();
      await mailpitLogin(memberPage, users[1].email);
      await memberPage.goto(roomPath);
      await expect(
        memberPage.getByRole("heading", {
          name: "Invitation test group",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", { name: "Invite people", exact: true }),
      ).toHaveCount(0);
      await memberPage.goto(`${roomPath}/created`);
      await expect(
        memberPage.getByRole("heading", {
          name: "Page not found",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        memberPage.getByText("Invitation test group", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });
});
