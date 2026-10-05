import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  FixtureScope,
  createSignedInFixture,
  stackAdminClient,
  seedWishlistItems,
} from "../helpers/local-stack";

test.skip(!process.env.E2E_LOCAL_SUPABASE, "requires the local Supabase stack");

test("the Groups index denies signed-out access", async ({ page }) => {
  await page.goto("/groups");
  await expect(page).toHaveURL(/\/auth(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "Start your first group." }),
  ).toHaveCount(0);
});

test("responsive navigation connects real destinations and Home reflects saved items", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      "visual-shell",
      { displayName: "Shell Ada", tasteLine: "small useful things" },
      scope,
    );
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { name: "Add something you’d love to get" }),
    ).toBeVisible();
    // Home auto-starts extraction. Keep navigation independent of live shops
    // and assert the carried link in the settled fallback, not transient input.
    await page.route("**/wishlist/items/extract", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "unavailable", message: "Generic safe copy." },
        }),
      }),
    );
    await page
      .getByLabel("Paste a product link from any shop")
      .fill("https://example.com/a-gift");
    await page
      .getByRole("button", { name: "Add an item", exact: true })
      .click();
    await expect(page).toHaveURL(/\/wishlist\/items\/new\?url=/);
    await expect(
      page.getByLabel("Link (optional)", { exact: true }),
    ).toHaveValue("https://example.com/a-gift");
    // V18 Add Item is a standalone flow, with its own persistent exit.
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await expect(page.getByRole("banner")).toContainText("Add an item");
    await page
      .getByRole("link", { name: "Close and return to your wishlist" })
      .click();
    await expect(page).toHaveURL(/\/wishlist$/);
    const navigation = page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true });
    await navigation.getByRole("link", { name: "Groups", exact: true }).click();
    await expect(page).toHaveURL(/\/groups$/, { timeout: 1000 });
    await expect(
      navigation.getByRole("link", { name: "Groups", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", {
        name: "Start your first group.",
        exact: true,
      }),
    ).toBeVisible();
    await navigation
      .getByRole("link", { name: "My wishlist", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "My wishlist", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const inlineAdd = page
      .getByRole("main")
      .getByRole("link", { name: "Add an item", exact: true });
    await expect(inlineAdd).toBeVisible();
    // Empty lists retain their contextual CTA without a duplicate floating
    // button obscuring the empty-state heading on a narrow viewport.
    await expect(
      page.locator('a[href="/wishlist/items/new"]').filter({ visible: true }),
    ).toHaveCount(page.viewportSize()!.width < 1024 ? 1 : 2);
    await seedWishlistItems(admin, ownerId, [
      {
        id: randomUUID(),
        title: "Saved fixture gift",
        sort_position: 1,
        desire_level: "would_love",
      },
    ]);
    await page.reload();
    const add = page
      .getByRole("link", { name: "Add an item", exact: true })
      .filter({ visible: true });
    await expect(add).toHaveCount(1);
    if (page.viewportSize()!.width < 1024) {
      await expect(add).toHaveCSS("position", "fixed");
      const actionBox = await add.boundingBox();
      const navBox = await navigation.boundingBox();
      expect(actionBox!.y + actionBox!.height).toBeLessThan(navBox!.y);
    }
    await add.click();
    await expect(page).toHaveURL(/\/wishlist\/items\/new$/);
    await page.goto("/wishlist");
    await navigation.getByRole("link", { name: "Home", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "1 item on your wishlist" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Add something you’d love to get" }),
    ).toHaveCount(0);
  });
});

test("profile edits persist across wishlist and Home, cancellation preserves stored values", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "profile-parity",
      { displayName: "Profile Ada", tasteLine: "Useful little things" },
      scope,
    );
    await page.goto("/wishlist");
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Edit your profile" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name", { exact: true }).fill("New Ada");
    await dialog
      .getByLabel("Personality line")
      .fill("Books and bright ceramics");
    await test.info().attach("profile-editor", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("main")
        .getByText("Books and bright ceramics", { exact: true }),
    ).toBeVisible();
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { name: "Welcome in, New." }),
    ).toBeVisible();
    await page.goto("/wishlist");
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await dialog.getByLabel("Name", { exact: true }).fill("Unsaved name");
    await dialog.getByRole("button", { name: "Close edit profile" }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
      "New Ada",
    );
    await dialog.getByRole("button", { name: "Close edit profile" }).click();
  });
});

