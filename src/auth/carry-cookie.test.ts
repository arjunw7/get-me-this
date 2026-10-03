import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type StoredCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

const store: Map<string, StoredCookie> = new Map();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => store.get(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      store.set(name, { name, value, options });
    },
  }),
}));

import {
  CARRY_COOKIE_NAME,
  clearAuthCarry,
  encodeAuthCarry,
  parseAuthCarry,
  readAuthCarry,
  setAuthCarry,
} from "./carry-cookie";

/**
 * The carry cookie (004c, owner decision): the validated email and
 * approved intent travel from /auth to /auth/verify in a short-lived,
 * app-owned HttpOnly cookie, validated server-side on every read and
 * cleared on cancel/restart, successful verification, and expiry.
 */
const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("carry-cookie payload validation", () => {
  it("round-trips a valid payload", () => {
    const value = encodeAuthCarry("you@example.com", "wishlist", NOW);
    expect(parseAuthCarry(value, NOW + 1000)).toEqual({
      email: "you@example.com",
      intent: "wishlist",
    });
  });

  it("carries only a validated public token for the matching intent", () => {
    const shareToken = "A".repeat(43);
    const value = encodeAuthCarry(
      "you@example.com",
      "public-wishlist",
      NOW,
      shareToken,
    );
    expect(parseAuthCarry(value, NOW)).toEqual({
      email: "you@example.com",
      intent: "public-wishlist",
      shareToken,
    });
    expect(parseAuthCarry(value, NOW + 3601_000)).toBeNull();
    expect(
      parseAuthCarry(
        encodeAuthCarry("you@example.com", "home", NOW, shareToken),
        NOW,
      ),
    ).toEqual({ email: "you@example.com", intent: "home" });
  });
  it.each([undefined, "//evil.example", "A".repeat(42) + "B", "A".repeat(44)])(
    "rejects missing or altered public token in a carried public intent",
    (shareToken) => {
      expect(
        parseAuthCarry(
          JSON.stringify({
            email: "you@example.com",
            intent: "public-wishlist",
            shareToken,
            exp: NOW / 1000 + 3600,
          }),
          NOW,
        ),
      ).toBeNull();
    },
  );
  it("accepts the value up to (not past) its expiry", () => {
    const value = encodeAuthCarry("you@example.com", "home", NOW);
    // Expiry is checked against the wall clock: at Max-Age minus one second
    // it is still valid; one second past, it is not.
    expect(parseAuthCarry(value, NOW + 3600 * 1000 - 1000)).not.toBeNull();
    expect(parseAuthCarry(value, NOW + 3600 * 1000 + 1000)).toBeNull();
  });

  it("treats malformed, non-enum, and missing values like a missing cookie", () => {
    expect(parseAuthCarry(undefined, NOW)).toBeNull();
    expect(parseAuthCarry("", NOW)).toBeNull();
    expect(parseAuthCarry("not json", NOW)).toBeNull();
    expect(parseAuthCarry(JSON.stringify([1, 2]), NOW)).toBeNull();
    // Format-checked email: a tampered or malformed address is rejected.
    expect(
      parseAuthCarry(
        JSON.stringify({ email: "not-an-email", intent: "home", exp: 9 }),
        NOW,
      ),
    ).toBeNull();
    // Closed intent enum: an injected value is rejected.
    expect(
      parseAuthCarry(
        JSON.stringify({
          email: "you@example.com",
          intent: "https://evil.example",
          exp: 9,
        }),
        NOW,
      ),
    ).toBeNull();
    expect(
      parseAuthCarry(
        JSON.stringify({ email: "you@example.com", intent: 7, exp: 9 }),
        NOW,
      ),
    ).toBeNull();
    // Checked expiry: a missing or malformed expiry is rejected.
    expect(
      parseAuthCarry(
        JSON.stringify({ email: "you@example.com", intent: "home" }),
        NOW,
      ),
    ).toBeNull();
    expect(
      parseAuthCarry(
        JSON.stringify({
          email: "you@example.com",
          intent: "home",
          exp: "soon",
        }),
        NOW,
      ),
    ).toBeNull();
    expect(
      parseAuthCarry(
        JSON.stringify({
          email: "you@example.com",
          intent: "home",
          exp: Number.NaN,
        }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("carry-cookie storage attributes", () => {
  beforeEach(() => {
    store.clear();
  });

  it("sets an HttpOnly, Secure, SameSite=Lax cookie scoped to /auth with a named lifetime", async () => {
    await setAuthCarry("you@example.com", "create-group");

    const stored = store.get(CARRY_COOKIE_NAME);
    expect(stored).toBeDefined();
    expect(stored?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/auth",
      maxAge: 3600,
    });
    const parsed = JSON.parse(stored?.value ?? "") as {
      email: string;
      intent: string;
      exp: number;
    };
    expect(parsed.email).toBe("you@example.com");
    expect(parsed.intent).toBe("create-group");
    // The expiry rides in the payload and is checked server-side on read.
    expect(typeof parsed.exp).toBe("number");
  });

  it("reads back only a valid carried value", async () => {
    await setAuthCarry("you@example.com", "wishlist");
    expect(await readAuthCarry()).toEqual({
      email: "you@example.com",
      intent: "wishlist",
    });

    store.set(CARRY_COOKIE_NAME, { name: CARRY_COOKIE_NAME, value: "garbage" });
    expect(await readAuthCarry()).toBeNull();
    store.clear();
    expect(await readAuthCarry()).toBeNull();
  });

  it("clears by expiring the cookie", async () => {
    await setAuthCarry("you@example.com", "home");
    await clearAuthCarry();

    const stored = store.get(CARRY_COOKIE_NAME);
    expect(stored?.value).toBe("");
    expect(stored?.options).toMatchObject({
      maxAge: 0,
      httpOnly: true,
      secure: true,
    });
  });
});
