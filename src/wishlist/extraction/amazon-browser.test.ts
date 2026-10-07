// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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
  return {
    workerUrl: "https://browser.example/extract",
    workerSecret: "test-only-browser-secret-32-characters",
    fetch: vi.fn(async () => Response.json(value)),
    transport: {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    },
    limiter: new ExtractionLimiter({ processRate: 100 }),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Railway Amazon metadata API", () => {
  it("matches Amazon ASIN URLs and rejects deceptive retailers", () => {
    expect(isAmazonProductUrl(source)).toBe(true);
    expect(
      isAmazonProductUrl("https://amazon.in.attacker.example/dp/B0DGTSRX3R"),
    ).toBe(false);
  });
  it("uses a narrow authenticated request without a Firecrawl key or original query", async () => {
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
    expect(input.fetch).toHaveBeenCalledWith(
      input.workerUrl,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({ marketplace: "amazon.in", asin: "B0DGTSRX3R" }),
        headers: {
          authorization: `Bearer ${input.workerSecret}`,
          "content-type": "application/json",
        },
      }),
    );
  });
  it.each(["https://www.amazon.in/s?k=headphones"])(
    "never sends unsupported Amazon links to Firecrawl: %s",
    async (url) => {
      vi.stubEnv("FIRECRAWL_API_KEY", "test-only-key");
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const { extractProductLink } = await import("./product-link");
      await expect(extractProductLink(url)).rejects.toMatchObject({
        code: "unsupported_content",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...product, status: 503 },
    { ...product, blocked: true },
    { ...product, asin: "B09MTQ23X4" },
    { ...product, finalUrl: "https://www.amazon.in/dp/B09MTQ23X4" },
  ])("rejects wrong or blocked products", async (value) => {
    await expect(
      extractAmazonProduct(source, options(value)),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });
  it.each([
    { ...product, prices: [] },
    { ...product, prices: ["₹1699.00", "₹1700.00"] },
    { ...product, unavailable: true },
    { ...product, currency: "USD" },
  ])("keeps ambiguous money empty", async (value) => {
    expect(
      (await extractAmazonProduct(source, options(value))).originalAmountMinor,
    ).toBeUndefined();
  });
  it("rejects private DNS before disclosing a target", async () => {
    const input = options();
    input.transport.resolve = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "blocked_url",
    });
    expect(input.fetch).not.toHaveBeenCalled();
  });
  it("fails safely without worker configuration", async () => {
    vi.stubEnv("AMAZON_BROWSER_URL", "");
    vi.stubEnv("AMAZON_BROWSER_SECRET", "");
    await expect(extractAmazonProduct(source)).rejects.toMatchObject({
      code: "unavailable",
    });
  });
  it("passes cancellation to the worker request", async () => {
    const input = options();
    const controller = new AbortController();
    input.fetch.mockImplementation(async () => {
      controller.abort();
      throw new Error("cancelled");
    });
    await expect(
      extractAmazonProduct(source, { ...input, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
  it("does not retry worker capacity/auth errors", async () => {
    const input = options();
    input.fetch.mockImplementation(async () =>
      Response.json({ code: "unavailable" }, { status: 503 }),
    );
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(input.fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds decoded worker output", async () => {
    const input = options();
    input.fetch.mockImplementation(async () =>
      Response.json({ payload: "x".repeat(17000) }),
    );
    await expect(extractAmazonProduct(source, input)).rejects.toMatchObject({
      code: "too_large",
    });
  });
  it("rejects unsafe worker transport and embedded credentials", async () => {
    await expect(
      extractAmazonProduct(source, {
        ...options(),
        workerUrl: "http://browser.example/extract",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      extractAmazonProduct(source, {
        ...options(),
        workerUrl: "https://secret@browser.example/extract",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
describe("Amazon app short links", () => {
  it.each(["amzn.in", "amzn.to", "amzn.eu", "a.co"])(
    "resolves %s directly to the worker and preserves the pasted URL",
    async (host) => {
      const input = options();
      const short = `https://${host}/d/08uwFjwv`;
      const writes: Uint8Array[] = [];
      const destroy = vi.fn();
      const resolve = vi.fn(input.transport.resolve);
      let hops = 0;
      const dial = vi.fn(async () => ({
        remoteAddress: "93.184.216.34",
        write: (bytes: Uint8Array) => {
          writes.push(bytes);
        },
        destroy,
        async *[Symbol.asyncIterator]() {
          yield new TextEncoder().encode(
            hops++ === 0
              ? `HTTP/1.1 302 Found\r\nLocation: ${source}\r\n\r\n`
              : "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 2\r\n\r\nok",
          );
        },
      }));
      const { extractProductLink } = await import("./product-link");
      const result = await extractProductLink(short, {
        ...input,
        transport: { resolve, dial },
      });
      expect(result).toMatchObject({
        sourceUrl: short,
        title: product.title,
        retailer: "amazon.in",
      });
      expect(dial).toHaveBeenCalledTimes(2);
      expect(resolve).toHaveBeenCalledWith(
        "www.amazon.in",
        expect.any(AbortSignal),
      );
      expect(input.fetch).toHaveBeenCalledTimes(1);
      expect(input.fetch).toHaveBeenCalledWith(
        input.workerUrl,
        expect.objectContaining({
          body: JSON.stringify({
            marketplace: "amazon.in",
            asin: "B0DGTSRX3R",
          }),
        }),
      );
      expect(new TextDecoder().decode(writes[0])).not.toContain(
        input.workerSecret,
      );
      expect(destroy).toHaveBeenCalled();
    },
  );
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

describe("current Amazon price markup", () => {
  async function read(html: string) {
    document.body.innerHTML = html;
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
      return JSON.parse(output.mock.calls[0]![0] as string);
    } finally {
      output.mockRestore();
      document.body.innerHTML = "";
    }
  }
  const title = '<span id="productTitle">Blue headphones</span>';
  const currency =
    '<script type="application/json">{"currencyInfo":{"code":"INR"}}</script>';
  function module(price: string) {
    return `<div id="corePriceDisplay_desktop_feature_div" data-csa-c-asin="B0DGTSRX3R">${price}<span class="apex-basisprice-value"><span class="a-offscreen">₹139,998</span></span><span class="apex-priceperunit-value"><span class="a-offscreen">₹7,999,900</span></span></div>`;
  }
  it("reads a blank offscreen price from its currency symbol and whole amount", async () => {
    const data = await read(
      title +
        module(
          '<span class="apex-pricetopay-value"><span class="a-offscreen"> </span><span class="a-price-symbol">₹</span><span class="a-price-whole">79,999</span></span>',
        ) +
        currency,
    );
    expect(data).toMatchObject({
      asin: "B0DGTSRX3R",
      prices: ["₹79,999"],
      currency: "INR",
    });
    const { amazonProposal } = await import("./amazon-product");
    expect(amazonProposal(new URL(source), data)).toMatchObject({
      originalAmountMinor: "7999900",
      originalCurrency: "INR",
    });
  });
  it("uses the main product display price with paise instead of alternate seller prices", async () => {
    const legacy =
      '<div id="corePrice_feature_div"><span class="apex-pricetopay-value"><span class="a-offscreen">₹4,599.00</span></span></div>';
    const data = await read(
      title +
        legacy +
        module(
          '<span class="priceToPay"><span class="a-offscreen"> </span><span class="a-price-symbol">₹</span><span class="a-price-whole">4,556<span class="a-price-decimal">.</span></span><span class="a-price-fraction">81</span></span>',
        ) +
        module(
          '<span class="apex-pricetopay-value"><span class="a-offscreen">₹4,599.00</span></span>',
        ) +
        currency,
    );
    expect(data.prices).toEqual(["₹4,556.81"]);
    const { amazonProposal } = await import("./amazon-product");
    expect(amazonProposal(new URL(source), data).originalAmountMinor).toBe(
      "455681",
    );
  });
  it("does not turn an incomplete fractional amount into a guessed whole price", async () => {
    const data = await read(
      title +
        module(
          '<span class="priceToPay"><span class="a-offscreen"></span><span class="a-price-symbol">₹</span><span class="a-price-whole">4,556.</span><span class="a-price-fraction">8</span></span>',
        ) +
        currency,
    );
    expect(data.prices).toEqual([]);
  });
  it("rejects conflicting product identities rather than trusting the URL", async () => {
    const data = await read(
      title +
        '<input id="ASIN" value="B000000000">' +
        module(
          '<span class="priceToPay"><span class="a-offscreen">₹999.00</span></span>',
        ) +
        currency,
    );
    const { amazonProposal } = await import("./amazon-product");
    expect(() => amazonProposal(new URL(source), data)).toThrow();
  });
});
