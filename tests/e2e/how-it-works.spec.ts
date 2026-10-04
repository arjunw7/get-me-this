import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the guide can be read without JavaScript and has its own canonical identity", async ({
  browser,
  baseURL,
}, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto(`${baseURL}/how-it-works?utm_source=chatgpt.com`);
  await expect(page).toHaveTitle(
    "How Get Me This works: wishlists and private gift groups",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Make a wishlist. Share it with your people.",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://getmethis.fun/how-it-works",
  );
  await expect(
    page.getByText("Reservations apply within that group;", { exact: false }),
  ).toBeVisible();
  const response = await page.request.get("/how-it-works");
  expect(await response.text()).toContain('"@type":"BreadcrumbList"');
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await context.close();
});

test("visitors can reach the guide from the homepage and open its answers with the keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByText("Do I need a group to use my wishlist?", { exact: true })
    .click();
  await page
    .getByRole("link", { name: "Read the wishlist and group guide" })
    .click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  const question = page.getByText("Do my friends need an account?", {
    exact: true,
  });
  await question.focus();
  await question.press("Enter");
  await expect(
    page.getByText("They can view your public wishlist without signing in.", {
      exact: false,
    }),
  ).toBeVisible();
  await question.press("Enter");
  await expect(
    page.getByText("They can view your public wishlist without signing in.", {
      exact: false,
    }),
  ).toBeHidden();
});

for (const [label, intent] of [
  ["Create my wishlist", "wishlist"],
  ["Create a group", "create-group"],
]) {
  test(`${label} preserves its authentication intent`, async ({ page }) => {
    await page.goto("/how-it-works");
    await page.getByRole("link", { name: label }).first().click();
    await expect(page).toHaveURL(new RegExp(`\\?intent=${intent}$`));
    await expect(
      page.getByRole("heading", { name: "Welcome to Get Me This." }),
    ).toBeVisible();
  });
}

test("the guide has no horizontal overflow or axe violations", async ({
  page,
}) => {
  await page.goto("/how-it-works");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const homeLinks = page.getByRole("link", { name: "Get Me This home" });
  for (const link of await homeLinks.all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  const breadcrumb = await page
    .getByRole("link", { name: "Home", exact: true })
    .boundingBox();
  expect(breadcrumb?.height).toBeGreaterThanOrEqual(44);
  expect(breadcrumb?.width).toBeGreaterThanOrEqual(44);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
