import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Local Mailpit-backed end-to-end proof of the real email-code flow
 * (004c/004d) and the onboarding/session-lifecycle slice (004e), against
 * the local Supabase stack and its built-in Mailpit inbox.
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

/**
 * Verifies the six-digit code. Both verification paths reach the SAME
 * post-auth rules (004e): a fresh user's incomplete profile lands on
 * /onboarding; a complete profile goes straight to its destination.
 */
async function verifyCode(page: Page, code: string): Promise<void> {
  await enterCode(page, code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

/**
 * Completes onboarding with a display name and optional taste line, and
 * lands on /home.
 */
async function completeOnboarding(
  page: Page,
  displayName: string,
  tasteLine?: string,
): Promise<void> {
  await page.waitForURL("**/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tell friends who you are.",
  );
  await page.getByLabel("What should friends call you?").fill(displayName);
  if (tasteLine !== undefined) {
    await page.getByLabel(/Describe your taste in one line/i).fill(tasteLine);
  }
  await page.getByRole("button", { name: /Let’s go/i }).click();
  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Welcome, ${displayName}.`,
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

test("a fresh user signs in, completes onboarding, lands on /home, and confirmed logout clears the session", async ({
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
  await verifyCode(page, code);
  const response = await verifyResponse;
  // Non-cacheable on the wire (the framework's action header also carries
  // no-store; what matters is that no cached copy can leak Set-Cookie).
  expect(response.headers()["cache-control"]).toContain("no-store");

  // The 004e post-auth gate: a fresh profile is incomplete → onboarding.
  await completeOnboarding(page, "Ada", "currently in my tiny-luxuries era");

  // Opening the sign-in route with a valid session goes straight home,
  // including entry links carrying an intent. The form never renders.
  for (const authPath of ["/auth", "/auth?intent=wishlist"]) {
    await page.goto(authPath);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome, Ada.",
    );
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  }

  // The persisted profile: a refresh keeps the session AND skips
  // onboarding (complete profiles never repeat it).
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome, Ada.",
  );
  // The taste line is shown in the profile block.
  await expect(
    page.getByText("currently in my tiny-luxuries era"),
  ).toBeVisible();

  // A new tab in the same browser retains the session (cookie storage).
  const secondTab = await page.context().newPage();
  await secondTab.goto("/home");
  await expect(secondTab.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome, Ada.",
  );
  await secondTab.close();

  // A fresh browser context with no cookies is signed out and redirected
  // safely — session state is inferred only from the session cookies.
  const freshContext = await page.context().browser()!.newContext();
  const freshPage = await freshContext.newPage();
  await freshPage.goto("/home");
  await expect(freshPage).toHaveURL(/\/auth$/);
  await expect(freshPage.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
  await freshContext.close();

  // Logout requires confirmation (signing in again needs email access).
  await page.getByRole("button", { name: /Account/i }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByText("Log out of Get Me This?")).toBeVisible();
  // Cancel keeps the session.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // Confirming logs out (the menu is still open after Cancel), and the
  // landing page shows the approved copy.
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/\?loggedOut=1$/);
  await expect(
    page.getByText("You’re logged out. See you soon."),
  ).toBeVisible();

  // The session is really gone: /home redirects to the entry screen.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/auth$/);
});

test("a returning user with a complete profile goes straight to their destination and never repeats onboarding", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = newEmail();
  await requestCode(page, email);
  const { code } = await readMailFor(email);
  await verifyCode(page, code);
  await completeOnboarding(page, "Rohan");

  // Sign out through the account menu (confirmation → logout).
  await page.getByRole("button", { name: /Account/i }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/\?loggedOut=1$/);

  // Return trip: same email, complete profile — straight to /home.
  await page.goto("/auth");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.waitForURL("**/auth/verify");
  const second = await readMailFor(email);
  await verifyCode(page, second.code);
  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome, Rohan.",
  );

  // Direct-link access to onboarding with a complete profile is routed
  // away — a complete profile cannot be forced back into onboarding.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/home$/);
});

test("a link GET is non-consuming: the choice state renders and the code still verifies", async ({
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

  // The clean 004d choice state — never the token in the URL — and no
  // session was created or token consumed by the GET.
  await expect(page).toHaveURL(/\/auth\/link$/);
  expect(page.url()).not.toContain("token_hash");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Finish signing in.",
  );

  // The explicit alternative: back to code entry, the one-time token was
  // NOT consumed by the GET, and the code still verifies — through the
  // same post-auth gate as the code path.
  await page
    .getByRole("link", { name: "Use your six-digit code instead" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );
  await verifyCode(page, code);
  await page.waitForURL("**/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tell friends who you are.",
  );
});

test("a link click completes sign-in only through the explicit action, with an equivalent session", async ({
  page,
}) => {
  const email = newEmail();
  await requestCode(page, email);
  const { tokenHash } = await readMailFor(email);
  expect(tokenHash).toBeTruthy();

  // The link lands on the clean choice state; no URL ever keeps the hash.
  const requestUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/link")) requestUrls.push(request.url());
  });
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  await expect(page).toHaveURL(/\/auth\/link$/);

  // The explicit user action is the only verification path; success lands
  // through the same post-auth gate the code path produces.
  await page.getByRole("button", { name: "Use my sign-in link" }).click();
  await page.waitForURL("**/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tell friends who you are.",
  );
  // No request to /auth/link ever carried the token material.
  expect(requestUrls.every((url) => !url.includes("token_hash"))).toBe(true);

  // Session equivalence with the code path: the link-created session is
  // real — the signed-in boundary on /auth/verify still shows, and local
  // sign-out clears it.
  await page.goto("/auth/verify");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/\?loggedOut=1$/);
  await expect(
    page.getByText("You’re logged out. See you soon."),
  ).toBeVisible();
  await page.goto("/auth/verify");
  await expect(page).toHaveURL(/\/auth$/);
});

test("the six-digit code no longer verifies after a successful link verification", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = newEmail();
  await requestCode(page, email);
  const { code, tokenHash } = await readMailFor(email);
  expect(tokenHash).toBeTruthy();

  // Verify through the link first (one-time credential semantics).
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  await expect(page).toHaveURL(/\/auth\/link$/);
  await page.getByRole("button", { name: "Use my sign-in link" }).click();
  await page.waitForURL("**/onboarding");

  // The same email's six-digit code — never yet entered — is consumed:
  // the local provider refuses the spent token (one-time credential
  // semantics), checked directly against the local auth endpoint so the
  // UI's carry state cannot mask it. The response is a 4xx refusal.
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  expect(apiUrl).toBeTruthy();
  const spend = await fetch(`${apiUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: apiKey ?? "" },
    body: JSON.stringify({ type: "email", token: code, email }),
  });
  // A refusal (any 4xx) is the one-time proof: the correct code, had the
  // link verification not consumed it, would verify with a session here.
  expect(spend.ok).toBe(false);
  expect(spend.status).toBeGreaterThanOrEqual(400);
  expect(spend.status).toBeLessThan(500);
});

