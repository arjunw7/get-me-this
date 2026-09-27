import { expect, test } from "@playwright/test";

/**
 * The ARJ-9 design foundation fixture is the deterministic reference route.
 * The same assertions run under both approved projects (mobile 390x844 and
 * desktop 1440x1000), proving the route renders at each viewport.
 */

test("renders the deterministic design foundation fixture", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Get Me This | Design foundation");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Tokens and primitives");
  await expect(heading).toBeVisible();

  for (const label of [
    "Start my wishlist",
    "Add an item",
    "Create a group",
    "Update my wishlist",
  ]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }

  // Approved product terminology is present where the fixture speaks product.
  await expect(page.getByRole("textbox", { name: "Item name" })).toBeVisible();
  await expect(
    page.getByText("Placeholders are examples, never labels."),
  ).toBeVisible();

  // Banned terminology never appears on the fixture.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/shelfie|circle/i);
});
