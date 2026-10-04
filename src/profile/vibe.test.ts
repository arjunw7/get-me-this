import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIBE,
  VIBE_OPTIONS,
  normalizeVibe,
  parseVibe,
  vibeClasses,
} from "./vibe";

describe("persisted Vibe contract", () => {
  it.each(VIBE_OPTIONS)(
    "accepts exactly $value and provides readable semantic colors",
    ({ value }) => {
      expect(parseVibe(value)).toBe(value);
      expect(normalizeVibe(value)).toBe(value);
      expect(vibeClasses(value)).toContain("bg-");
      expect(vibeClasses(value)).toContain(
        value === "electric" ? "text-surface-raised" : "text-content-primary",
      );
    },
  );
  it.each([
    null,
    undefined,
    "",
    "blue",
    "coral",
    "lime",
    "Electric",
    " electric",
    0,
    {},
    ["tomato"],
  ])("rejects invalid write values and defaults legacy reads: %j", (value) => {
    expect(parseVibe(value)).toBeNull();
    expect(normalizeVibe(value)).toBe(DEFAULT_VIBE);
  });
});
