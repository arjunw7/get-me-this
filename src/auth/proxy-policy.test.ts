import { describe, expect, it } from "vitest";

import {
  cleanConfirmUrl,
  isServerActionRequest,
  shouldRedirectToCleanConfirmUrl,
} from "./proxy-policy";

/**
 * The request-level policies behind proxy.ts (004c).
 */
describe("proxy policy", () => {
  it("redirects any /auth/confirm query — the token hash is authentication material", () => {
    expect(
      shouldRedirectToCleanConfirmUrl(
        "/auth/confirm",
        "?token_hash=abc&type=email",
      ),
    ).toBe(true);
    expect(
      shouldRedirectToCleanConfirmUrl("/auth/confirm", "?state=valid"),
    ).toBe(true);
    expect(shouldRedirectToCleanConfirmUrl("/auth/confirm", "")).toBe(false);
    expect(
      shouldRedirectToCleanConfirmUrl("/auth/verify", "?token_hash=abc"),
    ).toBe(false);
    expect(shouldRedirectToCleanConfirmUrl("/", "?anything")).toBe(false);
  });

  it("builds the clean redirect target from the origin only", () => {
    expect(cleanConfirmUrl("http://127.0.0.1:3100")).toBe(
      "http://127.0.0.1:3100/auth/confirm",
    );
  });

  it("recognizes Next.js Server Action requests by method and header", () => {
    expect(isServerActionRequest("POST", "some-action-id")).toBe(true);
    expect(isServerActionRequest("POST", null)).toBe(false);
    expect(isServerActionRequest("GET", "some-action-id")).toBe(false);
    expect(isServerActionRequest("GET", null)).toBe(false);
  });
});
