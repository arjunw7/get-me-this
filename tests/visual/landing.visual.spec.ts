import { expect, test } from "@playwright/test";

/**
 * Visual-regression screenshots of the ARJ-16 landing page, compared
 * against `docs/design-reference/baselines/v18/landing--*.png`.
 *
 * Determinism measures are the repository standard (see fixture.visual.spec.ts):
 * full-page capture at the approved viewport size (390x844, 1440x1000),
 * animations disabled, caret hidden, device pixel ratio 1, local fonts and
 * local images only.
 *
 * Candidate screenshots are generated with --update-snapshots and stay
 * uncommitted until the product owner approves them
 * (docs/delivery/visual-baselines.md).
 */
test("landing page is visually stable", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page).toHaveTitle(
    "Get Me This | Group wishlists for every occasion",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Make a wishlist.",
  );

  await expect(page).toHaveScreenshot(`landing-${testInfo.project.name}.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
});
