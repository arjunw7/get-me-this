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
    // 004c changes the entry screen's helper copy to the real code-flow
    // promise ("No password. We'll send you a secure code to sign in."),
    // so this family's rendering no longer matches the committed baseline.
    // SKIPPED pending the owner's side-by-side copy review and baseline
    // regeneration (docs/delivery/visual-baselines.md) — do not unskip by
    // regenerating without approval.
    name: "auth-wishlist",
    url: "/auth?intent=wishlist",
    heading: "Welcome to Get Me This.",
  },
  {
    // See the auth-wishlist note: 004c copy change, regeneration gate.
    name: "auth-create-group",
    url: "/auth?intent=create-group",
    heading: "Welcome to Get Me This.",
  },
  {
    // 004c: the bare /auth/verify route is now the real flow (carry-cookie
    // driven); the static reference state moved to the explicit
    // `?state=default` fixture URL. The fixture screen renders
    // byte-identically there, so the committed baseline stays valid.
    name: "verify-default",
    url: "/auth/verify?state=default",
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
    // 004c: the confirm route renders ONE honest interim state ("One more
    // step.") — the old loading/valid/expired frames are gone, so these
    // families cannot match their committed baselines. SKIPPED pending the
    // owner's side-by-side review of the interim screen and the baseline
    // regeneration (or retirement) decision.
    name: "confirm-valid",
    url: "/auth/confirm?state=valid",
    heading: "You’re in.",
  },
  {
    // See the confirm-valid note: 004c interim state, regeneration gate.
    name: "confirm-expired",
    url: "/auth/confirm?state=expired",
    heading: "This link has expired.",
  },
  {
    // 004e: the bare /onboarding route is the real gated flow; the fixture
    // states moved to the explicit `?state=` URLs, exactly as 004c did for
    // /auth/verify. The fixture screens render identically to the states
    // the committed baselines captured, so the baselines stay valid.
    name: "onboarding",
    url: "/onboarding?state=default",
    heading: "Tell friends who you are.",
  },
  {
    name: "onboarding-validation",
    url: "/onboarding?state=validation",
    heading: "Tell friends who you are.",
  },
];

/**
 * The fixed instant the fake clock is paused at during every capture.
 * A named constant keeps the frozen page time identical across all
 * baselines and reruns.
 */
const FROZEN_AT = new Date("2026-01-01T00:00:00Z");

/** Baseline families whose rendering 004c deliberately changed; their
 *  committed baselines cannot be regenerated without the owner's explicit
 *  side-by-side approval (AGENTS.md, docs/delivery/visual-baselines.md). */
const PENDING_BASELINE_APPROVAL = new Set([
  "auth-wishlist",
  "auth-create-group",
  "confirm-valid",
  "confirm-expired",
]);

for (const family of FAMILIES) {
  test(`${family.name} is visually stable in its fixture state`, async ({
    page,
  }, testInfo) => {
    test.skip(
      PENDING_BASELINE_APPROVAL.has(family.name),
      "004c changes this screen's copy or state; baseline regeneration awaits the owner's side-by-side review (docs/delivery/visual-baselines.md)",
    );
    // Test-only determinism, using Playwright's documented "pause time"
    // mechanism: install the fake clock and PAUSE it (page.clock.pauseAt)
    // BEFORE navigation. While paused, no page timer fires, so the resend
    // countdown's one-second tick cannot run and the capture is pinned at
    // the deterministic initial value (0:30) on every run. Note that
    // install() alone does NOT freeze timers; pauseAt is what holds time.
    // The ticking behavior stays covered by the fake-timer unit tests and
    // the e2e suite, never by screenshots.
    await page.clock.install({ time: FROZEN_AT });
    await page.clock.pauseAt(FROZEN_AT);
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

test("the paused fake clock holds the countdown at 0:30 past one second of real time", async ({
  page,
}) => {
  // Regression check for the capture mechanism itself: with the clock
  // paused via page.clock.pauseAt, more than a full second of real elapsed
  // time must NOT advance the countdown — it must still display the
  // deterministic initial value when a baseline is captured.
  await page.clock.install({ time: FROZEN_AT });
  await page.clock.pauseAt(FROZEN_AT);
  await page.goto("/auth/verify?state=default");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Check your inbox.",
  );
  await expect(page.getByText("Resend code in 0:30")).toBeVisible();

  await page.waitForTimeout(1100);

  await expect(page.getByText("Resend code in 0:30")).toBeVisible();
  await expect(page.getByText("Resend code in 0:29")).toHaveCount(0);
});
