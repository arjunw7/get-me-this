import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the approved wishlist-first landing revision.
 *
 * The suites run under both approved projects (mobile 390x844 and desktop
 * 1440x1000). Landing CTAs are verified by CLICK-THROUGH: each control is
 * activated and the rendered destination content is asserted — inspecting
 * href attributes alone is not evidence.
 */

test("renders the approved landing hierarchy", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Get Me This | Your shareable gift wishlist");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Good gifts start with a wishlist.");

  for (const section of [
    "Your wishlist. One link. Happy friends.",
    "A few good questions.",
    "Any excuse to gift.",
  ]) {
    await expect(page.getByRole("heading", { name: section })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", {
      name: "Gifting together? Start a group.",
    }),
  ).toBeVisible();

  // Approved terminology only.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/shelfie|circle/i);

  // The demo group figure's accessible name matches its visible name.
  await expect(
    page.getByRole("figure", { name: "Santa Party 🎉" }),
  ).toBeVisible();
  await expect(
    page.getByRole("figure", { name: "Santa Party 🎉" }),
  ).toContainText("Reserved by you");
  await expect(
    page.getByRole("figure", { name: "Santa Party 🎉" }),
  ).toContainText("Kabir sees his list, but none of the reservations");
});

test("anchor navigation scrolls to its section", async ({ page }, testInfo) => {
  // The reference hides the anchor nav below the md breakpoint by design;
  // mobile users scroll to the sections directly.
  test.skip(
    (testInfo.project.use.viewport?.width ?? 0) < 768,
    "anchor nav is hidden on mobile in the approved design",
  );
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(
    page.getByRole("heading", {
      name: "Your wishlist. One link. Happy friends.",
    }),
  ).toBeInViewport();
});

test.describe("landing CTA click-through", () => {
  for (const cta of [
    { name: "Create my wishlist", intent: "wishlist" },
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

  // The pre-submit helper text promises exactly the working code flow.
  await expect(
    page.getByText("No password. We’ll send you a secure code to sign in."),
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

test("a valid submission recovers honestly when the provider is not configured", async ({
  page,
}) => {
  // The plain e2e build carries no Supabase configuration, so the request
  // action lands in the generic recovery state: no navigation, no carry,
  // no fake success, the control stays usable.
  await page.goto("/auth");
  await page.getByLabel("Email").fill("you@example.com");
  await page.getByRole("button", { name: "Continue with email" }).click();

  await expect(
    page.getByRole("alert").filter({
      hasText: "We couldn’t send your code just now.",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
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
  // Controls visible at every viewport: wordmark (home), Log in, and the
  // primary and example hero CTAs must be keyboard reachable with the focus ring.
  expect(focused).toMatch(/Get Me\s*This\|solid/);
  expect(focused).toContain("Log in|solid");
  expect(focused).toContain("Create my wishlist|solid");
  expect(focused).toContain("How it works|solid");
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
      destinationHeading: "Your wishlist. One link. Happy friends.",
    },
    {
      name: "Log in",
      start: "/",
      destinationUrl: /\/auth\?intent=home$/,
      destinationHeading: "Welcome to Get Me This.",
    },
    {
      name: "Create my wishlist",
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

test("the hero explanation action works with a keyboard at both sizes", async ({
  page,
}) => {
  await page.goto("/");
  const action = page.getByRole("link", { name: "How it works" }).last();
  await action.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#how$/);
  await expect(
    page.getByRole("heading", {
      name: "Your wishlist. One link. Happy friends.",
    }),
  ).toBeInViewport();
  const question = page
    .locator("summary")
    .filter({ hasText: "Do I need a group" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("No. Create your wishlist and share its link.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("the original decorative collage respects reduced motion and shows no public reservations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const hero = page.locator("main > section").first();
  await expect(hero.locator("img")).toHaveCount(3);
  await expect(hero).not.toContainText(/reserved|reservation/i);
  const reveal = hero.locator(".landing-reveal").first();
  await expect(reveal).toBeVisible();
  const duration = await reveal.evaluate(
    (element) => getComputedStyle(element).animationDuration,
  );
  const durationMs = duration.endsWith("ms")
    ? parseFloat(duration)
    : parseFloat(duration) * 1000;
  expect(durationMs).toBeLessThanOrEqual(0.02);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("the landing CTAs pop on hover with the approved press motion", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "press-motion interpolation is asserted in Chromium, the approved evidence engine",
  );

  await page.goto("/");
  const cta = page.getByRole("link", { name: "Create my wishlist" }).first();
  await cta.waitFor({ state: "visible" });

  // Sample the computed translate through the 150ms press transition while
  // the pointer moves onto the CTA. The lift must animate through
  // intermediate values: on staging the lift never fired on anchors at all
  // (:enabled never matches an anchor), so the control read as inert.
  const sampling = cta.evaluate(
    (element) =>
      new Promise<string[]>((resolve) => {
        const read = () => getComputedStyle(element).translate;
        const observed = [read()];
        const start = performance.now();
        const tick = () => {
          observed.push(read());
          if (performance.now() - start < 300) requestAnimationFrame(tick);
          else resolve(observed);
        };
        requestAnimationFrame(tick);
      }),
  );
  await cta.hover();
  const observed = await sampling;

  const liftOf = (value: string) => {
    if (!value || value === "none") return 0;
    return Math.abs(parseFloat(value.split(" ")[1] ?? "0")) || 0;
  };

  // The hover end-state is the approved 2px lift (spacing token 0.5).
  const finalLift = liftOf(observed[observed.length - 1]);
  expect(finalLift).toBeGreaterThanOrEqual(1.9);
  expect(finalLift).toBeLessThanOrEqual(2.1);

  // The lift is animated: at least one sampled frame sits strictly between
  // rest and the final lift. A jump (or no motion) fails this.
  const intermediates = observed
    .map(liftOf)
    .filter((lift) => lift > 0.05 && lift < 1.9);
  expect(intermediates.length).toBeGreaterThanOrEqual(1);
});
