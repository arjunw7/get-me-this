import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_NO_PROVIDER !== "1",
  "run through scripts/e2e-no-provider-actions.sh with explicit empty provider configuration",
);

test("current-build create, edit, and delete actions gate signed-out callers before data access", async ({
  page,
}) => {
  const actionResponses: Array<{
    cacheControl: string | null;
    status: number;
  }> = [];
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      response.request().headers()["next-action"]
    ) {
      actionResponses.push({
        cacheControl: response.headers()["cache-control"] ?? null,
        status: response.status(),
      });
    }
  });

  for (const button of ["Create action", "Edit action", "Delete action"]) {
    await page.goto("/test-support/wishlist-action-reference");
    await expect(
      page.locator('[data-no-provider-config="true"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: button }).click();
    await expect(page).toHaveURL(/\/auth(?:\?|$)/);
  }
  expect(actionResponses).toHaveLength(3);
  expect(
    actionResponses.every((entry) => entry.cacheControl?.includes("no-store")),
  ).toBe(true);
  expect(actionResponses.some((entry) => entry.status >= 500)).toBe(false);

  for (const route of [
    "/wishlist/items/new",
    "/wishlist/items/00000000-0000-4000-8000-000000000028/edit",
    "/wishlist/items/not-a-uuid/edit",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/auth(?:\?|$)/);
    await expect(page.getByText(/Lamp|Private fixture/)).toHaveCount(0);
  }
});
