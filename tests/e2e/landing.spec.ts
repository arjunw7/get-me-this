import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the static fidelity landing slice (ARJ-16).
 *
 * The suites run under both approved projects (mobile 390x844 and desktop
 * 1440x1000). Landing CTAs are verified by CLICK-THROUGH: each control is
 * activated and the rendered destination content is asserted — inspecting
 * href attributes alone is not evidence.
 */

test("renders the approved landing hierarchy", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(
    "Get Me This | Group wishlists for every occasion",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(
    /Make a wishlist\. Share it with your\s+people\./,
  );

  for (const section of ["How it works", "Any excuse to gift."]) {
    await expect(page.getByRole("heading", { name: section })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", {
      name: "Everyone’s wishlist in one place. No double gifts.",
    }),
  ).toBeVisible();

  // Approved terminology only.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/shelfie|circle/i);

  // The demo group figure's accessible name matches its visible name.
  await expect(
    page.getByRole("figure", { name: "Santa Party 🎉" }),
  ).toBeVisible();
});

test("anchor navigation scrolls to its section", async ({ page }, testInfo) => {
  // The reference hides the anchor nav below the md breakpoint by design;
  // mobile users scroll to the sections directly.
  test.skip(
    (testInfo.project.use.viewport?.width ?? 0) < 768,
    "anchor nav is hidden on mobile in the approved design",
  );
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(
    page.getByRole("heading", { name: "How it works" }),
  ).toBeInViewport();
});

test.describe("landing CTA click-through", () => {
  for (const cta of [
    { name: "Start my wishlist", intent: "wishlist" },
    { name: "Create a group", intent: "create-group" },
  ]) {
    test(`"${cta.name}" lands on the rendered email-entry destination`, async ({
      page,
    }) => {
      await page.goto("/");
      // The hero CTA and the final-CTA panel share the label; the hero one
      // is first in the DOM.
      await page.getByRole("link", { name: cta.name }).first().click();
      await expect(page).toHaveURL(new RegExp(`\\?intent=${cta.intent}$`));
      await expect(
        page.getByRole("heading", { name: "Welcome to Get Me This." }),
      ).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Continue with email" }),
      ).toBeVisible();
    });
  }

  test(`"Log in" lands on the rendered email-entry destination`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?intent=home$`));
    await expect(
      page.getByRole("heading", { name: "Welcome to Get Me This." }),
    ).toBeVisible();
  });
});

test("email entry validates before any submission state", async ({ page }) => {
  await page.goto("/auth");

  // The pre-submit helper text is honest: no delivery or sign-in promise.
  await expect(
    page.getByText(
      "No password. This static preview doesn’t send email or sign anyone in.",
    ),
  ).toBeVisible();

  const email = page.getByLabel("Email");
  const submit = page.getByRole("button", { name: "Continue with email" });

  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter your email" }),
  ).toBeVisible();

  await email.fill("not-an-email");
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Check for typos?" }),
  ).toBeVisible();
});

test("a valid submission is honest: a visible preview notice, no navigation, no claims", async ({
  page,
}) => {
  await page.goto("/auth");
  await page.getByLabel("Email").fill("you@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();

  const notice = page.getByRole("status");
  await expect(notice).toHaveText(
    "Preview only — this static preview doesn’t send email or sign you in yet.",
  );
  await expect(page).toHaveURL(/\/auth$/);
  // The control stays usable; no disabled, fake-sending, or success state.
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toBeEnabled();
});

test("every interactive control is keyboard reachable with a visible focus ring", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium",
    "focus-visible behaviour is asserted in Chromium, the approved evidence engine",
  );

  const isDesktop = (testInfo.project.use.viewport?.width ?? 0) >= 768;

  await page.goto("/");

  const focusedLabels: string[] = [];
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return "";
      const outline = getComputedStyle(active).outlineStyle;
      // The global :focus-visible ring must be present on keyboard focus.
      return `${active.textContent?.trim().slice(0, 40) ?? ""}|${outline}`;
    });
    focusedLabels.push(label);
  }

  const focused = focusedLabels.join("\n");
  // Controls visible at every viewport: wordmark (home), Log in, and both
  // hero CTAs must be keyboard reachable with the focus ring.
  expect(focused).toMatch(/Get Me\s*This\|solid/);
  expect(focused).toContain("Log in|solid");
  expect(focused).toContain("Start my wishlist|solid");
  expect(focused).toContain("Create a group|solid");
  // The anchor nav is hidden below md in the approved design; desktop only.
  if (isDesktop) {
    expect(focused).toContain("How it works|solid");
  }

  // Keyboard activation reaches the destination, not just focus: every
  // control visible on the mobile viewport is asserted at BOTH viewports.
  // All four are native anchors, so Enter activation is expected for each —
  // none is intentionally non-activatable. The wordmark starts from /auth
  // so navigating home is observable (from / it would be a no-op).
  const activations = [
    {
      name: "Get Me This home",
      start: "/auth",
      destinationUrl: /\/$/,
      destinationHeading: "How it works",
    },
    {
      name: "Log in",
      start: "/",
      destinationUrl: /\/auth\?intent=home$/,
      destinationHeading: "Welcome to Get Me This.",
    },
    {
      name: "Start my wishlist",
      start: "/",
      destinationUrl: /\/auth\?intent=wishlist$/,
      destinationHeading: "Welcome to Get Me This.",
    },
    {
      name: "Create a group",
      start: "/",
      destinationUrl: /\/auth\?intent=create-group$/,
      destinationHeading: "Welcome to Get Me This.",
    },
  ] as const;

  for (const {
    name,
    start,
    destinationUrl,
    destinationHeading,
  } of activations) {
    await page.goto(start);
    // .first() targets the hero CTA when the same label also appears in the
    // final-CTA section; the wordmark and Log in links are unique.
    await page.getByRole("link", { name }).first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(destinationUrl);
    await expect(
      page.getByRole("heading", { name: destinationHeading }),
    ).toBeVisible();
  }
});

test("the hero collage is static under reduced motion", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "prefers-reduced-motion emulation is asserted in Chromium",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const reveal = page.locator(".landing-reveal").first();
  await expect(reveal).toBeVisible();
  // The global reduced-motion block pins every animation to 0.01ms, so no
  // entrance motion can play regardless of the resolved animation name.
  const duration = await reveal.evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  // Chromium serialises 0.01ms as "1e-05s"; compare numerically.
  const durationMs = duration.endsWith("ms")
    ? parseFloat(duration)
    : parseFloat(duration) * 1000;
  expect(durationMs).toBeLessThanOrEqual(0.02);
});
