import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  gateOtpSend,
  realTurnstileVerifier,
  type CaptchaConfig,
} from "./captcha";

/**
 * 009b CAPTCHA gate tests, credential-independent (the staging credentials
 * have been broken since 2026-09-29; the verifier is stubbed here).
 */

const config: CaptchaConfig = { siteKey: "site", secretKey: "secret" };
const passingVerifier = async () => true;
const failingVerifier = async () => false;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("gateOtpSend", () => {
  it("is disabled when the kill switch (missing configuration) is in force", async () => {
    const result = await gateOtpSend({
      config: null,
      verifier: failingVerifier,
      token: "tok",
      clientIp: null,
    });
    expect(result).toBe("disabled");
  });

  it("fails closed on a missing or malformed token while enabled", async () => {
    for (const token of [undefined, null, "", 42]) {
      const result = await gateOtpSend({
        config,
        verifier: passingVerifier,
        token,
        clientIp: null,
      });
      expect(result).toBe("failed");
    }
  });

  it("passes and fails with the verifier's verdict", async () => {
    expect(
      await gateOtpSend({
        config,
        verifier: passingVerifier,
        token: "tok",
        clientIp: null,
      }),
    ).toBe("passed");
    expect(
      await gateOtpSend({
        config,
        verifier: failingVerifier,
        token: "tok",
        clientIp: null,
      }),
    ).toBe("failed");
  });

  it("the real verifier fails closed on network error and never logs the secret", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a) =>
      lines.push(String(a[0])),
    );
    vi.spyOn(console, "error").mockImplementation((...a) =>
      lines.push(String(a[0])),
    );
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    expect(await realTurnstileVerifier("tok", null)).toBe(false);
    expect(lines.join("\n")).not.toContain("secret");
  });
});
