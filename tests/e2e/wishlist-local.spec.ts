import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  FixtureScope,
  createSignedInFixture,
  fixtureWishlistId,
  requireStackEnv,
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

async function assertProfileGeometry(
  page: Page,
  empty: boolean,
  profile = PROFILE,
): Promise<void> {
  const region = page.getByRole("region", { name: profile.displayName });
  const band = await region.locator(":scope > div:first-child").boundingBox();
  const heading = page.getByRole("heading", { name: profile.displayName });
  const name = await heading.boundingBox();
  const taste = await page.getByText(profile.tasteLine).boundingBox();
  expect(band).not.toBeNull();
  expect(name).not.toBeNull();
  expect(taste).not.toBeNull();
  expect(taste!.y).toBeGreaterThanOrEqual(band!.y + band!.height + 4);
  const avatar = region.locator("span").first();
  const avatarPaint = await avatar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const topmost = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + 10,
    );
    return {
      color: getComputedStyle(element).backgroundColor,
      isTopmost: topmost === element || element.contains(topmost),
    };
  });
  expect(avatarPaint.color).toBe("rgb(198, 240, 98)");
  expect(
    avatarPaint.isTopmost,
    `${profile.displayName} avatar is covered within its band overlap`,
  ).toBe(true);
  const desktop = page.viewportSize()?.width !== 390;
  if (desktop) {
    expect(
      name!.y,
      `${profile.displayName} clips above the desktop band`,
    ).toBeGreaterThanOrEqual(band!.y + 8);
    expect(
      name!.y + name!.height,
      `${profile.displayName} touches the desktop band divider`,
    ).toBeLessThanOrEqual(band!.y + band!.height - 10);
  }
  await expect(heading).toHaveCSS("font-size", desktop ? "36px" : "30px");
  if (empty) {
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toHaveCSS("font-size", "30px");
  }
}

async function assertNameTextContained(page: Page, displayName: string) {
  const heading = page.getByRole("heading", { name: displayName });
  const bounds = await heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const region = element.closest("section");
    if (region === null) throw new Error("Profile card is missing");
    const cardBounds = region.getBoundingClientRect();
    return {
      text: {
        left: text.left,
        right: text.right,
        top: text.top,
        bottom: text.bottom,
      },
      card: {
        left: cardBounds.left,
        right: cardBounds.right,
        top: cardBounds.top,
        bottom: cardBounds.bottom,
      },
    };
  });
  expect(bounds.text.left).toBeGreaterThanOrEqual(bounds.card.left);
  expect(bounds.text.right).toBeLessThanOrEqual(bounds.card.right);
  expect(bounds.text.top).toBeGreaterThanOrEqual(bounds.card.top);
  expect(bounds.text.bottom).toBeLessThanOrEqual(bounds.card.bottom);
}

async function navigateWithDocumentAndFlight(page: Page, path: string) {
  const response = await page.goto(path);
  if (response === null) {
    throw new Error("Expected a document navigation response");
  }
  await page.waitForLoadState("load");
  const target = new URL(path, page.url());
  expect(new URL(response.url()).pathname).toBe(target.pathname);
  expect(response.headers()["content-type"] ?? "").toMatch(
    /^text\/html(?:;|$)/i,
  );
  const documentBody = await response.text();
  expect(documentBody.trim().length).toBeGreaterThan(0);

  // BrowserContext.request shares this page's cookies, so this is a fresh
  // authenticated Flight request for the same target, not an HTML navigation
  // or a response opportunistically emitted by page.goto(). Next may first
  // redirect to its cache-busting _rsc URL; the request client follows it.
  const flightResponse = await page.context().request.get(target.toString(), {
    headers: { RSC: "1", Accept: "text/x-component" },
  });
  expect(new URL(flightResponse.url()).pathname).toBe(target.pathname);
  expect(flightResponse.headers()["content-type"] ?? "").toMatch(
    /^text\/x-component(?:;|$)/i,
  );
  const flightBody = await flightResponse.text();
  expect(flightBody.trim().length).toBeGreaterThan(0);

  return { response, documentBody, flightBody };
}

