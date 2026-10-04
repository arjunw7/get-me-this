import { randomUUID } from "node:crypto";

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
 * Stack-gated group activity proof (007d) against the LOCAL Supabase stack,
 * run through scripts/e2e-local-stack.sh: real sessions for the organizer
 * and the item owner, SQL fixtures plus the real 007c/007a RPCs for the
 * reserver's audited events.
 *
 * The binding rule is privacy: reservation entries render state-only for
 * every viewer except the reserver, and the item's owner never sees any
 * reservation entry, marker, or wording at all — while the reservation
 * demonstrably exists (the organizer's view asserts it in the same run).
 *
 * No assertion prints reserver identity material beyond the fixed
 * synthetic names.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Activity room bash";
const OWNER_NAME = "Owner Orla";
const RESERVER_NAME = "Reserver Rai";

function addSqlUser(userId: string, email: string): void {
  runStackSql(`
    insert into auth.users (id, aud, role, email, encrypted_password)
    values ('${userId}'::uuid, 'authenticated', 'authenticated', '${email}', '');`);
}

function addSqlMember(
  groupId: string,
  userId: string,
  status: "joined" | "invited",
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

test("the group room activity section: state-only wording, owner blind spot, denial", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const projectTag = testInfo.project.name === "desktop" ? "b" : "a";
  // Per-run random ids: a previous failed run's orphaned fixtures can never
  // collide with a fresh run's primary keys (the fixed-id pattern would).
  const runSqlUserId = (): string => randomUUID();
  const [reserverId, pendingId] = [runSqlUserId(), runSqlUserId()];

  await scope.run(async () => {
    // The organizer creates the group through the real UI.
    const organizerId = await createSignedInFixture(
      page,
      admin,
      `arj40-organizer-${projectTag}`,
      { displayName: "Organizer Ona", tasteLine: "watches the room" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page
      .getByLabel("Date", { exact: true })
      .fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];

    // The item owner joins through a real signed-in session on a separate
    // context so their blind spot can be observed through the real route.
    const browser = page.context().browser()!;
    const ownerPage = await browser.newPage();
    const ownerId = await createSignedInFixture(
      ownerPage,
      admin,
      `arj40-owner-${projectTag}`,
      { displayName: OWNER_NAME, tasteLine: "must not know" },
      scope,
    );
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql(
        [groupId],
        [organizerId, ownerId, reserverId, pendingId],
      );
      runStackSql(`
        delete from public.profiles where id in (${[reserverId, pendingId].map((id) => `'${id}'::uuid`).join(",")});
        delete from auth.users where id in (${[reserverId, pendingId].map((id) => `'${id}'::uuid`).join(",")});`);
    });

    // Roster: the owner and the reserver joined; the reserver named; a
    // pending member for the denial check.
    addSqlUser(
      reserverId,
      `arj40-reserver-${projectTag}-${reserverId.slice(0, 8)}@example.invalid`,
    );
    addSqlUser(
      pendingId,
      `arj40-pending-${projectTag}-${pendingId.slice(0, 8)}@example.invalid`,
    );
    addSqlMember(
      groupId,
      ownerId,
      "joined",
      OWNER_NAME,
      "clock_timestamp() - interval '2 hours'",
    );
    addSqlMember(
      groupId,
      reserverId,
      "joined",
      RESERVER_NAME,
      "clock_timestamp() - interval '1 hour'",
    );
    addSqlMember(
      groupId,
      pendingId,
      "invited",
      "Pending Pia",
      "clock_timestamp()",
    );

    // The owner's item, then the reserver claims it through the REAL 007c
    // RPC (the audited item_reserved event production writes), and reacts
    // through the REAL 007a RPC.
    runStackSql(`
      insert into public.wishlist_items (
        wishlist_id, owner_id, title, extraction_status, sort_position
      )
      values
        ((select id from public.wishlists where owner_id = '${ownerId}'::uuid),
         '${ownerId}'::uuid, 'Pour-over kettle', 'manual', 1);`);
    const itemId = runStackSql(`
      select id from public.wishlist_items
      where owner_id = '${ownerId}'::uuid and title = 'Pour-over kettle';`).trim();
    runStackSql(
      withIdentity(
        reserverId,
        `select result from public.reserve_group_item('${groupId}'::uuid, '${itemId}'::uuid);`,
      ),
    );
    runStackSql(
      withIdentity(
        reserverId,
        `select very_you_count from public.set_group_item_reaction('${groupId}'::uuid, '${itemId}'::uuid, 'very_you');`,
      ),
    );

    // --- the organizer's room: populated, state-only, self-labelled -------
    await page.getByTestId("open-group").click();
    await page.waitForURL(`**/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    const activity = page.getByTestId("activity-section");
    await expect(activity).toBeVisible();
    await expect(page.getByTestId("activity-list")).toBeVisible();
    await expect(page.getByTestId("activity-empty")).toHaveCount(0);

    // Membership events name their actor — self-labelled for the viewer
    // themself. (The reserver and the other members are SQL fixtures with
    // no invitation_accepted audit event, so the only membership entries
    // are the creator's.)
    await expect(activity.getByText("You created the group")).toBeVisible();
    await expect(activity.getByText(/joined the group/)).toHaveCount(0);
    await expect(
      activity.getByText("A gift was reserved for Owner Orla"),
    ).toBeVisible();
    await expect(
      activity.getByText(new RegExp(`${RESERVER_NAME} reserved`)),
    ).toHaveCount(0);

    // The reaction entry names the actor (the social fact 007a exposes).
    await expect(
      activity.getByText(`${RESERVER_NAME} reacted to Pour-over kettle`),
    ).toBeVisible();

    // Review-only visual candidate (no baseline adoption without
    // product/design approval).
    await testInfo.attach("group-activity-populated", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });

    // --- the owner's blind spot --------------------------------------------
    await ownerPage.goto(`/groups/${groupId}`);
    await expect(
      ownerPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    const ownerActivity = ownerPage.getByTestId("activity-section");
    await expect(ownerActivity).toBeVisible();
    // The owner sees membership and reaction entries but zero reservation
    // entries, markers, or wording — while the reservation demonstrably
    // exists above.
    await expect(ownerActivity.getByText(/reserved/i)).toHaveCount(0);
    await expect(ownerPage.getByText(/reserved/i)).toHaveCount(0);
    await expect(
      ownerActivity.getByText(`${RESERVER_NAME} reacted to Pour-over kettle`),
    ).toBeVisible();

    await testInfo.attach("group-activity-owner-blind", {
      body: await ownerPage.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await ownerPage.context().close();

    // --- denial: a pending member gets the generic not-found result -------
    const pendingContext = await browser.newContext();
    try {
      const pendingPage = await pendingContext.newPage();
      const browserPendingId = await createSignedInFixture(
        pendingPage,
        admin,
        `arj40-${projectTag}-browser-pending`,
        { displayName: "Pending Pia", tasteLine: "waits" },
        scope,
      );
      scope.register("pending fixture membership", async () => {
        runStackSql(
          `delete from public.group_members where group_id = '${groupId}'::uuid and user_id = '${browserPendingId}'::uuid;`,
        );
      });
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, membership_generation)
        values ('${groupId}'::uuid, '${browserPendingId}'::uuid, 'invited', false, 1);`);
      await pendingPage.goto(`/groups/${groupId}`);
      await expect(
        pendingPage.getByText(/Not found|not found/i).first(),
      ).toBeVisible();
      await expect(pendingPage.getByTestId("activity-section")).toHaveCount(0);
    } finally {
      await pendingContext.close();
    }
  });
});
