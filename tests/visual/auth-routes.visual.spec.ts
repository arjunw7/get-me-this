import { expect, test } from "@playwright/test";

/**
 * Visual-regression screenshots of the static auth and onboarding states
 * (003b), named per the route map's baseline families and compared
 * against `docs/design-reference/baselines/v18/` and, for the three
 * states without a distinct frozen screenshot (confirm success, confirm
 * recovery, onboarding validation), the pinned-artifact reference
 * captures in docs/delivery/evidence/arj-18/.
 *
 * Determinism measures, all test-only: full-page capture at the approved
 * viewport, animations disabled, caret hidden, device pixel ratio 1, local
 * fonts and vendored assets, countdowns rendered from their deterministic
 * initial value. Candidate screenshots are generated with
 * --update-snapshots and are committed only after human approval; see
 * docs/delivery/visual-baselines.md.
 *
 * The confirm fixtures render their FINAL states directly — no timer or
 * animation gates application state, and the content assertions below are
 * guards, not the source of determinism. The loading frame has no
 * baseline family: the frozen confirm-* PNGs already document it, and
 * its behavior is covered by tests, not screenshots.
 */

type Family = {
  name: string;
  url: string;
  /** The heading that proves the intended state rendered before capture. */
  heading: string;
};

const FAMILIES: readonly Family[] = [
  {
    name: "auth-wishlist",
    url: "/auth?intent=wishlist",
    heading: "Welcome to Get Me This.",
  },
  {
    name: "auth-create-group",
    url: "/auth?intent=create-group",
    heading: "Welcome to Get Me This.",
  },
  {
    name: "verify-default",
    url: "/auth/verify",
    heading: "Check your inbox.",
  },
  {
    name: "verify-error",
    url: "/auth/verify?state=error",
    heading: "Check your inbox.",
  },
  {
    name: "verify-expired",
    url: "/auth/verify?state=expired",
    heading: "Check your inbox.",
  },
  {
    name: "confirm-valid",
    url: "/auth/confirm?state=valid",
    heading: "You’re in.",
  },
  {
    name: "confirm-expired",
    url: "/auth/confirm?state=expired",
    heading: "This link has expired.",
  },
  {
    name: "onboarding",
    url: "/onboarding",
    heading: "Tell friends who you are.",
  },
  {
    name: "onboarding-validation",
    url: "/onboarding?state=validation",
    heading: "Tell friends who you are.",
  },
];

for (const family of FAMILIES) {
  test(`${family.name} is visually stable in its fixture state`, async ({
    page,
  }, testInfo) => {
    await page.goto(family.url);

    // Guard: the intended state must have rendered — a passing screenshot
    // of any other frame is not acceptable evidence.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      family.heading,
    );

    // State-specific guards beyond the heading.
    if (family.name === "verify-error") {
      await expect(page.getByText(/That code doesn’t match/i)).toBeVisible();
    }
    if (family.name === "verify-expired") {
      await expect(page.getByText("That code has expired.")).toBeVisible();
    }
    if (family.name === "confirm-valid") {
      await expect(
        page.getByText(
          "In the real product, this takes you where you were headed.",
        ),
      ).toBeVisible();
    }
    if (family.name === "onboarding-validation") {
      await expect(
        page.getByText("Friends need something to call you."),
      ).toBeVisible();
    }

    await expect(page).toHaveScreenshot(
      `${family.name}-${testInfo.project.name}.png`,
      {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      },
    );
  });
}
