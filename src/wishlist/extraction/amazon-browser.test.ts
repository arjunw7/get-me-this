// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { extractAmazonProduct, isAmazonProductUrl, amazonBrowserCode } =
  await import("./amazon-browser");
const source = "https://www.amazon.in/dp/B0DGTSRX3R";
const session = "11111111-1111-4111-8111-111111111111";
const product = {
  status: 200,
  finalUrl: source,
  asin: "B0DGTSRX3R",
  title: "Blue headphones",
  image: "https://m.media-amazon.com/images/product.jpg",
  prices: ["₹1,699.00"],
  currency: "INR",
  unavailable: false,
  blocked: false,
};
function options(value: unknown = product) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url).endsWith("/execute"))
      return Response.json({
        success: true,
        exitCode: 0,
        stdout: JSON.stringify(value),
      });
    if (String(url).endsWith(session)) return Response.json({ success: true });
    return Response.json({ success: true, id: session });
  });
  return {
    apiKey: "test-only-key",
    fetch,
    transport: {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    },
    admit: () => true,
  };
}
afterEach(() => vi.unstubAllEnvs());
describe("Amazon managed browser", () => {
  it("dispatches only recognized Amazon product URLs", () => {
    expect(isAmazonProductUrl(source)).toBe(true);
    expect(isAmazonProductUrl("https://www.amazon.com/dp/B0DGTSRX3R")).toBe(
      true,
    );
    expect(
      isAmazonProductUrl("https://amazon.in.attacker.example/dp/B0DGTSRX3R"),
    ).toBe(false);
    expect(isAmazonProductUrl("https://www.amazon.in/s?k=headphones")).toBe(
      false,
    );
  });
  it("returns exact current money and stops its disposable session", async () => {
    const input = options();
    expect(await extractAmazonProduct(source, input)).toEqual({
      sourceUrl: source,
      title: "Blue headphones",
      retailer: "amazon.in",
      originalAmountMinor: "169900",
      originalCurrency: "INR",
      candidateImageUrls: [product.image],
    });
    expect(input.fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.firecrawl.dev/v2/interact",
      `https://api.firecrawl.dev/v2/interact/${session}/execute`,
      `https://api.firecrawl.dev/v2/interact/${session}`,
    ]);
    expect(JSON.parse(input.fetch.mock.calls[0]![1]!.body as string)).toEqual({
      ttl: 30,
      activityTtl: 10,
      streamWebView: false,
    });
    expect(input.fetch.mock.calls[2]![1]!.method).toBe("DELETE");
  });
  it.each([
    { ...product, status: 503 },
    { ...product, blocked: true },
    { ...product, asin: "B09MTQ23X4" },
    { ...product, finalUrl: "https://www.amazon.in/dp/B09MTQ23X4" },
    { ...product, title: "" },
  ])(
    "rejects blocked or different products and still closes the session",
    async (value) => {
      const input = options(value);
      await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
        code: "extraction_failed",
      });
      expect(input.fetch.mock.calls.at(-1)![1]!.method).toBe("DELETE");
    },
  );
  it.each([
    { ...product, unavailable: true },
    { ...product, prices: [] },
    { ...product, prices: ["₹1,699.00", "₹2,000.00"] },
    { ...product, currency: "USD" },
  ])("omits uncertain money", async (value) => {
    expect(
      (await extractAmazonProduct(source, options(value))).originalAmountMinor,
    ).toBeUndefined();
  });
  it("rejects private DNS before creating a browser", async () => {
    const input = options();
    input.transport.resolve = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "blocked_url",
    });
    expect(input.fetch).not.toHaveBeenCalled();
  });
  it("avoids requests when the browser start budget is exhausted", async () => {
    const input = { ...options(), admit: () => false };
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(input.fetch).not.toHaveBeenCalled();
  });
  it("does not retry a provider payment error", async () => {
    const input = options();
    input.fetch.mockImplementation(async () =>
      Response.json({ error: "secret vendor message" }, { status: 402 }),
    );
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(input.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Amazon DOM reader", () => {
  it("reads the product buy price, skips blank nodes and ignores MRP and recommendations", async () => {
    document.body.innerHTML = `<span id="productTitle">Blue headphones</span><input id="ASIN" value="B0DGTSRX3R"><img id="landingImage" src="https://m.media-amazon.com/images/product.jpg"><div id="corePrice_feature_div"><span class="apex-pricetopay-value"><span class="a-offscreen">₹1,699.00</span></span><span class="apex-basisprice-value"><span class="a-offscreen">₹3,790.00</span></span></div><div id="corePriceDisplay_desktop_feature_div"><span class="apex-pricetopay-value"><span class="a-offscreen"> </span></span></div><div class="a-price"><span class="a-offscreen">₹999.00</span></div><script type="application/json">{"currencyInfo":{"code":"INR"}}</script>`;
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const page = {
        setViewportSize: async () => {},
        setExtraHTTPHeaders: async () => {},
        goto: async () => ({ status: () => 200 }),
        waitForTimeout: async () => {},
        evaluate: async (fn: () => unknown) => fn(),
        url: () => source,
      };
      await new Function(
        "page",
        `return (async()=>{${amazonBrowserCode(source)}})()`,
      )(page);
      const parsed = JSON.parse(output.mock.calls[0]![0] as string);
      expect(parsed).toMatchObject({
        asin: "B0DGTSRX3R",
        prices: ["₹1,699.00"],
        currency: "INR",
        blocked: false,
      });
    } finally {
      output.mockRestore();
      document.body.innerHTML = "";
    }
  });
});

describe("Amazon browser lifecycle", () => {
  it("closes an allocated session when execution is cancelled", async () => {
    const input = options();
    const controller = new AbortController();
    input.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/execute")) {
        controller.abort();
        throw new Error("cancelled");
      }
      if (init?.method === "DELETE") {
        expect(init.signal?.aborted).toBe(false);
        return Response.json({ success: true });
      }
      return Response.json({ success: true, id: session });
    });
    await expect(
      extractAmazonProduct(source, { ...input, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(input.fetch.mock.calls.at(-1)![1]!.method).toBe("DELETE");
  });
  it("never turns a provider-controlled session ID into an arbitrary endpoint", async () => {
    const input = options();
    input.fetch.mockResolvedValue(
      Response.json({ success: true, id: "../../outside?token=secret" }),
    );
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "extraction_failed",
    });
    expect(input.fetch).toHaveBeenCalledTimes(1);
  });
});
