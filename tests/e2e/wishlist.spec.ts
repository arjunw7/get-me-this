import { expect, test } from "@playwright/test";

/**
 * Signed-out protection for the wishlist routes (005b), running against
 * the production build WITHOUT provider configuration (the plain `pnpm
 * test:e2e` environment) — here the page-level `requireCompleteProfile`
 * gate is the control; the stack-gated spec (tests/e2e/wishlist-local.spec.ts)
 * re-proves the full proxy envelope — 302, no-store, no-referrer — with
 * the provider configured.
 *
 * Asserted without a provider: the redirect to /auth and the absence of
 * ANY wishlist markup (not even the empty state), for page GETs and for
 * anonymous POSTs (with and without a Server Action header) that must
 * never execute wishlist behavior.
 */

/** Copy that only the wishlist surface renders. */
const WISHLIST_MARKERS = [
  "Very minimalist of you.",
  "Add the first thing you’d secretly love to unwrap",
  "things",
  "My wishlist",
];

test("a signed-out GET of /wishlist is redirected with zero wishlist markup", async ({
  page,
}) => {
  await page.goto("/wishlist");

  await expect(page).toHaveURL(/\/auth$/);
  // Zero wishlist markup — not even the empty state.
  const body = await page.locator("body").innerText();
  for (const marker of WISHLIST_MARKERS) {
    expect(body, `signed-out body contains "${marker}"`).not.toContain(marker);
  }
  // The auth entry screen rendered.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("a signed-out GET of /wishlist/items/new is redirected with zero wishlist markup", async ({
  page,
}) => {
  await page.goto("/wishlist/items/new");

  await expect(page).toHaveURL(/\/auth$/);
  const body = await page.locator("body").innerText();
  for (const marker of WISHLIST_MARKERS) {
    expect(body, `signed-out body contains "${marker}"`).not.toContain(marker);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("a signed-out POST to /wishlist does not execute wishlist behavior", async ({
  page,
}) => {
  await page.goto("/");

  for (const withActionHeader of [false, true]) {
    // redirect: "manual" — the signed-out request must be bounced (or
    // refused), never followed to a 200 page: a followed redirect to /auth
    // would end as a 200 response and say nothing about the POST itself.
    const result = await page.evaluate(async (withHeader: boolean) => {
      const response = await fetch("/wishlist", {
        method: "POST",
        redirect: "manual",
        headers: withHeader ? { "Next-Action": "not-a-real-action" } : {},
      });
      const body = await response.text().catch(() => "");
      return { status: response.status, body };
    }, withActionHeader);

    // No 200 with wishlist content, no mutation, no data in the body.
    expect(
      result.status,
      `POST (action header: ${withActionHeader}) status`,
    ).not.toBe(200);
    for (const marker of ["Ceramic pour-over", "wishlist-owner"]) {
      expect(result.body).not.toContain(marker);
    }
  }
});
