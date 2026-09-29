import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

type StoredCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};
const cookieStore: Map<string, StoredCookie> = new Map();
const requestHeaders: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieStore.set(name, { name, value, options });
    },
  }),
  headers: async () => ({
    get: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
  }),
}));

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();
const getUser = vi.fn();

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithOtp, verifyOtp, signOut, getUser },
  }),
}));

vi.mock("./link-intents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./link-intents")>();
  return {
    ...actual,
    resolveSafeRedirectTarget: vi.fn(actual.resolveSafeRedirectTarget),
  };
});

import {
  cancelAuthFlowAction,
  requestCodeAction,
  resendCodeAction,
  signOutAction,
  verifyCodeAction,
  verifyMagicLinkAction,
} from "./actions";
import { CARRY_COOKIE_NAME } from "./carry-cookie";
import { LINK_COOKIE_NAME, encodeLinkEnvelope } from "./link-cookie";
import { resolveSafeRedirectTarget } from "./link-intents";

/**
 * The server actions of the email-code flow (004c): server-side
 * re-validation, provider calls with the allowlisted emailRedirectTo, the
 * carry cookie's lifecycle, closed generic failure mapping, successful
 * session creation, and the local-scoped minimal sign-out.
 */
const IDLE = { status: "idle" } as const;

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  cookieStore.clear();
  requestHeaders.host = "127.0.0.1:3100";
  delete requestHeaders["x-forwarded-proto"];
  signInWithOtp.mockReset();
  verifyOtp.mockReset();
  signOut.mockReset();
  getUser.mockReset();
  vi.mocked(resolveSafeRedirectTarget).mockClear();
  process.env.AUTH_LINK_COOKIE_SECRET = "test-secret";
});

afterEach(() => {
  delete process.env.AUTH_LINK_COOKIE_SECRET;
});

