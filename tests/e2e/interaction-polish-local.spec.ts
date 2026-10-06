import AxeBuilder from "@axe-core/playwright";
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
import {
  deleteFixtureGroupsSql,
  runStackSql,
  withIdentity,
} from "../helpers/group-stack";
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

test("six-row calendars stay spacious and budget entry rejects letters", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const owner = await person(scope, "Calendar Casey");
    await mailpitLogin(page, owner.email);
    const openCalendar = async () => {
      await page.getByLabel("Date", { exact: true }).fill("2027-05-15");
      await page
        .getByRole("button", { name: "Choose date", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "May 2027" }),
      ).toBeVisible();
    };
    await before(page, "/groups/new", openCalendar, "six-row-calendar");
    await page.goto("/groups/new");
    await openCalendar();
    const calendar = page.getByRole("dialog", {
      name: "Choose date",
      exact: true,
    });
    await expect(calendar.getByRole("row")).toHaveCount(7);
    const popup = calendar.locator("..");
    await expect
      .poll(() => popup.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(1);
    for (const label of ["May 1, 2027", "May 15, 2027", "May 31, 2027"]) {
      const bounds = await calendar
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
    }
    const bounds = await popup.boundingBox();
    expect(bounds?.y).toBeGreaterThanOrEqual(16);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()!.height - 16,
    );
    await capture(page, "six-row-calendar-after");
    await calendar
      .getByRole("button", { name: "May 31, 2027", exact: true })
      .click();
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
      "2027-05-31",
    );
    const amount = page.getByRole("textbox", { name: "Amount", exact: true });
    await amount.fill("");
    await amount.pressSequentially("12a3.45");
    await expect(amount).toHaveValue("123.45");
    await amount.fill("alphabetic paste");
    await expect(amount).toHaveValue("123.45");
  });
});

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

