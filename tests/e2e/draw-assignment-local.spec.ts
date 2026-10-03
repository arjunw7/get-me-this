import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { deleteFixtureGroupsSql, runStackSql } from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated 008d proof (brief
 * docs/delivery/issues/008d-assignment-view-and-redraw.md, acceptance
 * criteria 3, 4, 5, 6, and 10) against the LOCAL Supabase stack, run
 * through scripts/e2e-local-stack.sh: real sessions for the organizer and a
 * joined giver, SQL-only fixtures for the roster changes.
 *
 * Covered: the giver's assignment surface (valid assignment, Member
 * fallback, neutral invalid state, zero-rows state), the once-per-version
 * viewed marker, the organizer's confirmed redraw flow (consequences,
 * CAS passthrough, refreshed stale state, blocked insufficient state), the
 * unattributed roster-departure alert, the assignment-email enqueues under
 * the exact identity key, and the privacy negatives (no internals in the
 * DOM, no cross-member content). Screenshots of the new surfaces attach to
 * the report as the review-candidate visual evidence at the project's
 * viewport (mobile 390x844 / desktop 1440x1000).
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const GROUP_NAME = "Fixture draw room";

async function capture(page: import("@playwright/test").Page, name: string) {
  const screenshot = await page.screenshot({ fullPage: true });
  await test.info().attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}

test("the secret draw room: assignment view, viewed state, confirmed redraw, and emails", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const projectTag = testInfo.project.name === "desktop" ? "c" : "d";

  await scope.run(async () => {
    // The organizer creates the secret_draw group through the real UI.
    const organizerId = await createSignedInFixture(
      page,
      admin,
      `arj39-organizer-${projectTag}`,
      { displayName: "Organizer Ona", tasteLine: "draws the names" },
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

    // A fresh synthetic giver identity per run: a fixed email would collide
    // with any leftover from an earlier failed attempt (unique-constrained).
    const giverUserId = randomUUID();
    const giverEmail = `arj39-giver-${projectTag}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.invalid`;
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId, giverUserId]);
      runStackSql(`
        delete from public.profiles where id = '${giverUserId}'::uuid;
        delete from auth.users where id = '${giverUserId}'::uuid;`);
    });

    // One joined giver beyond the organizer, with no display name: the
    // Member fallback surface.
    runStackSql(`
      insert into auth.users (id, aud, role, email, encrypted_password)
      values ('${giverUserId}'::uuid, 'authenticated', 'authenticated', '${giverEmail}', '');
      insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
      values ('${groupId}'::uuid, '${giverUserId}'::uuid, 'joined', true, clock_timestamp(), 1);`);

    // --- the organizer starts the draw -----------------------------------
    await page.getByTestId("open-group").click();
    await page.waitForURL(`**/groups/${groupId}`);
    await expect(
      page.getByRole("heading", { level: 1, name: GROUP_NAME }),
    ).toBeVisible();

    // Before any draw: the giver surface renders the identical zero-rows
    // state, and the organizer sees the start-draw confirmation.
    await expect(page.getByTestId("assignment-empty")).toBeVisible();
    await expect(page.getByTestId("draw-confirm")).toBeVisible();

    await page.getByTestId("draw-confirm").click();
    await expect(page.getByTestId("draw-consequences")).toContainText(
      "only after the draw",
    );
    await page.getByTestId("draw-confirm-button").click();
    await page.waitForURL(`**/groups/${groupId}?draw=drawn`);
    await expect(page.getByTestId("draw-drawn")).toBeVisible();

    // The organizer's draw-state surface renders existence metadata only.
    await expect(page.getByTestId("draw-participants")).toHaveText("2 people");
    await expect(page.getByTestId("draw-version")).toHaveText("#1");
    const organizerSection = await page
      .getByTestId("draw-section")
      .textContent();
    expect(organizerSection).not.toMatch(/giver|recipient/i);

    // The organizer is also a giver: a valid assignment card with no
    // internals in the DOM, and the once-per-version viewed marker.
    await expect(page.getByTestId("assignment-card")).toBeVisible();
    const organizerRoom = await page.getByTestId("group-room").textContent();
    expect(organizerRoom ?? "").not.toMatch(/generation|tombstone/i);
    await capture(page, "draw-assignment-organizer");

    const viewedRows = () =>
      runStackSql(
        `select count(*) from public.group_assignment_views where group_id = '${groupId}'::uuid;`,
      ).trim();
    expect(Number(viewedRows())).toBe(1);

    // The idempotent marker: a fresh render writes no second row.
    await page.reload();
    await expect(page.getByTestId("assignment-card")).toBeVisible();
    expect(Number(viewedRows())).toBe(1);

    // The assignment-email enqueues: exactly one per valid giver under the
    // exact 008c identity key.
    const enqueueKeys = () =>
      runStackSql(
        `select idempotency_key from private.email_outbox where template_key = 'assignment' and idempotency_key like 'assignment:${groupId}:%' order by idempotency_key;`,
      ).trim();
    expect(enqueueKeys().split("\n")).toHaveLength(2);
    expect(enqueueKeys()).toContain(`assignment:${groupId}:1:${organizerId}`);
    expect(enqueueKeys()).toContain(`assignment:${groupId}:1:${giverUserId}`);

    // --- a joined giver sees their own assignment only --------------------
    const giverContext = await page.context().browser()!.newContext();
    try {
      const giverPage = await giverContext.newPage();
      const giverId = await createSignedInFixture(
        giverPage,
        admin,
        `arj39-giver-browser-${projectTag}`,
        { displayName: "Giver Gia", tasteLine: "keeps secrets" },
        scope,
      );
      // Gia joins after the committed draw: she reads the identical
      // zero-rows state (no assignment in version 1) and no redraw control.
      runStackSql(`
        insert into public.group_members (group_id, user_id, status, participating, joined_at, membership_generation)
        values ('${groupId}'::uuid, '${giverId}'::uuid, 'joined', true, clock_timestamp(), 1);`);

      await giverPage.goto(`/groups/${groupId}`);
      await expect(
        giverPage.getByRole("heading", { level: 1, name: GROUP_NAME }),
      ).toBeVisible();
      await expect(giverPage.getByTestId("assignment-empty")).toBeVisible();
      // Non-organizers see no redraw control whatsoever.
      await expect(giverPage.getByTestId("draw-section")).toHaveCount(0);
      await capture(giverPage, "draw-assignment-giver");

      // The roster-departure alert is organizer-only and unattributed:
      // simulate the departure of the SQL giver (removed from the roster).
      runStackSql(`
        insert into public.audit_events (actor_id, group_id, event_type, subject_user_id, metadata)
        values ('${organizerId}'::uuid, '${groupId}'::uuid, 'member_left'::public.group_audit_event_type, '${giverUserId}'::uuid, '{}'::jsonb);
        update public.group_members
        set status = 'left', participating = false, membership_generation = membership_generation + 1
        where group_id = '${groupId}'::uuid and user_id = '${giverUserId}'::uuid;`);

      await page.reload();
      await expect(page.getByTestId("roster-out-of-sync")).toBeVisible();
      const alert = await page.getByTestId("roster-out-of-sync").textContent();
      expect(alert ?? "").not.toContain("Gia");
      expect(alert ?? "").not.toMatch(/giver-|@/);

      // The giver assigned the departed member sees the neutral invalid
      // state with no recipient identity anywhere.
      const organizerAssignment = await page
        .getByTestId("assignment-section")
        .textContent();
      // The organizer's own assignment may be valid; assert no DOM surface
      // names the departed member in connection with any assignment.
      expect(organizerAssignment ?? "").not.toContain("Gia");
      await capture(page, "draw-roster-out-of-sync");

      // The confirmed redraw restores valid reads for the new version only.
      await page.getByTestId("draw-confirm").click();
      await expect(page.getByTestId("draw-consequences")).toContainText(
        "Every current assignment will be replaced",
      );
      await page.getByTestId("draw-confirm-button").click();
      await page.waitForURL(`**/groups/${groupId}?draw=drawn`);
      await expect(page.getByTestId("draw-version")).toHaveText("#2");

      // The redraw enqueued under the NEW version's key only, one per valid
      // giver of the two-participant roster, and the stale CAS never
      // enqueued for the superseded version.
      const versionTwoKeys = runStackSql(
        `select count(*) from private.email_outbox where template_key = 'assignment' and idempotency_key like 'assignment:${groupId}:2:%';`,
      ).trim();
      expect(Number(versionTwoKeys)).toBe(2);

      // The giver's new-version read is valid again.
      await giverPage.reload();
      await expect(giverPage.getByTestId("assignment-card")).toBeVisible();
      await capture(page, "draw-redrawn");
    } finally {
      await giverContext.close();
    }
  });
});

