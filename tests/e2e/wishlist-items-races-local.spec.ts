import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";
import { wishlistControl } from "../helpers/wishlist-control-client";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires local Supabase and the loopback transport controller",
);

async function attributeAction(
  page: Page,
  caseId: string,
  participant: "first" | "second" = "first",
) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await route.continue({
        headers: {
          ...request.headers(),
          "x-arj28-case": caseId,
          "x-arj28-participant": participant,
        },
      });
      return;
    }
    await route.continue();
  });
}

async function attributeEditNavigation(
  page: Page,
  itemId: string,
  caseId: string,
) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if (
      request.method() === "GET" &&
      request.isNavigationRequest() &&
      target.pathname === `/wishlist/items/${itemId}/edit`
    ) {
      await route.continue({
        headers: {
          ...request.headers(),
          "x-arj28-case": caseId,
          "x-arj28-participant": "first",
        },
      });
      return;
    }
    await route.continue();
  });
}

test("same owner/key contenders yield one live row and conflict-then-missing is unavailable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const caseId = randomUUID();
  const submissionId = randomUUID();
  await wishlistControl.register(caseId);
  await wishlistControl.arm(caseId, "after-live-key-before-insert", 2);
  await wishlistControl.arm(caseId, "after-unique-conflict-before-lookup", 1);
  try {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-race",
      { displayName: "Ada" },
      scope,
    );
    const second = await page.context().newPage();
    await page.goto("/wishlist/items/new");
    await second.goto("/wishlist/items/new");
    await attributeAction(page, caseId, "first");
    await attributeAction(second, caseId, "second");
    for (const surface of [page, second]) {
      await surface.getByLabel("Item name").fill("ARJ-28 concurrent lamp");
      await surface
        .locator('input[name="submissionId"]')
        .evaluate((node, value) => {
          (node as HTMLInputElement).value = value as string;
        }, submissionId);
    }

    const firstClick = page.getByRole("button", { name: "Add item" }).click();
    const secondClick = second
      .getByRole("button", { name: "Add item" })
      .click();
    await wishlistControl.wait(caseId, "after-live-key-before-insert");
    const arrivals = await wishlistControl.events(caseId);
    expect(
      arrivals.arrivals.filter(
        (event) => event.stage === "after-live-key-before-insert",
      ),
    ).toHaveLength(2);

    await wishlistControl.releaseOne(
      caseId,
      "after-live-key-before-insert",
      "first",
    );
    await firstClick;
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const winner = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId)
      .single();
    expect(winner.error).toBeNull();

    await wishlistControl.release(caseId, "after-live-key-before-insert");
    await wishlistControl.wait(caseId, "after-unique-conflict-before-lookup");
    const rowsBeforeDelete = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId);
    expect(rowsBeforeDelete.data).toHaveLength(1);
    const removed = await admin
      .from("wishlist_items")
      .delete()
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId);
    expect(removed.error).toBeNull();
    await wishlistControl.release(
      caseId,
      "after-unique-conflict-before-lookup",
    );
    await secondClick;
    await expect(
      second.getByText(/We couldn’t save that item just now/i),
    ).toBeVisible();
    await expect(
      second.getByText(/We couldn’t save that item just now/i),
    ).toContainText(/unavailable|try again/i);
    const survivors = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId);
    expect(survivors.data).toEqual([]);
    expect((await wishlistControl.events(caseId)).failed).toBe(false);
    await second.close();
  } finally {
    await wishlistControl.clear(caseId);
    await scope.cleanup();
  }
});