test("Join with a link shows feedback while invitation navigation is delayed", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "join-feedback",
      { displayName: "Join Jules", tasteLine: "" },
      scope,
    );
    const { mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const capture = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      const dir = process.env.E2E_INTERACTION_EVIDENCE_DIR;
      if (dir) await mkdir(dir, { recursive: true });
      await test.info().attach(name, {
        body: await page.screenshot({
          ...(dir
            ? { path: join(dir, `${name}-${test.info().project.name}.png`) }
            : {}),
          fullPage: true,
          animations: "disabled",
          style: "#group-invite-link { color: transparent !important; }",
        }),
        contentType: "image/png",
      });
    };
    const token = "A".repeat(43);
    const exercise = async (origin: string, changed: boolean) => {
      await page.goto(`${origin}/groups`);
      await page
        .getByRole("textbox", { name: "Invite link" })
        .fill(`${origin}/invite/${token}`);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(`**/invite/${token}*`, async (route) => {
        await held;
        await route.continue();
      });
      try {
        const button = page.getByRole("button", { name: "Join with a link" });
        await button.hover();
        if (changed) await expect(button).toHaveCSS("cursor", "pointer");
        await button.click({ noWaitAfter: true });
        if (changed) {
          await expect(
            page.getByRole("button", { name: "Opening invite…" }),
          ).toBeDisabled();
          await expect(
            page.getByRole("form", { name: "Join a group" }),
          ).toHaveAttribute("aria-busy", "true");
        }
        await capture(changed ? "after" : "before");
      } finally {
        release();
      }
      await expect(page).toHaveURL(/\/invite\/unavailable$/);
      await page.unroute(`**/invite/${token}*`);
    };
    if (process.env.E2E_PUBLIC_BEFORE_ORIGIN) {
      const before = new URL(process.env.E2E_PUBLIC_BEFORE_ORIGIN);
      if (before.protocol !== "http:" || before.hostname !== "127.0.0.1")
        throw new Error("Before evidence requires a loopback server");
      await exercise(before.origin, false);
    }
    await exercise("http://127.0.0.1:3100", true);
  });
});

test("group creation entry shows loading and supports the custom occasion", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      stackAdminClient(),
      "group-start-feedback",
      { displayName: "Create Casey", tasteLine: "" },
      scope,
    );
    const { mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const capture = async (name: string) => {
      await page.evaluate(() => document.fonts.ready);
      const dir = process.env.E2E_INTERACTION_EVIDENCE_DIR;
      if (dir) await mkdir(dir, { recursive: true });
      await test.info().attach(name, {
        body: await page.screenshot({
          ...(dir
            ? { path: join(dir, `${name}-${test.info().project.name}.png`) }
            : {}),
          fullPage: true,
          animations: "disabled",
        }),
        contentType: "image/png",
      });
    };
    const exercise = async (origin: string, changed: boolean) => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/groups/new*", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(`${origin}/groups`);
      await page
        .getByRole("textbox", { name: "Group name" })
        .fill("Board game night");
      const button = page.getByRole("button", { name: "Create a group" });
      if (changed) {
        await button.hover();
        await expect(button).toHaveCSS("cursor", "pointer");
      }
      await capture(changed ? "after" : "before");
      try {
        if (!changed) release();
        await button.click({ noWaitAfter: true });
        if (changed) {
          await expect(
            page.getByRole("button", { name: "Opening form…" }),
          ).toBeDisabled();
          await capture("loading-after");
        }
      } finally {
        release();
      }
      await expect(page).toHaveURL(/\/groups\/new\?/);
      await expect(
        page.getByRole("textbox", { name: "Group name" }),
      ).toHaveValue("Board game night");
      await page.unroute("**/groups/new*");
    };
    if (process.env.E2E_PUBLIC_BEFORE_ORIGIN) {
      const before = new URL(process.env.E2E_PUBLIC_BEFORE_ORIGIN);
      if (before.protocol !== "http:" || before.hostname !== "127.0.0.1")
        throw new Error("Before evidence requires a loopback server");
      await exercise(before.origin, false);
    }
    await exercise("http://127.0.0.1:3100", true);
    await page.goto("/groups");
    await page
      .getByRole("textbox", { name: "Group name" })
      .fill("Board game night");
    await page.getByText("Something else", { exact: true }).click();
    await page.getByRole("button", { name: "Create a group" }).click();
    await expect(
      page.getByRole("radio", { name: "Something else" }),
    ).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Group name" })).toHaveValue(
      "Board game night",
    );
  });
});
