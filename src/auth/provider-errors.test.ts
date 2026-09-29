import { describe, expect, it } from "vitest";

import {
  isOverLimitFailure,
  mapRequestCodeFailure,
  mapVerifyCodeFailure,
} from "./provider-errors";

/**
 * The closed generic error mapping (004c): provider messages never pass
 * through, no account-existence signal is possible, and the public
 * vocabulary is exactly the closed enums.
 */
describe("provider error mapping", () => {
  it("maps rate-limit refusals to the over-limit state", () => {
    expect(
      mapRequestCodeFailure({
        status: 429,
        code: "over_email_send_rate_limit",
        message:
          "For security purposes, you can only request this after 0 seconds.",
      }),
    ).toBe("over-limit");
    expect(
      mapVerifyCodeFailure({ status: 429, code: "over_request_rate_limit" }),
    ).toBe("over-limit");
    expect(isOverLimitFailure({ status: 429 })).toBe(true);
    expect(isOverLimitFailure({ code: "over_smtp_send_rate_limit" })).toBe(
      true,
    );
  });

  it("maps the token-rejection family to the rejected-code state", () => {
    // Locally and on staging, wrong, expired, reused, and superseded codes
    // all arrive as this same 403 — one public state covers them honestly.
    const rejected = {
      status: 403,
      code: "otp_expired",
      message: "Token has expired or is invalid",
    };
    expect(mapVerifyCodeFailure(rejected)).toBe("rejected-code");
    expect(mapVerifyCodeFailure({ status: 403 })).toBe("rejected-code");
    expect(mapVerifyCodeFailure({ code: "otp_expired" })).toBe("rejected-code");
    expect(
      mapVerifyCodeFailure({ status: 400, code: "validation_failed" }),
    ).toBe("rejected-code");
  });

  it("lands everything else in the generic unavailable state", () => {
    expect(mapRequestCodeFailure(new TypeError("fetch failed"))).toBe(
      "unavailable",
    );
    expect(mapRequestCodeFailure({ status: 500, code: "unexpected" })).toBe(
      "unavailable",
    );
    expect(mapRequestCodeFailure(undefined)).toBe("unavailable");
    expect(mapVerifyCodeFailure(null)).toBe("unavailable");
    expect(mapVerifyCodeFailure({ status: 500, code: "unexpected" })).toBe(
      "unavailable",
    );
    expect(mapVerifyCodeFailure(new TypeError("fetch failed"))).toBe(
      "unavailable",
    );
  });

  it("never passes a provider message through to the public vocabulary", () => {
    // Whatever the provider says — including account-specific wording — the
    // mapping output is one of the closed enum values and nothing else.
    for (const error of [
      {
        status: 400,
        code: "bad",
        message: "account does not exist for user@x.com",
      },
      { status: 403, message: "Email address user@x.com not confirmed" },
      { status: 429, message: "user@x.com must wait 42 seconds" },
      "raw string failure",
      42,
    ]) {
      const requestResult = mapRequestCodeFailure(error);
      expect(["invalid-email", "over-limit", "unavailable"]).toContain(
        requestResult,
      );
      const verifyResult = mapVerifyCodeFailure(error);
      expect([
        "invalid-code",
        "rejected-code",
        "over-limit",
        "unavailable",
      ]).toContain(verifyResult);
    }
  });
});
