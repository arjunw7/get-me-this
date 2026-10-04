import { describe, expect, it } from "vitest";

import {
  cleanConfirmUrl,
  isProtectedRoutePath,
  isServerActionRequest,
  shouldRedirectToCleanConfirmUrl,
} from "./proxy-policy";

/**
 * The request-level policies behind proxy.ts (004c/004e).
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

describe("protected routes (004e)", () => {
  it("protects the authenticated routes", () => {
    expect(isProtectedRoutePath("/home")).toBe(true);
    expect(isProtectedRoutePath("/groups")).toBe(true);
    expect(isProtectedRoutePath("/onboarding")).toBe(true);
  });

  it("protects the wishlist routes (005b)", () => {
    expect(isProtectedRoutePath("/wishlist")).toBe(true);
    expect(isProtectedRoutePath("/wishlist/items/new")).toBe(true);
    expect(
      isProtectedRoutePath(
        "/wishlist/items/00000000-0000-4000-8000-000000000001/edit",
      ),
    ).toBe(true);
    expect(isProtectedRoutePath("/wishlist/items/not-a-uuid/edit")).toBe(true);
  });

  it("keeps the landing page, auth routes, and everything else public", () => {
    for (const path of [
      "/",
      "/auth",
      "/auth/verify",
      "/auth/confirm",
      "/auth/link",
      "/onboarding?state=validation", // query strings never count
      "/health",
      "/design-foundation",
      "/HOME", // case-sensitive, exact match only
      "/home/extra",
      // The wishlist paths are protected by exact match only: unknown child
      // paths are not blanket-protected (they render the framework's
      // not-found state, which carries no wishlist data — 005b criterion 1).
      "/wishlist/unknown",
      "/wishlist/items",
      "/WISHLIST", // case-sensitive, exact match only
      "/wishlist?state=anything", // query strings never count
    ]) {
      expect(isProtectedRoutePath(path), path).toBe(false);
    }
  });
});
