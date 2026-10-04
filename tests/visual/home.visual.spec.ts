import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Visual candidate capture for the authenticated home (fast-lane brief:
 * real authenticated home). The approved state families — a user with one
 * group, and the branded no-groups empty state — are captured at this
 * project's viewport.
 *
 * NO BASELINE IS ADOPTED: the captures attach to the test report as review
 * candidates for independent product/design comparison against the pinned
 * V18 `home-new-account` reference. A baseline change is a separate owner
 * decision. Deterministic rendering: a fixed fixture group, fixed synthetic
 * names, a fixed future occasion date, and the app's pinned fonts;
 * test-only fixture data never ships in production.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Home visual fixture";

async function capture(page: Page, name: string): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true });
  await test.info().attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}

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

test("the authenticated home's state families are captured for review", async ({
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
      "home-visual-organizer",
      { displayName: "Visual Ona", tasteLine: "reviews the home" },
      scope,
    );
    const groupId = addFixtureGroup(organizerId);
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId]);
    });

    await page.goto("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Hey Visual." }),
    ).toBeVisible();
    await expect(page.getByTestId("my-group-card")).toHaveCount(1);
    await capture(page, "home-with-group-full-page");

    const emptyContext = await page
      .context()
      .browser()!
      .newContext({ viewport: page.viewportSize(), deviceScaleFactor: 1 });
    try {
      const emptyPage = await emptyContext.newPage();
      await createSignedInFixture(
        emptyPage,
        admin,
        "home-visual-empty",
        { displayName: "Empty Eno", tasteLine: "no groups yet" },
        scope,
      );
      await emptyPage.goto("/home");
      await expect(
        emptyPage.getByRole("heading", {
          level: 1,
          name: "Welcome in, Empty.",
        }),
      ).toBeVisible();
      await expect(
        emptyPage.getByRole("heading", {
          name: "Add something you’d love to get",
        }),
      ).toBeVisible();
      await capture(emptyPage, "home-empty-full-page");
    } finally {
      await emptyContext.close();
    }
  });
});
