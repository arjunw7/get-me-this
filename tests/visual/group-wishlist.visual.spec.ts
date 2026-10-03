import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Member wishlist browsing (006e) review-only candidates and accessibility
 * scans, gated by the local Supabase stack. The brief's two approved state
 * families (populated and authorized-empty friend wishlists) are captured
 * per viewport as screenshot candidates into test-results/arj39-candidates
 * and scanned with axe at the pinned WCAG tags with the 44px touch-target
 * check. NO baseline is adopted: baseline changes require explicit
 * product/design approval (docs/delivery/visual-baselines.md).
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CANDIDATE_DIR = join(process.cwd(), "test-results", "arj39-candidates");

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Fixture browse visual";

function addSqlUser(userId: string, email: string): void {
  runStackSql(`
    insert into auth.users (id, aud, role, email, encrypted_password)
    values ('${userId}'::uuid, 'authenticated', 'authenticated', '${email}', '');`);
}

function addSqlMember(
  groupId: string,
  userId: string,
  displayName: string,
  joinedAtSql: string,
): void {
  runStackSql(`
    insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
    values ('${groupId}'::uuid, '${userId}'::uuid, 'joined', true, ${joinedAtSql}, 1);
    update public.profiles set display_name = '${displayName}' where id = '${userId}'::uuid;`);
}

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

test("member wishlist states yield matched responsive candidates and clean axe scans", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  mkdirSync(CANDIDATE_DIR, { recursive: true });
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const viewport = testInfo.project.name;
  const projectTag = viewport === "desktop" ? "b" : "a";
  const sqlUserId = (n: number): string =>
    `8f3a0000-0000-4000-8000-00000000${projectTag}5${String(n).padStart(2, "0")}`;
  const axeStates: Array<{ state: string; violationIds: string[] }> = [];
  const capture = async (
    state: string,
    options?: { checkTargets?: boolean },
  ) => {
    const file = `arj39-${state}-${viewport}.png`;
    await page.screenshot({
      path: join(CANDIDATE_DIR, file),
      fullPage: true,
      animations: "disabled",
    });
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    axeStates.push({
      state,
      violationIds: axe.violations.map((violation) => violation.id),
    });
    expect(axe.violations.map(({ id, impact }) => ({ id, impact }))).toEqual(
      [],
    );
    if (options?.checkTargets === false) return;
    const undersized = await page
      .locator(
        "button:visible, a[href]:visible, input:not([type=radio]):visible, select:visible, textarea:visible",
      )
      .evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            tag: node.tagName,
            height: Math.round(node.getBoundingClientRect().height),
            text: node.textContent?.slice(0, 40) ?? "",
            href:
              node instanceof HTMLAnchorElement
                ? (node.getAttribute("href") ?? "")
                : "",
          }))
          .filter((node) => node.height < 44),
      );
    expect(undersized).toEqual([]);
  };

  await scope.run(async () => {
    // The viewer creates the group through the real UI and stays signed in.
    const viewerId = await createSignedInFixture(
      page,
      admin,
      "arj39-visual-viewer",
      { displayName: "Vera Viewer", tasteLine: "scans the shelves" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill(GROUP_NAME);
    await page
      .getByLabel("Date")
      .fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];

    const [populatedId, emptyId] = [1, 2].map(sqlUserId);
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [viewerId, populatedId, emptyId]);
      runStackSql(`
        delete from public.profiles where id in (${[populatedId, emptyId].map((id) => `'${id}'::uuid`).join(",")});
        delete from auth.users where id in (${[populatedId, emptyId].map((id) => `'${id}'::uuid`).join(",")});`);
    });

    addSqlUser(
      populatedId,
      `arj39-visual-populated-${projectTag}@example.invalid`,
    );
    addSqlUser(emptyId, `arj39-visual-empty-${projectTag}@example.invalid`);
    addSqlMember(
      groupId,
      populatedId,
      "Populated Pia",
      "clock_timestamp() - interval '2 hours'",
    );
    addSqlMember(
      groupId,
      emptyId,
      "Empty Nia",
      "clock_timestamp() - interval '1 hour'",
    );
    seedItems(populatedId, `${projectTag}5`);

    // Populated friend wishlist.
    await page.goto(`/groups/${groupId}/members/${populatedId}/wishlist`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Populated Pia's wishlist",
      }),
    ).toBeVisible();
    await expect(page.getByTestId("member-wishlist-item")).toHaveCount(2);
    await capture("populated");

    // Authorized-empty friend wishlist.
    await page.goto(`/groups/${groupId}/members/${emptyId}/wishlist`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Empty Nia's wishlist" }),
    ).toBeVisible();
    await expect(page.getByTestId("member-wishlist-empty")).toBeVisible();
    await capture("empty");

    // Own state: the route redirects server-side to /wishlist; the axe
    // surface is the owner wishlist the viewer lands on. (The glob form
    // would also match the member route itself, which ends in /wishlist.)
    await page.goto(`/groups/${groupId}/members/${viewerId}/wishlist`);
    await page.waitForURL((url) => url.pathname === "/wishlist");
    expect(new URL(page.url()).pathname).toBe("/wishlist");
    await expect(
      page.getByRole("heading", { level: 1, name: "Vera Viewer" }),
    ).toBeVisible();
    await capture("own");

    // Not-found state: a guessed member id renders the generic result.
    // The touch-target check is skipped here: the generic not-found page is
    // a pre-existing global surface outside 006e's scope (its compact
    // "Back to home" link is shared with every not-found route).
    await page.goto(
      `/groups/${groupId}/members/00000000-0000-4000-8000-00000000dead/wishlist`,
    );
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await capture("not-found", { checkTargets: false });

    expect(axeStates).toHaveLength(4);
    writeFileSync(
      join(CANDIDATE_DIR, `axe-${viewport}.json`),
      `${JSON.stringify({ viewport, states: axeStates }, null, 2)}\n`,
      { mode: 0o600 },
    );
  });
});
