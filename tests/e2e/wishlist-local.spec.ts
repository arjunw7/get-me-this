import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
  fixtureWishlistId,
  seedWishlistItems,
  signInFixtureUser,
  stackAdminClient,
  type ItemFixture,
} from "../helpers/local-stack";

/**
 * Stack-gated wishlist proof (005b), against the LOCAL Supabase stack the
 * CI database job starts (run through scripts/e2e-local-stack.sh; a plain
 * `pnpm test:e2e` run skips this file — there is no stack to talk to).
 *
 * Covered here, on top of the plain tests/e2e/wishlist.spec.ts: the full
 * proxy envelope (302, no-store, no-referrer), the non-cacheable signed-in
 * document, the V18 empty composition and its CTA navigation, the
 * populated snapshot fields in the pinned read order, the branded
 * missing-image placeholder including the runtime-failure fallback,
 * persistence across reload and a same-browser new tab, cross-user
 * denial, stale-session recovery, keyboard operability with axe, and the
 * unknown-child-path not-found consequence.
 *
 * Fixtures: every test creates its own synthetic user through the real
 * signup path and deletes it in teardown. Item fixtures are inserted
 * through the service-role client (setup only — the app itself reads
 * strictly under RLS) and removed with the user.
 */

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

/** The deterministic profile every fixture user completes onboarding with. */
const PROFILE = {
  displayName: "Ada",
  tasteLine: "currently in my tiny-luxuries era",
};

/**
 * The image URLs for the populated fixtures. The reachable one is served
 * by the app under test itself (the pinned :3100 e2e origin), so no
 * external host is involved; the unreachable one fails at runtime.
 */
const REACHABLE_IMAGE = "http://127.0.0.1:3100/assets/landing/k-kettle.jpg";
const UNREACHABLE_IMAGE = "http://127.0.0.1:59999/broken.jpg";

/** The seeded items for the populated state, in fixture sort order.
 *  Item ids are per-run random UUIDs: parallel projects each seed their own
 *  fixture wishlist, and wishlist_items' primary key is globally unique
 *  (the fixed-UUID convention is reserved for the single-user seed.sql).
 *  Read order is pinned by distinct sort_position, never by the ids. */
function populatedFixtures(): ItemFixture[] {
  return [
    {
      id: randomUUID(),
      title: "Ceramic pour-over coffee set",
      source_url: "https://example.invalid/products/pour-over-set",
      retailer: "Fixture Roasters",
      note: "The matte one, not the glossy one.",
      desire_level: "really_want",
      sort_position: 1,
      original_amount_minor: 249900,
      original_currency: "INR",
      image_url: REACHABLE_IMAGE,
    },
    {
      id: randomUUID(),
      title: "The Overstory paperback",
      source_url: null,
      retailer: "Fixture Books",
      note: null,
      desire_level: "would_love",
      sort_position: 2,
      original_amount_minor: 132000,
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
      title: "Film for the half-frame camera",
      source_url: "https://example.invalid/products/film",
      retailer: "Fixture Photo",
      note: null,
      desire_level: "would_love",
      sort_position: 4,
      original_amount_minor: 120000,
      original_currency: "INR",
      image_url: UNREACHABLE_IMAGE,
    },
  ];
}

/** Creates a signed-in fixture user on the page and returns its ids. */
async function signedInFixture(
  page: Page,
): Promise<{ admin: ReturnType<typeof stackAdminClient>; userId: string }> {
  const admin = stackAdminClient();
  const email = fixtureEmail("wishlist-e2e");
  const userId = await createFixtureUser(admin, email);
  await signInFixtureUser(page, admin, email, PROFILE);
  return { admin, userId };
}

