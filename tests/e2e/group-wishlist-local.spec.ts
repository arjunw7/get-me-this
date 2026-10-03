import { expect, test } from "@playwright/test";

import {
  deleteFixtureGroupsSql,
  runStackSql,
  withIdentity,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated member wishlist browsing proof (006e) against the LOCAL
 * Supabase stack, run through scripts/e2e-local-stack.sh: a real organizer
 * session (created through the UI) browses SQL-fixture members'
 * wishlists from the 006d room roster. The suite covers the roster entry
 * link, direct navigation, the populated and authorized-empty wishlist
 * states, the owner self-view redirect, keyboard use, safe external
 * links, no-store cache headers, no-capture marking, and the uniform
 * denial matrix (signed-out, outsider, pending viewer, guessed and
 * malformed ids, committed removal).
 *
 * No probe prints roster or wishlist material: assertions reference fixed
 * synthetic names and shapes only.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Fixture browse bash";
const MEMBER_NAMES = ["Organizer Ona", "Joined Jay", "Joined Nia"];

/** A SQL-only fixture user (auth.users row + trigger profile). */
function addSqlUser(userId: string, email: string): void {
  runStackSql(`
    insert into auth.users (id, aud, role, email, encrypted_password)
    values ('${userId}'::uuid, 'authenticated', 'authenticated', '${email}', '');`);
}

/** A SQL-only fixture member row. */
function addSqlMember(
  groupId: string,
  userId: string,
  status: "invited" | "joined" | "removed",
  displayName: string | null,
  joinedAtSql: string,
): void {
  runStackSql(`
    insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
    values ('${groupId}'::uuid, '${userId}'::uuid, '${status}', ${status === "joined"}, ${joinedAtSql}, 1);`);
  if (displayName !== null) {
    runStackSql(
      `update public.profiles set display_name = '${displayName}' where id = '${userId}'::uuid;`,
    );
  }
}

/** Seeds the populated fixture wishlist for the given member. */
function seedItems(userId: string, emailTag: string): void {
  runStackSql(`
    insert into public.wishlist_items (
      wishlist_id, owner_id, title, source_url, retailer, image_url,
      note, original_amount_minor, original_currency,
      desire_level, extraction_status, sort_position
    )
    values
      ((select id from public.wishlists where owner_id = '${userId}'::uuid), '${userId}'::uuid,
       'Pour-over kettle',
       'https://shop.example.invalid/${emailTag}-kettle', 'Fixture Roasters',
       'https://img.example.invalid/${emailTag}-kettle.jpg',
       'The 1 litre one.', '249900', 'INR', 'really_want', 'manual', 2),
      ((select id from public.wishlists where owner_id = '${userId}'::uuid), '${userId}'::uuid,
       'Ceramic mug', null, null, null, null, null, null, 'just_an_idea', 'manual', 1);
  `);
}

test("the member wishlist route redirects signed-out visitors to sign-in", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(15_000);

  await page.goto(
    "/groups/00000000-0000-4000-8000-00000000dead/members/00000000-0000-4000-8000-00000000dead/wishlist",
  );
  await expect(page).toHaveURL(/\/auth/);
});

