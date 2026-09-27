import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility evidence for the deterministic reference route.
 *
 * The suite stays green at rest: the injected-violation test proves the
 * scanner detects a known violation and that the clean scan afterwards finds
 * nothing. The injected node is removed inside the same test, so no failing
 * assertion or broken state is ever committed.
 */

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

const INJECTED_ID = "arj-10-injected-a11y-violation";

/** Static public routes shipped so far, scanned at both viewports. */
const PUBLIC_ROUTES = [
  "/",
  "/auth",
  "/auth?intent=wishlist",
  "/auth?intent=create-group",
  "/auth/verify",
  "/auth/verify?state=error",
  "/auth/verify?state=expired",
  "/auth/confirm?state=loading",
  "/auth/confirm?state=valid",
  "/auth/confirm?state=expired",
  "/onboarding",
  "/onboarding?state=validation",
  "/design-foundation",
] as const;

test("every static public route has no WCAG A/AA violations at both viewports", async ({
  page,
}) => {
  // Test-only accommodation: reduced motion pins the landing's one-shot
  // entrance animation to 0.01ms so axe scans the settled layout instead of
  // racing mid-fade elements (whose blended colours are not the rendered
  // design). The end state with `fill: both` is identical to the resting
  // layout.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();
    expect(results.violations, `axe violations on ${route}`).toEqual([]);
  }
});

test("axe detects an injected violation and clears after it is removed", async ({
  page,
}) => {
  await page.goto("/design-foundation");

  // Inject a known WCAG violation: an image without an alt attribute inside
  // the page's main landmark.
  await page.evaluate((id: string) => {
    const img = document.createElement("img");
    img.id = id;
    img.src =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    document.querySelector("main")?.appendChild(img);
  }, INJECTED_ID);

  // Axe classifies an image that has not finished decoding as "incomplete"
  // instead of a violation, which raced the scan on slower viewport runs.
  await page.evaluate(
    (id: string) =>
      new Promise<void>((resolve) => {
        const img = document.getElementById(id) as HTMLImageElement | null;
        if (!img || img.complete) {
          resolve();
          return;
        }
        img.addEventListener("load", () => resolve(), { once: true });
      }),
    INJECTED_ID,
  );

  const withViolation = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  const violationIds = withViolation.violations.map(
    (violation) => violation.id,
  );
  expect(violationIds).toContain("image-alt");

  // Removing the violation must return the page to a clean scan.
  await page.evaluate((id: string) => {
    document.getElementById(id)?.remove();
  }, INJECTED_ID);

  const clean = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();
  expect(clean.violations).toEqual([]);
});