async function tabTo(
  page: Page,
  target: Locator,
  label: string,
): Promise<void> {
  for (let step = 0; step < 32; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((node) => node === document.activeElement)) {
      const outline = await target.evaluate(
        (node) => getComputedStyle(node).outlineStyle,
      );
      expect(outline, `${label} has no visible keyboard focus`).not.toBe(
        "none",
      );
      return;
    }
  }
  throw new Error(`Tab did not reach ${label}`);
}

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
      original_amount_minor: "249900",
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
      title: "Film for the half-frame camera",
      source_url: "https://example.invalid/products/film",
      retailer: null,
      note: null,
      desire_level: "would_love",
      sort_position: 4,
      original_amount_minor: "120000",
      original_currency: "INR",
      image_url: UNREACHABLE_IMAGE,
    },
  ];
}

function privateItemMarkers(wishlistId: string): string[] {
  return [
    "Ceramic pour-over coffee set",
    "The Overstory paperback",
    "Mechanical keyboard keycaps",
    "Film for the half-frame camera",
    "Fixture Roasters",
    "Fixture Books",
    "The matte one, not the glossy one.",
    "Just an idea for now, no link yet.",
    "249900",
    "2499.00 INR",
    "132000",
    "120000",
    "1200.00 INR",
    "4 things",
    wishlistId,
    REACHABLE_IMAGE,
    UNREACHABLE_IMAGE,
  ];
}

/** Creates a signed-in fixture user on the page and returns its ids. */
async function signedInFixture(
  page: Page,
  profile = PROFILE,
): Promise<{
  admin: ReturnType<typeof stackAdminClient>;
  userId: string;
  scope: FixtureScope;
}> {
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const userId = await createSignedInFixture(
    page,
    admin,
    "wishlist-e2e",
    profile,
    scope,
  );
  return { admin, userId, scope };
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
  const { scope } = await signedInFixture(page);
  await scope.run(async () => {
    const response = await page.goto("/wishlist");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
  });
});

test("a fresh owner with zero items sees the V18 empty composition and its CTA navigates honestly", async ({
  page,
}) => {
  const { scope } = await signedInFixture(page);
  await scope.run(async () => {
    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);

    // The pinned empty-state copy and the exact CTA label (resolution 1:
    // "Add an item", the approved vocabulary — a documented divergence from
    // the V18 prototype's "Add from a link").
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Add the first thing you'd secretly love to unwrap. A candle, a camera, the hoodie you keep looking at.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Your friends will take it from there/),
    ).toHaveCount(0);
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
    await assertProfileGeometry(page, true);

    // The CTA opens the functional manual-entry form — never a 404.
    await cta.click();
    await expect(page).toHaveURL(/\/wishlist\/items\/new$/);
    await expect(
      page.getByRole("heading", { name: "Add an item" }),
    ).toBeVisible();
    await expect(page.getByLabel("Item name")).toBeVisible();
    await expect(page.getByText("Page not found")).toHaveCount(0);

    // And a visible way back.
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
  });
});

test("an owner name with descenders clears the desktop divider while the taste line stays below", async ({
  page,
}) => {
  const profile = {
    displayName: "Jaya",
    tasteLine: PROFILE.tasteLine,
  };
  const { scope } = await signedInFixture(page, profile);
  await scope.run(async () => {
    await page.goto("/wishlist");
    await expect(
      page.getByRole("heading", { name: profile.displayName }),
    ).toBeVisible();
    await assertProfileGeometry(page, true, profile);
  });
});

