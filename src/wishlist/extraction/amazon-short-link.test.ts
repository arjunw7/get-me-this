import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { resolveAmazonShortLink } = await import("./amazon-short-link");
const { isAmazonUrl } = await import("./amazon-product");
type Dependencies = import("./transport").TransportDependencies;
const source = new URL("https://amzn.in/d/08uwFjwv");
const target = "https://www.amazon.in/dp/B0DGTSRX3R";
const publicDns = [{ address: "93.184.216.34", family: 4 }];
function fixture(
  locations: string[],
  answers = publicDns,
  peer = "93.184.216.34",
) {
  let index = 0;
  const destroy = vi.fn();
  const resolve = vi.fn(async () => answers);
  const dial = vi.fn(async () => ({
    remoteAddress: peer,
    write: vi.fn(),
    destroy,
    async *[Symbol.asyncIterator]() {
      const location = locations[index++];
      yield new TextEncoder().encode(
        location
          ? `HTTP/1.1 302 Found\r\nLocation: ${location}\r\n\r\n`
          : "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 2\r\n\r\nok",
      );
    },
  }));
  return { resolve, dial, destroy };
}
function run(
  dependencies: Dependencies,
  signal = new AbortController().signal,
  url = source,
) {
  return resolveAmazonShortLink(url, dependencies, {
    signal,
    deadline: Date.now() + 8000,
  });
}
describe("guarded Amazon short links", () => {
  it("follows a chain with relative redirects and validates each hop", async () => {
    const deps = fixture(["/next", "https://amzn.to/example", target]);
    expect((await run(deps)).href).toBe(target);
    expect(deps.resolve).toHaveBeenCalledTimes(4);
    expect(deps.destroy).toHaveBeenCalledTimes(4);
  });
  it.each([
    "https://attacker.example/path",
    "https://amazon.in.attacker.example/dp/B0DGTSRX3R",
    "http://www.amazon.in/dp/B0DGTSRX3R",
    "https://user:pass@amazon.in/dp/B0DGTSRX3R",
  ])(
    "blocks foreign, downgraded or credential-bearing redirects: %s",
    async (location) => {
      const deps = fixture([location]);
      await expect(run(deps)).rejects.toBeDefined();
      expect(deps.dial).toHaveBeenCalledTimes(1);
      expect(deps.resolve).toHaveBeenCalledTimes(1);
      expect(deps.destroy).toHaveBeenCalled();
    },
  );
  it.each([
    "amzn.in.attacker.example",
    "www.amzn.in",
    "notamazon.in",
    "amazon.in.attacker.example",
  ])("does not classify deceptive hosts as Amazon: %s", (host) => {
    expect(isAmazonUrl(`https://${host}/d/example`)).toBe(false);
  });
  it("blocks mixed or private DNS on the final product hop", async () => {
    const deps = fixture([target]);
    deps.resolve
      .mockResolvedValueOnce(publicDns)
      .mockResolvedValueOnce([
        ...publicDns,
        { address: "127.0.0.1", family: 4 },
      ]);
    await expect(run(deps)).rejects.toMatchObject({ code: "blocked_url" });
    expect(deps.dial).toHaveBeenCalledTimes(1);
  });
  it("blocks private DNS at the short host", async () => {
    const deps = fixture([target], [{ address: "10.0.0.1", family: 4 }]);
    await expect(run(deps)).rejects.toMatchObject({ code: "blocked_url" });
    expect(deps.dial).not.toHaveBeenCalled();
  });
  it("rejects a mismatched socket peer", async () => {
    const deps = fixture([target], publicDns, "8.8.8.8");
    await expect(run(deps)).rejects.toMatchObject({ code: "blocked_url" });
    expect(deps.destroy).toHaveBeenCalled();
  });
  it("bounds redirect loops", async () => {
    const deps = fixture(Array(5).fill(source.href));
    await expect(run(deps)).rejects.toMatchObject({ code: "unavailable" });
    expect(deps.dial).toHaveBeenCalledTimes(4);
  });
  it("rejects an interstitial without a product ASIN", async () => {
    await expect(run(fixture([]))).rejects.toMatchObject({
      code: "unsupported_content",
    });
  });
  it("rejects cancellation before network access", async () => {
    const controller = new AbortController();
    controller.abort();
    const deps = fixture([target]);
    await expect(run(deps, controller.signal)).rejects.toMatchObject({
      code: "timeout",
    });
    expect(deps.dial).not.toHaveBeenCalled();
  });
  it("rejects insecure short URLs", async () => {
    const deps = fixture([target]);
    await expect(
      run(deps, undefined, new URL("http://amzn.in/d/example")),
    ).rejects.toMatchObject({ code: "blocked_url" });
    expect(deps.resolve).not.toHaveBeenCalled();
  });
});
