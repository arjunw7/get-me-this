import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
vi.mock("server-only", () => ({}));
const { createAmazonWorker } = await import("./amazon-worker-http");
const {
  productBrowserTarget,
  productResourceAllowed,
  sameProduct,
  createProductRequestPolicy,
} = await import("./product-browser-protocol");
const { fulfillProductResource, productResponseHeaders } =
  await import("../../../workers/amazon/product-route");
const secret = "test-only-secret-of-at-least-32-characters";
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function start() {
  const amazon = vi.fn(async () => ({ title: "Amazon" }));
  const generic = vi.fn(async () => ({ title: "Cup" }));
  const server = createAmazonWorker(secret, amazon, generic);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw Error();
  return {
    url: `http://127.0.0.1:${addr.port}/extract-product`,
    amazon,
    generic,
  };
}
function request(body: unknown, key = secret) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
describe("general product worker boundary", () => {
  it("preserves query-based product and variant identity while ignoring tracking", () => {
    expect(
      sameProduct(
        new URL("https://shop.example/p?id=A"),
        new URL("https://shop.example/p?id=B"),
      ),
    ).toBe(false);
    expect(
      sameProduct(
        new URL("https://shop.example/p?variant=1"),
        new URL("https://shop.example/p?variant=2"),
      ),
    ).toBe(false);
    expect(
      sameProduct(
        new URL("https://shop.example/p?id=A&utm_source=app"),
        new URL("https://shop.example/p?id=A"),
      ),
    ).toBe(true);
  });
  it("blocks unexpected document navigation, iframes and unsafe resource requests", () => {
    const target = new URL("https://shop.example/p");
    const policy = createProductRequestPolicy(target);
    policy.navigate(target);
    expect(policy.admit(target.href, "GET", "document", true)).toBe(true);
    expect(
      policy.admit("https://shop.example/other", "GET", "document", true),
    ).toBe(false);
    expect(policy.admit(target.href, "GET", "document", false)).toBe(false);
    expect(policy.admit("https://127.0.0.1/secret", "GET", "fetch", true)).toBe(
      false,
    );
    expect(
      policy.admit("https://cdn.example/a.js", "POST", "fetch", true),
    ).toBe(false);
    expect(
      policy.admit("https://cdn.example/a.js", "GET", "script", true),
    ).toBe(true);
    policy.navigate(target);
    policy.navigate(target);
    policy.navigate(target);
    expect(() => policy.navigate(target)).toThrow();
  });
  it("adds a separate restrictive CSP policy even if the retailer allows workers", () => {
    expect(
      productResponseHeaders({ "content-security-policy": "worker-src *" })[
        "content-security-policy"
      ],
    ).toBe(
      "worker-src *, worker-src 'none'; frame-src 'none'; object-src 'none'",
    );
  });

  it("requires authentication before admitting generic work", async () => {
    const { url, generic } = await start();
    expect(
      (await fetch(url, request({ url: "https://shop.example/a" }, "wrong")))
        .status,
    ).toBe(401);
    expect(generic).not.toHaveBeenCalled();
  });
  it.each([
    { url: "http://shop.example/a" },
    { url: "https://127.0.0.1/a" },
    { url: "https://user:secret@shop.example/a" },
    { url: "https://amazon.in/dp/B0DGTSRX3R" },
    { url: "https://shop.example/a", actions: [] },
    { url: "file:///etc/passwd" },
  ])("rejects unsafe or overpowered DTOs", async (body) => {
    const { url, generic } = await start();
    expect((await fetch(url, request(body))).status).toBe(422);
    expect(generic).not.toHaveBeenCalled();
  });
  it("admits only a narrow public HTTPS product URL", async () => {
    const { url, generic, amazon } = await start();
    expect(
      (await fetch(url, request({ url: "https://shop.example/a" }))).status,
    ).toBe(200);
    expect(generic.mock.calls.length).toBe(1);
    expect(amazon).not.toHaveBeenCalled();
  });
  it("caps input", async () => {
    const { url, generic } = await start();
    expect((await fetch(url, request({ url: "x".repeat(5000) }))).status).toBe(
      413,
    );
    expect(generic).not.toHaveBeenCalled();
  });
  it("checks product IDs and refuses homepage redirects", () => {
    expect(
      sameProduct(
        new URL("https://etsy.com/listing/123/cup"),
        new URL("https://www.etsy.com/listing/456/cup"),
      ),
    ).toBe(false);
    expect(
      sameProduct(
        new URL("https://shop.example/products/a"),
        new URL("https://shop.example/"),
      ),
    ).toBe(false);
    expect(productResourceAllowed("https://10.0.0.1/secret")).toBe(false);
    expect(() =>
      productBrowserTarget({ url: "https://shop.example:444/" }),
    ).toThrow();
  });
  it("inspects redirects before requesting any destination", async () => {
    const dispose = vi.fn(async () => {});
    const redirected = vi.fn();
    const fetch = vi.fn(async () => ({
      status: () => 302,
      headers: () => ({ location: "https://cdn.example/a" }),
      dispose,
    }));
    const abort = vi.fn(async () => {});
    const fulfill = vi.fn(async () => {});
    const route = {
      fetch,
      abort,
      fulfill,
      request: () => ({
        resourceType: () => "document",
        url: () => "https://shop.example/a",
      }),
    };
    await fulfillProductResource(route as never, redirected);
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ maxRedirects: 0, maxRetries: 0 }),
    );
    expect(redirected).toHaveBeenCalledWith("https://cdn.example/a");
    expect(fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, body: "" }),
    );
    expect(dispose).toHaveBeenCalled();
  });
  it("aborts unsafe redirect destinations before following", async () => {
    const redirected = vi.fn();
    const abort = vi.fn(async () => {});
    const route = {
      fetch: async () => ({
        status: () => 302,
        headers: () => ({ location: "http://127.0.0.1/secret" }),
        dispose: async () => {},
      }),
      abort,
      request: () => ({
        resourceType: () => "document",
        url: () => "https://shop.example/a",
      }),
    };
    await fulfillProductResource(route as never, redirected);
    expect(abort).toHaveBeenCalled();
    expect(redirected).not.toHaveBeenCalled();
  });
});