test("a replayed link (double-click or back button) finds no second session", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = newEmail();
  await requestCode(page, email);
  const { tokenHash } = await readMailFor(email);

  // First click: verify through the explicit action.
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  await expect(page).toHaveURL(/\/auth\/link$/);
  await page.getByRole("button", { name: "Use my sign-in link" }).click();
  await page.waitForURL("**/onboarding");

  // Second click of the same link, a fresh request: the one-shot cookie
  // was deleted on the completed attempt (a re-parking GET re-parks the
  // same hash), and the consumed provider token fails into the honest
  // recovery — no second session, no silent success.
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  await expect(page).toHaveURL(/\/auth\/link$/);
  await page.getByRole("button", { name: "Use my sign-in link" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This link didn’t work.",
  );

  // The replay did not clear the existing session: /auth/verify still
  // shows the signed-in boundary.
  await page.goto("/auth/verify");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );
});

test("a malformed link lands on the honest recovery with no session created", async ({
  page,
}) => {
  // Missing token hash: rejected to the clean interim route, no cookie.
  await page.goto("/auth/confirm?token_hash=&type=email");
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One more step.",
  );

  // A type outside the closed enum: the same recovery.
  await page.goto("/auth/confirm?token_hash=abc&type=signup");
  await expect(page).toHaveURL(/\/auth\/confirm$/);

  // A link without any query: the same interim state, still no session.
  await page.goto("/auth/confirm");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One more step.",
  );

  // No session exists: /auth/verify redirects to the signed-out entry,
  // and a protected route redirects there too.
  await page.goto("/auth/verify");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
  await page.goto("/home");
  await expect(page).toHaveURL(/\/auth$/);
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

  // The current code verifies — through the same post-auth gate.
  await verifyCode(page, second.code);
  await page.waitForURL("**/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tell friends who you are.",
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
  await verifyCode(page, code);
  await page.waitForURL("**/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tell friends who you are.",
  );

  const onboarding = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(onboarding.violations).toEqual([]);
});
