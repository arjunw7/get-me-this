import { expect, test, type Page, type Route } from "@playwright/test";

import {
  createFixtureUser,
  createSignedInFixture,
  deleteFixtureUser,
  fixtureWishlistId,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

/**
 * The 005f extraction-review e2e (stack-gated). Every extraction response
 * is served through Playwright route interception — fixture
 * ExtractionResult and typed-failure envelopes, with NO real outbound
 * egress in e2e. The save path is the real application: the unmodified
 * 005c boundary creates the row and the two-phase image tail runs against
 * the real local stack (the fake candidate domains cannot be fetched, so
 * the designed normalization-failure containment is exercised end to end).
 */

type ExtractFixture =
  | { kind: "result"; result: Record<string, unknown> }
  | { kind: "error"; status: number; code: string };

const COMPLETE_RESULT = {
  sourceUrl: "https://shop.example/product/lamp",
  title: "Mushroom ceramic table lamp",
  retailer: "Fixture Shop",
  originalAmountMinor: "2499",
  originalCurrency: "INR",
  candidateImageUrls: [
    "https://img.example/lamp-1.webp",
    "https://img.example/lamp-2.webp",
  ],
};

const PARTIAL_RESULT = {
  sourceUrl: "https://shop.example/product/lamp",
  title: "Mushroom ceramic table lamp",
  candidateImageUrls: [],
};

async function interceptExtract(
  page: Page,
  fixture: ExtractFixture | ((route: Route) => Promise<void>),
) {
  await page.route("**/wishlist/items/extract", async (route) => {
    if (typeof fixture === "function") return fixture(route);
    if (fixture.kind === "result")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: fixture.result }),
      });
    return route.fulfill({
      status: fixture.status,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: fixture.code, message: "Generic safe copy." },
      }),
    });
  });
}

async function openManualEntry(page: Page) {
  await page.goto("/wishlist/items/new");
  await expect(
    page.getByRole("heading", {
      name: "Drop the link. We’ll do the nosy part.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No link? Add it manually" }).click();
  await expect(
    page.getByRole("heading", { name: "Add it manually" }),
  ).toBeVisible();
  await expect(page.getByLabel("Item name")).toBeVisible();
}

async function fillManualForm(
  page: Page,
  item: {
    title: string;
    amount?: string;
    currency?: string;
    sourceUrl?: string;
  },
) {
  await page.getByLabel("Item name").fill(item.title);
  if (item.amount) await page.getByLabel("Price").fill(item.amount);
  if (item.currency)
    await page.getByLabel("Currency").selectOption(item.currency);
  if (item.sourceUrl)
    await page.getByLabel("Link (optional)").fill(item.sourceUrl);
}

async function readSubmissionId(page: Page): Promise<string> {
  return await page.locator('input[name="submissionId"]').inputValue();
}

async function overwriteSubmissionId(page: Page, value: string) {
  await page.evaluate((next) => {
    const element = document.querySelector<HTMLInputElement>(
      'input[name="submissionId"]',
    );
    if (!element) throw new Error("submission id input missing");
    element.value = next;
  }, value);
}

test("complete extraction: review, explicit save through the 005c contract, exact row, and reload persistence", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj31-extract",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    await interceptExtract(page, { kind: "result", result: COMPLETE_RESULT });

    await page.goto("/wishlist/items/new");
    await page
      .getByLabel("Product link")
      .fill("https://shop.example/product/lamp");
    await page.getByRole("button", { name: "Fetch details" }).click();
    await expect(
      page.getByRole("heading", { name: "Found it. Look right?" }),
    ).toBeVisible();
    // Prefilled only with what arrived; nothing saved yet.
    await expect(page.getByLabel("Item name")).toHaveValue(
      "Mushroom ceramic table lamp",
    );
    await expect(page.getByLabel("Shop (optional)")).toHaveValue(
      "Fixture Shop",
    );
    await expect(page.getByLabel("Price")).toHaveValue("24.99");
    await expect(
      page.getByRole("radio", { name: "Photo option 1" }),
    ).toBeChecked();

    // Review is not durable: a fresh navigation restarts extraction from
    // the ?url= route parameter (the manual-submit path does not rewrite
    // the route), and still nothing has been saved.
    await page.goto(
      "/wishlist/items/new?url=https://shop.example/product/lamp",
    );
    await expect(
      page.getByRole("heading", { name: "Found it. Look right?" }),
    ).toBeVisible();
    const reviewReloaded = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId);
    expect(reviewReloaded.data ?? []).toHaveLength(0);

    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    await expect(
      page.getByRole("status").getByText("Item added to your wishlist."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Mushroom ceramic table lamp" }),
    ).toBeVisible();

    // Exact database assertions: one row, exact pair, extracted status,
    // image columns from the two-phase tail. The candidate domain cannot
    // resolve, so normalization fails contained: image_url persists and no
    // snapshot path does.
    const created = await admin
      .from("wishlist_items")
      .select(
        "id,owner_id,wishlist_id,title,source_url,retailer,note,desire_level,original_amount_minor::text,original_currency,image_url,image_snapshot_path,extraction_status,client_submission_id",
      )
      .eq("owner_id", userId)
      .eq("title", "Mushroom ceramic table lamp")
      .single();
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({
      owner_id: userId,
      title: "Mushroom ceramic table lamp",
      source_url: "https://shop.example/product/lamp",
      retailer: "Fixture Shop",
      original_amount_minor: "2499",
      original_currency: "INR",
      desire_level: "would_love",
      image_url: "https://img.example/lamp-1.webp",
      image_snapshot_path: null,
      extraction_status: "extracted",
    });

    // Reload persistence: the saved item survives.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Mushroom ceramic table lamp" }),
    ).toBeVisible();

    // Equal-payload replay with the same submission key succeeds
    // idempotently and cannot duplicate the row.
    await interceptExtract(page, {
      kind: "error",
      status: 422,
      code: "blocked_url",
    });
    await page.goto("/wishlist/items/new");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await fillManualForm(page, {
      title: "Mushroom ceramic table lamp",
      amount: "24.99",
      currency: "INR",
      sourceUrl: "https://shop.example/product/lamp",
    });
    await overwriteSubmissionId(page, created.data!.client_submission_id);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const afterReplay = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId);
    expect(afterReplay.data ?? []).toHaveLength(1);
  });
});

