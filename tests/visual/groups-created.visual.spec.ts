import { expect, type Page, test } from "@playwright/test";

import {
  deleteFixtureGroupsSql,
  runStackSql,
  stackIssueGeneric,
  withIdentity,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Visual candidate capture for the organizer-only created screen's six
 * invitation states plus the replacement confirmation (brief 006b,
 * criterion 12 and the "Issued-expired and its replacement confirmation
 * each have explicit mobile and desktop visual proof" mandate).
 *
 * One fixture group named exactly like the approved preview fixture
 * ("ARJ-37 baseline fixture") walks the state machine through the real UI:
 *   never_issued -> token-present (redacted) -> active-link-lost ->
 *   replacement-confirmation -> issued-expired -> revoked -> stale.
 *
 * Two deterministic redactions are applied to every capture, and to the
 * approved preview captures they must match:
 *   1. The one-time token is never in any committed artifact: the link is
 *      rendered as a fixed canonical-shape placeholder.
 *   2. The stored expiry instants differ per environment; the rendered
 *      expiry paragraphs are pinned to fixed formatted samples (the same
 *      en-IN / Asia/Kolkata format formatExpiry produces).
 *
 * Cross-OS capture variance is absorbed with the documented
 * maxDiffPixelRatio tolerance (docs/delivery/evidence/arj-27/README.md,
 * finding 4): identical typefaces and text extents, Linux glyph
 * anti-aliasing differs at the pixel level only.
 */

const GROUP_NAME = "ARJ-37 baseline fixture";
const PINNED_EXPIRY = "1 Jan 2050, 5:30 am";

/**
 * Deterministic redaction applied identically by the committed specs and
 * the approved preview capture: no raw token and no environment-specific
 * expiry instant may enter a committed baseline artifact.
 */
async function redactForBaseline(page: Page): Promise<void> {
  await page.evaluate((pinned) => {
    document.querySelectorAll(".select-all").forEach((el) => {
      el.textContent = `https://example.invalid/invite/${"R".repeat(43)}`;
    });
    document.querySelectorAll("p").forEach((p) => {
      const text = (p.textContent ?? "").trim();
      if (text.startsWith("Anyone with this link can preview")) {
        p.textContent = `Anyone with this link can preview the group and join. It expires ${pinned}.`;
      } else if (text.startsWith("It expires")) {
        p.textContent = `It expires ${pinned}.`;
      } else if (text.startsWith("Your invite link expired")) {
        p.textContent = `Your invite link expired on ${pinned} and no longer works.`;
      }
    });
  }, PINNED_EXPIRY);
}

async function capture(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.03,
  });
}

test.describe("the created screen's invitation states", () => {
  test("all six invitation states and the replacement confirmation", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.E2E_LOCAL_SUPABASE,
      "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
    );
    test.setTimeout(300_000);
    page.setDefaultTimeout(15_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const organizerId = await createSignedInFixture(
        page,
        admin,
        "groups-visual-created",
        { displayName: "Organizer Ona", tasteLine: "planner of parties" },
        scope,
      );

      // The group is created through the real form; success redirects to
      // the organizer-only created route in the never-issued state.
      await page.goto("/groups/new");
      await expect(
        page.getByRole("heading", { name: "What are we celebrating?" }),
      ).toBeVisible();
      await page.getByLabel("Group name").fill(GROUP_NAME);
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await page.getByLabel("Date").fill(date);
      await page.getByRole("button", { name: "Create group" }).click();
      await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
      const groupId = new URL(page.url()).pathname.split("/")[2];
      scope.register("fixture groups", async () => {
        deleteFixtureGroupsSql([groupId], [organizerId]);
      });

      // State 1: never issued.
      await expect(
        page.getByRole("heading", { name: `${GROUP_NAME} is ready.` }),
      ).toBeVisible();
      await capture(
        page,
        `groups-created-never-issued-${testInfo.project.name}.png`,
      );

      // State 2: the one-time token display, deterministically redacted.
      await page.getByRole("button", { name: "Create invite link" }).click();
      const linkCard = page.getByTestId("invite-link-card");
      await expect(linkCard).toBeVisible();
      await redactForBaseline(page);
      await capture(
        page,
        `groups-created-token-present-${testInfo.project.name}.png`,
      );

      // State 3: reload — the token is gone; the active link is lost.
      await page.reload();
      const lostCard = page.getByTestId("active-link-lost");
      await expect(lostCard).toBeVisible();
      await redactForBaseline(page);
      await capture(
        page,
        `groups-created-active-link-lost-${testInfo.project.name}.png`,
      );

      // The replacement is confirmation-gated.
      await lostCard
        .getByRole("button", { name: "Create a new invite link" })
        .click();
      const confirmation = page.getByTestId("replacement-confirmation");
      await expect(confirmation).toBeVisible();
      await redactForBaseline(page);
      await capture(
        page,
        `groups-created-replacement-confirmation-${testInfo.project.name}.png`,
      );

      // Confirming rotates to version 2; pin the new row's stored expiry to
      // a past instant for the issued-expired proof.
      await confirmation
        .getByRole("button", { name: "Yes, create a new link" })
        .click();
      await expect(page.getByTestId("invite-link-card")).toBeVisible();
      runStackSql(
        `update public.group_invitations set expires_at = '2026-01-01 00:00:00+00'::timestamptz where group_id = '${groupId}'::uuid and shareable_version is not null;`,
      );

      // State 4: issued-expired with the authoritative stored expiry.
      await page.reload();
      const expiredCard = page.getByTestId("issued-expired");
      await expect(expiredCard).toBeVisible();
      await redactForBaseline(page);
      await capture(
        page,
        `groups-created-issued-expired-${testInfo.project.name}.png`,
      );

      // Confirm the replacement so a fresh active row exists, then revoke
      // it through the generic compare-and-swap (the organizer's own
      // authority, exercised as another session would).
      await expiredCard
        .getByRole("button", { name: "Create a new invite link" })
        .click();
      await page
        .getByTestId("replacement-confirmation")
        .getByRole("button", { name: "Yes, create a new link" })
        .click();
      await expect(page.getByTestId("invite-link-card")).toBeVisible();
      const version = runStackSql(
        `select shareable_invitation_version::text from public."groups" where id = '${groupId}'::uuid;`,
      ).trim();
      runStackSql(
        withIdentity(
          organizerId,
          `select public.revoke_group_invitation('${groupId}'::uuid, ${version}::bigint);`,
        ),
      );

      // State 5: revoked — no active link; "Create invite link" returns.
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Create invite link" }),
      ).toBeVisible();
      await expect(page.getByTestId("invite-link-card")).toHaveCount(0);
      await expect(page.getByTestId("active-link-lost")).toHaveCount(0);
      await redactForBaseline(page);
      await capture(
        page,
        `groups-created-revoked-${testInfo.project.name}.png`,
      );

      // State 6: a stale tab. This tab still projects the pre-revoke
      // version; another tab issues first, then this tab's issuance is
      // stale and the refreshed projection decides the display.
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Create invite link" }),
      ).toBeVisible();
      expect(stackIssueGeneric(organizerId, groupId)).toBeTruthy();
      await page.getByRole("button", { name: "Create invite link" }).click();
      await expect(page.getByTestId("active-link-lost")).toBeVisible();
      await expect(page.getByTestId("stale-version-note")).toBeVisible();
      await redactForBaseline(page);
      await capture(page, `groups-created-stale-${testInfo.project.name}.png`);
    });
  });
});
