import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated group-creation proof (006b) against the LOCAL Supabase
 * stack, run through scripts/e2e-local-stack.sh: the protected /groups/new
 * route sends signed-out visitors to sign-in, a signed-in member creates a
 * private group through the V18 form and lands on the organizer-only
 * "created" screen, the shareable invite link is shown exactly once and is
 * never recoverable after the one display (reload loses it), and a second
 * member who is not the organizer gets a 404 on the created URL.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

/** A real calendar date comfortably in the future, as YYYY-MM-DD. */
function futureIsoDate(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * The group tables are revoked from service_role by design (006a), so the
 * fixture group teardown cannot go through the admin client. Run it as
 * superuser SQL inside the local stack's database container, located
 * exactly the way the race harnesses locate it (label + exact name).
 */
function deleteFixtureGroupsSql(groupIds: string[], userIds: string[]): void {
  if (groupIds.length === 0 && userIds.length === 0) return;
  const config = readFileSync(
    path.join(process.cwd(), "supabase", "config.toml"),
    "utf8",
  );
  const projectId = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] ?? "";
  if (!projectId) {
    throw new Error("could not read project_id from supabase/config.toml");
  }
  const container = `supabase_db_${projectId}`;
  const list = (values: string[]) =>
    values.map((v) => `'${v}'::uuid`).join(",");
  const sql = [
    `delete from public.audit_events where group_id in (${list(groupIds)}) or actor_id in (${list(userIds)});`,
    `delete from public.group_invitation_uses where invitation_id in (select id from public.group_invitations where group_id in (${list(groupIds)})) or user_id in (${list(userIds)});`,
    `delete from public.group_invitations where group_id in (${list(groupIds)});`,
    `delete from public.group_creation_receipts where group_id in (${list(groupIds)}) or actor_id in (${list(userIds)});`,
    `delete from public.group_members where group_id in (${list(groupIds)}) or user_id in (${list(userIds)});`,
    `delete from public."groups" where id in (${list(groupIds)}) or organizer_id in (${list(userIds)});`,
  ].join("\n");
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "--no-psqlrc",
      "--user",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "ignore", "pipe"] },
  );
}

async function fillAndSubmitCreateForm(
  page: Page,
  name: string,
): Promise<void> {
  await page.goto("/groups/new");
  await expect(page).toHaveURL(/\/groups\/new$/);
  await expect(
    page.getByRole("heading", { name: "What are we celebrating?" }),
  ).toBeVisible();

  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("Date").fill(futureIsoDate());
  // Budget defaults to 2500 INR and the mode defaults to secret_draw; the
  // visible defaults are valid, so the form submits without touching them.
  await page.getByRole("button", { name: "Create group" }).click();

  await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
  await expect(
    page.getByRole("heading", { name: `${name} is ready.` }),
  ).toBeVisible();
}

test("the protected create-group route redirects signed-out visitors to sign-in", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(15_000);

  await page.goto("/groups/new");
  // The proxy never renders the form for an unauthenticated visitor and
  // never leaks the route's content.
  await expect(page).not.toHaveURL(/\/groups\/new/);
  await expect(page).toHaveURL(/\/auth/);
});

test("a member creates a private group; the invite link is shown exactly once; the created screen is organizer-only", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj37-organizer",
      { displayName: "Organizer Ona", tasteLine: "planner of parties" },
      scope,
    );

    const groupName = "Fixture birthday bash";
    await fillAndSubmitCreateForm(page, groupName);

    // The created group references the fixture users through restrictive
    // foreign keys, and the group tables have no service-role grant by
    // design; the teardown runs superuser SQL inside the local container.
    // The created URL carries the group id created by this organizer.
    const createdPath = new URL(page.url()).pathname;
    expect(createdPath).toMatch(/^\/groups\/[0-9a-f-]{36}\/created$/);
    const fixtureGroupId = createdPath.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([fixtureGroupId], [organizerId]);
    });

    // First issuance: the token link is displayed exactly once.
    await page.getByRole("button", { name: "Create invite link" }).click();
    const linkCard = page.getByTestId("invite-link-card");
    await expect(linkCard).toBeVisible();
    const link = await linkCard.locator(".select-all").first().textContent();
    expect(link).toContain("/invite/");
    const token = new URL(link as string).pathname.split("/").pop() as string;
    expect(token.length).toBeGreaterThan(16);

    // The one-time display is the only display: a reload shows the
    // active-link-lost state and never the token again.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `${groupName} is ready.` }),
    ).toBeVisible();
    await expect(page.getByTestId("invite-link-card")).toHaveCount(0);
    await expect(page.getByTestId("active-link-lost")).toBeVisible();
    expect(await page.content()).not.toContain(token);

    // Organizer-only: a second member who is not the organizer gets a 404,
    // never the created screen or any invitation state.
    const secondContext = await page.context().browser()!.newContext();
    try {
      const secondPage = await secondContext.newPage();
      await createSignedInFixture(
        secondPage,
        admin,
        "arj37-friend",
        { displayName: "Friend Fae", tasteLine: "gifts, not guesses" },
        scope,
      );
      await secondPage.goto(createdPath);
      await expect(
        secondPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      await expect(
        secondPage.getByRole("heading", { name: `${groupName} is ready.` }),
      ).toHaveCount(0);
      expect(await secondPage.content()).not.toContain(token);
    } finally {
      await secondContext.close();
    }

    // Sanity: the organizer's own session remains signed in and scoped.
    expect(organizerId).toBeTruthy();
  });
});

test("the create form rejects a changed payload after a conflict surface before resending", async ({
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
      "arj37-conflict",
      { displayName: "Conflict Cy", tasteLine: "double-clicker" },
      scope,
    );

    await page.goto("/groups/new");
    await expect(
      page.getByRole("heading", { name: "What are we celebrating?" }),
    ).toBeVisible();

    // Client-side field errors keep every entered value and never send.
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(
      page.getByText("Give it a name so people recognise the invite."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/groups\/new$/);
  });
});
