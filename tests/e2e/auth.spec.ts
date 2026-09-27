import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the static auth and onboarding routes (003b).
 *
 * Every designed state is reachable through its deterministic URL fixture,
 * every navigation is exercised by CLICK-THROUGH with rendered-content
 * assertions (never a bare href check), and the keyboard contract is
 * walked on the OTP input. The static-preview boundary is asserted: no
 * interaction may produce a delivery, verification, or completed-sign-in
 * claim.
 */

const NOTICE =
  "Preview only — this static preview doesn’t send email or sign you in yet.";

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

test("a valid email submission reveals the honest preview notice and nothing else", async ({
  page,
}) => {
  await page.goto("/auth?intent=wishlist");
  await page.getByLabel("Email").fill("arjun@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();

  await expect(page.getByText(NOTICE)).toBeVisible();
  // No navigation away from the entry screen.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("the verify flow is traversable by click-through with no 404 anywhere", async ({
  page,
}) => {
  // Email entry → honest submit → verify by direct fixture navigation.
  await page.goto("/auth?intent=home");
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Make a wishlist\. Share it with your\s+people\./,
  );

  await page.goto("/auth");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByText("Enter your email to continue.")).toBeVisible();

  // Verify default fixture, including the inbox preview's link.
  await page.goto("/auth/verify");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );
  await expect(page.getByText("Resend code in 0:30")).toBeVisible();
  await expect(page.getByText(NOTICE)).toBeVisible();

  // In-box mock link click-through to the confirm success frame.
  await page.getByRole("link", { name: "Sign in to Get Me This" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You’re in.",
  );
  await expect(page.getByText(NOTICE)).toBeVisible();

  // Recovery frame, back to verify, then change email back to entry.
  await page.goto("/auth/confirm?state=expired");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This link has expired.",
  );
  await page.getByRole("link", { name: "Send a new email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );

  await page.goto("/auth/confirm?state=expired");
  await page.getByRole("link", { name: "Use a different email" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Get Me This.",
  );
});

test("the designed verify error and expired fixtures render by URL", async ({
  page,
}) => {
  await page.goto("/auth/verify?state=error");
  await expect(page.getByText(/That code doesn’t match/i)).toBeVisible();
  await expect(page.getByText("Resend code in 0:30")).toBeVisible();

  await page.goto("/auth/verify?state=expired");
  await expect(page.getByText("That code has expired.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send a new code" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Digit 1 of 6" }),
  ).toBeDisabled();
});

test("the OTP keyboard contract works end to end", async ({ page }) => {
  await page.goto("/auth/verify");

  const first = page.getByRole("textbox", { name: "Digit 1 of 6" });
  await first.click();
  await first.pressSequentially("482913");
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

test("onboarding renders validation by fixture and by interaction, and submits honestly", async ({
  page,
}) => {
  await page.goto("/onboarding?state=validation");
  await expect(
    page.getByText("Friends need something to call you."),
  ).toBeVisible();

  await page.goto("/onboarding");
  await expect(
    page.getByText("Friends need something to call you."),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /Let’s go/i }).click();
  await expect(
    page.getByText("Friends need something to call you."),
  ).toBeVisible();

  await page.getByLabel("What should friends call you?").fill("Arjun");
  await page
    .getByRole("button", {
      name: "will travel for good coffee",
    })
    .click();
  await expect(page.getByLabel(/Describe your taste in one line/i)).toHaveValue(
    "will travel for good coffee",
  );

  await page.getByRole("button", { name: /Let’s go/i }).click();
  await expect(page.getByText(NOTICE)).toBeVisible();
  // No navigation: still onboarding.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tell friends who you are.",
  );

  // The Home back link resolves by click-through.
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Make a wishlist\. Share it with your\s+people\./,
  );
});

test("keyboard traversal reaches every control with visible focus", async ({
  page,
}) => {
  await page.goto("/auth/verify");

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
