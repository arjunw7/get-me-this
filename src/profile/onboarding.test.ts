import { describe, expect, it } from "vitest";

import { TASTE_LINE_MAX } from "@/src/auth/fixtures";

import { validateOnboardingInput, DISPLAY_NAME_MAX } from "./onboarding";

/**
 * Pure onboarding validation (004e): display name required; the taste line
 * bounded, blank normalized to null, and over-limit input REJECTED — never
 * silently truncated — under the one shared whitespace rule, over the full
 * blank corpus with its non-blank controls.
 */

const BLANK_CORPUS = [
  "",
  " ",
  "\t",
  "\n",
  "\r",
  " \t\n",
  "\t \t",
  "\u00A0",
  "\u00A0 \t",
  "\u3000",
  "\uFEFF",
] as const;

describe("validateOnboardingInput", () => {
  it("accepts a display name alone; the taste line normalizes to null", () => {
    expect(validateOnboardingInput("Ada", "")).toEqual({
      ok: true,
      displayName: "Ada",
      tasteLine: null,
    });
  });

  it.each(BLANK_CORPUS)(
    "a blank taste line (%j) normalizes to null, not the blank string",
    (value) => {
      const result = validateOnboardingInput("Ada", value);
      expect(result).toEqual({
        ok: true,
        displayName: "Ada",
        tasteLine: null,
      });
    },
  );

  it.each(BLANK_CORPUS)(
    "a blank display name (%j) is rejected as required",
    (value) => {
      const result = validateOnboardingInput(value, "");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.displayName).toBe("required");
        expect(result.errors.tasteLine).toBeUndefined();
      }
    },
  );

  it("rejects a display name over the form's bound server-side", () => {
    const result = validateOnboardingInput(
      "x".repeat(DISPLAY_NAME_MAX + 1),
      "",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.displayName).toBe("too-long");
  });

  it("accepts a display name at the bound", () => {
    expect(validateOnboardingInput("x".repeat(DISPLAY_NAME_MAX), "").ok).toBe(
      true,
    );
  });

  it("rejects an over-limit taste line instead of truncating", () => {
    const result = validateOnboardingInput(
      "Ada",
      "x".repeat(TASTE_LINE_MAX + 1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.tasteLine).toBe("too-long");
  });

  it("accepts a taste line at the limit", () => {
    const result = validateOnboardingInput("Ada", "x".repeat(TASTE_LINE_MAX));
    expect(result).toEqual({
      ok: true,
      displayName: "Ada",
      tasteLine: "x".repeat(TASTE_LINE_MAX),
    });
  });

  it.each(["x y", "  Ada  ", " currently in my tiny-luxuries era "])(
    "non-blank values pass through verbatim, untrimmed (%j)",
    (value) => {
      const result = validateOnboardingInput(value, value);
      expect(result).toEqual({
        ok: true,
        displayName: value,
        tasteLine: value,
      });
    },
  );

  it("reports both field errors together", () => {
    const result = validateOnboardingInput(
      "\u00A0",
      "x".repeat(TASTE_LINE_MAX + 1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.displayName).toBe("required");
      expect(result.errors.tasteLine).toBe("too-long");
    }
  });
});