test("partial extraction renders the generic notice with placeholder gaps and saves 'extracted'", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj31-partial",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    await interceptExtract(page, { kind: "result", result: PARTIAL_RESULT });

    await page.goto(
      "/wishlist/items/new?url=https://shop.example/product/lamp",
    );
    await expect(
      page.getByRole("heading", { name: "Found it. Look right?" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Some details couldn’t be read. Fill in anything missing below.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Shop (optional)")).toHaveValue("");
    await expect(page.getByLabel("Price")).toHaveValue("");
    await expect(
      page.getByText("Photo preview — adding photos isn’t available yet."),
    ).toBeVisible();

    await page.getByLabel("Shop (optional)").fill("Filled In Shop");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const created = await admin
      .from("wishlist_items")
      .select("extraction_status,image_url,image_snapshot_path,retailer")
      .eq("owner_id", userId)
      .single();
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({
      extraction_status: "extracted",
      image_url: null,
      image_snapshot_path: null,
      retailer: "Filled In Shop",
    });
  });
});

for (const failure of [
  { label: "invalid_url", status: 422 },
  { label: "blocked_url", status: 422 },
  { label: "unavailable", status: 422 },
  { label: "timeout", status: 504 },
  { label: "too_large", status: 413 },
  { label: "unsupported_content", status: 422 },
  { label: "extraction_failed", status: 422 },
  { label: "rate denial", status: 429 },
  { label: "concurrency denial", status: 503 },
]) {
  test(`the ${failure.label} response falls back to manual entry with the URL preserved and saves 'manual'`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(15_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const userId = await createSignedInFixture(
        page,
        admin,
        "arj31-fallback",
        { displayName: "Ada", tasteLine: "small thoughtful things" },
        scope,
      );
      await interceptExtract(page, {
        kind: "error",
        status: failure.status,
        code: "unavailable",
      });

      await page.goto(
        "/wishlist/items/new?url=https://shop.example/product/lamp",
      );
      await expect(
        page.getByRole("heading", { name: "That link played hard to get." }),
      ).toBeVisible();
      // Generic wording only; nothing distinguishes blocked, denied, or
      // failed, and no response detail is rendered. The app alert is
      // scoped explicitly: Next's own route announcer also carries
      // role="alert", so an unscoped getByRole("alert") is ambiguous.
      await expect(
        page.locator('[role="alert"]:not(#__next-route-announcer__)'),
      ).toContainText("We couldn’t read that shop.");
      await expect(page.getByText("Generic safe copy.")).toHaveCount(0);
      await expect(page.getByLabel("Link (optional)")).toHaveValue(
        "https://shop.example/product/lamp",
      );

      await fillManualForm(page, {
        title: "Fallback lamp",
        amount: "12.5",
        currency: "INR",
      });
      await page.getByRole("button", { name: "Add item" }).click();
      await expect(page).toHaveURL(/\/wishlist\?item=added$/);
      const created = await admin
        .from("wishlist_items")
        .select(
          "extraction_status,image_url,image_snapshot_path,original_amount_minor::text",
        )
        .eq("owner_id", userId)
        .single();
      expect(created.error).toBeNull();
      expect(created.data).toMatchObject({
        extraction_status: "manual",
        image_url: null,
        image_snapshot_path: null,
        original_amount_minor: "1250",
      });
    });
  });
}