test("the signed-out proxy envelope for the wishlist routes is 302 with no-store and no-referrer", async ({
  request,
}) => {
  for (const path of ["/wishlist", "/wishlist/items/new"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(302);
    expect(response.headers()["location"], path).toMatch(/\/auth$/);
    expect(response.headers()["cache-control"], path).toContain("no-store");
    expect(response.headers()["referrer-policy"], path).toBe("no-referrer");
  }
});

test("a signed-out POST to /wishlist is redirected by the proxy, never executed", async ({
  request,
}) => {
  // With the provider configured, the proxy layer (not just the page gate)
  // intercepts: a plain POST and a Server-Action-shaped POST are both
  // redirected before any page or action runs.
  for (const path of ["/wishlist", "/wishlist/items/new"]) {
    const response = await request.post(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(302);
    expect(response.headers()["location"], path).toMatch(/\/auth$/);
  }
});

test("the signed-in rendered /wishlist document is non-cacheable", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    const response = await page.goto("/wishlist");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});

test("a fresh owner with zero items sees the V18 empty composition and its CTA navigates honestly", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);

    // The pinned empty-state copy and the exact CTA label (resolution 1:
    // "Add an item", the approved vocabulary — a documented divergence from
    // the V18 prototype's "Add from a link").
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    await expect(
      page.getByText(/Add the first thing you’d secretly love to unwrap/),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: "Add an item" });
    await expect(cta).toBeVisible();

    // No fake items, no loading residue, no public-visibility language.
    await expect(page.getByRole("article")).toHaveCount(0);
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const phrase of ["share", "visible to", "group"]) {
      expect(body, `empty state says "${phrase}"`).not.toContain(phrase);
    }

    // The profile header: display name, taste line, "0 things".
    await expect(page.getByRole("heading", { name: "Ada" })).toBeVisible();
    await expect(
      page.getByText("currently in my tiny-luxuries era"),
    ).toBeVisible();
    await expect(page.getByText("0 things")).toBeVisible();

    // The CTA navigates to the designed interim add state — never a 404.
    await cta.click();
    await expect(page).toHaveURL(/\/wishlist\/items\/new$/);
    await expect(
      page.getByRole("heading", { name: "Add an item" }),
    ).toBeVisible();
    await expect(
      page.getByText(/adding items will live|arriving with the next update/i),
    ).toBeVisible();
    await expect(page.getByText("Page not found")).toHaveCount(0);

    // And a visible way back.
    await page.getByRole("link", { name: "Back to your wishlist" }).click();
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});

test("the populated view renders every snapshot field in the pinned read order, with the branded placeholder and runtime fallback", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    await seedWishlistItems(admin, userId, populatedFixtures());

    await page.goto("/wishlist");
    await expect(page.getByRole("heading", { name: "Ada" })).toBeVisible();
    await expect(page.getByText("4 things")).toBeVisible();

    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(4);
    const titles = await cards
      .all()
      .then((all) =>
        Promise.all(all.map((card) => card.getByRole("heading").textContent())),
      );
    // Pinned read order: sort_position ASC, id ASC.
    expect(titles).toEqual([
      "Ceramic pour-over coffee set",
      "The Overstory paperback",
      "Mechanical keyboard keycaps",
      "Film for the half-frame camera",
    ]);

    const first = cards.nth(0);
    // Retailer linked when a source URL exists (owner-only surface,
    // noreferrer), with the pinned minor-unit money format.
    const retailer = first.getByRole("link", { name: "Fixture Roasters" });
    await expect(retailer).toHaveAttribute(
      "href",
      "https://example.invalid/products/pour-over-set",
    );
    await expect(retailer).toHaveAttribute("rel", "noreferrer");
    await expect(first.getByText("2499.00 INR")).toBeVisible();
    await expect(
      first.getByText("The matte one, not the glossy one."),
    ).toBeVisible();
    await expect(first.getByText("Really want")).toBeVisible();
    // The reachable image renders (never the placeholder).
    await expect(
      first.getByRole("img", { name: "Ceramic pour-over" }),
    ).toBeVisible();

    const second = cards.nth(1);
    // Unlinked retailer (no source URL) stays plain text; the zero-decimal
    // JPY item renders without fractional digits.
    await expect(second.getByText("Fixture Books")).toBeVisible();
    await expect(
      second.getByRole("link", { name: "Fixture Books" }),
    ).toHaveCount(0);
    await expect(second.getByText("132000 JPY")).toBeVisible();
    await expect(second.getByText("Would love")).toBeVisible();

    const third = cards.nth(2);
    // No price, no retailer: no money text at all, note present.
    await expect(third.getByText(/INR|JPY/)).toHaveCount(0);
    await expect(
      third.getByText("Just an idea for now, no link yet."),
    ).toBeVisible();
    await expect(third.getByText("Just an idea")).toBeVisible();

    // The unreachable image degrades to the branded placeholder — never a
    // broken-image icon or blank gap.
    const fourth = cards.nth(3);
    await expect(
      fourth.getByTestId("wishlist-image-placeholder"),
    ).toBeVisible();
    await expect(
      fourth.getByTestId("wishlist-image-placeholder"),
    ).toContainText("Film for the half-frame camera");
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});