describe("requestCodeAction", () => {
  it("requests a code with the allowlisted redirect and carries the email and intent", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });

    await expect(
      requestCodeAction(
        IDLE,
        formData({ email: " you@example.com ", intent: "wishlist" }),
      ),
    ).rejects.toThrow(RedirectSignal);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "you@example.com",
      options: { emailRedirectTo: "http://127.0.0.1:3100/auth/confirm" },
    });
    const carried = cookieStore.get(CARRY_COOKIE_NAME);
    expect(carried).toBeDefined();
    const payload = JSON.parse(carried?.value ?? "{}") as {
      email: string;
      intent: string;
    };
    expect(payload.email).toBe("you@example.com");
    expect(payload.intent).toBe("wishlist");
  });

  it("redirects to the verify screen after a successful request", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    await expect(
      requestCodeAction(
        IDLE,
        formData({ email: "you@example.com", intent: "home" }),
      ),
    ).rejects.toThrow(RedirectSignal);
  });

  it("re-validates the email server-side before any provider call", async () => {
    const result = await requestCodeAction(
      IDLE,
      formData({ email: "not-an-email", intent: "home" }),
    );
    expect(result).toEqual({ status: "error", failure: "invalid-email" });
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(cookieStore.has(CARRY_COOKIE_NAME)).toBe(false);
  });

  it("re-validates the intent against the closed enum", async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: null });
    await expect(
      requestCodeAction(
        IDLE,
        formData({ email: "you@example.com", intent: "https://evil.example" }),
      ),
    ).rejects.toThrow(RedirectSignal);
    const payload = JSON.parse(
      cookieStore.get(CARRY_COOKIE_NAME)?.value ?? "{}",
    ) as { intent: string };
    // Unknown values resolve to home, exactly as the page parses them.
    expect(payload.intent).toBe("home");
  });

  it("maps a rate-limited send to the over-limit recovery without carrying anything", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: "over_email_send_rate_limit",
        message: "provider says wait",
      },
    });
    const result = await requestCodeAction(
      IDLE,
      formData({ email: "you@example.com", intent: "home" }),
    );
    expect(result).toEqual({ status: "error", failure: "over-limit" });
    expect(cookieStore.has(CARRY_COOKIE_NAME)).toBe(false);
  });

  it("maps every other provider failure to the generic unavailable state", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        status: 500,
        code: "whatever",
        message: "account-specific detail",
      },
    });
    const result = await requestCodeAction(
      IDLE,
      formData({ email: "you@example.com", intent: "home" }),
    );
    expect(result).toEqual({ status: "error", failure: "unavailable" });
    expect(cookieStore.has(CARRY_COOKIE_NAME)).toBe(false);
  });

  it("fails safely when the request origin is not on the trusted allowlist", async () => {
    requestHeaders.host = "evil.example";
    const result = await requestCodeAction(
      IDLE,
      formData({ email: "you@example.com", intent: "home" }),
    );
    expect(result).toEqual({ status: "error", failure: "unavailable" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("verifyCodeAction", () => {
  function carryValidValue() {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({ email: "you@example.com", intent: "home", exp }),
    });
  }

  it("verifies the code against the carried email and clears the carry on success", async () => {
    carryValidValue();
    verifyOtp.mockResolvedValue({
      data: { user: { email: "you@example.com" } },
      error: null,
    });

    const result = await verifyCodeAction(IDLE, formData({ code: "123456" }));

    expect(verifyOtp).toHaveBeenCalledWith({
      email: "you@example.com",
      token: "123456",
      type: "email",
    });
    expect(result).toEqual({ status: "verified" });
    expect(cookieStore.get(CARRY_COOKIE_NAME)?.options).toMatchObject({
      maxAge: 0,
    });
  });

  it("restarts safely when the carry cookie is missing or expired", async () => {
    expect(await verifyCodeAction(IDLE, formData({ code: "123456" }))).toEqual({
      status: "restart",
    });
    expect(verifyOtp).not.toHaveBeenCalled();

    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({
        email: "you@example.com",
        intent: "home",
        exp: Math.floor(Date.now() / 1000) - 1,
      }),
    });
    expect(await verifyCodeAction(IDLE, formData({ code: "123456" }))).toEqual({
      status: "restart",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects malformed codes before any provider call", async () => {
    carryValidValue();
    expect(await verifyCodeAction(IDLE, formData({ code: "12345" }))).toEqual({
      status: "error",
      failure: "invalid-code",
    });
    expect(await verifyCodeAction(IDLE, formData({ code: "abc123" }))).toEqual({
      status: "error",
      failure: "invalid-code",
    });
    expect(await verifyCodeAction(IDLE, new FormData())).toEqual({
      status: "error",
      failure: "invalid-code",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("maps the provider's token rejection to the closed generic state and keeps the flow alive", async () => {
    carryValidValue();
    verifyOtp.mockResolvedValue({
      data: {},
      error: {
        status: 403,
        code: "otp_expired",
        message: "Token has expired or is invalid",
      },
    });

    const result = await verifyCodeAction(IDLE, formData({ code: "000000" }));

    expect(result).toEqual({ status: "error", failure: "rejected-code" });
    // The carried email survives a rejection: the user can retry or resend
    // without re-entering their address.
    expect(cookieStore.get(CARRY_COOKIE_NAME)?.value).toContain(
      "you@example.com",
    );
  });

  it("creates no session on failure — verifyOtp never resolving a session is the only session source", async () => {
    carryValidValue();
    verifyOtp.mockResolvedValue({
      data: {},
      error: {
        status: 403,
        code: "otp_expired",
        message: "Token has expired or is invalid",
      },
    });
    await verifyCodeAction(IDLE, formData({ code: "000000" }));
    // The mock client exposes no session write on the failure path; the
    // action's only session-establishing call is the successful verifyOtp.
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });
});

describe("resendCodeAction", () => {
  it("resends to the carried email with the allowlisted redirect", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({
        email: "you@example.com",
        intent: "wishlist",
        exp,
      }),
    });
    signInWithOtp.mockResolvedValue({ data: {}, error: null });

    const result = await resendCodeAction(IDLE);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "you@example.com",
      options: { emailRedirectTo: "http://127.0.0.1:3100/auth/confirm" },
    });
    expect(result).toEqual({ status: "resent" });
  });

  it("restarts when the carry cookie is gone", async () => {
    expect(await resendCodeAction(IDLE)).toEqual({ status: "restart" });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("maps a too-early resend to the over-limit state", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({ email: "you@example.com", intent: "home", exp }),
    });
    signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: "over_email_send_rate_limit",
        message: "wait",
      },
    });

    expect(await resendCodeAction(IDLE)).toEqual({
      status: "error",
      failure: "over-limit",
    });
  });
});

describe("cancelAuthFlowAction", () => {
  it("clears the carry cookie and returns to the entry screen", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({ email: "you@example.com", intent: "home", exp }),
    });

    await expect(cancelAuthFlowAction()).rejects.toThrow(RedirectSignal);

    expect(cookieStore.get(CARRY_COOKIE_NAME)?.options).toMatchObject({
      maxAge: 0,
    });
  });
});

describe("signOutAction", () => {
  it("signs out with local scope only and clears the carry cookie", async () => {
    signOut.mockResolvedValue({ error: null });

    await expect(signOutAction()).rejects.toThrow(RedirectSignal);

    // Local scope: this browser's session is cleared without revoking
    // other devices' sessions (004c's minimal boundary).
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookieStore.get(CARRY_COOKIE_NAME)?.options).toMatchObject({
      maxAge: 0,
    });
  });
});

