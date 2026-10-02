import { expect, test, type Page } from "@playwright/test";

import {
  deleteFixtureGroupsSql,
  deleteInvitationContinuationRowsSql,
  runStackSql,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated invitation acceptance proof (brief 006c): real local Supabase
 * auth and Mailpit exercise the signed-out OTP journey end to end, the
 * invalid-token denial, and the signed-in join, then assert the database
 * effects (membership, use count, accepted continuation state) — never
 * inferring success from membership alone.
 *
 * Privacy: the raw invitation token is held in memory only (it is read from
 * the created screen's one-time display, exactly as a recipient receives
 * it), never logged, never asserted into output, and never persisted in any
 * artifact. Collected evidence carries no token, code, or email material.
 */

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const GROUP_NAME = "Invitation e2e fixture";

/** Polls the local Mailpit inbox for the six-digit invitation code. */
async function readCodeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listing = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const data = (await listing.json()) as {
      messages?: { ID: string; To?: { Address?: string }[] }[];
    };
    const mine = (data.messages ?? []).filter((message) =>
      (message.To ?? []).some((to) => to.Address === email),
    );
    if (mine.length > 0) {
      const detail = (await fetch(
        `${MAILPIT_URL}/api/v1/message/${mine[0].ID}`,
      ).then((response) => response.json())) as {
        Text?: string;
        HTML?: string;
      };
      const code = (detail.Text || detail.HTML || "").match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("no invitation code arrived within 12s");
}

/** Types a six-digit code into the designed OTP input. */
async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByRole("textbox", { name: "Digit 1 of 6" }).click();
  await page.keyboard.type(code, { delay: 40 });
}

/** The group row's joined-member count (joined only). */
function joinedCount(groupId: string, userId: string): string {
  return runStackSql(
    `select count(*)::text from public.group_members where group_id = '${groupId}'::uuid and user_id = '${userId}'::uuid and status = 'joined';`,
  ).trim();
}

/** The shareable invitation's issued use count. */
function invitationUseCount(groupId: string): string {
  return runStackSql(
    `select coalesce(sum(use_count), 0)::text from public.group_invitations where group_id = '${groupId}'::uuid and shareable_version is not null;`,
  ).trim();
}

/**
 * Creates a signed-in organizer with a private group and returns the one-
 * time shareable token read from the created screen (the exact 006b
 * issuance surface 006c consumes). Registers 006c-aware teardown: the
 * private continuation rows are removed before the groups and users,
 * because they hold restrict foreign keys to both. Extra user ids pushed
 * onto the fixture (e.g. a recipient who signed up through the real
 * surface) cascade in the same teardown.
 */
