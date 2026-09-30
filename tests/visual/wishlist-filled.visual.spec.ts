import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  FixtureScope,
  createSignedInFixture,
  seedWishlistItems,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Visual candidate capture for the wishlist POPULATED state (005b),
 * compared against the pinned V18 `wishlist-filled` references
 * (docs/design-reference/baselines/v18/wishlist-filled--{mobile,desktop})
 * at the two approved viewports — a design comparison (structure, layout
 * hierarchy, card design, typography, accent usage), not exact product
 * pixels.
 *
 * Accepted differences documented for owner review (brief resolutions 1,
 * 3, and 4): no Share button, no groups line, no theme colour, no
 * reaction summaries, no Reorder toolbar, no privacy line, no populated-
 * state "Add an item" toolbar link, the initials disc instead of an
 * avatar image; the money format is the pinned code-suffixed minor-unit
 * display ("2499.00 INR") — the V18 reference shows symbol formatting and
 * an approximate conversion that this slice deliberately does not render.
 * Item images come only from the app's own vendored assets (or the
 * branded placeholder): no external hosts, no mock data shipped.
 *
 * Stack-gated: the signed-in owner session is established through the
 * real surface against the local Supabase stack (CI database job), and
 * the four item fixtures are deterministic local-stack inserts, deleted
 * with the fixture user in teardown. Item ids are per-run random UUIDs
 * (parallel projects each seed their own fixture wishlist, and the table's
 * primary key is globally unique); the visual order is pinned by distinct
 * sort_position, never by ids.
 */

/** The reachable vendored asset (served by the app under test itself). */
const IMAGE_KETTLE = "http://127.0.0.1:3100/assets/landing/k-kettle.jpg";
const IMAGE_CUPS = "http://127.0.0.1:3100/assets/landing/r-cups.jpg";

test("the signed-in populated wishlist matches the pinned V18 filled composition", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.E2E_LOCAL_SUPABASE,
    "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
  );

  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "wishlist-visual-filled",
      {
        displayName: "Ada",
        tasteLine: "currently in my tiny-luxuries era",
      },
      scope,
    );
    await seedWishlistItems(admin, userId, [
      {
        id: randomUUID(),
        title: "Ceramic pour-over coffee set",
        source_url: "https://example.invalid/products/pour-over-set",
        retailer: "Fixture Roasters",
        note: "The matte one, not the glossy one.",
        desire_level: "really_want",
        sort_position: 1,
        original_amount_minor: "249900",
        original_currency: "INR",
        image_url: IMAGE_KETTLE,
      },
      {
        id: randomUUID(),
        title: "The Overstory paperback",
        source_url: null,
        retailer: "Fixture Books",
        note: null,
        desire_level: "would_love",
        sort_position: 2,
        original_amount_minor: "132000",
        original_currency: "JPY",
      },
      {
        id: randomUUID(),
        title: "Mechanical keyboard keycaps",
        source_url: null,
        retailer: null,
        note: "Just an idea for now, no link yet.",
        desire_level: "just_an_idea",
        sort_position: 3,
      },
      {
        id: randomUUID(),
        title: "Matcha whisk and bowl",
        source_url: "https://example.invalid/products/matcha-set",
        retailer: "Fixture Kitchen",
        note: null,
        desire_level: "would_love",
        sort_position: 4,
        original_amount_minor: "420000",
        original_currency: "INR",
        image_url: IMAGE_CUPS,
      },
    ]);

    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);

    // Guard: the intended state rendered before capture.
    await expect(page.getByRole("heading", { name: "Ada" })).toBeVisible();
    await expect(page.getByText("4 things")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(4);

    await expect(page).toHaveScreenshot(
      `wishlist-filled-${testInfo.project.name}.png`,
      {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      },
    );
  });
});
