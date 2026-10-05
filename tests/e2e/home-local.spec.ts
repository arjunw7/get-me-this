import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated authenticated-home proof against the LOCAL Supabase stack,
 * run through scripts/e2e-local-stack.sh: a signed-in user sees their real
 * groups on /home (public.my_groups_snapshot), can navigate into a group
 * room and the wishlist, and a signed-in user with no groups sees the
 * branded empty state with the Create a group entry. Group fixtures use
 * per-run random uuids so concurrent Playwright projects never collide.
 *
 * No probe prints session or invitation material: assertions reference
 * fixed synthetic names and shapes only.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Home fixture gathering";

/** A SQL fixture group joined by the given user, with a fresh random id. */
function addFixtureGroup(organizerId: string): string {
  const groupId = randomUUID();
  runStackSql(`
    insert into public."groups" (id, name, occasion, occasion_at, time_zone, mode, organizer_id)
    values (
      '${groupId}'::uuid,
      '${GROUP_NAME}',
      'Diwali',
      '2026-11-07 18:00:00+05:30',
      'Asia/Kolkata',
      'secret_draw',
      '${organizerId}'::uuid
    );
    insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
    values ('${groupId}'::uuid, '${organizerId}'::uuid, 'joined', true, clock_timestamp(), 1);`);
  return groupId;
}

test("the home route redirects signed-out visitors to sign-in", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(15_000);

  await page.goto("/home");
  await expect(page).toHaveURL(/\/auth/);
});

test("a signed-in user's landing visit offers Dashboard instead of Log in (ARJ-54)", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "landing-signed-in",
      { displayName: "Landing Ina", tasteLine: "lands signed in" },
      scope,
    );

    // Returning to the public landing reflects the persisted session:
    // the header offers the Dashboard entry, not a redundant Log in.
    await page.goto("/");
    const dashboard = page.getByRole("link", { name: "Dashboard" });
    await expect(dashboard).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" })).toHaveCount(0);

    // Click-through: the entry reaches the real authenticated home.
    await dashboard.click();
    await page.waitForURL("**/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome in, Landing." }),
    ).toBeVisible();
  });
});

test("a signed-in user with groups sees them and can navigate onward", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "home-organizer",
      { displayName: "Home Ona", tasteLine: "tests the home" },
      scope,
    );
    const groupId = addFixtureGroup(organizerId);
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId]);
    });

    await page.goto("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Hey Home." }),
    ).toBeVisible();
    await expect(page.getByTestId("my-group-card")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: GROUP_NAME })).toBeVisible();
    await expect(page.getByText("1 in", { exact: true })).toBeVisible();

    // The group card navigates to the real group room.
    await page.getByTestId("my-group-card").click();
    await page.waitForURL(`**/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    // Back home, the wishlist block navigates to the real wishlist.
    await page.goto("/home");
    await page.getByTestId("home-wishlist-link").click();
    await page.waitForURL("**/wishlist");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});

test("a signed-in user with no groups sees the branded empty state", async ({
  page,
}) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const userId = await createSignedInFixture(
      page,
      admin,
      "home-empty",
      { displayName: "Empty Eno", tasteLine: "no groups yet" },
      scope,
    );

    await page.goto("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome in, Empty." }),
    ).toBeVisible();
    await expect(page.getByText("Step 2 · Your people")).toBeVisible();
    await expect(page.getByTestId("my-group-card")).toHaveCount(0);

    // The empty state's Create a group entry goes to the real creation flow.
    await page.getByRole("link", { name: "Create a group" }).last().click();
    await page.waitForURL("**/groups");

    // First-use Home offers the wishlist step even with no groups or items.
    await page.goto("/home");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Add something you’d love to get",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Paste a product link from any shop" }),
    ).toBeVisible();

    // Nothing about the empty home leaks another user's group content.
    expect(await page.getByTestId("my-group-card").count()).toBe(0);
    expect(userId).toBeTruthy();

    // The step's wishlist entry reaches this user's real empty wishlist.
    await page
      .getByRole("navigation", { name: "Main" })
      .filter({ visible: true })
      .getByRole("link", { name: "My wishlist", exact: true })
      .click();
    await page.waitForURL("**/wishlist");
    const profile = page.getByRole("region", {
      name: "Empty Eno",
      exact: true,
    });
    await expect(profile).toBeVisible();
    await expect(profile.getByText("0 things", { exact: true })).toHaveCount(0);
  });
});
