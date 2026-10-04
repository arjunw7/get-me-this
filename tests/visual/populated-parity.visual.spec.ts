import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mailpitLogin } from "../helpers/mailpit-signin";

/** Opt-in, read-only capture of the separately seeded LOCAL V18 comparison account.
 * Never adopts baselines, creates rows, or signs into a production account.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE || !process.env.E2E_PARITY_FIXTURE_MANIFEST,
  "requires dedicated local comparison fixture",
);
test("populated V18 fixture across Home, rooms and gifting modes", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const fixture = JSON.parse(
    readFileSync(process.env.E2E_PARITY_FIXTURE_MANIFEST!, "utf8"),
  ) as { emails: { aanya: string }; groups: Record<string, string> };
  if (
    ![
      "parity-audit-20261004@example.com",
      "parity-proof-20261004@example.com",
    ].includes(fixture.emails.aanya) ||
    Object.values(fixture.groups).some((id) => !/^[\da-f-]{36}$/.test(id))
  )
    throw new Error("unexpected comparison fixture");
  await mailpitLogin(page, fixture.emails.aanya);
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  const capture = async (name: string) => {
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.evaluate(() => document.fonts.ready);
    // Full-page evidence must also load native-lazy images below the viewport.
    // Change loading policy only; keep real URLs, dimensions and product content.
    const imageFailures = await page
      .locator("img")
      .evaluateAll(async (images) => {
        const outcomes = await Promise.all(
          images.map((element) => {
            const image = element as HTMLImageElement;
            return new Promise<{ title: string; status: string } | null>(
              (resolve) => {
                const finish = (status: "loaded" | "failed" | "timed out") => {
                  clearTimeout(timer);
                  image.removeEventListener("load", loaded);
                  image.removeEventListener("error", failed);
                  resolve(
                    status === "loaded" ? null : { title: image.alt, status },
                  );
                };
                const loaded = () =>
                  finish(image.naturalWidth > 0 ? "loaded" : "failed");
                const failed = () => finish("failed");
                const timer = setTimeout(() => finish("timed out"), 15_000);
                image.addEventListener("load", loaded, { once: true });
                image.addEventListener("error", failed, { once: true });
                image.loading = "eager";
                if (image.complete) loaded();
              },
            );
          }),
        );
        return outcomes.filter((result) => result !== null);
      });
    expect(
      imageFailures,
      `${name}: product images must load before capture`,
    ).toEqual([]);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect.soft(scan.violations, `${name} accessibility`).toEqual([]);
    await info.attach(`${name}-${info.project.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  };
  await expect(
    page.getByRole("heading", { name: "You got Kabir." }),
  ).toBeVisible();
  await capture("home-active-v18");
  await page
    .getByRole("button", { name: "Account", exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByTestId("account-menu-content").filter({ visible: true }),
  ).toBeVisible();
  await capture("account-menu-home-v18");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("account-menu-content")).toHaveCount(0);
  await page.goto("/groups");
  await capture("groups-index-v18");
  for (const mode of ["secret", "everyone", "browse"]) {
    const id = fixture.groups[mode];
    await page.goto(`/groups/${id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Santa Party 🎉" }),
    ).toBeVisible();
    await expect(
      page.getByText("Matte black gooseneck kettle", { exact: true }).first(),
    ).toBeVisible();
    await capture(`group-${mode}-v18`);
    if (mode === "secret") {
      const ownItems = page.getByRole("list", {
        name: "Your items",
        exact: true,
      });
      await ownItems.focus();
      await expect(ownItems).toBeFocused();
      await ownItems.press("ArrowRight");
      await expect
        .poll(() => ownItems.evaluate((rail) => rail.scrollLeft))
        .toBeGreaterThan(0);
    }
    await page.goto(`/groups/${id}/gifting`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await capture(`gifting-${mode}-v18`);
  }
  await page.goto("/wishlist");
  await capture("wishlist-loaded-v18");
  await page
    .getByRole("button", { name: "Account", exact: true })
    .filter({ visible: true })
    .click();
  const accountMenu = page
    .getByTestId("account-menu-content")
    .filter({ visible: true });
  await expect(accountMenu).toBeVisible();
  await capture("account-menu-v18");
  await accountMenu
    .getByRole("button", { name: "Edit profile", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit your profile" }),
  ).toBeVisible();
  await capture("profile-editor-v18");
  await page.getByRole("button", { name: "Close edit profile" }).click();
});
