import { expect, test } from "@playwright/test";

/**
 * Visual-regression screenshots of the static email-entry destination,
 * compared against `docs/design-reference/baselines/v18/auth-home--*.png`
 * (the reference's default, no-intent-note state).
 *
 * Determinism and the candidate-approval workflow: see
 * fixture.visual.spec.ts and docs/delivery/visual-baselines.md.
 */
test.skip(
  true,
  "004c changes the entry screen's helper copy to the real code-flow promise; the auth-home baseline regeneration awaits the owner's side-by-side review (docs/delivery/visual-baselines.md)",
);

test("email entry (default state) is visually stable", async ({
  page,
}, testInfo) => {
  await page.goto("/auth?intent=home");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );

  await expect(page).toHaveScreenshot(
    `auth-home-${testInfo.project.name}.png`,
    {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    },
  );
});
