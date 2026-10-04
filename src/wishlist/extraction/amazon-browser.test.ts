// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { ExtractionLimiter } from "./limiter";
vi.mock("server-only", () => ({}));
const { extractAmazonProduct, isAmazonProductUrl, amazonBrowserCode } =
  await import("./amazon-browser");
const source = "https://www.amazon.in/dp/B0DGTSRX3R?tag=original";
const product = {
  status: 200,
  finalUrl: "https://www.amazon.in/dp/B0DGTSRX3R?th=1",
  asin: "B0DGTSRX3R",
  title: "Blue headphones",
  image: "https://m.media-amazon.com/images/product.jpg",
  prices: ["₹1,699.00"],
  currency: "INR",
  unavailable: false,
  blocked: false,
};
function options(value: typeof product = product) {
  const close = vi.fn(async () => {});
  const page = {
    setViewportSize: async () => {},
    setExtraHTTPHeaders: async () => {},
    goto: vi.fn(async (url: string, options?: unknown) => {
      void url;
      void options;
      return { status: () => value.status };
    }),
    waitForTimeout: async () => {},
    evaluate: async () => value,
    url: () => value.finalUrl,
  };
  const context = {
    route: vi.fn(async () => {}),
    routeWebSocket: vi.fn(async () => {}),
    newPage: async () => page,
  };
  const browser = { newContext: vi.fn(async () => context), close };
  const connect = vi.fn(async () => browser as unknown as Browser);
  return {
    workerUrl: "ws://127.0.0.1:3105/session",
    workerSecret: "test-only-browser-secret-32-characters",
    connect,
    transport: {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    },
    limiter: new ExtractionLimiter({ processRate: 100 }),
    browser,
    context,
    page,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Independent Amazon Playwright", () => {
  it("matches Amazon ASIN URLs and rejects deceptive retailers", () => {
    expect(isAmazonProductUrl(source)).toBe(true);
    expect(
      isAmazonProductUrl("https://amazon.in.attacker.example/dp/B0DGTSRX3R"),
    ).toBe(false);
  });
  it("does not send unsupported Amazon paths to Firecrawl", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "test-only-provider-key");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { extractProductLink } = await import("./product-link");
    await expect(
      extractProductLink("https://www.amazon.in/s?k=headphones"),
    ).rejects.toMatchObject({ code: "unsupported_content" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves the receiver when using the production Playwright connector", async () => {
    const input = options();
    vi.stubEnv("AMAZON_BROWSER_WS_URL", input.workerUrl);
    vi.stubEnv("AMAZON_BROWSER_SECRET", input.workerSecret);
    const spy = vi
      .spyOn(chromium, "connect")
      .mockImplementation(async function (this: unknown) {
        expect(this).toBe(chromium);
        return input.browser as unknown as Browser;
      });
    await expect(
      extractAmazonProduct(source, {
        transport: input.transport,
        limiter: input.limiter,
      }),
    ).resolves.toMatchObject({ title: "Blue headphones" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("uses the independent worker without a Firecrawl key and navigates a canonical URL", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const input = options();
    expect(await extractAmazonProduct(source, input)).toEqual({
      sourceUrl: source,
      title: "Blue headphones",
      retailer: "amazon.in",
      originalAmountMinor: "169900",
      originalCurrency: "INR",
      candidateImageUrls: [product.image],
    });
    expect(input.page.goto.mock.calls[0]![0]).toBe(
      "https://www.amazon.in/dp/B0DGTSRX3R?th=1&psc=1",
    );
    expect(input.browser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceWorkers: "block",
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
      }),
    );
    expect(input.browser.close).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...product, status: 503 },
    { ...product, blocked: true },
    { ...product, asin: "B09MTQ23X4" },
    { ...product, finalUrl: "https://www.amazon.in/dp/B09MTQ23X4" },
    { ...product, title: "" },
  ])(
    "rejects blocked or mismatched products and closes the browser",
    async (value) => {
      const input = options(value);
      await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
        code: "extraction_failed",
      });
      expect(input.browser.close).toHaveBeenCalled();
    },
  );
  it.each([
    { ...product, unavailable: true },
    { ...product, prices: [] },
    { ...product, prices: ["₹1,699.00", "₹2,000.00"] },
    { ...product, currency: "USD" },
  ])("leaves ambiguous money empty", async (value) => {
    expect(
      (await extractAmazonProduct(source, options(value))).originalAmountMinor,
    ).toBeUndefined();
  });
  it("blocks private DNS before connecting a browser", async () => {
    const input = options();
    input.transport.resolve = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "blocked_url",
    });
    expect(input.connect).not.toHaveBeenCalled();
  });
  it("fails into manual entry with an unconfigured worker and never calls Firecrawl", async () => {
    vi.stubEnv("AMAZON_BROWSER_WS_URL", "");
    vi.stubEnv("AMAZON_BROWSER_SECRET", "");
    const vendor = vi.fn();
    vi.stubGlobal("fetch", vendor);
    await expect(extractAmazonProduct(source)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(vendor).not.toHaveBeenCalled();
  });
  it("closes the remote browser on cancellation", async () => {
    const input = options();
    const controller = new AbortController();
    input.page.goto.mockImplementation(async () => {
      controller.abort();
      throw new Error("cancelled");
    });
    await expect(
      extractAmazonProduct(source, { ...input, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(input.browser.close).toHaveBeenCalled();
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
