import { expect, test } from "@playwright/test";

import {
  FixtureScope,
  createSignedInFixture,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Visual candidate capture for the wishlist EMPTY state (005b), compared
 * against the pinned V18 `wishlist-empty` references
 * (docs/design-reference/baselines/v18/wishlist-empty--{mobile,desktop}) at
 * the two approved viewports (mobile 390x844, desktop 1440x1000) — same
 * route, state, and scroll position, no overlays (route-map review
 * procedure). Stack-gated: the signed-in owner session is established
 * through the real surface against the local Supabase stack (CI database
 * job) via scripts/e2e-local-stack.sh.
 *
 * Accepted differences documented for owner review (brief resolutions 1
 * and 3): the CTA label is "Add an item" (approved vocabulary) instead of
 * the prototype's "Add from a link"; the header carries no theme colour,
 * no "visible to N groups" line, and the initials disc instead of an
 * avatar image; no Edit profile / Share buttons. The comparison holds
 * structure, layout hierarchy, typography, and accent usage.
 *
 * Determinism: fresh fixture user (real signup path, deleted in teardown),
 * fixed profile values, animations disabled, caret hidden, full-page
 * capture. The wishlist renders no time-dependent content (no dates, no
 * countdowns — created_at is never displayed), so no clock freezing is
 * needed. No images: the empty composition is pure art.
 */

test("the signed-in empty wishlist matches the pinned V18 empty composition", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.E2E_LOCAL_SUPABASE,
    "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
  );

  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "wishlist-visual-empty",
      {
        displayName: "Ada",
        tasteLine: "currently in my tiny-luxuries era",
      },
      scope,
    );

    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);

    // Guard: the intended state rendered — a passing screenshot of any
    // other frame is not acceptable evidence.
    await expect(
      page.getByRole("heading", { name: "Very minimalist of you." }),
    ).toBeVisible();
    await expect(page.getByText("0 things")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add an item" })).toBeVisible();

    await expect(page).toHaveScreenshot(
      `wishlist-empty-${testInfo.project.name}.png`,
      {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      },
    );
  });
});
