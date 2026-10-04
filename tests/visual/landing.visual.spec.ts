import { expect, test } from "@playwright/test";

/**
 * Compare against the two owner-approved Ubuntu CI homepage captures,
 * including Helpful guides. Approval and exact hashes are recorded in
 * docs/delivery/evidence/search-guides-2026-10-04/baseline-approval.json.
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
