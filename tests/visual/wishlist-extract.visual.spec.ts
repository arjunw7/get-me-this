import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CANDIDATE_DIR = join(process.cwd(), "test-results", "arj31-candidates");

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

/**
 * The 005f visual candidate suite. Candidate captures (never baselines —
 * no baseline commit precedes the independent product/design approval
 * pinned by the brief) for every reviewed extraction-flow state at the two
 * approved viewports, with axe and 44px-target scans per state. Extraction
 * responses are intercepted — no real outbound egress.
 */

const COMPLETE_RESULT = {
  sourceUrl: "https://shop.example/product/lamp",
  title: "Mushroom ceramic table lamp",
  retailer: "Etsy",
  originalAmountMinor: "6400",
  originalCurrency: "USD",
  candidateImageUrls: [
    "https://img.example/lamp-1.webp",
    "https://img.example/lamp-2.webp",
  ],
};

test("the extraction-review states yield matched responsive candidates and clean axe scans", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  mkdirSync(CANDIDATE_DIR, { recursive: true });
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const viewport = testInfo.project.name;
  const axeStates: Array<{ state: string; violationIds: string[] }> = [];
  const capture = async (state: string) => {
    const addItem = page.getByRole("button", { name: "Add item", exact: true });
    if (viewport === "mobile" && (await addItem.count()) > 0) {
      const actionBar = await addItem.evaluate((button) => ({
        bottom: button.parentElement!.getBoundingClientRect().bottom,
        viewport: innerHeight,
      }));
      expect(actionBar.bottom).toBeCloseTo(actionBar.viewport, 0);
    }
    const file = `arj31-${state}-${viewport}.png`;
    await page.screenshot({
      path: join(CANDIDATE_DIR, file),
      fullPage: true,
      animations: "disabled",
    });
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    axeStates.push({
      state,
      violationIds: axe.violations.map((violation) => violation.id),
    });
    expect(axe.violations.map(({ id, impact }) => ({ id, impact }))).toEqual(
      [],
    );
    const undersized = await page
      .locator(
        "button:visible, a[href]:visible, input:not([type=radio]):visible, select:visible, textarea:visible",
      )
      .evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            tag: node.tagName,
            height: Math.round(node.getBoundingClientRect().height),
          }))
          .filter((node) => node.height < 44),
      );
    expect(undersized).toEqual([]);
    const radioLabels = await page
      .locator('label:has(input[type="radio"]):visible')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => Math.round(node.getBoundingClientRect().height))
          .filter((height) => height < 44),
      );
    expect(radioLabels).toEqual([]);
  };

  try {
    await createSignedInFixture(
      page,
      admin,
      "arj31-visual",
      { displayName: "Ada", tasteLine: "currently in my tiny-luxuries era" },
      scope,
    );

    // Test-only approved V18 lamp image: real product photography rather
    // than failed remote thumbnails. No design fixtures enter production.
    await page.route("https://img.example/lamp-*.webp", (route) =>
      route.fulfill({
        contentType: "image/jpeg",
        path: join(
          process.cwd(),
          "tests/fixtures/design-reference/add-lamp.jpg",
        ),
      }),
    );

    // A mutable extract fixture with a hold phase for the loading capture.
    // The hold is released before the client's 12-second bound so no later
    // state is ever raced by an expiry.
    let holdRequests = true;
    let currentFixture: { status: number; body: unknown } = {
      status: 200,
      body: { result: COMPLETE_RESULT },
    };
    // The resolver lives in a holder object so TypeScript's control flow
    // cannot narrow it to undefined after the executor callback.
    const hold: { release: () => void } = { release: () => {} };
    const held = new Promise<void>((resolve) => {
      hold.release = resolve;
    });
    await page.route("**/wishlist/items/extract", async (route) => {
      if (holdRequests) await held;
      await route.fulfill({
        status: currentFixture.status,
        contentType: "application/json",
        body: JSON.stringify(currentFixture.body),
      });
    });
    const setFixture = (status: number, body: unknown) => {
      currentFixture = { status, body };
    };

    // Initial URL entry, empty.
    await page.goto("/wishlist/items/new");
    await expect(
      page.getByRole("heading", {
        name: "Drop the link. We’ll do the nosy part.",
      }),
    ).toBeVisible();
    await capture("add-initial");

    // Initial URL entry, prefilled: the ?url= route parameter seeds the
    // field AND auto-starts extraction (the approved state machine), so
    // the prefilled input composition is reached by typing into the field.
    await page.goto("/wishlist/items/new");
    await expect(
      page.getByRole("heading", {
        name: "Drop the link. We’ll do the nosy part.",
      }),
    ).toBeVisible();
    await page
      .getByLabel("Product link")
      .fill("https://shop.example/product/lamp");
    await expect(page.getByLabel("Product link")).toHaveValue(
      "https://shop.example/product/lamp",
    );
    await capture("add-initial-prefilled");

    // Extracting: the intercept holds the request open so the bounded
    // loading composition is stable for capture.
    await page.getByRole("button", { name: "Fetch details" }).click();
    await expect(page.getByText("Being nosy…")).toBeVisible();
    await expect(page.getByText("Reading shop.example")).toBeVisible();
    await capture("add-loading");
    holdRequests = false;
    hold.release();

    // Extracted review with the complete fixture.
    await expect(
      page.getByRole("heading", { name: "Found it. Look right?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Selected product photo" }),
    ).toBeVisible();
    await page
      .getByRole("img", { name: "Selected product photo" })
      .evaluate(async (image: HTMLImageElement) => {
        await image.decode();
      });
    await capture("add-extracted-review");

    // Validation-error state with retained values.
    await page.getByLabel("Item name").fill("");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("Enter a title.")).toBeVisible();
    await capture("add-validation");

    // Partial-extraction review.
    setFixture(200, {
      result: {
        sourceUrl: "https://shop.example/product/lamp",
        title: "Mushroom ceramic table lamp",
        candidateImageUrls: [],
      },
    });
    await page.getByRole("button", { name: "Start over" }).click();
    await page
      .getByLabel("Product link")
      .fill("https://shop.example/product/lamp");
    await page.getByRole("button", { name: "Fetch details" }).click();
    await expect(
      page.getByRole("heading", { name: "Found it. Look right?" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Some details couldn’t be read. Fill in anything missing below.",
      ),
    ).toBeVisible();
    await capture("add-partial-review");

    // Failed-extraction manual fallback with the preserved URL.
    setFixture(422, {
      error: { code: "unavailable", message: "Generic safe copy." },
    });
    await page.getByRole("button", { name: "Start over" }).click();
    await page
      .getByLabel("Product link")
      .fill("https://shop.example/product/lamp");
    await page.getByRole("button", { name: "Fetch details" }).click();
    await expect(
      page.getByRole("heading", { name: "That link played hard to get." }),
    ).toBeVisible();
    await capture("add-manual-fallback");

    // Success notice on the underlying list.
    await page.getByLabel("Item name").fill("ARJ-31 candidate lamp");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    await expect(
      page.getByRole("status").getByText("Item added to your wishlist."),
    ).toBeVisible();
    await capture("wishlist-added-notice");

    expect(axeStates.length).toBeGreaterThanOrEqual(7);
    writeFileSync(
      join(CANDIDATE_DIR, `axe-${viewport}.json`),
      `${JSON.stringify({ viewport, states: axeStates }, null, 2)}\n`,
      { mode: 0o600 },
    );
  } finally {
    await scope.cleanup();
  }
});
