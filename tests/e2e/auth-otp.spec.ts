import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Local Mailpit-backed end-to-end proof of the real email-code flow (004c),
 * against the local Supabase stack and its built-in Mailpit inbox.
 *
 * Run through `pnpm test:e2e:auth` (scripts/e2e-auth-local.sh), which builds
 * the app with the LOCAL stack's public configuration and exports the
 * guard variables these specs check. A plain `pnpm test:e2e` run skips this
 * file — it has no local stack to talk to.
 *
 * Privacy: this file handles the emailed code and the link's token hash as
 * transient runtime values only. They are never logged, never asserted as
 * text into failure messages beyond the transient match, and never appear
 * in committed evidence — the code entry uses paste, and screenshots of
 * failure artifacts stay uncommitted (gitignored test-results).
 */

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack and its Mailpit inbox; run pnpm test:e2e:auth",
);

/** A fresh synthetic address per run; local-stack data only. */
function newEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

type LocalMail = {
  /** The six-digit code from the newest message for the address. */
  code: string;
  /** The token hash from the emailed link's 004c form, if present. */
  tokenHash: string | null;
};

/**
 * Polls the Mailpit inbox until a message for the address arrives, then
 * parses the six-digit code and the emailed link's token hash from the
 * 004c link form (trusted destination + token_hash + type=email).
 */
async function readMailFor(email: string): Promise<LocalMail> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listing = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const data = (await listing.json()) as {
      messages?: { ID: string; To?: { Address?: string }[] }[];
    };
    const mine = (data.messages ?? []).filter((message) =>
      (message.To ?? []).some((to) => to.Address === email),
    );
    if (mine.length > 0) {
      const newest = mine[0];
      const detail = (await fetch(
        `${MAILPIT_URL}/api/v1/message/${newest.ID}`,
      ).then((response) => response.json())) as {
        HTML?: string;
        Text?: string;
      };
      const content = detail.Text || detail.HTML || "";
      const code = content.match(/\b(\d{6})\b/)?.[1] ?? "";
      const link = content.match(
        /\/auth\/confirm\?token_hash=([^"'&\s]+)&(?:amp;)?type=email/,
      );
      return { code, tokenHash: link ? (link[1] as string) : null };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`no email arrived within 12s`);
}

/** Types a six-digit code into the designed OTP input. */
async function enterCode(page: Page, code: string): Promise<void> {
  await page.getByRole("textbox", { name: "Digit 1 of 6" }).click();
  await page.keyboard.type(code, { delay: 40 });
}

/** Requests a code through the real entry screen and lands on verify. */
async function requestCode(page: Page, email: string): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL("**/auth/verify");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );
}

const RESEND_BUTTON = "Start a new code";
/** The named server-side cooldown (60s), plus a second so the jump is
 *  unambiguous. */
const RESEND_COOLDOWN_PLUS_MS = 61_000;

/** Advances the fake page clock past the resend cooldown. The countdown is
 *  a single recurring timer, so one jump deterministically exhausts it. */
async function advancePastResendCooldown(page: Page): Promise<void> {
  await page.clock.runFor(RESEND_COOLDOWN_PLUS_MS);
  await expect(page.getByRole("button", { name: RESEND_BUTTON })).toBeVisible();
}

const OVER_LIMIT_COPY =
  "That’s a few codes too fast. Wait a moment, then try again.";

