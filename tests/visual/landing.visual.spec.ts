import { expect, test } from "@playwright/test";

/**
 * Compare the approved wishlist-first landing revision against the frozen
 * golden screenshots. These will differ until the owner approves the new
 * desktop/mobile evidence in docs/delivery/evidence/landing-positioning-2026-10-04.
 * Never regenerate baselines merely to make this check pass.
 */
test("landing page is visually stable", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Get Me This | Your shareable gift wishlist");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Good gifts start with a wishlist.",
  );

  await expect(page).toHaveScreenshot(`landing-${testInfo.project.name}.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
});
