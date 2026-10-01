import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  createSignedInFixture,
  FixtureScope,
  seedWishlistItems,
  stackAdminClient,
  type ItemFixture,
} from "../helpers/local-stack";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const items: readonly ItemFixture[] = [
  {
    id: "00000000-0000-4000-8000-000000000301",
    title: "Ceramic matcha set",
    desire_level: "really_want",
    sort_position: 1,
  },
  {
    id: "00000000-0000-4000-8000-000000000302",
    title: "Tiny gold hoops",
    desire_level: "would_love",
    sort_position: 2,
  },
  {
    id: "00000000-0000-4000-8000-000000000303",
    title: "Linen pyjama set",
    desire_level: "just_an_idea",
    sort_position: 3,
  },
];
const CANDIDATE_DIR = join(process.cwd(), "test-results", "arj29-candidates");

async function canonicalTitles(page: Page): Promise<string[]> {
  return page.locator("article h3").allTextContents();
}

/**
 * The reorder panel's own polite live region. The page-level notice flash
 * (for example the `?item=added` "Item added to your wishlist." paragraph)
 * is also role="status" by design, so the reorder announcement is addressed
 * by its aria-live attribute to keep the locator unambiguous.
 */
function reorderStatus(surface: Page) {
  return surface.locator('p[role="status"][aria-live="polite"]');
}

test("arrow and touch moves persist across Done, reload, and a second tab", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      `arj29-reorder-${randomUUID()}`,
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    await seedWishlistItems(admin, ownerId, items);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/wishlist");
    mkdirSync(CANDIDATE_DIR, { recursive: true });
    await expect(
      page.getByText(
        "You’ll never see what’s been reserved. That’s the point.",
      ),
    ).toBeVisible();
    await page.screenshot({
      path: join(
        CANDIDATE_DIR,
        `arj29-wishlist-before-${testInfo.project.name}.png`,
      ),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Reorder", exact: true }).click();

    const reorder = page.getByRole("button", { name: "Done" });
    await expect(reorder).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: join(
        CANDIDATE_DIR,
        `arj29-wishlist-reorder-${testInfo.project.name}.png`,
      ),
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .press("Enter");
    await expect(reorderStatus(page)).toHaveText("Order saved.");

    const rows = page.getByRole("listitem");
    const firstHandle = page.getByRole("button", {
      name: "Drag to reorder Tiny gold hoops",
    });
    const lastRow = rows.nth(2);
    const start = await firstHandle.boundingBox();
    const target = await lastRow.boundingBox();
    if (!start || !target) throw new Error("reorder drag geometry unavailable");
    await firstHandle.dispatchEvent("pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: start.x + start.width / 2,
      clientY: start.y + start.height / 2,
      buttons: 1,
    });
    await firstHandle.dispatchEvent("pointermove", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: target.x + target.width / 2,
      clientY: target.y + target.height / 2,
      buttons: 1,
    });
    await firstHandle.dispatchEvent("pointerup", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: target.x + target.width / 2,
      clientY: target.y + target.height / 2,
      buttons: 0,
    });
    await expect(reorderStatus(page)).toHaveText("Order saved.");

    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("button", { name: "Reorder", exact: true }),
    ).toBeVisible();
    const expected = [
      "Ceramic matcha set",
      "Linen pyjama set",
      "Tiny gold hoops",
    ];
    await expect.poll(() => canonicalTitles(page)).toEqual(expected);
    await page.reload();
    await expect.poll(() => canonicalTitles(page)).toEqual(expected);
    const second = await page.context().newPage();
    await second.goto("/wishlist");
    await expect.poll(() => canonicalTitles(second)).toEqual(expected);

    const stored = await admin
      .from("wishlist_items")
      .select("title")
      .eq("owner_id", ownerId)
      .order("sort_position", { ascending: true })
      .order("id", { ascending: true });
    expect(stored.error).toBeNull();
    expect(stored.data?.map((row) => row.title)).toEqual(expected);
    await second.close();
  });
});

test("incomplete profiles cannot reorder through the current action", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      `arj29-incomplete-${randomUUID()}`,
      { displayName: "Ada" },
      scope,
    );
    await seedWishlistItems(admin, ownerId, items);
    await page.goto("/wishlist");
    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    const madeIncomplete = await admin
      .from("profiles")
      .update({ display_name: null, taste_line: null })
      .eq("id", ownerId);
    expect(madeIncomplete.error).toBeNull();

    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
    const stored = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", ownerId)
      .order("sort_position", { ascending: true })
      .order("id", { ascending: true });
    expect(stored.error).toBeNull();
    expect(stored.data?.map((row) => row.id)).toEqual(
      items.map(({ id }) => id),
    );
  });
});