test("a committed delete with a lost response stays uncertain and failed owner reads remain retryable", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const caseId = randomUUID();
  const itemId = randomUUID();
  await wishlistControl.register(caseId);
  try {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-delete-loss",
      { displayName: "Ada" },
      scope,
    );
    const parent = await admin
      .from("wishlists")
      .select("id")
      .eq("owner_id", userId)
      .single();
    expect(parent.error).toBeNull();
    const inserted = await admin.from("wishlist_items").insert({
      id: itemId,
      wishlist_id: parent.data!.id,
      owner_id: userId,
      title: "ARJ-28 response-loss fixture",
      sort_position: 1,
    });
    expect(inserted.error).toBeNull();
    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByRole("button", { name: "Delete item" }).click();
    await wishlistControl.arm(
      caseId,
      "postgrest-delete-response-loss",
      1,
      itemId,
      true,
    );
    await attributeAction(page, caseId);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete item" })
      .click();
    await wishlistControl.wait(caseId, "postgrest-delete-response-loss");
    await expect(
      page
        .getByRole("dialog")
        .getByText(/couldn’t confirm whether the item was removed/i),
    ).toBeVisible();
    const absent = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("id", itemId);
    expect(absent.error).toBeNull();
    expect(absent.data).toEqual([]);
    const failedEvents = await wishlistControl.events(caseId);
    expect(failedEvents.failed).toBe(false);
    expect(failedEvents.observations).toContainEqual(
      expect.objectContaining({
        kind: "local-rest",
        phase: "settled",
        outcome: "network-error",
        targetId: itemId,
        injected: true,
      }),
    );

    await page.getByRole("button", { name: "Check status" }).click();
    await expect(
      page.getByRole("link", { name: "Check the item" }),
    ).toBeVisible();
    await wishlistControl.arm(
      caseId,
      "postgrest-edit-read-failure",
      1,
      itemId,
      true,
    );
    await attributeEditNavigation(page, itemId, caseId);
    await page.getByRole("link", { name: "Check the item" }).click();
    await wishlistControl.wait(caseId, "postgrest-edit-read-failure");
    await expect(
      page.getByRole("heading", { name: "We couldn’t load this item." }),
    ).toBeVisible();
    await expect(page.getByText("ARJ-28 response-loss fixture")).toHaveCount(0);
    await page.getByRole("link", { name: "Try again" }).click();
    await expect(
      page.getByRole("heading", { name: "This item isn’t available." }),
    ).toBeVisible();
    const events = await wishlistControl.events(caseId);
    expect(events.failed).toBe(false);
    expect(
      events.probes.some(
        (probe) =>
          probe.stage === "postgrest-edit-read-failure" &&
          probe.reason === "consumed",
      ),
    ).toBe(true);
    expect(
      events.observations.filter(
        (event) => event.targetId === itemId && event.kind === "local-rest",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "settled",
          outcome: "network-error",
          injected: true,
        }),
        expect.objectContaining({
          phase: "settled",
          outcome: "response",
          injected: false,
        }),
      ]),
    );
  } finally {
    await wishlistControl.clear(caseId);
    await scope.cleanup();
  }
});

test("distinct submission keys released after one shared maximum may tie and remain stably ordered", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const caseId = randomUUID();
  await wishlistControl.register(caseId);
  await wishlistControl.arm(caseId, "after-max-before-insert", 2);
  try {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-distinct-keys",
      { displayName: "Ada" },
      scope,
    );
    const first = page;
    const second = await page.context().newPage();
    await first.goto("/wishlist/items/new");
    await second.goto("/wishlist/items/new");
    await attributeAction(first, caseId, "first");
    await attributeAction(second, caseId, "second");
    await first.getByLabel("Item name").fill("Distinct-key first");
    await second.getByLabel("Item name").fill("Distinct-key second");
    const firstClick = first.getByRole("button", { name: "Add item" }).click();
    const secondClick = second
      .getByRole("button", { name: "Add item" })
      .click();
    await wishlistControl.wait(caseId, "after-max-before-insert");
    expect(
      (await wishlistControl.events(caseId)).arrivals.filter(
        (arrival) => arrival.stage === "after-max-before-insert",
      ),
    ).toHaveLength(2);
    await wishlistControl.release(caseId, "after-max-before-insert");
    await Promise.all([firstClick, secondClick]);
    await expect(first).toHaveURL(/\/wishlist\?item=added$/);
    await expect(second).toHaveURL(/\/wishlist\?item=added$/);
    const rows = await admin
      .from("wishlist_items")
      .select("id,title,sort_position")
      .eq("owner_id", userId)
      .in("title", ["Distinct-key first", "Distinct-key second"])
      .order("sort_position", { ascending: true })
      .order("id", { ascending: true });
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(2);
    expect(rows.data?.[0].sort_position).toBe(rows.data?.[1].sort_position);
    await expect(
      first.getByRole("heading", {
        name: "Distinct-key first",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      first.getByRole("heading", {
        name: "Distinct-key second",
        exact: true,
      }),
    ).toBeVisible();
    const expectedOrder = rows.data?.map((row) => row.title);
    await first.goto("/wishlist");
    const renderedOrder = await first.locator("article h3").allTextContents();
    const indexFirst = renderedOrder.findIndex((text) =>
      text.includes("Distinct-key first"),
    );
    const indexSecond = renderedOrder.findIndex((text) =>
      text.includes("Distinct-key second"),
    );
    expect(renderedOrder).toContain("Distinct-key first");
    expect(renderedOrder).toContain("Distinct-key second");
    expect(indexFirst < indexSecond).toBe(
      expectedOrder?.[0] === "Distinct-key first",
    );
    expect((await wishlistControl.events(caseId)).failed).toBe(false);
    await second.close();
  } finally {
    await wishlistControl.clear(caseId);
    await scope.cleanup();
  }
});

