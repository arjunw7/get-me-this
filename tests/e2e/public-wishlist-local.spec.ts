import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  FixtureScope,
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
  seedWishlistItems,
  stackAdminClient,
} from "../helpers/local-stack";
import {
  deleteFixtureGroupsSql,
  runStackSql,
  withIdentity,
} from "../helpers/group-stack";
import { mailpitLogin } from "../helpers/mailpit-signin";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires migrated local Supabase and Mailpit",
);

async function fixtureProfile(
  scope: FixtureScope,
  prefix: string,
  displayName?: string,
  privateGroups: string[] = [],
) {
  const admin = stackAdminClient();
  const email = fixtureEmail(prefix);
  const id = await createFixtureUser(admin, email);
  scope.register("public wishlist fixture account", async () => {
    // Group FKs must be removed before this owner; FixtureScope runs independent
    // cleanup callbacks concurrently, so keep dependent cleanup in one callback.
    if (privateGroups.length) deleteFixtureGroupsSql(privateGroups, [id]);
    await deleteFixtureUser(admin, id);
  });
  if (displayName) {
    const { error } = await admin
      .from("profiles")
      .update({
        display_name: displayName,
        taste_line: "Small things, bright colors.",
        vibe: "electric",
      })
      .eq("id", id);
    if (error) throw new Error("Could not prepare the local public profile");
  }
  return { id, email };
}

