import { describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import { AUTH_CONFIRM_PATH, NO_REFERRER, NO_STORE } from "./proxy-policy";
import { config, proxy } from "../../proxy";

/**
 * The Next.js 16 proxy (004c): its matcher covers the auth Server Action
 * requests (actions POST to the page's own URL — a matcher that excluded
 * page paths would silently exclude the auth actions), cookie-setting and
 * cookie-clearing responses are non-cacheable, and /auth/confirm strips
 * its query with the required headers on the initial redirect response.
 */

const APP_ORIGIN = "http://localhost:3100";

function requestFor(
  path: string,
  init?: { method?: string; headers?: Record<string, string> },
) {
  return new NextRequest(`${APP_ORIGIN}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.headers,
  });
}

describe("proxy matcher", () => {
  it("covers every auth route — including the paths Server Actions POST to", () => {
    const matcher = config.matcher[0];
    expect(typeof matcher).toBe("string");
    // Next applies matcher patterns as a FULL match against the pathname.
    const pattern = new RegExp(`^(?:${matcher as string})$`);
    // GET pages and Server Action POSTs share these pathnames.
    for (const pathname of ["/auth", "/auth/verify", AUTH_CONFIRM_PATH]) {
      expect(pattern.test(pathname), pathname).toBe(true);
    }
    // And the landing + design routes stay covered too.
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/onboarding")).toBe(true);
  });

  it("still excludes Next's static asset paths", () => {
    const pattern = new RegExp(`^(?:${config.matcher[0] as string})$`);
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/_next/image")).toBe(false);
  });
});

describe("proxy responses", () => {
  it("redirects /auth/confirm with a query to the clean URL, no-store and no-referrer, before any rendering", async () => {
    const response = await proxy(
      requestFor(`${AUTH_CONFIRM_PATH}?token_hash=abc&type=email`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${APP_ORIGIN}${AUTH_CONFIRM_PATH}`,
    );
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("referrer-policy")).toBe(NO_REFERRER);
  });

  it("keeps the interim /auth/confirm page itself non-cacheable and non-referring", async () => {
    const response = await proxy(requestFor(AUTH_CONFIRM_PATH));

    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("referrer-policy")).toBe(NO_REFERRER);
  });

  it("marks Server Action responses non-cacheable — they may set or clear session and carry cookies", async () => {
    const response = await proxy(
      requestFor("/auth", {
        method: "POST",
        headers: { "next-action": "test-action-id" },
      }),
    );

    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    // And a verify-screen action POST is covered by the same rule.
    const verifyResponse = await proxy(
      requestFor("/auth/verify", {
        method: "POST",
        headers: { "next-action": "test-action-id" },
      }),
    );
    expect(verifyResponse.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("leaves ordinary GET responses without a forced cache policy", async () => {
    const response = await proxy(requestFor("/"));
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it("passes requests through unchanged when the Supabase configuration is absent", async () => {
    // This test environment has no NEXT_PUBLIC_* values: the proxy must not
    // construct a client or throw — it degrades to a plain pass-through.
    const response = await proxy(requestFor("/auth/verify"));
    expect(response.status).toBe(200);
  });
});