test("a price-pair edit racing a replacement returns retry without overwriting the current conversion tuple", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const caseId = randomUUID();
  const itemId = randomUUID();
  await wishlistControl.register(caseId);
  await wishlistControl.arm(caseId, "after-edit-read-before-update", 1);
  try {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-price-race",
      { displayName: "Ada" },
      scope,
    );
    const parent = await admin
      .from("wishlists")
      .select("id")
      .eq("owner_id", userId)
      .single();
    expect(parent.error).toBeNull();
    const seeded = await admin.from("wishlist_items").insert({
      id: itemId,
      wishlist_id: parent.data!.id,
      owner_id: userId,
      title: "Price race fixture",
      sort_position: 1,
      original_amount_minor: 2499,
      original_currency: "INR",
      converted_amount_minor: 1200,
      converted_currency: "USD",
      conversion_rate_source: "fixture-old",
      conversion_rate_at: "2026-09-01T00:00:00Z",
    });
    expect(seeded.error).toBeNull();
    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByLabel("Item name").fill("Stale title edit");
    await attributeAction(page, caseId, "first");
    const save = page.getByRole("button", { name: "Save changes" }).click();
    await wishlistControl.wait(caseId, "after-edit-read-before-update");
    const changed = await admin
      .from("wishlist_items")
      .update({
        original_amount_minor: 5100,
        original_currency: "USD",
        converted_amount_minor: 3000,
        converted_currency: "EUR",
        conversion_rate_source: "fixture-new",
        conversion_rate_at: "2026-09-02T00:00:00Z",
      })
      .eq("owner_id", userId)
      .eq("id", itemId);
    expect(changed.error).toBeNull();
    await wishlistControl.release(caseId, "after-edit-read-before-update");
    await save;
    await expect(
      page.getByText(/This item changed while you were editing/i),
    ).toContainText("changed while you were editing");
    const actual = await admin
      .from("wishlist_items")
      .select(
        "title,original_amount_minor::text,original_currency,converted_amount_minor::text,converted_currency,conversion_rate_source,conversion_rate_at",
      )
      .eq("owner_id", userId)
      .eq("id", itemId)
      .single();
    expect(actual.error).toBeNull();
    expect(actual.data).toEqual({
      title: "Price race fixture",
      original_amount_minor: "5100",
      original_currency: "USD",
      converted_amount_minor: "3000",
      converted_currency: "EUR",
      conversion_rate_source: "fixture-new",
      conversion_rate_at: "2026-09-02T00:00:00+00:00",
    });
    expect((await wishlistControl.events(caseId)).failed).toBe(false);
  } finally {
    await wishlistControl.clear(caseId);
    await scope.cleanup();
  }
});

test("an unrelated null-pair edit preserves a conversion tuple changed during the action", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const caseId = randomUUID();
  const itemId = randomUUID();
  await wishlistControl.register(caseId);
  await wishlistControl.arm(caseId, "after-edit-read-before-update", 1);
  try {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-null-pair-race",
      { displayName: "Ada" },
      scope,
    );
    const parent = await admin
      .from("wishlists")
      .select("id")
      .eq("owner_id", userId)
      .single();
    expect(parent.error).toBeNull();
    const seeded = await admin.from("wishlist_items").insert({
      id: itemId,
      wishlist_id: parent.data!.id,
      owner_id: userId,
      title: "Null pair conversion fixture",
      sort_position: 1,
      converted_amount_minor: 1200,
      converted_currency: "USD",
      conversion_rate_source: "fixture-old",
      conversion_rate_at: "2026-09-01T00:00:00Z",
    });
    expect(seeded.error).toBeNull();
    await page.goto(`/wishlist/items/${itemId}/edit`);
    await page.getByLabel("Item name").fill("Null-pair unrelated edit");
    await attributeAction(page, caseId, "first");
    const save = page.getByRole("button", { name: "Save changes" }).click();
    await wishlistControl.wait(caseId, "after-edit-read-before-update");
    const changed = await admin
      .from("wishlist_items")
      .update({
        converted_amount_minor: 3000,
        converted_currency: "EUR",
        conversion_rate_source: "fixture-new",
        conversion_rate_at: "2026-09-02T00:00:00Z",
      })
      .eq("owner_id", userId)
      .eq("id", itemId);
    expect(changed.error).toBeNull();
    await wishlistControl.release(caseId, "after-edit-read-before-update");
    await save;
    await expect(page).toHaveURL(/\/wishlist\?item=updated$/);
    const actual = await admin
      .from("wishlist_items")
      .select(
        "title,original_amount_minor::text,original_currency,converted_amount_minor::text,converted_currency,conversion_rate_source,conversion_rate_at",
      )
      .eq("owner_id", userId)
      .eq("id", itemId)
      .single();
    expect(actual.error).toBeNull();
    expect(actual.data).toEqual({
      title: "Null-pair unrelated edit",
      original_amount_minor: null,
      original_currency: null,
      converted_amount_minor: "3000",
      converted_currency: "EUR",
      conversion_rate_source: "fixture-new",
      conversion_rate_at: "2026-09-02T00:00:00+00:00",
    });
    expect((await wishlistControl.events(caseId)).failed).toBe(false);
  } finally {
    await wishlistControl.clear(caseId);
    await scope.cleanup();
  }
});
