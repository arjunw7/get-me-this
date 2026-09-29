import { describe, expect, it } from "vitest";

import {
  CARRY_COOKIE_MAX_AGE_SECONDS,
  RESEND_COOLDOWN_SECONDS,
} from "./flow-config";

/**
 * The named server-side flow constants (004c). The countdown is sourced
 * from RESEND_COOLDOWN_SECONDS — a UI reflection of the provider's
 * configured repeat-request limit, with the provider's response always
 * authoritative — and the carry cookie's life is a named constant too.
 */
describe("flow configuration constants", () => {
  it("mirrors the provider's per-user resend limit (staging: 60 seconds)", () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
  });

  it("aligns the carry-cookie life with the one-hour OTP expiry window", () => {
    expect(CARRY_COOKIE_MAX_AGE_SECONDS).toBe(3600);
  });
});