test("wishlist headers omit metadata tags and public zero reactions stay quiet", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const owner = await person(scope, "Wishlist Wren");
    await seedWishlistItems(
      stackAdminClient(),
      owner.id,
      ["Ceramic cup", "Desk lamp"].map((title, index) => ({
        id: randomUUID(),
        title,
        sort_position: index,
      })),
    );
    await mailpitLogin(page, owner.email);
    const ownerReady = async () => {
      await expect(
        page.getByRole("button", { name: "Share wishlist", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    await before(page, "/wishlist", ownerReady, "wishlist-header");
    await page.goto("/wishlist");
    await ownerReady();
    await expect(page.getByText(/marigold vibe|2 things/)).toHaveCount(0);
    await capture(page, "wishlist-header-after");
    await page
      .getByRole("button", { name: "Share wishlist", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Share your wishlist" });
    const publicPath = new URL(
      await dialog.getByLabel("Public wishlist link").inputValue(),
    ).pathname;
    await dialog.getByRole("button", { name: "Close sharing" }).click();
    await page.context().clearCookies();
    const publicReady = async () => {
      await expect(
        page.getByRole("heading", { name: "Ceramic cup", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    await before(page, publicPath, publicReady, "public-wishlist-display");
    await page.goto(publicPath);
    await publicReady();
    await expect(
      page.getByText(/marigold vibe|2 things|No reactions yet/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Sign in to react", exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Very you", exact: true }),
    ).toHaveCount(0);
    await capture(page, "public-wishlist-display-after");
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
      const metrics = await button.evaluate((el) => {
        const stamp = el.getBoundingClientRect();
        const choice = el.parentElement!;
        const label = choice.querySelector("[data-reaction-label]")!;
        const text = label.getBoundingClientRect();
        const badge = el
          .querySelector(".reaction-stamp-counter")!
          .getBoundingClientRect();
        return {
          width: stamp.width,
          height: stamp.height,
          gap: text.top - stamp.bottom,
          labelOverflow: label.scrollWidth - label.clientWidth,
          badgeOverlap: badge.left < stamp.right && badge.bottom > stamp.top,
        };
      });
      expect(metrics.width).toBe(64);
      expect(metrics.height).toBe(64);
      expect(metrics.gap).toBeGreaterThanOrEqual(12);
      expect(metrics.labelOverflow).toBeLessThanOrEqual(1);
      expect(metrics.badgeOverlap).toBe(true);
    }
    const accessibility = await new AxeBuilder({ page })
      .include(".reaction-stamps")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await capture(page, "room-reactions-after");
    const veryYou = page.getByRole("button", { name: "Very you", exact: true });
    await veryYou.click();
    await expect(veryYou).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(veryYou).toHaveAttribute("aria-pressed", "true");
    const wantItToo = page.getByRole("button", {
      name: "Want it too",
      exact: true,
    });
    await wantItToo.click();
    await expect(veryYou).toHaveAttribute("aria-pressed", "false");
    await expect(wantItToo).toHaveAttribute("aria-pressed", "true");
    // The pointer remains over the selected stamp after a click: neutral
    // hover styling must not wash out its blue fill against the white heart.
    await expect(wantItToo).toBeEnabled();
    await wantItToo.hover();
    await wantItToo.evaluate((el) =>
      Promise.all(
        el.getAnimations({ subtree: true }).map((motion) => motion.finished),
      ),
    );
    await expect(wantItToo.locator(".reaction-stamp-ink")).toHaveCSS(
      "background-color",
      "rgb(46, 75, 255)",
    );
    await expect(wantItToo.locator("svg")).toHaveCSS(
      "color",
      "rgb(255, 255, 255)",
    );
    expect(
      await wantItToo
        .locator("svg")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).b),
    ).toBeLessThan(-0.1);
    const hoverEvidenceDir = process.env.E2E_INTERACTION_EVIDENCE_DIR;
    if (hoverEvidenceDir) {
      await mkdir(hoverEvidenceDir, { recursive: true });
      await page
        .getByRole("group", { name: "React to this item", exact: true })
        .screenshot({
          path: path.join(
            hoverEvidenceDir,
            `stamp-selected-hover-${test.info().project.name}.png`,
          ),
          animations: "disabled",
        });
    }
    await page.mouse.move(0, 0);
    await wantItToo.evaluate((el) =>
      Promise.all(
        el.getAnimations({ subtree: true }).map((motion) => motion.finished),
      ),
    );
    expect(
      await wantItToo
        .locator("svg")
        .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).b),
    ).toBe(0);
    await expect(veryYou.locator(".reaction-stamp-counter")).toHaveText("0");
    await expect(wantItToo.locator(".reaction-stamp-counter")).toHaveText("1");
    await capture(page, "room-reactions-selected");
    await wantItToo.click();
    await expect(wantItToo).toHaveAttribute("aria-pressed", "false");
    await expect(wantItToo.locator(".reaction-stamp-counter")).toHaveText("0");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await veryYou.click();
    await expect(veryYou).toHaveAttribute("aria-pressed", "true");
    await expect(veryYou.locator(".reaction-stamp-ink")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(veryYou.locator(".reaction-stamp-ring")).toBeHidden();
    await expect(veryYou).toBeEnabled();
    await veryYou.hover();
    await expect(veryYou.locator("svg")).toHaveCSS("transform", "none");
    await expect(veryYou.locator("svg")).toHaveCSS(
      "transition-property",
      "none",
    );
  });
});

test("first-use Home shares through the existing modal and remembers completion", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const owner = await person(scope, "Sharing Sam");
    await seedWishlistItems(stackAdminClient(), owner.id, [
      { id: randomUUID(), title: "A ceramic cup", sort_position: 0 },
    ]);
    await mailpitLogin(page, owner.email);
    await before(
      page,
      "/home",
      async () => {
        await expect(
          page.getByRole("heading", { name: "1 item on your wishlist" }),
        ).toBeVisible();
      },
      "onboarding-sharing",
    );
    await page.goto("/home");
    const sharing = page.getByRole("region", { name: "Share your wishlist" });
    const group = page.getByRole("region", {
      name: "Create a group for your next occasion",
    });
    await expect(sharing).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("Step 3 · Your people")).toBeVisible();
    await capture(page, "onboarding-sharing-after");
    await page
      .getByRole("button", { name: "Share wishlist", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Share your wishlist" });
    await expect(dialog).toBeVisible();
    await expect(sharing.getByText("Wishlist shared.")).toHaveCount(0);
    // Redact the capability in visual evidence; the modal still copies its authoritative URL.
    await dialog.getByLabel("Public wishlist link").evaluate((input) => {
      (input as HTMLInputElement).value =
        `https://example.invalid/s/${"S".repeat(43)}`;
    });
    await capture(page, "onboarding-share-modal");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await dialog
      .getByRole("button", { name: "Copy link", exact: true })
      .click();
    await expect(
      dialog.getByText("Link copied.", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close sharing" }).click();
    await expect(sharing.getByText("Wishlist shared.")).toBeVisible();
    await expect(group).toHaveAttribute("aria-current", "step");
    await capture(page, "onboarding-sharing-complete");
    await page.reload();
    await expect(sharing.getByText("Wishlist shared.")).toBeVisible();
    await expect(group).toHaveAttribute("aria-current", "step");
  });
});

test("created groups offer matching invite and open actions with Home below", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const groups: string[] = [];
    const owner = await person(scope, "Organizer Olive", groups);
    const groupId = randomUUID();
    groups.push(groupId);
    runStackSql(
      `insert into public.groups (id,name,occasion,occasion_at,time_zone,mode,organizer_id,budget_amount_minor,budget_currency) values ('${groupId}','A small celebration','Birthday','2050-05-15 18:00:00+05:30','Asia/Kolkata','wishlist_only','${owner.id}',250000,'INR'); insert into public.group_members (group_id,user_id,status,participating,joined_at,membership_generation) values ('${groupId}','${owner.id}','joined',true,clock_timestamp(),1);`,
    );
    await mailpitLogin(page, owner.email);
    const route = `/groups/${groupId}/created`;
    const ready = async () => {
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "A small celebration is ready.",
        }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    await before(page, route, ready, "created-actions");
    await page.goto(route);
    await ready();
    const invite = page.getByRole("button", {
      name: "Invite people",
      exact: true,
    });
    const open = page.getByRole("link", { name: "Open group", exact: true });
    const home = page.getByRole("link", { name: "Go to home", exact: true });
    await expect(page.getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("link")).toHaveCount(2);
    const inviteBox = (await invite.boundingBox())!;
    const openBox = (await open.boundingBox())!;
    const homeBox = (await home.boundingBox())!;
    expect(Math.abs(inviteBox.y - openBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(inviteBox.height - openBox.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(inviteBox.width - openBox.width)).toBeLessThanOrEqual(1);
    expect(openBox.x).toBeGreaterThan(inviteBox.x);
    expect(homeBox.y).toBeGreaterThan(inviteBox.y + inviteBox.height);
    expect(Math.abs(homeBox.x - inviteBox.x)).toBeLessThanOrEqual(1);
    await expect(open).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await invite.hover();
    await expect(invite).toHaveCSS("cursor", "pointer");
    await page.mouse.move(0, 0);
    await capture(page, "created-actions-after");
    expect(
      runStackSql(
        `select shareable_invitation_version::text from public.groups where id='${groupId}';`,
      ).trim(),
    ).toBe("0");
    await invite.click();
    const dialog = page.getByRole("dialog", {
      name: "A small celebration is ready.",
    });
    const link = dialog.getByLabel("Invite link");
    await expect(link).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Share on WhatsApp", exact: true }),
    ).toBeVisible();
    await link.evaluate((el) => {
      (el as HTMLInputElement).value =
        `https://example.invalid/invite/${"R".repeat(43)}`;
    });
    await capture(page, "created-invite-modal");
    await page.keyboard.press("Escape");
    await expect(invite).toBeFocused();
    await open.click();
    await expect(page).toHaveURL(`/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "A small celebration" }),
    ).toBeVisible();
    await page.goto(route);
    await home.click();
    await expect(page).toHaveURL(/\/home$/);
  });
});

test("member wishlist actions keep gifting private and confirm releases", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const groupIds: string[] = [];
    const giver = await person(scope, "Gifting Grace", groupIds);
    const recipient = await person(scope, "Wishlist Wren", groupIds);
    const other = await person(scope, "Another friend", groupIds);
    const groupId = randomUUID();
    groupIds.push(groupId);
    const itemId = randomUUID();
    await seedWishlistItems(stackAdminClient(), recipient.id, [
      {
        id: itemId,
        title: "Ceramic cup",
        source_url: "https://shop.example.invalid/cup",
        retailer: "Cup shop",
        original_amount_minor: "120000",
        original_currency: "INR",
        note: "The sky blue one.",
        sort_position: 0,
      },
    ]);
    runStackSql(
      `insert into public.groups (id,name,occasion,occasion_at,time_zone,mode,organizer_id,budget_amount_minor,budget_currency) values ('${groupId}','A small celebration','Birthday','2050-05-15 18:00:00+05:30','Asia/Kolkata','wishlist_only','${giver.id}',250000,'INR'); ${[giver.id, recipient.id, other.id].map((id) => `insert into public.group_members (group_id,user_id,status,participating,joined_at,membership_generation) values ('${groupId}','${id}','joined',true,clock_timestamp(),1);`).join(" ")}`,
    );
    await mailpitLogin(page, giver.email);
    const route = `/groups/${groupId}/members/${recipient.id}/wishlist`;
    const card = page.getByTestId("member-wishlist-item");
    const ready = async () => {
      await expect(
        card.getByRole("heading", { name: "Ceramic cup", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    await before(page, route, ready, "wishlist-actions-available");
    await page.goto(route);
    await ready();
    const reserve = card.getByRole("button", { name: "Reserve secretly" });
    const copy = card.getByRole("button", { name: "Copy to my wishlist" });
    const stamp = card.getByRole("button", { name: "Very you", exact: true });
    expect((await reserve.boundingBox())!.y).toBeGreaterThan(
      (await stamp.boundingBox())!.y + 64,
    );
    expect((await copy.boundingBox())!.y).toBeGreaterThan(
      (await reserve.boundingBox())!.y,
    );
    await expect(reserve).toHaveCSS("background-color", "rgb(255, 90, 54)");
    await expect(copy).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(
      card.getByRole("link", { name: /original page/ }),
    ).toHaveAttribute("href", "https://shop.example.invalid/cup");
    await expect(
      card.getByRole("link", { name: /original page/ }).locator(".."),
    ).toContainText("Cup shop");
    await expect(card.locator(".reaction-stamps")).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await capture(page, "wishlist-actions-available-after");
    await reserve.click();
    await expect(
      card.getByText("Reserved by you", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Release reservation" }),
    ).toBeEnabled();
    await before(page, route, ready, "wishlist-actions-yours");
    const beforeOrigin = process.env.E2E_PUBLIC_BEFORE_ORIGIN;
    if (beforeOrigin) {
      await card.getByRole("button", { name: "Release reservation" }).click();
      await capture(page, "wishlist-release-before");
      await page.getByRole("button", { name: "Keep it", exact: true }).click();
    }
    await page.goto(route);
    await ready();
    await capture(page, "wishlist-actions-yours-after");
    const release = card.getByRole("button", { name: "Release reservation" });
    await release.click();
    const dialog = page.getByRole("dialog", {
      name: "Release your reservation?",
    });
    await expect(
      dialog.getByRole("button", { name: "Keep reservation" }),
    ).toBeFocused();
    expect(await dialog.evaluate((el) => Boolean(el.closest("article")))).toBe(
      false,
    );
    const modalBox = (await dialog.boundingBox())!;
    if (test.info().project.name === "mobile")
      expect(modalBox.y + modalBox.height).toBe(page.viewportSize()!.height);
    else expect(modalBox.width).toBeLessThan(600);
    await capture(page, "wishlist-release-after");
    expect(
      (
        await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(release).toBeFocused();
    expect(
      runStackSql(
        `select count(*) from public.group_item_reservations where group_id='${groupId}' and status='active';`,
      ).trim(),
    ).toBe("1");
    await release.click();
    await dialog
      .getByRole("button", { name: "Release reservation", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      card.getByRole("button", { name: "Reserve secretly" }),
    ).toBeEnabled();
    expect(
      runStackSql(
        `select count(*) from public.group_item_reservations where group_id='${groupId}' and status='active';`,
      ).trim(),
    ).toBe("0");
    runStackSql(
      withIdentity(
        other.id,
        `select public.reserve_group_item('${groupId}','${itemId}');`,
      ),
    );
    await before(page, route, ready, "wishlist-actions-other");
    await page.goto(route);
    await ready();
    await expect(
      card.getByText("Someone’s on it", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", {
        name: /Reserve secretly|Release reservation/,
      }),
    ).toHaveCount(0);
    await expect(copy).toBeEnabled();
    expect(await card.textContent()).not.toContain("Another friend");
    await capture(page, "wishlist-actions-other-after");
    await copy.click();
    const copied = card.getByRole("button", {
      name: "Copied to your wishlist",
      exact: true,
    });
    await expect(copied).toBeDisabled();
    await expect(copied).toContainText("✓");
    await expect(
      card.getByRole("status").filter({ hasText: "Copied to your wishlist" }),
    ).toHaveClass("sr-only");
    await capture(page, "wishlist-actions-copied-after");
    expect(
      (
        await new AxeBuilder({ page })
          .include('[data-testid="member-wishlist-item"]')
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    // The recipient's own route retains the established redirect and never
    // exposes the private coordination controls or confirmation.
    await page.context().clearCookies();
    await mailpitLogin(page, recipient.email);
    await page.goto(route);
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(
      page.getByRole("button", {
        name: /Reserve secretly|Release reservation/,
      }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
