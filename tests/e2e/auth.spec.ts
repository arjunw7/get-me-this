import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the auth routes (004c), running against the
 * production build WITHOUT provider configuration (the plain `pnpm
 * test:e2e` environment; the configured local-stack flow is covered by
 * tests/e2e/auth-otp.spec.ts via `pnpm test:e2e:auth`).
 *
 * Covered here: the approved intent helper copy, client-side validation,
 * the honest generic recovery when the provider is not configured, the
 * `?state=` URL fixtures (kept only for deterministic capture and tests),
 * the OTP keyboard contract, the interim /auth/confirm behavior (query
 * stripped before rendering, no-store, no-referrer, never verifying on
 * GET), the missing-carry restart, and the proxy's no-store header on the
 * auth Server Action response.
 */

const RESEND_CODES = "482913"; // the deterministic fixture code

/**
 * The instant the fake clock is paused at for the countdown assertion
 * (matching the visual specs' frozen capture instant).
 */
const FROZEN_AT = new Date("2026-01-01T00:00:00Z");

test("each email-entry intent renders its designed helper copy", async ({
  page,
}) => {
  await page.goto("/auth?intent=wishlist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
  await expect(
    page.getByText("First, a quick sign-in. Then you’ll add your first item."),
  ).toBeVisible();

  await page.goto("/auth?intent=create-group");
  await expect(
    page.getByText("First, a quick sign-in. Then you’ll set up your group."),
  ).toBeVisible();

  // The home intent renders the 003a default state (no note).
  await page.goto("/auth?intent=home");
  await expect(page.getByText(/First, a quick sign-in/)).toHaveCount(0);
});

test("the entry screen promises the working code flow, not a preview", async ({
  page,
}) => {
  await page.goto("/auth");

  await expect(
    page.getByText("No password. We’ll send you a secure code to sign in."),
  ).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/static preview|preview only/i);
  expect(body).not.toMatch(/sign-in link|either works/i);
});

test("client-side validation rejects empty and malformed emails before any request", async ({
  page,
}) => {
  await page.goto("/auth");

  const submit = page.getByRole("button", { name: "Continue with email" });
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter your email" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill("not-an-email");
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Check for typos?" }),
  ).toBeVisible();
});

test("a valid submission without provider configuration recovers honestly, with no-store on the action response", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByLabel("Email").fill("you@example.com");

  // The auth Server Action POSTs to /auth itself: the response must be
  // non-cacheable (the proxy matcher covers Server Action requests —
  // this header is that proof at the HTTP level).
  const actionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().replace(/\/$/, "").endsWith("/auth") &&
      response.request().headerValue("next-action") !== null,
  );
  await page.getByRole("button", { name: "Continue with email" }).click();
  const response = await actionResponse;

  // Non-cacheable on the wire (the framework's action header also carries
  // no-store; what matters is that no cached copy can ever leak Set-Cookie).
  expect(response.headers()["cache-control"]).toContain("no-store");
  // Honest generic recovery: no navigation, no carry, the control usable.
  await expect(page).toHaveURL(/\/auth$/);
  await expect(
    page.getByRole("alert").filter({
      hasText: "We couldn’t send your code just now.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toBeEnabled();
});

test("the verify flow fixtures render by URL for deterministic capture", async ({
  page,
}) => {
  // The ?state= fixtures are the static reference states, kept only for
  // deterministic fixture capture and tests — the bare route is the real
  // flow and restarts without a carried email.
  await page.clock.install({ time: FROZEN_AT });
  await page.clock.pauseAt(FROZEN_AT);
  await page.goto("/auth/verify?state=default");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );
  await expect(page.getByText("Resend code in 0:30")).toBeVisible();
  await page.clock.resume();

  await page.goto("/auth/verify?state=error");
  await expect(page.getByText(/That code doesn’t match/i)).toBeVisible();

  await page.goto("/auth/verify?state=expired");
  await expect(page.getByText("That code has expired.")).toBeVisible();
});

test("the OTP keyboard contract works end to end on the verify fixture", async ({
  page,
}) => {
  await page.goto("/auth/verify?state=default");

  const first = page.getByRole("textbox", { name: "Digit 1 of 6" });
  await first.click();
  await first.pressSequentially(RESEND_CODES);
  await expect(page.getByRole("textbox", { name: "Digit 6 of 6" })).toHaveValue(
    "3",
  );

  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("textbox", { name: "Digit 5 of 6" }),
  ).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("textbox", { name: "Digit 5 of 6" })).toHaveValue(
    "",
  );

  await page.keyboard.press("Backspace");
  await expect(page.getByRole("textbox", { name: "Digit 4 of 6" })).toHaveValue(
    "",
  );

  // Incomplete submission shows the designed short-code error inline.
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page.getByText("Enter all six digits.")).toBeVisible();
});

test("bare /auth/verify without a carried email restarts safely at the entry screen", async ({
  page,
}) => {
  await page.goto("/auth/verify");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("the confirm route strips its query before rendering and never verifies on GET", async ({
  page,
}) => {
  // A synthetic token value: the route discards the whole query without
  // ever reading it, so no real credential is needed — and none is logged.
  const redirectResponse = page.waitForResponse((response) =>
    response.url().includes("/auth/confirm?"),
  );
  await page.goto("/auth/confirm?token_hash=not-a-real-hash&type=email");
  const response = await redirectResponse;

  // The initial redirect response itself carries the required headers.
  expect(response.status()).toBe(302);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["location"] ?? "").toMatch(/\/auth\/confirm$/);

  // The clean URL renders the honest interim state.
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One more step.",
  );
  await expect(page.getByText(/isn’t active yet.*did nothing/i)).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/you’re in|signing you in|this link has expired/i);

  // The rendered page response is non-cacheable too (asserted in the
  // clean-URL test below; the redirect target is the same document).

  // The interim state offers the path back to code entry.
  await page.getByRole("link", { name: "Back to your code" }).click();
  // Without a carried email the verify route restarts at entry.
  await expect(page).toHaveURL(/\/auth$/);
});

test("the clean confirm route renders the interim state and stays non-cacheable", async ({
  page,
}) => {
  const response = page.waitForResponse((r) =>
    r.url().replace(/\/$/, "").endsWith("/auth/confirm"),
  );
  await page.goto("/auth/confirm");
  const documentResponse = await response;
  expect(documentResponse.headers()["cache-control"]).toBe("no-store");
  expect(documentResponse.headers()["referrer-policy"]).toBe("no-referrer");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One more step.",
  );
  await page.getByRole("link", { name: "Use a different email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("keyboard traversal reaches every control with visible focus", async ({
  page,
}) => {
  await page.goto("/auth/verify?state=default");

  // Header links, the six OTP cells, and the primary button are all
  // reachable by Tab in order, each with a visible focus stop.
  await page.keyboard.press("Tab"); // wordmark home link
  await expect(
    page.getByRole("link", { name: "Get Me This home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab"); // header back link
  await expect(
    page.getByRole("link", { name: "Change email" }).first(),
  ).toBeFocused();
  for (let i = 1; i <= 6; i++) {
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("textbox", { name: `Digit ${i} of 6` }),
    ).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeFocused();
});
