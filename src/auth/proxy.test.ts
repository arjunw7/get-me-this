import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NextRequest } from "next/server";

import {
  AUTH_CONFIRM_PATH,
  AUTH_LINK_PATH,
  NO_REFERRER,
  NO_STORE,
} from "./proxy-policy";
import { LINK_COOKIE_NAME } from "./link-cookie";
import { config, proxy } from "../../proxy";

/**
 * The Next.js 16 proxy (004c/004d): its matcher covers the auth Server
 * Action requests (actions POST to the page's own URL — a matcher that
 * excluded page paths would silently exclude the auth actions), cookie-
 * setting and cookie-clearing responses are non-cacheable, /auth/confirm
 * strips its query with the required headers on the initial redirect
 * response, and a valid link GET parks the token hash in the signed link
 * cookie before the clean 302 to /auth/link (never verifying on GET).
 */

const APP_ORIGIN = "http://localhost:3100";
const TEST_SECRET = "proxy-test-secret";

beforeEach(() => {
  process.env.AUTH_LINK_COOKIE_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.AUTH_LINK_COOKIE_SECRET;
});

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
  it("parks a valid link GET in the signed cookie and redirects clean to /auth/link", async () => {
    const response = await proxy(
      requestFor(`${AUTH_CONFIRM_PATH}?token_hash=abc&type=email`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${APP_ORIGIN}${AUTH_LINK_PATH}`,
    );
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("referrer-policy")).toBe(NO_REFERRER);
    const cookie = response.cookies.get(LINK_COOKIE_NAME);
    expect(cookie).toBeDefined();
    // The approved carry-cookie pattern: HttpOnly, Secure, SameSite=Lax,
    // scoped to /auth, within the named carry window.
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/auth",
    });
    expect(cookie?.maxAge).toBeGreaterThan(0);
    // The parked value is a signed two-part envelope, never the raw query.
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(cookie?.value).not.toContain("abc");
  });

  it("rejects an invalid link query to the clean recovery route with no cookie", async () => {
    for (const query of [
      "type=email", // missing token_hash
      "token_hash=&type=email", // empty token_hash
      "token_hash=abc&type=magiclink", // outside the closed enum
      "token_hash=abc", // missing type
    ]) {
      const response = await proxy(requestFor(`${AUTH_CONFIRM_PATH}?${query}`));
      expect(response.status, query).toBe(302);
      expect(response.headers.get("location"), query).toBe(
        `${APP_ORIGIN}${AUTH_CONFIRM_PATH}`,
      );
      expect(
        response.cookies.get(LINK_COOKIE_NAME)?.value,
        query,
      ).toBeUndefined();
      expect(response.headers.get("cache-control"), query).toBe(NO_STORE);
      expect(response.headers.get("referrer-policy"), query).toBe(NO_REFERRER);
    }
  });

  it("fails safe to recovery when the link-carriage secret is unset", async () => {
    delete process.env.AUTH_LINK_COOKIE_SECRET;
    const response = await proxy(
      requestFor(`${AUTH_CONFIRM_PATH}?token_hash=abc&type=email`),
    );
    expect(response.headers.get("location")).toBe(
      `${APP_ORIGIN}${AUTH_CONFIRM_PATH}`,
    );
    expect(response.cookies.get(LINK_COOKIE_NAME)?.value).toBeUndefined();
  });

  it("keeps the interim /auth/confirm page itself non-cacheable and non-referring", async () => {
    const response = await proxy(requestFor(AUTH_CONFIRM_PATH));

    expect(response.headers.get("cache-control")).toBe(NO_STORE);
    expect(response.headers.get("referrer-policy")).toBe(NO_REFERRER);
  });

  it("keeps the /auth/link choice route non-cacheable and non-referring", async () => {
    const response = await proxy(requestFor(AUTH_LINK_PATH));

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

  it("keeps every response for a protected route path non-cacheable (005b)", async () => {
    // Wishlist content is per-user data: a cached document could leak one
    // user's items to another through a shared cache. The generalized
    // final-response policy pins no-store on protected-route documents even
    // in this configuration-less environment (the page-level gate, not the
    // proxy, is the redirect control here — but the response must still
    // never be cacheable).
    for (const pathname of [
      "/home",
      "/onboarding",
      "/wishlist",
      "/wishlist/items/new",
      "/wishlist/items/00000000-0000-4000-8000-000000000001/edit",
    ]) {
      const response = await proxy(requestFor(pathname));
      expect(response.headers.get("cache-control"), pathname).toBe(NO_STORE);
    }
  });

  it("passes requests through unchanged when the Supabase configuration is absent", async () => {
    // This test environment has no NEXT_PUBLIC_* values: the proxy must not
    // construct a client or throw — it degrades to a plain pass-through.
    const response = await proxy(requestFor("/auth/verify"));
    expect(response.status).toBe(200);
  });

  describe("protected routes (004e)", () => {
    // Point the proxy at a closed local port: getUser() fails fast with a
    // connection refusal, which is exactly the signed-out/no-provider
    // outcome the redirect must be built on.
    const UNREACHABLE_CONFIG = {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-key",
    };

    function withLocalConfig(run: () => Promise<void>): () => Promise<void> {
      return async () => {
        for (const [key, value] of Object.entries(UNREACHABLE_CONFIG)) {
          process.env[key] = value;
        }
        try {
          await run();
        } finally {
          delete process.env.NEXT_PUBLIC_SUPABASE_URL;
          delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        }
      };
    }

    it(
      "redirects an anonymous request for a protected route to /auth with no-store",
      withLocalConfig(async () => {
        for (const pathname of [
          "/home",
          "/onboarding",
          "/wishlist",
          "/wishlist/items/new",
          "/wishlist/items/00000000-0000-4000-8000-000000000001/edit",
        ]) {
          const response = await proxy(requestFor(pathname));
          expect(response.status, pathname).toBe(302);
          expect(response.headers.get("location"), pathname).toBe(
            `${APP_ORIGIN}/auth`,
          );
          expect(response.headers.get("cache-control"), pathname).toBe(
            NO_STORE,
          );
          expect(response.headers.get("referrer-policy"), pathname).toBe(
            NO_REFERRER,
          );
        }
      }),
    );

    it(
      "covers Server Actions on protected pages (they POST to the page's own URL)",
      withLocalConfig(async () => {
        for (const pathname of ["/home", "/wishlist", "/wishlist/items/new", "/wishlist/items/00000000-0000-4000-8000-000000000001/edit"]) {
          const response = await proxy(
            requestFor(pathname, {
              method: "POST",
              headers: { "next-action": "test-action-id" },
            }),
          );
          expect(response.status, pathname).toBe(302);
          expect(response.headers.get("location"), pathname).toBe(
            `${APP_ORIGIN}/auth`,
          );
        }
      }),
    );

    it(
      "keeps public routes public even when signed out",
      withLocalConfig(async () => {
        for (const pathname of ["/", "/auth", "/auth/verify", "/auth/link"]) {
          const response = await proxy(requestFor(pathname));
          expect(response.status, pathname).not.toBe(302);
        }
      }),
    );

    it("does not blanket-protect unknown /wishlist child paths (they render not-found, which carries no data)", async () => {
      const response = await proxy(requestFor("/wishlist/unknown"));
      expect(response.status).not.toBe(302);
    });
  });
});