test("a changed-payload replay returns submission-conflict with the draft retained", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "arj31-conflict",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    await openManualEntry(page);
    await fillManualForm(page, { title: "Original conflict lamp" });
    const submissionId = await readSubmissionId(page);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);

    await openManualEntry(page);
    await fillManualForm(page, { title: "Changed conflict lamp" });
    await overwriteSubmissionId(page, submissionId);
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(
      page.getByText(/This entry was already saved with different details/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit saved item" }),
    ).toBeVisible();
    // The entered draft is retained.
    await expect(page.getByLabel("Item name")).toHaveValue(
      "Changed conflict lamp",
    );
  });
});

test("validation errors retain every raw entered value and move focus to the first error", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "arj31-validation",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    await openManualEntry(page);
    await fillManualForm(page, {
      title: "",
      amount: "12.345",
      sourceUrl: "https://user:pass@shop.example/x",
    });
    await page
      .getByLabel("Note (optional)")
      .fill("Unchanged raw note survives.");
    await page.getByRole("button", { name: "Add item" }).click();

    await expect(page.getByText("Enter a title.")).toBeVisible();
    await expect(
      page.getByText("Enter a valid amount for a supported currency."),
    ).toBeVisible();
    await expect(
      page.getByText("Enter a public HTTP or HTTPS link."),
    ).toBeVisible();
    await expect(page.getByLabel("Item name")).toHaveValue("");
    await expect(page.getByLabel("Price")).toHaveValue("12.345");
    await expect(page.getByLabel("Note (optional)")).toHaveValue(
      "Unchanged raw note survives.",
    );
    await expect(page.getByLabel("Item name")).toBeFocused();
  });
});

test("signed-out and incomplete-profile sessions are redirected and never saved", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    // Signed-out: the proxy redirects to /auth.
    await page.goto("/wishlist/items/new");
    await expect(page).toHaveURL(/\/auth(?:\?|$)/);

    // Incomplete profile: signed in, no onboarding completed yet.
    const email = `arj31-incomplete-${Date.now()}-incomplete@example.invalid`;
    const userId = await createFixtureUser(admin, email);
    scope.register("fixture user", () => deleteFixtureUser(admin, userId));
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    expect(error).toBeNull();
    await page.goto(
      `/auth/confirm?token_hash=${data!.properties!.hashed_token}&type=email`,
    );
    await expect(page).toHaveURL(/\/auth\/link$/);
    await page.getByRole("button", { name: "Use my sign-in link" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    // The incomplete session cannot reach the add-item flow.
    await page.goto("/wishlist/items/new");
    await expect(page).toHaveURL(/\/onboarding$/);
    const rows = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId);
    expect(rows.data ?? []).toHaveLength(0);
  });
});