test("a valid three-line owner name stays fully inside the band at the desktop breakpoint", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop breakpoint probe");
  await page.setViewportSize({ width: 640, height: 844 });
  const profile = {
    displayName: "CHRISTOPHER MAXIMILIAN MONTGOMERY",
    tasteLine: PROFILE.tasteLine,
  };
  const { scope } = await signedInFixture(page, profile);
  await scope.run(async () => {
    await page.goto("/wishlist");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const name = await page
      .getByRole("heading", { name: profile.displayName })
      .boundingBox();
    expect(name).not.toBeNull();
    expect(
      name!.height,
      "the breakpoint fixture must wrap to three lines",
    ).toBeGreaterThan(100);
    await assertProfileGeometry(page, true, profile);
  });
});

test("a valid unbroken 40-character owner name fits at mobile, breakpoint, and desktop widths", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "three-width probe");
  const profile = {
    displayName: "W".repeat(40),
    tasteLine: PROFILE.tasteLine,
  };
  const { scope } = await signedInFixture(page, profile);
  await scope.run(async () => {
    await page.goto("/wishlist");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    for (const width of [390, 640, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await assertProfileGeometry(page, true, profile);
      await assertNameTextContained(page, profile.displayName);
    }
  });
});

test("the populated view renders every snapshot field in the pinned read order, with the branded placeholder and runtime fallback", async ({
  page,
}) => {
  await page.route(UNREACHABLE_IMAGE, async (route) => {
    await route.abort("failed");
  });
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
    await seedWishlistItems(admin, userId, populatedFixtures());

    await page.goto("/wishlist");
    await expect(page.getByRole("heading", { name: "Ada" })).toBeVisible();
    await expect(page.getByText("4 things")).toBeVisible();
    await assertProfileGeometry(page, false);

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
    await expect(
      third.getByText("Just an idea", { exact: true }),
    ).toBeVisible();

    // The unreachable image degrades to the branded placeholder — never a
    // broken-image icon or blank gap.
    const fourth = cards.nth(3);
    const source = fourth.getByRole("link", { name: "example.invalid" });
    await expect(source).toHaveAttribute(
      "href",
      "https://example.invalid/products/film",
    );
    await expect(source).toHaveAttribute("rel", "noreferrer");
    // The image is lazy-loaded, so explicitly bring the final card into the
    // load zone. The route above makes the runtime failure deterministic
    // instead of depending on an unused localhost port and viewport timing.
    await fourth.scrollIntoViewIfNeeded();
    await expect(
      fourth.getByTestId("wishlist-image-placeholder"),
    ).toBeVisible();
    await expect(
      fourth.getByTestId("wishlist-image-placeholder"),
    ).toContainText("Film for the half-frame camera");
  });
});

test("populated items persist across a full reload and a same-browser new tab", async ({
  page,
}) => {
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
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
  });
});

test("1001 tied-boundary items are all present in the owner document", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
    const items: ItemFixture[] = Array.from({ length: 1001 }, (_, index) => ({
      id: randomUUID(),
      title: `Boundary item ${String(index).padStart(4, "0")}`,
      sort_position: index === 500 ? 499 : index,
    }));
    await seedWishlistItems(admin, userId, items);
    const response = await page.goto("/wishlist");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("1001 things")).toBeVisible();
    const document = await response!.text();
    expect(document).toContain("Boundary item 0000");
    expect(document).toContain("Boundary item 1000");
  });
});

