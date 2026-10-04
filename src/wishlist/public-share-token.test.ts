import { describe, expect, it } from "vitest";
import { parsePublicShareToken } from "./public-share-token";

describe("canonical public wishlist tokens", () => {
  it.each(["A".repeat(43), "_-aB2".repeat(8) + "xY0", "z".repeat(42) + "8"])(
    "accepts a canonical 32-byte token",
    (token) => {
      expect(parsePublicShareToken(token)).toBe(token);
    },
  );
  it.each([
    undefined,
    null,
    "",
    "A".repeat(42),
    "A".repeat(44),
    "A".repeat(42) + "B",
    "A".repeat(43) + "=",
    "/" + "A".repeat(42),
    "https://evil.example",
    "//evil.example",
    "../wishlist",
    "%2F%2Fevil.example",
    " A".repeat(22),
    [],
    {},
  ])("rejects malformed tokens and URL-like values: %j", (token) => {
    expect(parsePublicShareToken(token)).toBeNull();
  });
});
