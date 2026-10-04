import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { canonicalHostRedirect } from "./canonical-redirect";
import { config, proxy } from "../../proxy";

function requestFor(
  host: string,
  path: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host, ...headers },
  });
}

describe("canonical production host redirect", () => {
  it.each([
    "/",
    "/auth?intent=wishlist",
    "/auth/confirm?token_hash=fixture-only&type=email",
    "/invite/fixture-invite?from=whatsapp",
    "/s/fixture-share?from=friend&from=whatsapp",
    "/wishlist/items/new?url=https%3A%2F%2Fexample.com%2Fitem%3Fx%3D1%26y%3D2",
    "/favicon.ico",
    "/_next/static/fixture.js",
  ])(
    "permanently redirects %s and preserves its path and query",
    async (path) => {
      const response = await proxy(requestFor("www.getmethis.fun", path));
      expect(
        unstable_doesMiddlewareMatch({
          config,
          url: `https://www.getmethis.fun${path}`,
          headers: { host: "www.getmethis.fun" },
        }),
      ).toBe(true);
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://getmethis.fun${path}`,
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.has("set-cookie")).toBe(false);
    },
  );

  it.each([
    "getmethis.fun",
    "localhost:3100",
    "staging.getmethis.fun",
    "preview.up.railway.app",
    "www.getmethis.fun.evil.example",
    "wwwXgetmethisYfun",
  ])("does not redirect %s to the production host", async (host) => {
    expect(
      canonicalHostRedirect(requestFor(host, "/auth?intent=wishlist")),
    ).toBeNull();
  });

  it("ignores a forwarded host claiming to be www", async () => {
    expect(
      canonicalHostRedirect(
        requestFor("preview.up.railway.app", "/auth", {
          "x-forwarded-host": "www.getmethis.fun",
        }),
      ),
    ).toBeNull();
  });
});