async function createGroupAndToken(
  page: Page,
  scope: FixtureScope,
): Promise<{
  token: string;
  groupId: string;
  extraUserIds: string[];
}> {
  const admin = stackAdminClient();
  const organizerId = await createSignedInFixture(
    page,
    admin,
    "invitations-e2e-organizer",
    { displayName: "Organizer Ona", tasteLine: "planner of parties" },
    scope,
  );
  await page.goto("/groups/new");
  await page.getByLabel("Group name").fill(GROUP_NAME);
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel("Date").fill(date);
  await page.getByRole("button", { name: "Create group" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
  const groupId = new URL(page.url()).pathname.split("/")[2] ?? "";

  const extraUserIds: string[] = [];
  scope.register("fixture continuations, groups, and users", async () => {
    // Continuations first: they restrict-delete against the invitations
    // and the fixture users removed below.
    deleteInvitationContinuationRowsSql(groupId ? [groupId] : [], [
      organizerId,
      ...extraUserIds,
    ]);
    deleteFixtureGroupsSql(groupId ? [groupId] : [], [organizerId]);
    for (const userId of extraUserIds) {
      runStackSql(`delete from auth.users where id = '${userId}'::uuid;`);
    }
  });

  await page.getByRole("button", { name: "Create invite link" }).click();
  const linkCard = page.getByTestId("invite-link-card");
  await expect(linkCard).toBeVisible();
  const href = (await linkCard.locator(".select-all").textContent()) ?? "";
  const token = href.split("/invite/")[1] ?? "";
  expect(token).toHaveLength(43);
  return { token, groupId, extraUserIds };
}

test.describe("invitation preview and acceptance", () => {
  test("invalid token families reach the generic unavailable state with clean headers", async ({
    request,
  }) => {
    const bad = ["a".repeat(43), `${"A".repeat(42)}F`, `${"A".repeat(50)}`];
    for (const token of bad) {
      const response = await request.get(`/invite/${token}`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(302);
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      expect(response.headers()["location"]).toContain("/invite/unavailable");
      // No token material in the redirect target or body.
      expect(response.headers()["location"]).not.toContain(token);
      expect(await response.text()).not.toContain(token);
    }
  });

  test("a signed-out recipient joins through OTP with a second explicit Join", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const scope = new FixtureScope();
    await scope.run(async () => {
      const { token, groupId, extraUserIds } = await createGroupAndToken(
        page,
        scope,
      );

      // A fresh, signed-out browser opens the raw link.
      const context = await page
        .context()
        .browser()
        ?.newContext({
          viewport: { width: 390, height: 844 },
        });
      if (!context) throw new Error("no browser context");
      try {
        const recipient = await context.newPage();

        await recipient.goto(`/invite/${token}`, {
          waitUntil: "domcontentloaded",
        });
        // The raw landing never renders content: it redirects (directly,
        // or through the token-free start bootstrap) to the clean preview.
        await recipient.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);

        // Exactly the approved preview content renders.
        await expect(
          recipient.getByRole("heading", {
            name: `You're invited to ${GROUP_NAME}.`,
          }),
        ).toBeVisible();
        await expect(recipient.getByText("Organizer Ona")).toBeVisible();
        await expect(recipient.getByText("Joined so far")).toBeVisible();

        // Join: signed-out → the dedicated invitation email screen.
        await recipient.getByRole("button", { name: "Join the group" }).click();
        await recipient.waitForURL("/auth/invite/**");
        const flowId = new URL(recipient.url()).pathname.split("/").pop() ?? "";

        const email = `invitations-e2e-recipient-${Date.now()}@example.invalid`;
        await recipient.getByLabel("Email").fill(email);
        await recipient
          .getByRole("button", { name: "Continue with email" })
          .click();

        // OTP verification against the code the real local delivery sent.
        await recipient.waitForURL(/\/auth\/invite\/[0-9a-f-]{36}\/verify$/);
        const code = await readCodeFor(email);
        await enterCode(recipient, code);
        await recipient.getByRole("button", { name: "Verify" }).click();

        // The verification response never binds or accepts: the clean
        // reconciliation screen requires the explicit continuation POST.
        await recipient.waitForURL(/\/auth\/invite\/[0-9a-f-]{36}\/reconcile$/);
        await expect(
          recipient.getByRole("heading", { name: "You're signed in." }),
        ).toBeVisible();
        await recipient
          .getByRole("button", { name: "Continue this invitation" })
          .click();

        // Back on the live preview; a SECOND explicit Join accepts.
        await recipient.waitForURL(`/invite/continue/${flowId}`);
        await expect(
          recipient.getByRole("heading", {
            name: `You're invited to ${GROUP_NAME}.`,
          }),
        ).toBeVisible();
        await recipient.getByRole("button", { name: "Join the group" }).click();
        await recipient.waitForURL(`/invite/continue/${flowId}`);
        await expect(
          recipient.getByRole("heading", { name: "You're in." }),
        ).toBeVisible();

        // Database evidence: membership, one use, an accepted continuation.
        const recipientId = runStackSql(
          `select id::text from auth.users where email = '${email}';`,
        ).trim();
        extraUserIds.push(recipientId);
        await expect
          .poll(() => joinedCount(groupId, recipientId), { timeout: 10_000 })
          .toBe("1");
        expect(invitationUseCount(groupId)).toBe("1");
        const accepted = runStackSql(
          `select count(*)::text from private.invitation_continuations where verified_user_id = '${recipientId}'::uuid and accepted_at is not null;`,
        ).trim();
        expect(accepted).toBe("1");

        // Replay: returning to the same flow renders joined with no
        // additional membership or use.
        await recipient.goto(`/invite/continue/${flowId}`);
        await expect(
          recipient.getByRole("heading", { name: "You're in." }),
        ).toBeVisible();
        expect(joinedCount(groupId, recipientId)).toBe("1");
        expect(invitationUseCount(groupId)).toBe("1");
      } finally {
        await context.close();
      }
    });
  });

  test("a signed-in recipient joins directly from the preview", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const { token, groupId } = await createGroupAndToken(page, scope);

      // A second, signed-in user opens the same link in a fresh browser.
      const context = await page
        .context()
        .browser()
        ?.newContext({
          viewport: { width: 390, height: 844 },
        });
      if (!context) throw new Error("no browser context");
      try {
        const joiner = await context.newPage();
        const joinerId = await createSignedInFixture(
          joiner,
          admin,
          "invitations-e2e-joiner",
          { displayName: "Joiner Jai", tasteLine: "here for the snacks" },
          scope,
        );

        await joiner.goto(`/invite/${token}`);
        await joiner.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);
        await expect(
          joiner.getByRole("heading", {
            name: `You're invited to ${GROUP_NAME}.`,
          }),
        ).toBeVisible();

        // One explicit Join accepts directly — no email step.
        await joiner.getByRole("button", { name: "Join the group" }).click();
        await joiner.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);
        await expect(
          joiner.getByRole("heading", { name: "You're in." }),
        ).toBeVisible();

        await expect
          .poll(() => joinedCount(groupId, joinerId), { timeout: 10_000 })
          .toBe("1");
        const accepted = runStackSql(
          `select count(*)::text from private.invitation_continuations where verified_user_id = '${joinerId}'::uuid and accepted_at is not null;`,
        ).trim();
        expect(accepted).toBe("1");
      } finally {
        await context.close();
      }
    });
  });
});
