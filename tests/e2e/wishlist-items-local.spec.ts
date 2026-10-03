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
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
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
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await page.getByLabel("Item name").fill("Manual e2e fixture lamp");
    await page.getByLabel("Price").fill("24.99");
    await page
      .getByRole("combobox", { name: "Currency", exact: true })
      .fill("INR");
    await page
      .getByRole("combobox", { name: "Currency", exact: true })
      .press("Enter");
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
        "id,title,owner_id,wishlist_id,sort_position,original_amount_minor::text,original_currency,source_url,note,desire_level,extraction_status",
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
      sort_position: 1,
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
    const deleteOpener = page.getByRole("button", { name: "Delete item" });
    await deleteOpener.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        deleteOpener.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return bounds.height >= 44 && (hit === node || node.contains(hit));
        }),
      )
      .toBe(true);
    await deleteOpener.click();
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

test("a hard-deleted submission key can be reinserted by a delayed create retry", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-hard-delete-reinsert",
      { displayName: "Ada" },
      scope,
    );
    const submissionId = randomUUID();
    const title = "Same-key hard-delete retry fixture";
    await page.goto("/wishlist/items/new");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await page.getByLabel("Item name").fill(title);
    await page.locator('input[name="submissionId"]').evaluate((node, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, submissionId);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const first = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId)
      .single();
    expect(first.error).toBeNull();
    const removed = await admin
      .from("wishlist_items")
      .delete()
      .eq("owner_id", userId)
      .eq("id", first.data!.id)
      .select("id");
    expect(removed.error).toBeNull();
    expect(removed.data).toEqual([{ id: first.data!.id }]);

    await page.goto("/wishlist/items/new");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await page.getByLabel("Item name").fill(title);
    await page.locator('input[name="submissionId"]').evaluate((node, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(node, value);
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, submissionId);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const live = await admin
      .from("wishlist_items")
      .select("id,client_submission_id")
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId);
    expect(live.error).toBeNull();
    expect(live.data).toHaveLength(1);
    expect(live.data?.[0].id).not.toBe(first.data!.id);
  });
});

test("incomplete profiles cannot create, edit, or delete through current actions", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-incomplete-action",
      { displayName: "Ada" },
      scope,
    );
    const parent = await admin
      .from("wishlists")
      .select("id")
      .eq("owner_id", userId)
      .single();
    expect(parent.error).toBeNull();
    const itemId = randomUUID();
    const seeded = await admin.from("wishlist_items").insert({
      id: itemId,
      wishlist_id: parent.data!.id,
      owner_id: userId,
      title: "Incomplete gate fixture",
      sort_position: 1,
    });
    expect(seeded.error).toBeNull();
    const setComplete = async (complete: boolean) => {
      const result = await admin
        .from("profiles")
        .update({
          display_name: complete ? "Ada" : null,
          taste_line: null,
        })
        .eq("id", userId);
      expect(result.error).toBeNull();
    };

    await page.goto("/wishlist/items/new");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await page.getByLabel("Item name").fill("Blocked incomplete create");
    await setComplete(false);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
    const created = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("title", "Blocked incomplete create");
    expect(created.error).toBeNull();
    expect(created.data).toEqual([]);

    await setComplete(true);
    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByLabel("Item name").fill("Blocked incomplete edit");
    await setComplete(false);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
    const afterEdit = await admin
      .from("wishlist_items")
      .select("title")
      .eq("owner_id", userId)
      .eq("id", itemId)
      .single();
    expect(afterEdit.error).toBeNull();
    expect(afterEdit.data?.title).toBe("Incomplete gate fixture");

    await setComplete(true);
    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByRole("button", { name: "Delete item" }).click();
    await setComplete(false);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete item" })
      .click();
    await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
    const afterDelete = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("id", itemId)
      .single();
    expect(afterDelete.error).toBeNull();
  });
});

test("expired sessions cannot create, edit, or delete through current actions", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    for (const action of ["create", "edit", "delete"] as const) {
      await page.context().clearCookies();
      const userId = await createSignedInFixture(
        page,
        admin,
        `arj28-expired-${action}`,
        { displayName: "Ada" },
        scope,
      );
      const parent = await admin
        .from("wishlists")
        .select("id")
        .eq("owner_id", userId)
        .single();
      expect(parent.error).toBeNull();
      const itemId = randomUUID();
      if (action !== "create") {
        const seeded = await admin.from("wishlist_items").insert({
          id: itemId,
          wishlist_id: parent.data!.id,
          owner_id: userId,
          title: `Expired ${action} fixture`,
          sort_position: 1,
        });
        expect(seeded.error).toBeNull();
      }

      if (action === "create") {
        await page.goto("/wishlist/items/new");
        await page
          .getByRole("button", { name: "No link? Add it manually" })
          .click();
        await page.getByLabel("Item name").fill("Blocked expired create");
      } else {
        await page.goto(`/wishlist/items/${itemId}/edit`);
        if (action === "edit")
          await page.getByLabel("Item name").fill("Blocked expired edit");
        else await page.getByRole("button", { name: "Delete item" }).click();
      }
      await page.context().clearCookies();
      await page.reload();
      await expect(page).toHaveURL(/\/auth(?:\?|$)/);
      const unchanged = await admin
        .from("wishlist_items")
        .select("id,title")
        .eq("owner_id", userId);
      expect(unchanged.error).toBeNull();
      if (action === "create") expect(unchanged.data).toEqual([]);
      else
        expect(unchanged.data).toEqual([
          { id: itemId, title: `Expired ${action} fixture` },
        ]);
    }
  });
});

test("a real PostgreSQL delete rejection is definite and leaves the owner row intact", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-delete-sql-rejection",
      { displayName: "Ada" },
      scope,
    );
    const parent = await admin
      .from("wishlists")
      .select("id")
      .eq("owner_id", userId)
      .single();
    expect(parent.error).toBeNull();
    const itemId = randomUUID();
    const inserted = await admin.from("wishlist_items").insert({
      id: itemId,
      wishlist_id: parent.data!.id,
      owner_id: userId,
      title: "ARJ-28 definite SQL rejection fixture",
      sort_position: 1,
    });
    expect(inserted.error).toBeNull();
    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByRole("button", { name: "Delete item" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete item" })
      .click();
    await expect(
      page.getByText(
        "We couldn’t remove this item. It’s still here; you can try again.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Retry delete" }),
    ).toBeVisible();
    const row = await admin
      .from("wishlist_items")
      .select("id,title,owner_id,wishlist_id")
      .eq("owner_id", userId)
      .eq("id", itemId)
      .single();
    expect(row.error).toBeNull();
    expect(row.data).toEqual({
      id: itemId,
      title: "ARJ-28 definite SQL rejection fixture",
      owner_id: userId,
      wishlist_id: parent.data!.id,
    });
    const renamed = await admin
      .from("wishlist_items")
      .update({ title: "ARJ-28 rejection fixture cleanup" })
      .eq("owner_id", userId)
      .eq("id", itemId);
    expect(renamed.error).toBeNull();
  });
});