test("PostgREST transports full bigint originals as strings and the owner sees exact prices", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
    await seedWishlistItems(admin, userId, [
      {
        id: randomUUID(),
        title: "Beyond-safe INR",
        sort_position: 1,
        original_amount_minor: "9007199254740993",
        original_currency: "INR",
      },
      {
        id: randomUUID(),
        title: "Max-bigint INR",
        sort_position: 2,
        original_amount_minor: "9223372036854775807",
        original_currency: "INR",
      },
      { id: randomUUID(), title: "No-price sentinel", sort_position: 3 },
    ]);
    const wishlistId = await fixtureWishlistId(admin, userId);
    const rawBodies: string[] = [];
    const trackedFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (
        new URL(
          input instanceof Request ? input.url : String(input),
        ).pathname.endsWith("/rest/v1/wishlist_items")
      ) {
        rawBodies.push(await response.clone().text());
      }
      return response;
    };
    const ownerClient = createClient(
      requireStackEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireStackEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: trackedFetch },
      },
    );
    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email:
          (await admin.auth.admin.getUserById(userId)).data.user?.email ?? "",
      });
    expect(linkError).toBeNull();
    expect(link.properties?.hashed_token).toBeTruthy();
    const { error: authError } = await ownerClient.auth.verifyOtp({
      token_hash: link.properties!.hashed_token,
      type: "email",
    });
    expect(authError).toBeNull();
    const { data, error } = await ownerClient
      .from("wishlist_items")
      .select(
        "id,title,source_url,retailer,image_url,image_snapshot_path,note,desire_level,sort_position,original_amount_minor::text,original_currency,created_at,updated_at",
      )
      .eq("wishlist_id", wishlistId)
      .order("sort_position", { ascending: true })
      .order("id", { ascending: true })
      .range(0, 499);
    expect(error).toBeNull();
    expect(data?.map((row) => row.original_amount_minor)).toEqual([
      "9007199254740993",
      "9223372036854775807",
      null,
    ]);
    expect(typeof data?.[0].original_amount_minor).toBe("string");
    expect(
      rawBodies.some(
        (body) =>
          body.includes('"original_amount_minor":"9007199254740993"') &&
          body.includes('"original_amount_minor":"9223372036854775807"') &&
          body.includes('"original_amount_minor":null'),
      ),
    ).toBe(true);

    const document = await page.goto("/wishlist");
    expect(document?.status()).toBe(200);
    await expect(page.getByText("90071992547409.93 INR")).toBeVisible();
    await expect(page.getByText("92233720368547758.07 INR")).toBeVisible();
    const noPrice = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "No-price sentinel" }),
    });
    await expect(noPrice).not.toContainText("INR");
  });
});

test("a second user's wishlist reveals nothing about the first user's rows", async ({
  browser,
}) => {
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    // User A: signed in, with known seeded items and a known wishlist id.
    const contextA = await browser.newContext();
    scope.register("context A", () => contextA.close());
    const pageA = await contextA.newPage();
    const userA = await createSignedInFixture(
      pageA,
      admin,
      "wishlist-e2e-a",
      PROFILE,
      scope,
    );
    await seedWishlistItems(admin, userA, populatedFixtures());
    const wishlistIdA = await fixtureWishlistId(admin, userA);

    // User B: a completely separate browser context (no cookie sharing).
    const contextB = await browser.newContext();
    scope.register("context B", () => contextB.close());
    const pageB = await contextB.newPage();
    await createSignedInFixture(
      pageB,
      admin,
      "wishlist-e2e-b",
      {
        displayName: "Rohan",
        tasteLine: "will travel for good coffee",
      },
      scope,
    );

    const { documentBody, flightBody } = await navigateWithDocumentAndFlight(
      pageB,
      "/wishlist",
    );

    // B's own empty state renders; none of A's data — titles, notes,
    // retailers, amounts, item counts, or ids — appears in the DOM or the
    // network payload, even with A's wishlist id known to the test.
    await expect(
      pageB.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    await expect(pageB.getByRole("heading", { name: "Rohan" })).toBeVisible();
    const surfaces = {
      DOM: await pageB.locator("body").innerText(),
      document: documentBody,
      Flight: flightBody,
    };
    for (const [surface, body] of Object.entries(surfaces)) {
      for (const [index, secret] of privateItemMarkers(wishlistIdA).entries()) {
        expect(
          body.toLowerCase().includes(secret.toLowerCase()),
          `user B's ${surface} contains private fixture marker ${index}`,
        ).toBe(false);
      }
    }
  });
});

test("a stale session cookie recovers to the auth flow with no leak, and re-signing in restores the wishlist", async ({
  page,
}) => {
  // Two full sign-in UI flows plus seeding on a cold CI box: the default
  // 30s test timeout is too tight here.
  test.setTimeout(120_000);
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
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
  });
});