test("a foreign authenticated user can neither read nor mutate the saved item", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const admin = stackAdminClient();
  const ownerScope = new FixtureScope();
  const foreignScope = new FixtureScope();
  try {
    const ownerPage = await browser.newPage();
    const ownerId = await createSignedInFixture(
      ownerPage,
      admin,
      "arj31-owner",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      ownerScope,
    );
    await ownerPage.close();
    const foreignPage = await browser.newPage();
    const foreignId = await createSignedInFixture(
      foreignPage,
      admin,
      "arj31-foreign",
      { displayName: "Grace", tasteLine: "loud patterns" },
      foreignScope,
    );

    const saved = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", ownerId)
      .limit(1);
    expect(saved.data ?? []).toHaveLength(0);
    // The owner saves one item through the manual fallback.
    await openManualEntry(foreignPage);
    // Foreign session sees only their own (empty) wishlist, never the owner's rows.
    await fillManualForm(foreignPage, { title: "Foreign attempt lamp" });
    await foreignPage.getByRole("button", { name: "Add item" }).click();
    await expect(foreignPage).toHaveURL(/\/wishlist\?item=added$/);

    const rows = await admin.from("wishlist_items").select("id,owner_id");
    expect(rows.error).toBeNull();
    // The admin client reads every row, including the local stack's seeded
    // demo rows; the invariant is that nothing belongs to the OWNER (whose
    // wishlist is empty) and the foreign save landed under the foreign id.
    for (const row of rows.data ?? []) {
      expect(row.owner_id).not.toBe(ownerId);
    }
    const foreignRows = await admin
      .from("wishlist_items")
      .select("id,owner_id")
      .eq("owner_id", foreignId);
    expect((foreignRows.data ?? []).length).toBeGreaterThanOrEqual(1);
    await foreignPage.close();
  } finally {
    await ownerScope.cleanup();
    await foreignScope.cleanup();
  }
});

test("display prefers the signed snapshot, then the remote image URL, then the branded placeholder", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj31-display",
      { displayName: "Ada", tasteLine: "small thoughtful things" },
      scope,
    );
    const wishlistId = await fixtureWishlistId(admin, userId);

    // A real WebP snapshot in the owner's own prefix, uploaded through the
    // admin fixture client (setup only, the same tests-only pattern).
    const sharpModule = await import("sharp");
    const webp = await sharpModule
      .default({
        create: { width: 8, height: 8, channels: 3, background: "#e05038" },
      })
      .webp()
      .toBuffer();
    const snapshotPath = `${userId}/00000000-0000-5000-8000-0000000000d1.webp`;
    const upload = await admin.storage
      .from("wishlist-item-snapshots")
      .upload(snapshotPath, webp, { contentType: "image/webp", upsert: true });
    expect(upload.error).toBeNull();

    await admin.from("wishlist_items").insert([
      {
        wishlist_id: wishlistId,
        owner_id: userId,
        title: "Snapshot first lamp",
        image_snapshot_path: snapshotPath,
        image_url: "https://img.example/never-rendered.webp",
        sort_position: 1,
      },
      {
        wishlist_id: wishlistId,
        owner_id: userId,
        title: "Remote fallback lamp",
        image_url: "https://img.example/remote-fallback.webp",
        sort_position: 2,
      },
      {
        wishlist_id: wishlistId,
        owner_id: userId,
        title: "Placeholder lamp",
        sort_position: 3,
      },
    ]);

    // No egress in e2e: the remote fallback host cannot resolve, so the
    // card's runtime onError fallback would degrade the <img> to the
    // branded placeholder before the src assertion can read it. Fulfill
    // the image request so the remote-fallback card keeps its <img>
    // mounted — the state under test.
    await page.route("**/img.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/webp", body: webp }),
    );

    await page.goto("/wishlist");
    // Snapshot-first: the signed URL is the source, never a bare raw path
    // (the signed URL necessarily embeds the object path under /sign/).
    const snapshotImage = page.getByRole("img", {
      name: "Snapshot first lamp",
    });
    await expect(snapshotImage).toBeVisible();
    const signedSrc = (await snapshotImage.getAttribute("src")) ?? "";
    expect(signedSrc).toContain(
      "/storage/v1/object/sign/wishlist-item-snapshots/",
    );
    expect(signedSrc).toContain("token=");
    // The remote fallback renders its own URL.
    await expect(
      page
        .getByRole("img", { name: "Remote fallback lamp" })
        .getAttribute("src"),
    ).resolves.toBe("https://img.example/remote-fallback.webp");
    // No image fields: the branded placeholder, never a broken image.
    await expect(
      page
        .locator("article")
        .filter({ hasText: "Placeholder lamp" })
        .getByTestId("wishlist-image-placeholder"),
    ).toHaveCount(1);
  });
});
