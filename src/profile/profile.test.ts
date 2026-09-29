import { describe, expect, it } from "vitest";

import { isProfileComplete } from "./profile";

/**
 * The profile-completeness gate (004e): NOT a null-only check — a blank
 * display name under the one shared whitespace rule reads as incomplete
 * and routes to onboarding, across the full blank corpus. Defense in
 * depth: the database CHECK constraint is the primary control.
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

describe("isProfileComplete", () => {
  it("null is incomplete", () => {
    expect(isProfileComplete(null)).toBe(false);
  });

  it.each(BLANK_CORPUS)(
    "a blank display name (%j) routes to onboarding, never /home",
    (value) => {
      expect(isProfileComplete(value)).toBe(false);
    },
  );

  it.each(["Ada", "  Ada  ", "x y"])(
    "a non-blank display name (%j) is complete and stored as given",
    (value) => {
      expect(isProfileComplete(value)).toBe(true);
    },
  );
});
