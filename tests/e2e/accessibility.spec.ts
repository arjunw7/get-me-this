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

test("clean fixture has no WCAG A/AA violations at both viewports", async ({
  page,
}) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_TAGS])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("axe detects an injected violation and clears after it is removed", async ({
  page,
}) => {
  await page.goto("/");

  // Inject a known WCAG violation: an image without an alt attribute inside
  // the page's main landmark.
  await page.evaluate((id: string) => {
    const img = document.createElement("img");
    img.id = id;
    img.src =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    document.querySelector("main")?.appendChild(img);
  }, INJECTED_ID);

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