async function sharingPath(page: Page) {
  await page.goto("/wishlist");
  await expect(
    page.getByRole("button", { name: "Share wishlist", exact: true }),
  ).toBeVisible();
  await capture(page, "owner-wishlist-share-cta");
  await page
    .getByRole("button", { name: "Share wishlist", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Share your wishlist" });
  await expect(dialog).toBeVisible();
  await capture(page, "owner-sharing-sheet");
  const link = await dialog.getByLabel("Public wishlist link").inputValue();
  const url = new URL(link);
  // Boolean assertions keep capability tokens out of ordinary assertion text.
  expect(url.origin === new URL(page.url()).origin).toBe(true);
  expect(/^\/s\/[A-Za-z0-9_-]{43}$/.test(url.pathname)).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "Stop sharing", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Open public wishlist", { exact: true }),
  ).toHaveCount(0);
  const openLink = dialog.getByRole("link", {
    name: "Open public wishlist (opens in a new tab)",
    exact: true,
  });
  await expect(openLink).toBeVisible();
  expect((await openLink.getAttribute("href")) === link).toBe(true);
  await expect(openLink).toHaveAttribute("target", "_blank");
  await expect(openLink).toHaveAttribute("rel", "noopener noreferrer");
  const [opened] = await Promise.all([
    page.waitForEvent("popup"),
    openLink.click(),
  ]);
  try {
    await opened.waitForLoadState("domcontentloaded");
    expect(opened.url() === link).toBe(true);
    await expect(opened.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await opened.close();
  }
  return url.pathname;
}

async function expectPublicPrivacy(page: Page, ownerEmail: string) {
  await expect(
    page.getByRole("button", {
      name: /Reserve|Edit profile|Delete item|Share wishlist/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Gifting|Groups|Copy to my wishlist/ }),
  ).toHaveCount(0);
  const body = await page.locator("body").innerText();
  expect(body.includes(ownerEmail)).toBe(false);
  expect(body.includes("Private birthday planning")).toBe(false);
  expect(
    /Your draw|Someone in the group has this covered|Reserved by|Purchase progress/.test(
      body,
    ),
  ).toBe(false);
}

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const evidenceDir = process.env.E2E_PUBLIC_EVIDENCE_DIR;
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const filename = `${test.info().title.replace(/[^a-z0-9]+/gi, "-")}-${name}-${test.info().project.name}.png`;
  const body = await page.screenshot({
    fullPage: !(await page.getByRole("dialog").count()),
    animations: "disabled",
    caret: "hide",
    style:
      "input[readonly] { color: transparent !important; caret-color: transparent !important; }",
    ...(evidenceDir ? { path: path.join(evidenceDir, filename) } : {}),
  });
  await test.info().attach(`${name}-${test.info().project.name}`, {
    body,
    contentType: "image/png",
  });
}

test("automatic sharing supports anonymous viewing, owner read-only reactions, revocation and a new link", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const owner = await fixtureProfile(scope, "public-owner", "Public Owner");
    await mailpitLogin(page, owner.email);
    const beforeOrigin = process.env.E2E_PUBLIC_BEFORE_ORIGIN;
    if (beforeOrigin) {
      const beforeUrl = new URL(beforeOrigin);
      const currentUrl = new URL(page.url());
      if (
        beforeUrl.protocol !== "http:" ||
        !["127.0.0.1", "localhost"].includes(beforeUrl.hostname) ||
        beforeUrl.hostname !== currentUrl.hostname
      ) {
        throw new Error(
          "Before evidence requires the same local host as the isolated runner",
        );
      }
      await page.goto(new URL("/wishlist", beforeUrl).href);
      await expect(
        page.getByRole("region", { name: "Public Owner", exact: true }),
      ).toBeVisible();
      await capture(page, "owner-wishlist-before-share-cta");
      await page
        .getByRole("button", { name: "Share wishlist", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Share your wishlist" }),
      ).toBeVisible();
      await capture(page, "owner-sharing-sheet-before");
      await page
        .getByRole("button", { name: "Close sharing", exact: true })
        .click();
      // Relative navigation uses the isolated runner's baseURL, even after an
      // absolute visit to the review server. The session stays on this host.
    }
    const originalPath = await sharingPath(page);
    const dialog = page.getByRole("dialog", { name: "Share your wishlist" });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await dialog
      .getByRole("button", { name: "Copy link", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toHaveText("Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(copied).pathname === originalPath).toBe(true);

    const anonymous = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: page.viewportSize(),
      deviceScaleFactor: 1,
    });
    try {
      const visitor = await anonymous.newPage();
      await visitor.goto(originalPath);
      await expect(
        visitor.getByRole("heading", {
          name: "Public Owner's wishlist",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        visitor.getByRole("heading", { name: "No wishlist items yet." }),
      ).toBeVisible();
      await expect(visitor.locator("[data-vibe]")).toHaveAttribute(
        "data-vibe",
        "electric",
      );
      await expectPublicPrivacy(visitor, owner.email);
      await capture(visitor, "public-empty-anonymous");

      const imageItemId = randomUUID();
      const imagePath = `${owner.id}/${randomUUID()}.webp`;
      const admin = stackAdminClient();
      const pixels = await sharp({
        create: { width: 40, height: 40, channels: 3, background: "#ffb719" },
      })
        .webp()
        .toBuffer();
      const upload = await admin.storage
        .from("wishlist-item-snapshots")
        .upload(imagePath, pixels, { contentType: "image/webp" });
      if (upload.error) throw new Error("Could not prepare image fixture");
      scope.register("public image fixture", async () => {
        const { error } = await admin.storage
          .from("wishlist-item-snapshots")
          .remove([imagePath]);
        if (error) throw new Error("Could not remove image fixture");
      });
      await seedWishlistItems(admin, owner.id, [
        {
          id: imageItemId,
          title: "Bright desk lamp",
          sort_position: 0,
          note: "Warm light, please.",
          original_amount_minor: "2400",
          original_currency: "USD",
          source_url: "https://example.com/lamp",
          retailer: "Lamp shop",
        },
      ]);
      const updated = await admin
        .from("wishlist_items")
        .update({ image_snapshot_path: imagePath })
        .eq("id", imageItemId);
      if (updated.error) throw new Error("Could not attach image fixture");
      const imageRoute = `${originalPath}/images/${imageItemId}`;
      const photo = await visitor.request.get(imageRoute);
      expect(photo.status()).toBe(200);
      expect(photo.headers()["cache-control"]).toContain("no-store");
      expect(photo.headers()["content-type"]).toBe("image/webp");
      const loadedResponse = await visitor.reload();
      expect(loadedResponse?.headers()["referrer-policy"]).toBe("no-referrer");
      expect(loadedResponse?.headers()["cache-control"]).toContain("no-store");
      expect((await visitor.content()).includes(imagePath)).toBe(false);
      await expect(
        visitor.getByRole("heading", { name: "Bright desk lamp" }),
      ).toBeVisible();
      await expect(
        visitor.getByRole("link", { name: "Sign in to react", exact: true }),
      ).toBeVisible();
      await expect(
        visitor.getByRole("button", { name: "Very you", exact: true }),
      ).toHaveCount(0);
      await capture(visitor, "public-populated-anonymous");

      const ownerPublic = await page.context().newPage();
      try {
        await ownerPublic.goto(originalPath);
        await expect(
          ownerPublic.getByRole("heading", { name: "Bright desk lamp" }),
        ).toBeVisible();
        await expect(
          ownerPublic.getByRole("button", { name: "Very you", exact: true }),
        ).toHaveCount(0);
        await expect(
          ownerPublic.getByRole("link", {
            name: "Sign in to react",
            exact: true,
          }),
        ).toHaveCount(0);
        await expectPublicPrivacy(ownerPublic, owner.email);
      } finally {
        await ownerPublic.close();
      }

      // The simplified sheet deliberately has no revoke control. Exercise the
      // retained owner-scoped RPC as this synthetic authenticated fixture, then
      // verify subsequent public document/image reads and UI re-enabling.
      // Select only booleans/version: capability tokens never enter SQL output.
      const revoked = runStackSql(`begin;
        set local role authenticated;
        ${withIdentity(
          owner.id,
          `
          select enabled::text || '|' || version::text || '|' || (share_token is null)::text
          from public.revoke_wishlist_share((select version from public.own_wishlist_share_state()));
        `,
        )}
        commit;`).trim();
      expect(revoked).toBe("false|1|true");
      await page.reload();
      await page
        .getByRole("button", { name: "Share wishlist", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "Enable sharing", exact: true }),
      ).toBeVisible();
      expect((await visitor.request.get(imageRoute)).status()).toBe(404);
      await visitor.reload();
      await expect(
        visitor.getByRole("heading", {
          name: "This wishlist isn’t available.",
        }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Enable sharing", exact: true })
        .click();
      await expect(dialog.getByLabel("Public wishlist link")).toBeVisible();
      const replacement = new URL(
        await dialog.getByLabel("Public wishlist link").inputValue(),
      ).pathname;
      expect(replacement !== originalPath).toBe(true);
      await visitor.goto(originalPath);
      await expect(
        visitor.getByRole("heading", {
          name: "This wishlist isn’t available.",
        }),
      ).toBeVisible();
      await visitor.goto(replacement);
      await expect(
        visitor.getByRole("heading", { name: "Bright desk lamp" }),
      ).toBeVisible();
    } finally {
      await anonymous.close();
    }
  });
});

for (const fresh of [false, true]) {
  test(`${fresh ? "fresh" : "returning"} Mailpit sign-in returns to the public wishlist without auto-reacting`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const scope = new FixtureScope();
    await scope.run(async () => {
      const groupId = randomUUID();
      const owner = await fixtureProfile(
        scope,
        "share-return-owner",
        "Wishlist Host",
        [groupId],
      );
      const viewer = await fixtureProfile(
        scope,
        "share-return-viewer",
        fresh ? undefined : "Returning Friend",
      );
      runStackSql(`begin;
        insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id)
        values('${groupId}','Private birthday planning','Birthday','2026-11-07 18:00:00+05:30','Asia/Kolkata','wishlist_only','${owner.id}');
        insert into public.group_members(group_id,user_id,status,participating,joined_at,membership_generation)
        values('${groupId}','${owner.id}','joined',true,now(),1);
        commit;`);
      await seedWishlistItems(stackAdminClient(), owner.id, [
        {
          id: randomUUID(),
          title: "Public ceramic mug",
          sort_position: 0,
        },
      ]);
      await mailpitLogin(page, owner.email);
      const publicPath = await sharingPath(page);
      const viewerContext = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: page.viewportSize(),
        deviceScaleFactor: 1,
      });
      try {
        const visitor = await viewerContext.newPage();
        await visitor.goto(publicPath);
        await visitor
          .getByRole("link", { name: "Sign in to react", exact: true })
          .click();
        await visitor.waitForURL((url) => url.pathname === "/auth");
        const authUrl = new URL(visitor.url());
        expect(authUrl.pathname).toBe("/auth");
        expect(authUrl.searchParams.get("intent")).toBe("public-wishlist");
        const token = publicPath.slice(3);
        expect(authUrl.searchParams.get("share") === token).toBe(true);
        await mailpitLogin(
          visitor,
          viewer.email,
          fresh ? "onboarding" : "home",
          {
            authPath: `${authUrl.pathname}${authUrl.search}`,
            returnPath: fresh ? `/onboarding?share=${token}` : publicPath,
          },
        );
        if (fresh) {
          await visitor
            .getByLabel("What should friends call you?")
            .fill("Fresh Friend");
          await visitor
            .getByRole("button", { name: "Let’s go", exact: true })
            .click();
          await visitor.waitForURL((url) => url.pathname === publicPath);
        }
        await expect(
          visitor.getByRole("heading", {
            name: "Wishlist Host's wishlist",
            exact: true,
          }),
        ).toBeVisible();
        const card = visitor
          .getByRole("list", { name: "Wishlist items" })
          .getByRole("article");
        const veryYou = card.getByRole("button", {
          name: "Very you",
          exact: true,
        });
        const wantIt = card.getByRole("button", {
          name: "Want it too",
          exact: true,
        });
        await expect(veryYou).toHaveAttribute("aria-pressed", "false");
        await expect(wantIt).toHaveAttribute("aria-pressed", "false");
        await expect(
          card.getByText("Be the first to react", { exact: true }),
        ).toBeVisible();
        await expectPublicPrivacy(visitor, owner.email);
        expect(
          runStackSql(
            `select count(*) from public.group_members where user_id='${viewer.id}';`,
          ).trim(),
        ).toBe("0");
        await veryYou.click();
        await expect(veryYou).toHaveAttribute("aria-pressed", "true");
        await visitor.reload();
        await expect(veryYou).toHaveAttribute("aria-pressed", "true");
        await wantIt.click();
        await expect(wantIt).toHaveAttribute("aria-pressed", "true");
        await expect(veryYou).toHaveAttribute("aria-pressed", "false");
        await expect(card.getByRole("status")).toHaveText("1 reaction");
        await capture(
          visitor,
          `public-${fresh ? "fresh" : "returning"}-reaction`,
        );
        await page.goto(publicPath);
        await expect(page.getByRole("status")).toContainText("1 reaction");
        await expect(
          page.getByRole("button", { name: "Want it too", exact: true }),
        ).toHaveCount(0);
        await wantIt.click();
        await expect(wantIt).toHaveAttribute("aria-pressed", "false");
        await visitor.reload();
        await expect(
          card.getByText("Be the first to react", { exact: true }),
        ).toBeVisible();
        await expectPublicPrivacy(visitor, owner.email);
      } finally {
        await viewerContext.close();
      }
    });
  });
}
