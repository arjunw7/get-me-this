import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
 * Stack-gated copy-to-own-wishlist proof (007b) against the LOCAL Supabase
 * stack, run through scripts/e2e-local-stack.sh: a real joined member
 * (the group's organizer) copies a SQL-fixture friend item from the 006e
 * member-wishlist page into their own wishlist, sees the designed success
 * and already-copied states, and finds the copied item editable in their
 * own wishlist. The denial classes are covered by the uniform not-found
 * surface (a pending member and a guessed id never see the copy affordance
 * at all); the database-level uniform denials are proven by the pgTAP
 * suite and the 007b race harness.
 *
 * No probe prints wishlist material beyond the fixed synthetic fixture
 * strings.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Fixture copy bash";
const FRIEND_NAME = "Friend Fabi";

function addSqlUser(userId: string, email: string): void {
  runStackSql(`
    insert into auth.users (id, aud, role, email, encrypted_password)
    values ('${userId}'::uuid, 'authenticated', 'authenticated', '${email}', '');`);
}

function addSqlMember(
  groupId: string,
  userId: string,
  status: "invited" | "joined",
  displayName: string | null,
): void {
  runStackSql(`
    insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
    values ('${groupId}'::uuid, '${userId}'::uuid, '${status}', ${status === "joined"}, clock_timestamp(), 1);`);
  if (displayName !== null) {
    runStackSql(
      `update public.profiles set display_name = '${displayName}' where id = '${userId}'::uuid;`,
    );
  }
}

test("a joined member copies a friend's item into their own wishlist", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const projectTag = testInfo.project.name === "desktop" ? "b" : "a";
  const friendId = `9c100000-0000-4000-8000-0000000${projectTag}0001`;

  await scope.run(async () => {
    // The copier creates the group through the real UI and joins it as
    // organizer; the friend is a SQL-fixture joined member with one item.
    const copierId = await createSignedInFixture(
      page,
      admin,
      `arj40-copier-${projectTag}`,
      { displayName: "Copier Cora", tasteLine: "takes the hint" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page
      .getByLabel("Date", { exact: true })
      .fill(new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];

    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [copierId, friendId]);
      runStackSql(`
        delete from public.profiles where id = '${friendId}'::uuid;
        delete from auth.users where id = '${friendId}'::uuid;`);
    });

    addSqlUser(friendId, `arj40-friend-${projectTag}@example.invalid`);
    addSqlMember(groupId, friendId, "joined", FRIEND_NAME);
    runStackSql(`
      insert into public.wishlist_items (
        wishlist_id, owner_id, title, source_url, retailer, image_url, note,
        original_amount_minor, original_currency, desire_level, extraction_status, sort_position
      )
      values (
        (select id from public.wishlists where owner_id = '${friendId}'::uuid),
        '${friendId}'::uuid,
        'Copy-test kettle',
        'https://shop.example.invalid/${projectTag}-copy-kettle',
        'Fixture Roasters',
        'https://img.example.invalid/${projectTag}-copy-kettle.jpg',
        'The 1 litre one.',
        '249900', 'INR', 'really_want', 'manual', 1
      );`);

    // --- the copy affordance and its success state -------------------------
    await page.goto(`/groups/${groupId}/members/${friendId}/wishlist`);
    const card = page
      .getByTestId("member-wishlist-item")
      .filter({ hasText: "Copy-test kettle" });
    await expect(card).toHaveCount(1);

    // The copy affordance submits in place: no navigation, a brief
    // in-progress state, then the designed success confirmation.
    const copyButton = card.getByTestId("copy-to-wishlist");
    await copyButton.click();

    await expect(card.getByRole("status")).toContainText(
      "Copied to your wishlist",
    );
    await expect(copyButton).toHaveCount(0);
    await expect(
      card.getByRole("img", { name: "Copy Cat — copied to your wishlist" }),
    ).toBeVisible();

    // --- the copied item appears in the copier's own wishlist --------------
    await page.goto("/wishlist");
    const ownItem = page
      .getByRole("article")
      .filter({ hasText: "Copy-test kettle" });
    await expect(ownItem).toHaveCount(1);
    // Fully editable through the existing owner flows.
    await expect(
      ownItem.getByRole("link", { name: "Edit Copy-test kettle" }),
    ).toBeAttached();
    // Nothing about the copy — provenance, source owner, source group — is
    // rendered anywhere.
    const ownHtml = await page.content();
    expect(ownHtml).not.toContain(friendId);
    expect(ownHtml).not.toContain(GROUP_NAME);
    expect(ownHtml).not.toContain("copied");

    // --- the already-copied state ------------------------------------------
    await page.goto(`/groups/${groupId}/members/${friendId}/wishlist`);
    // A current copy is a persistent confirmation, not a repeat-submit action.
    const sticker = card.getByRole("img", {
      name: "Copy Cat — copied to your wishlist",
    });
    await expect(sticker).toBeVisible();
    await expect(card.getByTestId("copy-to-wishlist")).toHaveCount(0);
    await page.reload();
    await expect(sticker).toBeVisible();
    await expect(card.getByTestId("copy-to-wishlist")).toHaveCount(0);
    expect(
      runStackSql(
        `select count(*) from public.wishlist_items where owner_id='${copierId}'::uuid and copied_from_item_id=(select id from public.wishlist_items where owner_id='${friendId}'::uuid and title='Copy-test kettle');`,
      ).trim(),
    ).toBe("1");

    // Keep the populated read-only confirmation accessible.
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);

    // --- the uniform denial surface -----------------------------------------
    // A pending member and a guessed member id get the generic not-found
    // result: no copy affordance, no wishlist material, no enumeration.
    await page.goto(
      `/groups/${groupId}/members/00000000-0000-4000-8000-00000000dead/wishlist`,
    );
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();

    // A committed removal of the copier ends everything on the next
    // navigation — including the copy affordance.
    runStackSql(
      withIdentity(
        copierId,
        // The organizer removes the friend through the compare-and-swap 006f
        // overload at the group's current member-admin version; the copier's
        // own removal is proven by the 007b race harness at the database
        // level.
        `select member_admin_version from public.remove_group_member('${groupId}'::uuid, '${friendId}'::uuid, (select member_admin_version from public."groups" where id = '${groupId}'::uuid));`,
      ),
    );
    await page.goto(`/groups/${groupId}/members/${friendId}/wishlist`);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
  });
});
