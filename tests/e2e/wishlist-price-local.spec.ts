import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createSignedInFixture,
  fixtureWishlistId,
  FixtureScope,
  seedWishlistItems,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated price-presentation proof (005g, dormant conversion) against
 * the LOCAL Supabase stack: the original price always displays, a
 * fixture-seeded complete converted tuple renders the full approximate
 * treatment (reachable today only through reviewed fixtures — no
 * production writer exists), a stale tuple shows its older captured date,
 * and the wishlist read path makes zero outbound requests to any
 * non-first-party host (no provider, no rate network call, page network
 * instrumentation).
 *
 * The browser locale is a non-INR language on purpose: conversion is
 * never inferred from locale, browser language, or currency symbol, so
 * the rendered prices are identical to any other viewer's.
 */
test.use({ locale: "de-DE" });

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

type SeededPrices = {
  originalOnlyTitle: string;
  approximateTitle: string;
  staleTitle: string;
  unsupportedTitle: string;
  approximateText: string;
  approximateAccessible: string;
  staleText: string;
};

async function seedPriceFixtures(
  page: import("@playwright/test").Page,
  admin: ReturnType<typeof stackAdminClient>,
  scope: FixtureScope,
): Promise<SeededPrices> {
  const userId = await createSignedInFixture(
    page,
    admin,
    "arj32-prices",
    { displayName: "Ada", tasteLine: "small thoughtful things" },
    scope,
  );
  // Sanity-check the seeded wishlist exists before inserting items.
  await fixtureWishlistId(admin, userId);

  const freshRateAt = new Date().toISOString();
  const staleRateAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const freshDate = freshRateAt.slice(0, 10);
  const staleDate = staleRateAt.slice(0, 10);

  const originalOnlyTitle = "Fixture enamel mug";
  const approximateTitle = "Fixture pour-over set";
  const staleTitle = "Fixture desk lamp";
  const unsupportedTitle = "Fixture figurine";

  await seedWishlistItems(admin, userId, [
    {
      id: randomUUID(),
      title: originalOnlyTitle,
      retailer: "Fixture Roasters",
      desire_level: "really_want",
      sort_position: 1,
      original_amount_minor: "249900",
      original_currency: "INR",
    },
    {
      id: randomUUID(),
      title: approximateTitle,
      retailer: "Fixture Kitchen",
      desire_level: "would_love",
      sort_position: 2,
      original_amount_minor: "2499",
      original_currency: "INR",
      converted_amount_minor: "2999",
      converted_currency: "USD",
      conversion_rate_source: "fixture-provider quote fx-1",
      conversion_rate_at: freshRateAt,
    },
    {
      id: randomUUID(),
      title: staleTitle,
      retailer: "Fixture Lights",
      desire_level: "would_love",
      sort_position: 3,
      original_amount_minor: "132000",
      original_currency: "JPY",
      converted_amount_minor: "8900",
      converted_currency: "USD",
      conversion_rate_source: "fixture-provider quote fx-stale",
      conversion_rate_at: staleRateAt,
    },
    {
      id: randomUUID(),
      title: unsupportedTitle,
      retailer: "Fixture Objects",
      desire_level: "just_an_idea",
      sort_position: 4,
      original_amount_minor: "4200",
      original_currency: "INR",
      converted_amount_minor: "5500",
      converted_currency: "XYZ",
      conversion_rate_source: "fixture-provider quote fx-xyz",
      conversion_rate_at: freshRateAt,
    },
  ]);

  return {
    originalOnlyTitle,
    approximateTitle,
    staleTitle,
    unsupportedTitle,
    approximateText: `≈ 29.99 USD · fixture-provider quote fx-1 · captured ${freshDate}`,
    approximateAccessible: `Approximately 29.99 USD — rate source fixture-provider quote fx-1, captured ${freshDate}.`,
    staleText: `≈ 89.00 USD · fixture-provider quote fx-stale · captured ${staleDate}`,
  };
}

test("the dormant default shows the original price with no conversion placeholder", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const seeded = await seedPriceFixtures(page, admin, scope);

    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(
      page.getByRole("heading", { name: seeded.originalOnlyTitle }),
    ).toBeVisible();

    const card = page
      .getByRole("article")
      .filter({ hasText: seeded.originalOnlyTitle });
    await expect(card.getByText("2499.00 INR")).toBeVisible();
    // Conversion unavailable is a normal state: no approximate line, no
    // placeholder, no skeleton, no error — and no invented conversion from
    // the de-DE browser locale.
    await expect(card.getByTestId("approximate-price-line")).toHaveCount(0);
    await expect(card.getByText(/approximately/i)).toHaveCount(0);
    await expect(card.getByText(/≈/)).toHaveCount(0);

    await page.screenshot({
      path: `test-results/arj32-candidates/arj32-price-original-only-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
});

test("a fixture-seeded tuple renders the approximate treatment; stale and unsupported degrade per contract", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const seeded = await seedPriceFixtures(page, admin, scope);

    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(page.getByRole("article")).toHaveCount(4);

    // The approximate line sits below the original, which stays visible.
    const approximateCard = page
      .getByRole("article")
      .filter({ hasText: seeded.approximateTitle });
    await expect(approximateCard.getByText("24.99 INR")).toBeVisible();
    await expect(
      approximateCard.getByTestId("approximate-price-line"),
    ).toContainText(seeded.approximateText);
    // The accessible text carries "approximately", the amount and code,
    // the rate source, and the captured UTC date.
    await expect(
      approximateCard.getByText(seeded.approximateAccessible),
    ).toBeAttached();

    // A stale tuple renders the same line with its older captured date;
    // staleness is never silently hidden and never blocks the item.
    const staleCard = page
      .getByRole("article")
      .filter({ hasText: seeded.staleTitle });
    await expect(staleCard.getByText("1320.00 JPY")).toBeVisible();
    await expect(staleCard.getByTestId("approximate-price-line")).toContainText(
      seeded.staleText,
    );

    // An unsupported converted code omits the approximate line and shows
    // the original — never an invented format or value.
    const unsupportedCard = page
      .getByRole("article")
      .filter({ hasText: seeded.unsupportedTitle });
    await expect(unsupportedCard.getByText("42.00 INR")).toBeVisible();
    await expect(
      unsupportedCard.getByTestId("approximate-price-line"),
    ).toHaveCount(0);

    await page.screenshot({
      path: `test-results/arj32-candidates/arj32-price-approximate-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
});

test("the wishlist read path makes zero outbound requests to non-first-party hosts", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const seeded = await seedPriceFixtures(page, admin, scope);

    const nonFirstParty: string[] = [];
    page.on("request", (request) => {
      const host = new URL(request.url()).hostname;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
        nonFirstParty.push(request.url());
      }
    });

    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(
      page.getByRole("heading", { name: seeded.approximateTitle }),
    ).toBeVisible();
    // Settle the network: the approximate content has rendered and no
    // provider, rate, or third-party host was ever contacted.
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: seeded.approximateTitle })
        .getByTestId("approximate-price-line"),
    ).toContainText(seeded.approximateText);
    await page.waitForLoadState("networkidle");

    expect(nonFirstParty).toEqual([]);
  });
});
