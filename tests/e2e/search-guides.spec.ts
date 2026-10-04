import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const guides = [
  {
    path: "/birthday-wishlist",
    title: "Birthday wishlist: share your gift ideas | Get Me This",
    heading: "A birthday wishlist your friends can actually use.",
    cta: "Create my birthday wishlist",
    intent: "wishlist",
  },
  {
    path: "/wishlist-from-different-stores",
    title: "Make a wishlist from different stores | Get Me This",
    heading: "Different shops. One wishlist.",
    cta: "Create my wishlist",
    intent: "wishlist",
  },
  {
    path: "/secret-santa",
    title: "Secret Santa with wishlists | Get Me This",
    heading: "Secret Santa, with gifts they’d actually love.",
    cta: "Start a Secret Santa group",
    intent: "create-group",
  },
] as const;

test("all guides have visible crawlable homepage links", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Helpful guides." });
  await section.scrollIntoViewIfNeeded();
  for (const path of ["/how-it-works", ...guides.map((guide) => guide.path)]) {
    const link = section.locator(`a[href="${path}"]`);
    await expect(link).toBeVisible();
    expect(
      await link.evaluate((element) => element.closest("details")),
    ).toBeNull();
  }
  await section.locator('a[href="/birthday-wishlist"]').click();
  await expect(page).toHaveURL(/\/birthday-wishlist$/);
});

for (const guide of guides) {
  test(`${guide.path} is readable without JavaScript with canonical and structured identity`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL,
      viewport: testInfo.project.use.viewport,
    });
    const page = await context.newPage();
    const response = await page.goto(
      `${baseURL}${guide.path}?utm_source=chatgpt.com`,
    );
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(guide.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      guide.heading,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://getmethis.fun${guide.path}`,
    );
    const raw = await page.request.get(guide.path, {
      headers: { "User-Agent": "OAI-SearchBot" },
    });
    expect(raw.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const html = await raw.text();
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain(guide.heading);
    await context.close();
  });

  test(`${guide.path} preserves CTA intent and supports keyboard answers`, async ({
    page,
  }) => {
    await page.goto(guide.path);
    const question = page.locator("summary").first();
    await question.focus();
    await question.press("Enter");
    await expect(page.locator("details").first()).toHaveAttribute("open", "");
    await question.press("Enter");
    await expect(page.locator("details").first()).not.toHaveAttribute(
      "open",
      "",
    );
    await page
      .getByRole("link", { name: guide.cta, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`\\?intent=${guide.intent}$`));
    await expect(
      page.getByRole("heading", { name: "Welcome to Get Me This." }),
    ).toBeVisible();
  });

  test(`${guide.path} has accessible layout and links to other guides`, async ({
    page,
  }) => {
    await page.goto(guide.path);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const related = page.getByRole("region", { name: "Keep exploring." });
    await expect(related.locator("a")).toHaveCount(3);
    await expect(related.locator(`a[href="${guide.path}"]`)).toHaveCount(0);
    for (const link of await page
      .locator('header a, nav[aria-label="Breadcrumb"] a, footer a')
      .all()) {
      const box = await link.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
