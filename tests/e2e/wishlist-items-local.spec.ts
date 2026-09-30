import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createSignedInFixture,
  fixtureWishlistId,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

test("manual create, exact decimal readback, owner edit, and confirmed hard delete persist", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-items",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    const wishlistId = await fixtureWishlistId(admin, userId);
    const before = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId);
    expect(before.error).toBeNull();

    await page.goto("/wishlist/items/new");
    await page.getByLabel("Item name").fill("Manual e2e fixture lamp");
    await page.getByLabel("Price").fill("24.99");
    await page.getByLabel("Currency").selectOption("INR");
    await page
      .getByLabel("Link (optional)")
      .fill("https://arj28-fixture.invalid/lamp");
    await page
      .getByLabel("Note (optional)")
      .fill("Synthetic CRUD verification only.");
    await page.getByRole("radio", { name: "Really want" }).check();
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    await expect(
      page.getByRole("heading", { name: "Manual e2e fixture lamp" }),
    ).toBeVisible();
    const created = await admin
      .from("wishlist_items")
      .select(
        "id,title,owner_id,wishlist_id,original_amount_minor::text,original_currency,source_url,note,desire_level,extraction_status",
      )
      .eq("owner_id", userId)
      .eq("title", "Manual e2e fixture lamp")
      .single();
    expect(created.error).toBeNull();
    if (created.error || !created.data)
      throw new Error("created wishlist item fixture could not be read back");
    expect(created.data).toMatchObject({
      owner_id: userId,
      wishlist_id: wishlistId,
      original_amount_minor: "2499",
      original_currency: "INR",
      source_url: "https://arj28-fixture.invalid/lamp",
      note: "Synthetic CRUD verification only.",
      desire_level: "really_want",
      extraction_status: "manual",
    });
    expect(
      (await admin.from("wishlist_items").select("id").eq("owner_id", userId))
        .data,
    ).toHaveLength((before.data?.length ?? 0) + 1);

    await page
      .getByRole("link", { name: "Edit Manual e2e fixture lamp" })
      .click();
    await expect(page.getByLabel("Price")).toHaveValue("24.99");
    await page.getByLabel("Price").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=updated$/);
    const cleared = await admin
      .from("wishlist_items")
      .select(
        "original_amount_minor::text,original_currency,converted_amount_minor::text,converted_currency,conversion_rate_source,conversion_rate_at",
      )
      .eq("owner_id", userId)
      .eq("id", created.data.id)
      .single();
    expect(cleared.error).toBeNull();
    expect(cleared.data).toEqual({
      original_amount_minor: null,
      original_currency: null,
      converted_amount_minor: null,
      converted_currency: null,
      conversion_rate_source: null,
      conversion_rate_at: null,
    });

    await page
      .getByRole("link", { name: "Edit Manual e2e fixture lamp" })
      .click();
    await page.getByRole("button", { name: "Delete item" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("button", { name: "Delete item" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete item" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete item" })
      .click();
    await expect(page).toHaveURL(/\/wishlist\?item=deleted$/);
    const absent = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("id", created.data.id);
    expect(absent.error).toBeNull();
    expect(absent.data).toEqual([]);
  });
});

test("a foreign complete profile cannot replay a real owner edit action", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const foreignScope = new FixtureScope();
  const foreignContext = await browser.newContext();
  const foreignPage = await foreignContext.newPage();
  let captured:
    { url: string; headers: Record<string, string>; body: Buffer } | undefined;
  try {
    const ownerId = await createSignedInFixture(
      page,
      admin,
      "arj28-owner-action",
      { displayName: "Ada" },
      scope,
    );
    const wishlistId = await fixtureWishlistId(admin, ownerId);
    const itemId = randomUUID();
    const inserted = await admin.from("wishlist_items").insert({
      id: itemId,
      wishlist_id: wishlistId,
      owner_id: ownerId,
      title: "Owner-only action row",
      sort_position: 1,
    });
    expect(inserted.error).toBeNull();
    const before = await admin
      .from("wishlist_items")
      .select("id,title,note,owner_id,wishlist_id")
      .eq("id", itemId)
      .single();
    expect(before.error).toBeNull();

    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByLabel("Item name").fill("Forged cross-user update");
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        const rawHeaders = request.headers();
        const allowedHeaders = [
          "accept",
          "content-type",
          "next-action",
          "next-router-state-tree",
          "origin",
          "referer",
          "rsc",
        ];
        const headers = Object.fromEntries(
          allowedHeaders.flatMap((name) =>
            rawHeaders[name] ? [[name, rawHeaders[name]]] : [],
          ),
        );
        captured = {
          url: request.url(),
          headers,
          body: request.postDataBuffer() ?? Buffer.alloc(0),
        };
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => captured?.body.length ?? 0).toBeGreaterThan(0);

    await createSignedInFixture(
      foreignPage,
      admin,
      "arj28-foreign-action",
      { displayName: "Bea" },
      foreignScope,
    );
    const replay = await foreignContext.request.post(captured!.url, {
      headers: captured!.headers,
      data: captured!.body,
      timeout: 15_000,
    });
    expect(replay.status()).toBeGreaterThanOrEqual(200);
    expect(replay.status()).toBeLessThan(500);
    const after = await admin
      .from("wishlist_items")
      .select("id,title,note,owner_id,wishlist_id")
      .eq("id", itemId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data).toEqual(before.data);

    await foreignPage.goto(`/wishlist/items/${itemId}/edit`);
    await expect(
      foreignPage.getByRole("heading", { name: "This item isn’t available." }),
    ).toBeVisible();
    await expect(foreignPage.getByText("Owner-only action row")).toHaveCount(0);
  } finally {
    await foreignScope.cleanup();
    await scope.cleanup();
    await foreignContext.close();
  }
});
