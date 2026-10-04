import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mailpitLogin } from "../helpers/mailpit-signin";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE || !process.env.E2E_PARITY_FIXTURE_MANIFEST,
  "requires dedicated local comparison fixture",
);
test("account menu on the populated reference wishlist", async ({
  page,
}, info) => {
  const fixture = JSON.parse(
    readFileSync(process.env.E2E_PARITY_FIXTURE_MANIFEST!, "utf8"),
  );
  if (fixture.emails.aanya !== "parity-proof-20261004@example.com")
    throw new Error("Dedicated proof account required");
  await mailpitLogin(page, fixture.emails.aanya);
  await page.goto("/wishlist");
  await page
    .getByRole("button", { name: "Account", exact: true })
    .filter({ visible: true })
    .click();
  const menu = page
    .getByTestId("account-menu-content")
    .filter({ visible: true });
  await expect(
    menu.getByRole("link", { name: "My wishlist", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("button", { name: "Log out", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    document
      .querySelectorAll("img")
      .forEach((image) => (image.loading = "eager"));
  });
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).complete),
        ),
    )
    .toBe(true);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect.soft(scan.violations).toEqual([]);
  await info.attach(`account-menu-${info.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await menu.getByRole("button", { name: "Log out", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Log out of Get Me This?",
  });
  await expect(confirmation).toBeVisible();
  await expect(menu).toHaveCount(0);
  const confirmationScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect.soft(confirmationScan.violations).toEqual([]);
  await info.attach(`logout-confirmation-${info.project.name}`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "Account", exact: true })
      .filter({ visible: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(/\/wishlist$/);
});