test("populated items persist across a full reload and a same-browser new tab", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    await seedWishlistItems(admin, userId, populatedFixtures());

    const assertPopulated = async (surface: Page) => {
      await expect(surface.getByRole("article")).toHaveCount(4);
      await expect(
        surface.getByRole("heading", { name: "Ceramic pour-over coffee set" }),
      ).toBeVisible();
      await expect(surface.getByText("2499.00 INR")).toBeVisible();
    };

    await page.goto("/wishlist");
    await assertPopulated(page);

    // A full reload is a server round-trip, not client cache.
    await page.reload();
    await assertPopulated(page);

    // A new tab in the same browser context: same session, same items,
    // no re-authentication friction.
    const secondTab = await page.context().newPage();
    await secondTab.goto("/wishlist");
    await expect(secondTab).toHaveURL(/\/wishlist$/);
    await assertPopulated(secondTab);
    await secondTab.close();
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});

test("a second user's wishlist reveals nothing about the first user's rows", async ({
  browser,
}) => {
  const admin = stackAdminClient();
  // User A: signed in, with known seeded items and a known wishlist id.
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const emailA = fixtureEmail("wishlist-e2e-a");
  const userA = await createFixtureUser(admin, emailA);
  await signInFixtureUser(pageA, admin, emailA, PROFILE);
  await seedWishlistItems(admin, userA, populatedFixtures());
  const wishlistIdA = await fixtureWishlistId(admin, userA);

  // User B: a completely separate browser context (no cookie sharing).
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const emailB = fixtureEmail("wishlist-e2e-b");
  const userB = await createFixtureUser(admin, emailB);
  try {
    await signInFixtureUser(pageB, admin, emailB, {
      displayName: "Rohan",
      tasteLine: "will travel for good coffee",
    });

    const documentResponse = pageB.waitForResponse((response) =>
      response.url().replace(/\/$/, "").endsWith("/wishlist"),
    );
    await pageB.goto("/wishlist");
    const response = await documentResponse;
    const payload = (await response.text()).toLowerCase();

    // B's own empty state renders; none of A's data — titles, notes,
    // retailers, amounts, item counts, or ids — appears in the DOM or the
    // network payload, even with A's wishlist id known to the test.
    await expect(
      pageB.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    await expect(pageB.getByRole("heading", { name: "Rohan" })).toBeVisible();
    const dom = (await pageB.locator("body").innerText()).toLowerCase();
    for (const secret of [
      "ceramic pour-over",
      "overstory",
      "keycaps",
      "fixture roasters",
      "fixture books",
      "the matte one",
      "2499",
      "132000",
      "4 things",
      wishlistIdA,
    ]) {
      expect(dom, `user B's DOM contains "${secret}"`).not.toContain(secret);
      expect(
        payload,
        `user B's document payload contains "${secret}"`,
      ).not.toContain(secret);
    }
  } finally {
    await deleteFixtureUser(admin, userA);
    await deleteFixtureUser(admin, userB);
    await contextA.close();
    await contextB.close();
  }
});

test("a stale session cookie recovers to the auth flow with no leak, and re-signing in restores the wishlist", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    await seedWishlistItems(admin, userId, populatedFixtures());
    await page.goto("/wishlist");
    await expect(page.getByRole("article")).toHaveCount(4);

    // Corrupt the session cookie in place: a dead session, not no session.
    const cookies = await page.context().cookies();
    const authCookies = cookies.filter((cookie) =>
      cookie.name.includes("auth-token"),
    );
    expect(authCookies.length).toBeGreaterThan(0);
    await page.context().clearCookies();
    await page.context().addCookies(
      authCookies.map((cookie) => ({
        ...cookie,
        value: "dead-session-cookie",
      })),
    );

    // Recovery: no 500, no leak — the safe bounce to the auth flow.
    const response = await page.goto("/wishlist", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/auth$/);
    const body = await page.locator("body").innerText();
    for (const secret of ["ceramic pour-over", "2499", "4 things"]) {
      expect(body).not.toContain(secret);
    }

    // Re-signing in through the real flow restores the wishlist.
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const emailAgain = userData.user?.email;
    expect(emailAgain).toBeTruthy();
    await signInFixtureUser(page, admin, emailAgain as string, PROFILE);
    await page.goto("/wishlist");
    await expect(page.getByRole("article")).toHaveCount(4);
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});

