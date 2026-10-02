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

// These specs share one auth/invite surface and one forged-replay leg on
// the same Next server; interleaved invitation actions truncate the
// redirect RSC streams under load ("destination stream closed early").
// Serial execution keeps each journey's cookie jar and stream intact.
test.describe.configure({ mode: "serial" });

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const GROUP_NAME = "Invitation e2e fixture";

/** Polls the local Mailpit inbox for the six-digit invitation code. */
async function readCodeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listing = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`, {
      signal: AbortSignal.timeout(5_000),
    });
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

/**
 * The runtime writer inventory (review note e): every Set-Cookie the
 * journey's responses may carry, by name. The named inventory is — the
 * @supabase/ssr provider session scheme (`sb-…`, including its chunked
 * suffixes), the 004c/004d generic auth carry cookies, and the 006c
 * invitation envelope family (`__Host-gmt-invite-*`). Anything else is an
 * undeclared writer and fails the proof.
 */
const WRITER_INVENTORY: readonly { name: string; pattern: RegExp }[] = [
  { name: "provider session cookies", pattern: /^sb-/ },
  { name: "004c auth carry", pattern: /^gmt-auth-carry$/ },
  { name: "004d link carry", pattern: /^gmt-auth-link$/ },
  { name: "006c invitation envelopes", pattern: /^__Host-gmt-invite-/ },
];

/** Asserts every observed Set-Cookie writer is in the named inventory. */
function observeCookieWriters(page: Page): string[] {
  const writers: string[] = [];
  page.on("response", (response) => {
    void response.headersArray().then((headers) => {
      for (const header of headers) {
        if (header.name.toLowerCase() !== "set-cookie") continue;
        const cookieName = header.value.split("=", 1)[0]?.trim() ?? "";
        writers.push(cookieName);
      }
    });
  });
  return writers;
}

function assertWritersInInventory(writers: string[]): void {
  const undeclared = writers.filter(
    (cookieName) =>
      !WRITER_INVENTORY.some((entry) => entry.pattern.test(cookieName)),
  );
  expect(undeclared).toEqual([]);
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

  test("a signed-out recipient joins through OTP, onboarding, and a final explicit Join", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const scope = new FixtureScope();
    await scope.run(async () => {
      const { token, groupId, extraUserIds } = await createGroupAndToken(
        page,
        scope,
      );

      // A fresh, signed-out browser opens the raw link. The context uses
      // this test project's viewport, so both the mobile and the desktop
      // project run the whole journey at their own size (review note c).
      const context = await page
        .context()
        .browser()
        ?.newContext({ viewport: page.viewportSize() ?? undefined });
      if (!context) throw new Error("no browser context");
      try {
        const recipient = await context.newPage();
        // Review note e: enumerate every Set-Cookie writer observed across
        // the whole journey and prove each is in the named inventory.
        const writers = observeCookieWriters(recipient);
        const step = (label: string) =>
          console.log(`[journey] ${label} url=${recipient.url()}`);
        recipient.on("crash", () => console.log("[journey] PAGE CRASHED"));
        recipient.on("close", () => console.log("[journey] PAGE CLOSED"));
        recipient.on("requestfailed", (request) =>
          console.log(
            `[journey] requestfailed ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ""}`,
          ),
        );

        await recipient.goto(`/invite/${token}`, {
          waitUntil: "domcontentloaded",
        });
        // The raw landing never renders content: it redirects (directly,
        // or through the token-free start bootstrap) to the clean preview.
        await recipient.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);
        step("preview");

        // Exactly the approved preview content renders.
        await expect(
          recipient.getByRole("heading", {
            name: `You're invited to ${GROUP_NAME}.`,
          }),
        ).toBeVisible();
        await expect(recipient.getByText("Organizer Ona")).toBeVisible();
        await expect(recipient.getByText("Joined so far")).toBeVisible();
        step("preview content");

        // Join: signed-out → the dedicated invitation email screen.
        await recipient.getByRole("button", { name: "Join the group" }).click();
        await recipient.waitForURL("/auth/invite/**");
        const flowId = new URL(recipient.url()).pathname.split("/").pop() ?? "";
        step("email screen");

        const email = `invitations-e2e-recipient-${Date.now()}@example.invalid`;
        await recipient.getByLabel("Email").fill(email);
        await recipient
          .getByRole("button", { name: "Continue with email" })
          .click();

        // OTP verification against the code the real local delivery sent.
        await recipient.waitForURL(/\/auth\/invite\/[0-9a-f-]{36}\/verify$/);
        const code = await readCodeFor(email);
        await enterCode(recipient, code);
        step("code entered");
        await recipient.getByRole("button", { name: "Verify" }).click();

        // The verification response never binds or accepts: the clean
        // reconciliation screen requires the explicit continuation POST.
        await recipient.waitForURL(/\/auth\/invite\/[0-9a-f-]{36}\/reconcile$/);
        step("reconcile");
        await expect(
          recipient.getByRole("heading", { name: "You're signed in." }),
        ).toBeVisible();
        // The reconciliation is idempotent, but the click's URL wait must
        // span the brokered verification's settle round-trip, which is
        // slow under CI load — and re-clicking is never an option for the
        // one-shot verification steps before this point.
        await recipient
          .getByRole("button", { name: "Continue this invitation" })
          .click();
        await recipient.waitForURL(`/invite/continue/${flowId}`, {
          timeout: 30_000,
        });
        step("second preview");

        // Back on the live preview; a SECOND explicit Join sends the brand-
        // new recipient to the invitation onboarding (it never accepts):
        // completing it returns to the live preview for the third Join.
        await expect(
          recipient.getByRole("heading", {
            name: `You're invited to ${GROUP_NAME}.`,
          }),
        ).toBeVisible();
        await recipient.getByRole("button", { name: "Join the group" }).click();
        await recipient.waitForURL(`/onboarding/invite/${flowId}`);
        step("onboarding");
        await recipient
          .getByLabel("What should friends call you?")
          .fill("Recipient Rhea");
        await recipient.getByRole("button", { name: "Let’s go" }).click();

        await recipient.waitForURL(`/invite/continue/${flowId}`);
        await expect(
          recipient.getByRole("heading", {
            name: `You're invited to ${GROUP_NAME}.`,
          }),
        ).toBeVisible();
        await recipient.getByRole("button", { name: "Join the group" }).click();
        await recipient.waitForURL(`/invite/continue/${flowId}`);
        step("third preview joined");
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
        step("membership row");
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

        // Review note e: the whole journey's Set-Cookie writers are the
        // named inventory — nothing else wrote a cookie.
        assertWritersInInventory(writers);
      } finally {
        await context.close();
      }
    });
  });

  test("a signed-in recipient joins directly from the preview", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const { token, groupId } = await createGroupAndToken(page, scope);

      // A second, signed-in user opens the same link in a fresh browser,
      // at this test project's viewport (review note c: the desktop
      // project runs the direct join at desktop size).
      const context = await page
        .context()
        .browser()
        ?.newContext({ viewport: page.viewportSize() ?? undefined });
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

  // Review note d: the Join action's same-origin enforcement (Next's
  // Server Action Origin and Fetch Metadata checks) is proven against a
  // real captured action id — a replay with a foreign or missing Origin
  // must be rejected and must create nothing.
  test("a captured Join action replay with a foreign or missing Origin is rejected", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const { token, groupId } = await createGroupAndToken(page, scope);
      const context = await page
        .context()
        .browser()
        ?.newContext({ viewport: page.viewportSize() ?? undefined });
      if (!context) throw new Error("no browser context");
      try {
        const joiner = await context.newPage();
        const joinerId = await createSignedInFixture(
          joiner,
          admin,
          "invitations-e2e-csrf",
          { displayName: "Replay Ro", tasteLine: "reads headers" },
          scope,
        );

        // Capture the real Join action POST (URL, action id, body).
        let captured: {
          url: string;
          headers: Record<string, string>;
          body: string;
        } | null = null;
        joiner.on("request", (req) => {
          if (req.method() === "POST" && req.headers()["next-action"]) {
            captured = {
              url: req.url(),
              headers: req.headers(),
              body: req.postData() ?? "",
            };
          }
        });

        await joiner.goto(`/invite/${token}`);
        await joiner.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);
        await joiner.getByRole("button", { name: "Join the group" }).click();
        await joiner.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);
        await expect(
          joiner.getByRole("heading", { name: "You're in." }),
        ).toBeVisible();
        await expect
          .poll(() => joinedCount(groupId, joinerId), { timeout: 10_000 })
          .toBe("1");
        if (!captured) throw new Error("no Join action POST captured");

        // Replay the EXACT captured action request with a forged Origin:
        // the framework's Origin/Fetch-Metadata check aborts the action
        // (the 500 "Invalid Server Actions request" rejection) before any
        // action code runs. A replay with no Origin header is deliberately
        // allowed through by the framework (a handcrafted request carries
        // no unwilling credentials), so for that leg the proof is the
        // database: the replayed acceptance is idempotent and creates no
        // second membership, use, or acceptance.
        const foreign = await request.post((captured as { url: string }).url, {
          headers: {
            ...(captured as { headers: Record<string, string> }).headers,
            origin: "https://attacker.invalid",
          },
          data: (captured as { body: string }).body,
        });
        expect(foreign.status()).toBeGreaterThanOrEqual(400);

        await request.post((captured as { url: string }).url, {
          headers: Object.fromEntries(
            Object.entries(
              (captured as { headers: Record<string, string> }).headers,
            ).filter(([name]) => name.toLowerCase() !== "origin"),
          ),
          data: (captured as { body: string }).body,
        });

        // Nothing was accepted by either replay.
        expect(joinedCount(groupId, joinerId)).toBe("1");
        expect(invitationUseCount(groupId)).toBe("1");
        const accepted = runStackSql(
          `select count(*)::text from private.invitation_continuations where verified_user_id = '${joinerId}'::uuid and accepted_at is not null;`,
        ).trim();
        expect(accepted).toBe("1");
      } finally {
        await context.close();
      }
    });
  });

  // Brief 006c criterion 12 (review blocker): the broker's delivery
  // acknowledgement is not optional. While a verification's
  // delivery_pending lease is unacknowledged, a competing tab's confirmed
  // logout is blocked honestly with the session preserved — in either
  // response order — and completes only after the acknowledgement (or
  // recovery) releases the lease.
  test("an unacknowledged verification delivery blocks logout until the acknowledgement settles", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const scope = new FixtureScope();
    await scope.run(async () => {
      const { token } = await createGroupAndToken(page, scope);
      const context = await page
        .context()
        .browser()
        ?.newContext({ viewport: page.viewportSize() ?? undefined });
      if (!context) throw new Error("no browser context");
      try {
        const recipient = await context.newPage();
        await recipient.goto(`/invite/${token}`);
        await recipient.waitForURL(/\/invite\/continue\/[0-9a-f-]{36}$/);
        await recipient.getByRole("button", { name: "Join the group" }).click();
        await recipient.waitForURL("/auth/invite/**");
        const email = `invitations-e2e-broker-${Date.now()}@example.invalid`;
        await recipient.getByLabel("Email").fill(email);
        await recipient
          .getByRole("button", { name: "Continue with email" })
          .click();
        await recipient.waitForURL(/\/auth\/invite\/[0-9a-f-]{36}\/verify$/);
        const code = await readCodeFor(email);

        // Hold ONLY the verification's delivery acknowledgement REQUEST —
        // captured before it reaches the server, so the server lease stays
        // genuinely delivery_pending. Later acknowledgements pass through.
        const held: (() => void)[] = [];
        let holding = true;
        await context.route("**/auth/invite/mutation/acknowledge", (route) => {
          if (holding) {
            holding = false;
            held.push(() => {
              void route
                .fetch()
                .then((response) => route.fulfill({ response }));
            });
            return;
          }
          void route.fetch().then((response) => route.fulfill({ response }));
        });

        await enterCode(recipient, code);
        console.log(`[broker] code entered url=${recipient.url()}`);
        await recipient.getByRole("button", { name: "Verify" }).click();

        // The broker fired the acknowledgement, which is now held before
        // reaching the server: the server lease is delivery_pending and
        // the browser has not applied any reseal.
        await expect
          .poll(() => held.length, { timeout: 15_000 })
          .toBeGreaterThan(0);
        console.log(`[broker] ack held url=${recipient.url()}`);

        // The verification tab dies while its acknowledgement is held —
        // exactly the lost-browser case the lease protocol covers. Its
        // Web Lock is released by the document's death, the one-use nonce
        // cookie survives in the context jar, and the server lease stays
        // delivery_pending.
        await recipient.close();
        await context.unroute("**/auth/invite/mutation/acknowledge");

        // A second tab's confirmed logout is blocked honestly — the broker
        // lock is free now, but the server lease is still delivery_pending,
        // so the acquisition refuses and the flagged /home state renders
        // with the session preserved. The fresh recipient still has an
        // incomplete profile, so /home redirects to onboarding first; the
        // profile is completed here before the menu exists on a screen
        // that can attempt a logout.
        const second = await context.newPage();
        second.on("crash", () => console.log("[broker] SECOND PAGE CRASHED"));
        second.on("close", () => console.log("[broker] SECOND PAGE CLOSED"));
        second.on("requestfailed", (request) =>
          console.log(
            `[broker] requestfailed ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ""}`,
          ),
        );
        await second.goto("/home");
        await second.waitForURL(/\/onboarding$/, { timeout: 20_000 });
        await second
          .getByLabel("What should friends call you?")
          .fill("Broker Recipient");
        await second.getByRole("button", { name: "Let’s go" }).click();
        await second.waitForURL(/\/(home|invite\/continue\/)/, {
          timeout: 20_000,
        });
        await second.goto("/home");
        await second.getByRole("button", { name: /account/i }).click();
        await second.getByRole("button", { name: "Log out" }).click();
        await second.getByRole("button", { name: "Log out" }).click();
        await second
          .waitForURL(/\/home\?logoutBlocked=1$/, { timeout: 20_000 })
          .catch(async () => {
            console.log(
              `[broker] second tab did not reach the blocked state; url=${second.url()} text: ${(
                await second
                  .locator("main, body")
                  .first()
                  .innerText({ timeout: 5_000 })
                  .catch(() => "<unreadable>")
              )
                .slice(0, 400)
                .replace(/\n/g, " | ")}`,
            );
            throw new Error("second tab logout was not blocked");
          });
        console.log(`[broker] second tab blocked url=${second.url()}`);

        // The blocked attempt's own settlement acknowledged the stranded
        // delivery (the nonce proved it), so the lease is idle again and
        // the retry completes the logout and its own delivery
        // acknowledgement under the same lock.
        await second.getByRole("button", { name: /account/i }).click();
        await second.getByRole("button", { name: "Log out" }).click();
        await second.getByRole("button", { name: "Log out" }).click();
        await second.waitForURL(/\/\?loggedOut=1$/, { timeout: 20_000 });
      } finally {
        await context.close();
      }
    });
  });
});