describe("verifyMagicLinkAction", () => {
  const IDLE_LINK = { status: "idle" } as const;

  async function parkValidLink(tokenHash = "tok-hash"): Promise<void> {
    const envelope = await encodeLinkEnvelope(
      tokenHash,
      "email",
      Date.now(),
      "test-secret",
    );
    cookieStore.set(LINK_COOKIE_NAME, {
      name: LINK_COOKIE_NAME,
      value: envelope,
    });
  }

  it("verifies the carried token hash and redirects to the signed-in boundary", async () => {
    await parkValidLink();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({
        email: "you@example.com",
        intent: "wishlist",
        exp,
      }),
    });
    verifyOtp.mockResolvedValue({ data: {}, error: null });

    // Success redirects to the verified screen's approved signed-in
    // boundary — the same state the code path produces.
    await expect(verifyMagicLinkAction(IDLE_LINK)).rejects.toThrow(
      new RedirectSignal("/auth/verify"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "tok-hash",
      type: "email",
    });
    // One-shot carriage: the link cookie is deleted on the completed
    // attempt, and the 004c carry has served its purpose.
    expect(cookieStore.get(LINK_COOKIE_NAME)?.options).toMatchObject({
      maxAge: 0,
    });
    expect(cookieStore.get(CARRY_COOKIE_NAME)?.options).toMatchObject({
      maxAge: 0,
    });
    // Pin the resolved redirect value for the known `wishlist` intent so
    // the action's (currently value-only) binding cannot silently rot.
    expect(
      vi.mocked(resolveSafeRedirectTarget).mock.results.at(-1)?.value,
    ).toBe("/home");
  });

  it("resolves the intent destination as a value only through the safe table", async () => {
    // With an attacker-controlled intent string in the carry, resolution
    // still lands on a server-defined route (exercised via the successful
    // verification path — the value itself is 004e's navigation input and
    // is unit-tested in link-intents.test.ts).
    await parkValidLink();
    const exp = Math.floor(Date.now() / 1000) + 3600;
    cookieStore.set(CARRY_COOKIE_NAME, {
      name: CARRY_COOKIE_NAME,
      value: JSON.stringify({
        email: "you@example.com",
        intent: "//evil.example",
        exp,
      }),
    });
    verifyOtp.mockResolvedValue({ data: {}, error: null });

    await expect(verifyMagicLinkAction(IDLE_LINK)).rejects.toThrow(
      RedirectSignal,
    );
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    // The dead binding is protected: resolution still lands on a
    // server-defined route (`/home`) through the safe table (004e consumes
    // redirects only via resolveSafeRedirectTarget).
    expect(
      vi.mocked(resolveSafeRedirectTarget).mock.results.at(-1)?.value,
    ).toBe("/home");
  });

  it("treats a missing link cookie as the closed recovery, never verifying", async () => {
    const result = await verifyMagicLinkAction(IDLE_LINK);
    expect(result).toEqual({ status: "error", failure: "rejected-code" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("treats a forged or expired link cookie exactly like a missing one", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      Date.now() - 3601_000, // issued beyond the named carry window
      "test-secret",
    );
    cookieStore.set(LINK_COOKIE_NAME, {
      name: LINK_COOKIE_NAME,
      value: envelope,
    });
    const result = await verifyMagicLinkAction(IDLE_LINK);
    expect(result).toEqual({ status: "error", failure: "rejected-code" });
    expect(verifyOtp).not.toHaveBeenCalled();

    // A tampered payload under a valid-looking envelope is the same.
    cookieStore.set(LINK_COOKIE_NAME, {
      name: LINK_COOKIE_NAME,
      value: `${"not"}.${"a-signature"}`,
    });
    expect(await verifyMagicLinkAction(IDLE_LINK)).toEqual({
      status: "error",
      failure: "rejected-code",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("maps a refused (expired/reused) token into the closed generic set and still deletes the cookie", async () => {
    await parkValidLink();
    verifyOtp.mockResolvedValue({
      data: {},
      error: {
        status: 403,
        code: "otp_expired",
        message: "Token has expired or is invalid",
      },
    });

    const result = await verifyMagicLinkAction(IDLE_LINK);
    expect(result).toEqual({ status: "error", failure: "rejected-code" });
    expect(cookieStore.get(LINK_COOKIE_NAME)?.options).toMatchObject({
      maxAge: 0,
    });
  });

  it("maps an unavailable provider into the closed generic set", async () => {
    await parkValidLink();
    verifyOtp.mockResolvedValue({
      data: {},
      error: { status: 500, code: "boom", message: "detail" },
    });

    expect(await verifyMagicLinkAction(IDLE_LINK)).toEqual({
      status: "error",
      failure: "unavailable",
    });
  });

  it("creates no session on failure — the only session source is a successful verifyOtp", async () => {
    await parkValidLink();
    verifyOtp.mockResolvedValue({
      data: {},
      error: {
        status: 403,
        code: "otp_expired",
        message: "Token has expired or is invalid",
      },
    });
    await verifyMagicLinkAction(IDLE_LINK);
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
  });
});
