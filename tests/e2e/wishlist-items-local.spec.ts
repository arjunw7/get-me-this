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