test("the full request → read-the-code → verify loop signs in, and local sign-out clears it", async ({
  page,
}) => {
  const email = newEmail();
  await requestCode(page, email);

  // The verify screen reflects the named server-side cooldown constant.
  await expect(page.getByText("Resend code in 1:00")).toBeVisible();
  // The carried email never appears in the URL.
  expect(page.url()).toMatch(/\/auth\/verify$/);

  const { code } = await readMailFor(email);
  expect(code).toMatch(/^\d{6}$/);

  // The verify Server Action response is non-cacheable.
  const verifyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headerValue("next-action") !== null,
  );
  await enterCode(page, code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  const response = await verifyResponse;
  // Non-cacheable on the wire (the framework's action header also carries
  // no-store; what matters is that no cached copy can leak Set-Cookie).
  expect(response.headers()["cache-control"]).toContain("no-store");

  // The approved signed-in boundary, with the minimal sign-out control.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );

  // The session exists: a reload keeps the signed-in state.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );

  // Local-scoped sign-out clears the session.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto("/auth/verify");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("a link click on /auth/confirm is non-consuming: the interim state renders and the code still verifies", async ({
  page,
}) => {
  const email = newEmail();
  await requestCode(page, email);
  const { code, tokenHash } = await readMailFor(email);
  expect(tokenHash).toBeTruthy();

  // A real link click (or scanner prefetch): GET with the token hash.
  const redirect = page.waitForResponse((response) =>
    response.url().includes("/auth/confirm?"),
  );
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  const response = await redirect;
  expect(response.status()).toBe(302);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");

  // The clean URL renders the honest interim state — no session was created.
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One more step.",
  );

  // Back to code entry: the one-time token was NOT consumed.
  await page.getByRole("link", { name: "Back to your code" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );
  await enterCode(page, code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );
});

test("a wrong code recovers safely with no session", async ({ page }) => {
  const email = newEmail();
  await requestCode(page, email);
  await readMailFor(email); // ensure delivery before verifying

  await enterCode(page, "000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "That code didn’t work" }),
  ).toBeVisible();
  // No session: the screen stays on code entry with recovery paths.
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Change email" }).first(),
  ).toBeVisible();
});

test("a superseded code fails safely and the current code still verifies", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The fake clock is installed before any navigation so every page timer
  // (the countdown) is controlled from the start.
  await page.clock.install();
  const email = newEmail();
  await requestCode(page, email);
  const first = await readMailFor(email);

  // A newer request supersedes the older unverified code (provider rule:
  // one code per message; the newest send wins).
  await page.waitForTimeout(1200); // provider's per-user minimum between sends
  await advancePastResendCooldown(page);
  await page.getByRole("button", { name: RESEND_BUTTON }).click();
  await expect(page.getByText("Resend code in 1:00")).toBeVisible();
  const second = await readMailFor(email);
  expect(second.code).toMatch(/^\d{6}$/);
  expect(second.code).not.toBe(first.code);

  // The superseded code is rejected into the approved recovery state.
  await enterCode(page, first.code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That code didn’t work" }),
  ).toBeVisible();

  // The current code verifies.
  await enterCode(page, second.code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );
});

test("a too-early resend renders the over-limit recovery whatever the clock says", async ({
  page,
}) => {
  const email = newEmail();
  // The fake clock is installed before any navigation so every page timer
  // (the countdown) is controlled from the start.
  await page.clock.install();
  await requestCode(page, email);
  await readMailFor(email);

  // Manipulate the clock so the resend control is enabled immediately,
  // then resend twice in quick succession: the provider's per-user repeat
  // limit refuses the too-early send, proving its response is
  // authoritative over the button and the clock.
  await page.waitForTimeout(1200);
  await advancePastResendCooldown(page);
  await page.getByRole("button", { name: RESEND_BUTTON }).click(); // second send
  await expect(page.getByText("Resend code in 1:00")).toBeVisible();

  // Resend again within the provider's per-user minimum interval: the
  // manipulation only re-enabled the control; the provider refuses the
  // too-early send, proving its response is authoritative.
  await advancePastResendCooldown(page);
  await page.getByRole("button", { name: RESEND_BUTTON }).click();

  await expect(page.getByText(/Hold on\./)).toBeVisible();
  await expect(page.getByText(OVER_LIMIT_COPY)).toBeVisible();
  // Only two emails were actually delivered.
  const listing = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`).then(
    (response) => response.json(),
  );
  const delivered = (listing.messages ?? []).filter(
    (message: { To?: { Address?: string }[] }) =>
      (message.To ?? []).some((to) => to.Address === email),
  );
  expect(delivered).toHaveLength(2);
});

test("the real verify screens stay accessible", async ({ page }) => {
  const email = newEmail();
  await requestCode(page, email);

  const entry = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(entry.violations).toEqual([]);

  const { code } = await readMailFor(email);
  await enterCode(page, code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );

  const signedIn = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(signedIn.violations).toEqual([]);
});
