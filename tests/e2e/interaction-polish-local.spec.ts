import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  FixtureScope,
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
  seedWishlistItems,
  stackAdminClient,
} from "../helpers/local-stack";
import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import { mailpitLogin } from "../helpers/mailpit-signin";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires local Supabase and Mailpit",
);
async function person(
  scope: FixtureScope,
  name: string,
  groups: string[] = [],
) {
  const admin = stackAdminClient(),
    email = fixtureEmail("interaction-polish"),
    id = await createFixtureUser(admin, email);
  scope.register("interaction fixture", async () => {
    if (groups.length) deleteFixtureGroupsSql(groups, [id]);
    await deleteFixtureUser(admin, id);
  });
  const { error } = await admin
    .from("profiles")
    .update({
      display_name: name,
      taste_line: "Thoughtful little things",
      vibe: "marigold",
    })
    .eq("id", id);
  if (error) throw new Error("Profile fixture failed");
  return { id, email };
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const dir = process.env.E2E_INTERACTION_EVIDENCE_DIR;
  if (dir) {
    await mkdir(dir, { recursive: true });
    await page.screenshot({
      path: path.join(dir, `${name}-${test.info().project.name}.png`),
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
  }
}
async function before(
  page: Page,
  route: string,
  ready: () => Promise<void>,
  name: string,
) {
  const origin = process.env.E2E_PUBLIC_BEFORE_ORIGIN;
  if (!origin) return;
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
    throw new Error("Local before server required");
  await page.goto(new URL(route, url).href);
  await ready();
  await capture(page, `${name}-before`);
}

test("wishlist drag reorder persists with pointer and keyboard and profile hover responds", async ({
  page,
}) => {
  test.setTimeout(120000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const owner = await person(scope, "Aanya Mehta");
    await seedWishlistItems(
      stackAdminClient(),
      owner.id,
      ["Desk lamp", "Ceramic mug", "Soft blanket"].map((title, index) => ({
        id: randomUUID(),
        title,
        sort_position: index,
      })),
    );
    await mailpitLogin(page, owner.email);
    await before(
      page,
      "/wishlist",
      async () => {
        await expect(
          page.getByRole("button", { name: "Edit profile", exact: true }),
        ).toBeVisible();
      },
      "wishlist-interactions",
    );
    await page.goto("/wishlist");
    const edit = page.getByRole("button", {
      name: "Edit profile",
      exact: true,
    });
    await expect(edit).toBeVisible();
    const initial = await edit.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await edit.hover();
    await expect(edit).toHaveCSS("cursor", "pointer");
    await expect
      .poll(() => edit.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(initial);
    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    const handle = page.getByRole("button", {
      name: "Drag to reorder Desk lamp",
      exact: true,
    });
    await expect(handle).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Move .* (up|down)/ }),
    ).toHaveCount(0);
    await page
      .locator("[data-reorder-id]")
      .last()
      .evaluate((element) => element.scrollIntoView({ block: "center" }));
    const source = await handle.boundingBox();
    const target = await page
      .getByRole("button", {
        name: "Drag to reorder Soft blanket",
        exact: true,
      })
      .boundingBox();
    if (!source || !target) throw new Error("Drag handles missing");
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.getByText("Order saved.", { exact: true })).toHaveCount(
      1,
    );
    await expect(page.locator("[data-reorder-id]").last()).toContainText(
      "Desk lamp",
    );
    await capture(page, "wishlist-drag-reorder");
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Home");
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-reorder-id]").first()).toContainText(
      "Desk lamp",
    );
    await expect(page.getByRole("status")).toHaveText("Order saved.");
    await page.reload();
    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    await expect(page.locator("[data-reorder-id]").first()).toContainText(
      "Desk lamp",
    );
    await capture(page, "wishlist-keyboard-reorder");
  });
});