test("a joined member browses friends' wishlists from the room roster", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  // The fixed-id SQL fixtures are scoped per Playwright project: the mobile
  // and desktop runs may execute concurrently on a developer machine, and
  // shared uuids or email lookups would collide (CI runs one worker at a
  // time; local runs do not).
  const projectTag = testInfo.project.name === "desktop" ? "b" : "a";
  const sqlUserId = (n: number): string =>
    `8f390000-0000-4000-8000-00000000${projectTag}4${String(n).padStart(2, "0")}`;

  await scope.run(async () => {
    // The organizer creates the group through the real UI.
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj39-organizer",
      { displayName: MEMBER_NAMES[0], tasteLine: "browses politely" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page
      .getByLabel("Date")
      .fill(new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];

    const [jayId, pendingId, niaId] = [1, 2, 3].map(sqlUserId);
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId, jayId, pendingId, niaId]);
      // The SQL-only fixture users are not admin-API fixtures: their
      // trigger-created profiles and auth rows go last, after the group
      // teardown has removed the restricting references.
      runStackSql(`
        delete from public.profiles where id in (${[jayId, pendingId, niaId].map((id) => `'${id}'::uuid`).join(",")});
        delete from auth.users where id in (${[jayId, pendingId, niaId].map((id) => `'${id}'::uuid`).join(",")});`);
    });

    // Roster: the populated wishlist member, the empty wishlist member,
    // and a pending invitee. The organizer's own wishlist stays empty so
    // the self-view redirect can be proven against /wishlist.
    addSqlUser(jayId, `arj39-jay-${projectTag}@example.invalid`);
    addSqlUser(niaId, `arj39-nia-${projectTag}@example.invalid`);
    addSqlUser(pendingId, `arj39-pending-${projectTag}@example.invalid`);
    addSqlMember(
      groupId,
      jayId,
      "joined",
      MEMBER_NAMES[1],
      "clock_timestamp() - interval '2 hours'",
    );
    addSqlMember(
      groupId,
      niaId,
      "joined",
      MEMBER_NAMES[2],
      "clock_timestamp() - interval '1 hour'",
    );
    addSqlMember(
      groupId,
      pendingId,
      "invited",
      "Pending Pia",
      "clock_timestamp()",
    );
    seedItems(jayId, `${projectTag}4`);

    // --- roster entry link -------------------------------------------------
    await page.getByTestId("open-group").click();
    await page.waitForURL(`**/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    const rosterLinks = page.getByTestId("roster-member-link");
    await expect(rosterLinks).toHaveCount(3);

    // Keyboard use: the roster link is focusable and activates with Enter.
    await rosterLinks.filter({ hasText: MEMBER_NAMES[1] }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/groups/${groupId}/members/${jayId}/wishlist`);

    // --- the populated friend wishlist -------------------------------------
    const documentResponse = await page.reload();
    expect(documentResponse?.headers()["cache-control"]).toContain("no-store");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `${MEMBER_NAMES[1]}'s wishlist`,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Wishlists are shared only with joined group members."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Back to ${GROUP_NAME}` }),
    ).toBeVisible();
    await expect(page.getByTestId("member-wishlist-item")).toHaveCount(2);
    // The mug is seeded first (sort_position 1), the kettle second.
    const mug = page.getByTestId("member-wishlist-item").first();
    const card = page
      .getByTestId("member-wishlist-item")
      .filter({ hasText: "Pour-over kettle" });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("2499.00 INR");
    await expect(card).toContainText("The 1 litre one.");
    await expect(mug).toContainText("Just an idea");
    await expect(mug).not.toContainText("INR");
    await expect(page.getByTestId("member-wishlist-empty")).toHaveCount(0);

    // The external link carries the noopener contract.
    const external = card.getByRole("link", {
      name: /opens in a new tab/,
    });
    await expect(external).toHaveAttribute("target", "_blank");
    await expect(external).toHaveAttribute("rel", "noopener noreferrer");

    // The browse surface is blocked from autocapture and session replay
    // (React renders the bare marker attribute as "true").
    expect(
      await page
        .getByTestId("member-wishlist")
        .getAttribute("data-ph-no-capture"),
    ).not.toBeNull();

    // Review-only visual candidate (no baseline adoption without
    // product/design approval).
    await testInfo.attach("member-wishlist-populated", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    // --- the authorized-empty friend wishlist ------------------------------
    await page.goto(`/groups/${groupId}/members/${niaId}/wishlist`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `${MEMBER_NAMES[2]}'s wishlist`,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("member-wishlist-empty")).toBeVisible();
    await expect(page.getByTestId("member-wishlist-item")).toHaveCount(0);
    await expect(page.getByText("Add an item")).toHaveCount(0);
    await expect(page.getByText("Edit item")).toHaveCount(0);

    await testInfo.attach("member-wishlist-empty", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    // --- the owner self-view redirects to /wishlist ------------------------
    // (The glob form would also match the member route itself, which ends
    // in /wishlist.)
    await page.goto(`/groups/${groupId}/members/${organizerId}/wishlist`);
    await page.waitForURL((url) => url.pathname === "/wishlist");
    expect(new URL(page.url()).pathname).toBe("/wishlist");

    // --- denial matrix -----------------------------------------------------
    // Pending viewer: a live pending member sees the generic not-found
    // result with no group or wishlist material.
    const pendingContext = await page.context().browser()!.newContext();
    try {
      const pendingPage = await pendingContext.newPage();
      await createSignedInFixture(
        pendingPage,
        admin,
        `arj39-${projectTag}-browser-pending`,
        { displayName: "Pending Pia", tasteLine: "waits for the link" },
        scope,
      );
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, membership_generation)
        values ('${groupId}'::uuid, (
          select id from auth.users where email like 'arj39-${projectTag}-browser-pending-%@example.invalid' limit 1
        ), 'invited', false, 1);`);

      await pendingPage.goto(`/groups/${groupId}/members/${jayId}/wishlist`);
      await expect(
        pendingPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      const html = await pendingPage.content();
      expect(html).not.toContain(GROUP_NAME);
      expect(html).not.toContain(MEMBER_NAMES[1]);
      expect(html).not.toContain("Pour-over kettle");
    } finally {
      await pendingContext.close();
    }

    // Guessed member id and malformed id: the same not-found result.
    await page.goto(
      `/groups/${groupId}/members/00000000-0000-4000-8000-00000000dead/wishlist`,
    );
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await page.goto(`/groups/${groupId}/members/not-a-uuid/wishlist`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();

    // A committed removal ends the access on the next navigation.
    runStackSql(
      withIdentity(
        organizerId,
        `select result from public.remove_group_member('${groupId}'::uuid, '${jayId}'::uuid);`,
      ),
    );
    await page.goto(`/groups/${groupId}/members/${jayId}/wishlist`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByText("Pour-over kettle")).toHaveCount(0);
  });
});