test("a stale second tab refetches the authoritative order before another move", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      `arj29-stale-${randomUUID()}`,
      { displayName: "Ada" },
      scope,
    );
    await seedWishlistItems(admin, ownerId, items);
    const staleTab = await page.context().newPage();
    await Promise.all([page.goto("/wishlist"), staleTab.goto("/wishlist")]);
    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(reorderStatus(page)).toHaveText("Order saved.");

    await staleTab
      .getByRole("button", { name: "Reorder", exact: true })
      .click();
    await staleTab
      .getByRole("button", { name: "Move Linen pyjama set up" })
      .click();
    await expect(reorderStatus(staleTab)).toHaveText(
      "Order refreshed. Choose another move if needed.",
    );
    const staleRows = await staleTab
      .getByRole("listitem")
      .locator("p.truncate")
      .allTextContents();
    expect(staleRows).toEqual([
      "Tiny gold hoops",
      "Ceramic matcha set",
      "Linen pyjama set",
    ]);
    const stored = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", ownerId)
      .order("sort_position", { ascending: true })
      .order("id", { ascending: true });
    expect(stored.data?.map((row) => row.id)).toEqual([
      items[1].id,
      items[0].id,
      items[2].id,
    ]);
    await staleTab.close();
  });
});

test("create and delete commit orders reconcile without overwriting or resurrection", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      `arj29-interleaving-${randomUUID()}`,
      { displayName: "Ada" },
      scope,
    );
    await seedWishlistItems(admin, ownerId, items);
    const wishlist = await admin
      .from("wishlists")
      .select("id")
      .eq("owner_id", ownerId)
      .single();
    expect(wishlist.error).toBeNull();

    await page.goto("/wishlist");
    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    const createdFirstId = randomUUID();
    const createdFirst = await admin.from("wishlist_items").insert({
      id: createdFirstId,
      wishlist_id: wishlist.data!.id,
      owner_id: ownerId,
      title: "Created before reorder",
      sort_position: 4,
    });
    expect(createdFirst.error).toBeNull();
    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(reorderStatus(page)).toHaveText(
      "Order refreshed. Choose another move if needed.",
    );
    await expect(page.getByText("Created before reorder")).toBeVisible();

    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(reorderStatus(page)).toHaveText("Order saved.");
    await page.getByRole("button", { name: "Done" }).click();
    await page.goto("/wishlist/items/new");
    await page.getByLabel("Item name").fill("Created after reorder");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const afterCreate = await admin
      .from("wishlist_items")
      .select("title")
      .eq("owner_id", ownerId)
      .order("sort_position", { ascending: true })
      .order("id", { ascending: true });
    expect(afterCreate.error).toBeNull();
    expect(afterCreate.data?.at(-1)?.title).toBe("Created after reorder");

    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    const deletedFirst = await admin
      .from("wishlist_items")
      .delete()
      .eq("owner_id", ownerId)
      .eq("id", items[1].id);
    expect(deletedFirst.error).toBeNull();
    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(reorderStatus(page)).toHaveText(
      "Order refreshed. Choose another move if needed.",
    );
    await expect(page.getByText("Tiny gold hoops")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(reorderStatus(page)).toHaveText("Order saved.");
    await page.getByRole("button", { name: "Remove Linen pyjama set" }).click();
    await page.getByRole("button", { name: "Delete item" }).click();
    await expect(page.getByText("Linen pyjama set")).toHaveCount(0);
    const deletedAfter = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("id", items[2].id);
    expect(deletedAfter.error).toBeNull();
    expect(deletedAfter.data).toEqual([]);
  });
});

test("Done waits for saving, stays open after a lost response, and axe passes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      `arj29-recovery-${randomUUID()}`,
      { displayName: "Ada" },
      scope,
    );
    await seedWishlistItems(admin, ownerId, items);
    await page.goto("/wishlist");
    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);

    let release!: () => void;
    let observed!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const received = new Promise<void>((resolve) => (observed = resolve));
    await page.route("**/wishlist", async (route) => {
      if (route.request().method() === "POST") {
        observed();
        await held;
      }
      await route.continue();
    });
    const saving = page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await received;
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("button", { name: "Finishing…" }),
    ).toBeVisible();
    release();
    await saving;
    await expect(
      page.getByRole("button", { name: "Reorder", exact: true }),
    ).toBeVisible();
    await page.unroute("**/wishlist");

    await page.getByRole("button", { name: "Reorder", exact: true }).click();
    let aborted = false;
    await page.route("**/wishlist", async (route) => {
      if (!aborted && route.request().method() === "POST") {
        aborted = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Move Ceramic matcha set down" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "We couldn’t confirm the saved order.",
    );
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("button", { name: "Retry refresh" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry refresh" }).click();
    await expect(
      page.getByRole("button", { name: "Reorder", exact: true }),
    ).toBeVisible();
  });
});
