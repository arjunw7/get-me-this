import { describe, expect, it } from "vitest";

import { resolveSafeRedirectTarget } from "./link-intents";

/**
 * The 004d intent-to-route table (the ARJ-23 redirect-safety corpus): every
 * resolved destination is a server-defined route. External URLs,
 * protocol-relative URLs, encoded bypasses, backslash tricks, mixed-case
 * schemes, and unexpected intent values all resolve through the closed
 * enum into a server-defined route — attacker-controlled input can never
 * become a redirect target.
 */

/** The only server-defined route 004d resolves to (004e serves the rest). */
const HOME = "/home";

const BYPASS_CORPUS = [
  "https://evil.example",
  "http://evil.example/wishlist",
  "//evil.example",
  "///evil.example",
  "\\\\evil.example",
  "/\\evil.example",
  "%2F%2Fevil.example",
  "%2Fevil",
  "%252F%252Fevil.example",
  "\\evil.example",
  "javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "data:text/html,evil",
  "HTTPS://evil.example",
  "HtTpS://evil.example",
  "home#wishlist",
  "home/../../evil",
  " /home",
  "/home?next=//evil.example",
  "wishlist x",
  "WISHLIST",
  "home-or-else",
  "",
];

describe("resolveSafeRedirectTarget", () => {
  it("maps every approved intent to a server-defined route", () => {
    expect(resolveSafeRedirectTarget("home")).toBe(HOME);
    // The unbuilt wishlist experience resolves to home with no claim of
    // creation; 006b serves the real create-group route.
    expect(resolveSafeRedirectTarget("wishlist")).toBe(HOME);
    expect(resolveSafeRedirectTarget("create-group")).toBe("/groups/new");
  });

  it("only constructs a public wishlist path from the closed intent and canonical token", () => {
    const token = "A".repeat(43);
    expect(resolveSafeRedirectTarget("public-wishlist", token)).toBe(
      `/s/${token}`,
    );
    expect(resolveSafeRedirectTarget("home", token)).toBe("/home");
    expect(resolveSafeRedirectTarget("create-group", token)).toBe(
      "/groups/new",
    );
    expect(resolveSafeRedirectTarget("public-wishlist")).toBe("/home");
    for (const attempt of [
      ...BYPASS_CORPUS,
      "A".repeat(42) + "B",
      "/s/" + token,
    ]) {
      expect(resolveSafeRedirectTarget("public-wishlist", attempt)).toBe(
        "/home",
      );
    }
  });
  it("defaults an absent intent to home", () => {
    expect(resolveSafeRedirectTarget(undefined)).toBe(HOME);
  });

  it("resolves every bypass attempt to a server-defined route, never the input", () => {
    for (const attempt of BYPASS_CORPUS) {
      expect(resolveSafeRedirectTarget(attempt), attempt).toBe(HOME);
    }
  });
});