test("branded calendar and searchable currency submit the selected date and currency", async ({
  page,
}) => {
  test.setTimeout(120000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const groups: string[] = [];
    const owner = await person(scope, "Aanya Mehta", groups);
    await mailpitLogin(page, owner.email);
    await before(
      page,
      "/groups/new",
      async () => {
        await page
          .getByLabel("Group name", { exact: true })
          .fill("Holiday gifting");
        await page.getByLabel("Date", { exact: true }).fill("2027-11-04");
      },
      "group-form-controls",
    );
    await page.goto("/groups/new");
    await page
      .getByLabel("Group name", { exact: true })
      .fill("Holiday gifting");
    await page.getByLabel("Date", { exact: true }).fill("2027-11-04");
    await page
      .getByRole("button", { name: "Choose date", exact: true })
      .click();
    const calendar = page.getByRole("dialog", {
      name: "Choose date",
      exact: true,
    });
    await expect(calendar).toBeVisible();
    await capture(page, "group-branded-calendar");
    await calendar
      .getByRole("button", { name: "November 5, 2027", exact: true })
      .click();
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
      "2027-11-05",
    );
    const currency = page.getByRole("combobox", {
      name: "Currency",
      exact: true,
    });
    await currency.click();
    await currency.fill("Dollar");
    await expect(page.getByRole("option", { name: /USD/ })).toBeVisible();
    await capture(page, "group-currency-search");
    await page.getByRole("option", { name: /USD/ }).click();
    await expect(currency).toHaveValue("USD");
    await capture(page, "group-form-controls-after");
    await page
      .getByRole("button", { name: "Create group", exact: true })
      .click();
    await page.waitForURL((url) =>
      /^\/groups\/[0-9a-f-]+\/created$/.test(url.pathname),
    );
    const groupId = new URL(page.url()).pathname.split("/")[2];
    groups.push(groupId);
    const data = JSON.parse(
      runStackSql(
        `select json_build_object('budget_currency',budget_currency,'occasion_date',to_char(occasion_at at time zone time_zone,'YYYY-MM-DD')) from public.groups where id='${groupId}';`,
      ),
    ) as { budget_currency: string; occasion_date: string };
    expect(data.budget_currency).toBe("USD");
    expect(data.occasion_date).toBe("2027-11-05");
    await page.goto("/wishlist/items/new");
    await page.getByRole("button", { name: /Add it manually/i }).click();
    const itemCurrency = page.getByRole("combobox", {
      name: "Currency",
      exact: true,
    });
    await itemCurrency.click();
    await itemCurrency.fill("Yen");
    await expect(page.getByRole("option", { name: /JPY/ })).toBeVisible();
    await capture(page, "wishlist-currency-search");
    await page.getByRole("option", { name: /JPY/ }).click();
    await expect(itemCurrency).toHaveValue("JPY");
    await page
      .getByLabel("Item name", { exact: true })
      .fill("Japanese ceramic cup");
    await page.getByLabel("Price", { exact: true }).fill("1000");
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/wishlist");
    const saved = await stackAdminClient()
      .from("wishlist_items")
      .select("original_currency,original_amount_minor")
      .eq("owner_id", owner.id)
      .eq("title", "Japanese ceramic cup")
      .single();
    if (saved.error || !saved.data)
      throw new Error("Saved item currency could not be verified");
    expect(saved.data.original_currency).toBe("JPY");
    expect(String(saved.data.original_amount_minor)).toBe("1000");
  });
});

test("room reactions have space around icons and labels and remain usable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const groupIds: string[] = [];
    const owner = await person(scope, "Reaction Riley", groupIds);
    const friend = await person(scope, "Friend Frankie");
    const itemId = randomUUID();
    await seedWishlistItems(stackAdminClient(), friend.id, [
      { id: itemId, title: "Ceramic cup", sort_position: 0 },
    ]);
    const groupId = randomUUID();
    groupIds.push(groupId);
    runStackSql(
      `insert into public.groups (id,name,occasion,occasion_at,time_zone,mode,organizer_id,budget_amount_minor,budget_currency) values ('${groupId}','A small celebration','Birthday','2050-05-15 18:00:00+05:30','Asia/Kolkata','wishlist_only','${owner.id}',250000,'INR'); ${[owner.id, friend.id].map((id) => `insert into public.group_members (group_id,user_id,status,participating,joined_at,membership_generation) values ('${groupId}','${id}','joined',true,clock_timestamp(),1);`).join(" ")}`,
    );
    await mailpitLogin(page, owner.email);
    const ready = async () => {
      await expect(
        page.getByRole("heading", { name: "Ceramic cup", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Very you", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    await before(page, `/groups/${groupId}`, ready, "room-reactions");
    await page.goto(`/groups/${groupId}`, { waitUntil: "domcontentloaded" });
    await ready();
    for (const label of [
      "Very you",
      "Questionable, but supported",
      "Want it too",
    ]) {
      const button = page.getByRole("button", { name: label, exact: true });
      expect(
        (await button.boundingBox({ timeout: 10_000 }))?.height,
      ).toBeGreaterThanOrEqual(76);
      const metrics = await button.evaluate((el) => {
        const icon = el
          .querySelector('[aria-hidden="true"]')!
          .getBoundingClientRect();
        const text = el
          .querySelector("[data-reaction-label]")!
          .getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return {
          height: box.height,
          gap: text.top - icon.bottom,
          top: icon.top - box.top,
          bottom: box.bottom - text.bottom,
          overflow: el.scrollWidth - el.clientWidth,
        };
      });
      expect(metrics.height).toBeGreaterThanOrEqual(76);
      expect(metrics.gap).toBeGreaterThanOrEqual(8);
      expect(metrics.top).toBeGreaterThanOrEqual(8);
      expect(metrics.bottom).toBeGreaterThanOrEqual(8);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
    }
    await capture(page, "room-reactions-after");
    const veryYou = page.getByRole("button", { name: "Very you", exact: true });
    await veryYou.click();
    await expect(veryYou).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(veryYou).toHaveAttribute("aria-pressed", "true");
    await veryYou.click();
    await expect(veryYou).toHaveAttribute("aria-pressed", "false");
  });
});
