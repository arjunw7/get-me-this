import { expect, test } from "@playwright/test";

/**
 * Visual-regression screenshots of the ARJ-9 design foundation fixture.
 *
 * Determinism measures, all test-only:
 * - full-page capture at the approved viewport size (390x844, 1440x1000)
 * - animations disabled so no transition or hover state can leak into a frame
 * - caret hidden so the text field never has a blinking-cursor race
 * - device pixel ratio 1 (set in playwright.config.ts)
 * - fonts vendored locally by the app; no network font loading
 * - fixture content is fully static: no dates, randomness, or network images
 *
 * The production fixture is never styled for screenshots. If stabilization is
 * ever genuinely required beyond these options, it must use Playwright's
 * screenshot-only `style` option and be documented here.
 */

test("design foundation fixture is visually stable", async ({
  page,
}, testInfo) => {
  // Relocated off "/" by ARJ-16 (003a): the landing page owns the root
  // route now. The fixture renders identically at its new URL, so the
  // committed baselines must still match with zero pixel diff.
  await page.goto("/design-foundation");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tokens and primitives",
  );

  // The approved viewport is part of the baseline name, so mobile 390x844 and
  // desktop 1440x1000 never collide.
  await expect(page).toHaveScreenshot(`fixture-${testInfo.project.name}.png`, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
  });
});
