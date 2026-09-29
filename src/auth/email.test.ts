import { describe, expect, it } from "vitest";

import { isValidEmail } from "./email";

/**
 * One email rule enforced by the client form, the server action, and the
 * carry-cookie read path alike (004c).
 */
describe("isValidEmail", () => {
  it("accepts plausible addresses", () => {
    expect(isValidEmail("you@example.com")).toBe(true);
    expect(isValidEmail("  you@example.com  ")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.co")).toBe(true);
  });

  it("rejects empty and malformed values", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
    expect(isValidEmail("two@at@signs.com")).toBe(false);
    expect(isValidEmail("spaces in@address.com")).toBe(false);
  });
});