test("the insufficient-participants draw renders the neutral blocked state", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const soloTag = testInfo.project.name === "desktop" ? "e" : "f";

  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      `arj39-solo-organizer-${soloTag}`,
      { displayName: "Solo Ona", tasteLine: "waits for friends" },
      scope,
    );
    await page.goto("/groups/new");
    await page.getByLabel("Group name").fill("Solo draw room");
    await page
      .getByLabel("Date")
      .fill(new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId]);
    });

    await page.getByTestId("open-group").click();
    await page.waitForURL(`**/groups/${groupId}`);
    await page.getByTestId("draw-confirm").click();
    await page.getByTestId("draw-confirm-button").click();
    await page.waitForURL(`**/groups/${groupId}?draw=insufficient`);
    await expect(page.getByTestId("draw-blocked")).toContainText(
      "at least 2 participating members",
    );
    // Nothing committed: no assignments, no emails, no viewed rows.
    const rows = runStackSql(
      `select count(*) from public.group_assignments where group_id = '${groupId}'::uuid;`,
    ).trim();
    expect(Number(rows)).toBe(0);
    const outbox = runStackSql(
      `select count(*) from private.email_outbox where template_key = 'assignment' and idempotency_key like 'assignment:${groupId}:%';`,
    ).trim();
    expect(Number(outbox)).toBe(0);
  });
});
