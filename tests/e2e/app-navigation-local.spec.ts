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