test("every interactive element is keyboard-operable with visible focus, and both states axe clean", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    // Empty state first.
    await page.goto("/wishlist");
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();

    const emptyScan = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();
    expect(emptyScan.violations).toEqual([]);

    // Tab to the CTA: keyboard-reachable with a visible focus indicator.
    let sawWishlistCta = false;
    for (let step = 0; step < 10; step += 1) {
      await page.keyboard.press("Tab");
      const cta = page.getByRole("link", { name: "Add an item" });
      if (await cta.evaluate((node) => node === document.activeElement)) {
        sawWishlistCta = true;
        break;
      }
    }
    expect(sawWishlistCta, "Tab never reached the empty-state CTA").toBe(true);
    // The focus indicator is the global :focus-visible outline.
    const outline = await page
      .getByRole("link", { name: "Add an item" })
      .evaluate((node) => getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");

    // The CTA is operable by keyboard alone.
    await page.getByRole("link", { name: "Add an item" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wishlist\/items\/new$/);
    await expect(
      page.getByRole("heading", { name: "Add an item" }),
    ).toBeVisible();
    // The interim page's way-back link is keyboard-reachable too.
    await page.getByRole("link", { name: "Back to your wishlist" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wishlist$/);

    // Populated state: retailer links, axe, and keyboard reachability.
    await seedWishlistItems(admin, userId, populatedFixtures());
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(4);

    const populatedScan = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();
    expect(populatedScan.violations).toEqual([]);

    let sawRetailerLink = false;
    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press("Tab");
      const link = page.getByRole("link", { name: "Fixture Roasters" });
      if (
        (await link.count()) > 0 &&
        (await link.evaluate((node) => node === document.activeElement))
      ) {
        sawRetailerLink = true;
        break;
      }
    }
    expect(sawRetailerLink, "Tab never reached the retailer link").toBe(true);
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});

test("an unknown /wishlist child path renders not-found with no wishlist data", async ({
  page,
}) => {
  const { admin, userId } = await signedInFixture(page);
  try {
    await seedWishlistItems(admin, userId, populatedFixtures());

    const response = await page.goto("/wishlist/not-a-real-item");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const secret of [
      "ceramic pour-over",
      "overstory",
      "keycaps",
      "fixture roasters",
      "2499",
      "4 things",
    ]) {
      expect(body, `not-found body contains "${secret}"`).not.toContain(secret);
    }
  } finally {
    await deleteFixtureUser(admin, userId);
  }
});