test("every interactive element is keyboard-operable with visible focus, and both states axe clean", async ({
  page,
}) => {
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
    // Empty state first.
    await page.goto("/wishlist");
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();

    const emptyScan = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();
    expect(emptyScan.violations).toEqual([]);

    const wordmark = page.getByRole("link", { name: "Get Me This home" });
    const account = page.getByRole("button", { name: "Account" });
    await tabTo(page, wordmark, "wordmark");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/wishlist");
    await tabTo(page, wordmark, "wordmark");
    await tabTo(page, account, "account trigger");
    await page.keyboard.press("Space");
    await expect(account).toHaveAttribute("aria-expanded", "true");
    await tabTo(
      page,
      page.getByRole("link", { name: "My wishlist" }),
      "My wishlist menu entry",
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wishlist$/);

    await page.goto("/wishlist");
    await tabTo(page, wordmark, "wordmark");
    await tabTo(page, account, "account trigger");
    await page.keyboard.press("Enter");
    await tabTo(
      page,
      page.getByRole("link", { name: "My wishlist" }),
      "My wishlist menu entry",
    );
    await tabTo(
      page,
      page.getByRole("button", { name: "Log out" }),
      "Log out menu entry",
    );
    await page.keyboard.press("Space");
    await expect(page.getByText("Log out of Get Me This?")).toBeVisible();
    await tabTo(
      page,
      page.getByRole("button", { name: "Cancel" }),
      "logout cancel",
    );
    await page.keyboard.press("Space");
    await expect(page.getByText("Log out of Get Me This?")).toHaveCount(0);

    await page.goto("/wishlist");
    await tabTo(page, wordmark, "wordmark");
    await tabTo(page, account, "account trigger");
    await tabTo(
      page,
      page.getByRole("link", { name: "Add an item" }),
      "empty CTA",
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/wishlist\/items\/new$/);
    await expect(
      page.getByRole("heading", { name: "Add an item" }),
    ).toBeVisible();
    await tabTo(
      page,
      page.getByRole("link", { name: "Get Me This home" }),
      "interim wordmark",
    );
    await tabTo(
      page,
      page.getByRole("button", { name: "Account" }),
      "interim account",
    );
    await tabTo(
      page,
      page.getByRole("link", { name: "Cancel" }),
      "manual entry cancel link",
    );
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

    await page.route("https://example.invalid/products/film", (route) =>
      route.fulfill({ status: 200, body: "source reached" }),
    );
    await tabTo(
      page,
      page.getByRole("link", { name: "Get Me This home" }),
      "populated wordmark",
    );
    await tabTo(
      page,
      page.getByRole("button", { name: "Account" }),
      "populated account",
    );
    await tabTo(
      page,
      page.getByRole("link", { name: "Fixture Roasters" }),
      "retailer link",
    );
    await tabTo(
      page,
      page.getByRole("link", { name: "example.invalid" }),
      "source link without retailer",
    );
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("https://example.invalid/products/film");
  });
});

test("an unknown /wishlist child path renders not-found with no wishlist data", async ({
  page,
}) => {
  const { admin, userId, scope } = await signedInFixture(page);
  await scope.run(async () => {
    await seedWishlistItems(admin, userId, populatedFixtures());
    const wishlistId = await fixtureWishlistId(admin, userId);

    const { response, documentBody, flightBody } =
      await navigateWithDocumentAndFlight(page, "/wishlist/not-a-real-item");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    const surfaces = {
      DOM: await page.locator("body").innerText(),
      document: documentBody,
      Flight: flightBody,
    };
    for (const [surface, body] of Object.entries(surfaces)) {
      for (const [index, secret] of privateItemMarkers(wishlistId).entries()) {
        expect(
          body.toLowerCase().includes(secret.toLowerCase()),
          `not-found ${surface} contains private fixture marker ${index}`,
        ).toBe(false);
      }
    }
  });
});
