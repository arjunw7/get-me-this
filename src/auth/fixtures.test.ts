import { describe, expect, it } from "vitest";

import {
  DEMO_CODE,
  INTENT_NOTES,
  parseConfirmVariant,
  parseIntent,
  parseOnboardingVariant,
  parseVerifyVariant,
  RESEND_SECONDS,
  TASTE_LINE_MAX,
  TASTE_LINE_SUGGESTIONS,
} from "./fixtures";

/**
 * The auth fixture module holds the designed copy and the URL-fixture
 * convention. These guards keep the copy anchored to the frozen V18
 * reference, hold the approved terminology, and pin the deterministic
 * fixture values.
 */

describe("auth fixtures", () => {
  it("parses the reference's intent convention with a safe default", () => {
    expect(parseIntent("home")).toBe("home");
    expect(parseIntent("wishlist")).toBe("wishlist");
    expect(parseIntent("create-group")).toBe("create-group");
    expect(parseIntent(undefined)).toBe("home");
    expect(parseIntent("invite")).toBe("home");
    expect(parseIntent("nonsense")).toBe("home");
  });

  it("carries the reference's intent notes, with none for home", () => {
    expect(INTENT_NOTES.home).toBeNull();
    expect(INTENT_NOTES.wishlist).toBe(
      "First, a quick sign-in. Then you’ll add your first item.",
    );
    expect(INTENT_NOTES["create-group"]).toBe(
      "First, a quick sign-in. Then you’ll set up your group.",
    );
  });

  it("parses verify variants with a safe default", () => {
    expect(parseVerifyVariant("error")).toBe("error");
    expect(parseVerifyVariant("expired")).toBe("expired");
    expect(parseVerifyVariant("default")).toBe("default");
    expect(parseVerifyVariant(undefined)).toBe("default");
    expect(parseVerifyVariant("nonsense")).toBe("default");
  });

  it("renders confirm states directly: bare route and unknown values load; valid and expired are explicit", () => {
    expect(parseConfirmVariant("valid")).toBe("valid");
    expect(parseConfirmVariant("expired")).toBe("expired");
    expect(parseConfirmVariant("loading")).toBe("loading");
    expect(parseConfirmVariant(undefined)).toBe("loading");
    expect(parseConfirmVariant("nonsense")).toBe("loading");
  });

  it("parses onboarding variants with a safe default", () => {
    expect(parseOnboardingVariant("validation")).toBe("validation");
    expect(parseOnboardingVariant("default")).toBe("default");
    expect(parseOnboardingVariant(undefined)).toBe("default");
    expect(parseOnboardingVariant("nonsense")).toBe("default");
  });

  it("pins the deterministic demo values used for capture", () => {
    expect(DEMO_CODE).toBe("482913");
    expect(RESEND_SECONDS).toBe(30);
    expect(TASTE_LINE_MAX).toBe(60);
    expect(TASTE_LINE_SUGGESTIONS).toEqual([
      "currently in my tiny-luxuries era",
      "will travel for good coffee",
      "my cart is a personality",
      "yes, I need another tote",
    ]);
  });

  it("keeps the approved product terminology", () => {
    const copy = [
      ...Object.values(INTENT_NOTES).filter((v): v is string => v !== null),
      ...TASTE_LINE_SUGGESTIONS,
    ];
    for (const text of copy) {
      expect(text).not.toMatch(/shelfie|circle/i);
    }
  });
});
