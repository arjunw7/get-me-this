import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { extractProductLink } = await import("./firecrawl");
const source = "https://shop.example/products/cup?variant=blue";
const product = {
  title: "<b>Blue cup</b>",
  url: source,
  variants: [
    {
      id: "blue",
      price: { amount: 1299.5, currency: "INR", formatted: "₹1,299.50" },
      images: [{ url: "https://cdn.example/cup.jpg", alt: "Cup" }],
      sale: { originalPrice: { amount: 1500, currency: "INR" } },
    },
  ],
};
function fixture(value: unknown = product, statusCode = 200) {
  return {
    success: true,
    data: {
      product: value,
      metadata: { statusCode, sourceURL: source },
      markdown: "Price ₹1,299.50\nMRP ₹1,500",
    },
  };
}
const transport = {
  resolve: async () => [{ address: "93.184.216.34", family: 4 }],
};
function options(body: unknown = fixture()) {
  return {
    apiKey: "test-only-key",
    transport,
    fetch: vi.fn<typeof fetch>(async () => Response.json(body)),
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Firecrawl product import", () => {
  it("returns editable product fields and current exact money instead of list price", async () => {
    const input = options();
    expect(await extractProductLink(source, input)).toEqual({
      sourceUrl: source,
      title: "Blue cup",
      retailer: "shop.example",
      originalAmountMinor: "129950",
      originalCurrency: "INR",
      candidateImageUrls: ["https://cdn.example/cup.jpg"],
    });
    const [endpoint, init] = input.fetch.mock.calls[0]!;
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      url: source,
      formats: ["product", "markdown"],
      skipTlsVerification: false,
      proxy: "auto",
      location: { country: "IN" },
    });
  });
  it("rejects a retailer redirect that changes an explicit product ID", async () => {
    await expect(
      extractProductLink(
        "https://www.nykaa.com/cetaphil/p/392483",
        options(
          fixture({
            ...product,
            url: "https://www.nykaa.com/cetaphil/p/392484?skuId=20990",
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });
  it("rejects a currency conflict in the rendered page evidence", async () => {
    const body = fixture({
      ...product,
      variants: [{ price: { amount: 850, currency: "USD" }, images: [] }],
    });
    body.data.markdown = "# Nico Mug\nMRP ₹850";
    const result = await extractProductLink(source, options(body));
    expect(result.title).toBe("Blue cup");
    expect(result.originalAmountMinor).toBeUndefined();
    expect(result.originalCurrency).toBeUndefined();
  });
  it.each([
    "MRP: ₹1,299.50\nSale price ₹999",
    "Price ₹999\n~~₹1,299.50~~",
    "Original price INR 1299.50\nCurrent price INR 999",
    "INR 1299.50 (MRP)\nINR 999 Sale price",
    "M.R.P.:\nINR ₹1,299.50\nPrice ₹999",
  ])(
    "does not confirm native money using only list-price evidence: %s",
    async (markdown) => {
      const body = fixture();
      body.data.markdown = markdown;
      const result = await extractProductLink(source, options(body));
      expect(result.title).toBe("Blue cup");
      expect(result.candidateImageUrls).toEqual([
        "https://cdn.example/cup.jpg",
      ]);
      expect(result.originalAmountMinor).toBeUndefined();
      expect(result.originalCurrency).toBeUndefined();
    },
  );
  it("omits a price without matching visible currency and amount evidence", async () => {
    const body = fixture();
    body.data.markdown = "# Blue cup\nSubscribe for offers";
    const result = await extractProductLink(source, options(body));
    expect(result.originalAmountMinor).toBeUndefined();
  });
  it("recovers a missing product image only when its alt text names the product", async () => {
    const body = fixture({
      ...product,
      variants: [{ price: product.variants[0].price, images: [] }],
    });
    body.data.markdown =
      "# Blue cup\nMRP ₹1,299.50\n![Blue cup](https://cdn.example/cup.jpg)\n![Recommended vase](https://cdn.example/vase.jpg)";
    expect(
      (await extractProductLink(source, options(body))).candidateImageUrls,
    ).toEqual(["https://cdn.example/cup.jpg"]);
  });
  it("omits price when multiple variants could refer to different choices", async () => {
    const result = await extractProductLink(
      source,
      options(
        fixture({
          ...product,
          variants: [
            product.variants[0],
            {
              id: "red",
              price: { amount: 1400, currency: "INR" },
              images: [{ url: "https://cdn.example/red.jpg" }],
            },
          ],
        }),
      ),
    );
    expect(result.originalAmountMinor).toBeUndefined();
    expect(result.originalCurrency).toBeUndefined();
    expect(result.title).toBe("Blue cup");
  });
  it.each([
    { amount: 2.555, currency: "INR" },
    { amount: -1, currency: "USD" },
    { amount: 9999999999999999, currency: "INR" },
    { amount: 12, currency: "₹" },
  ])("does not fabricate unsupported or imprecise money %j", async (price) => {
    const result = await extractProductLink(
      source,
      options(fixture({ ...product, variants: [{ price, images: [] }] })),
    );
    expect(result.originalAmountMinor).toBeUndefined();
    expect(result.originalCurrency).toBeUndefined();
  });
  it("filters unsafe images, deduplicates and caps candidates", async () => {
    const images = [
      "http://127.0.0.1/private",
      "javascript:alert(1)",
      "https://cdn.example/cup.jpg",
      "https://cdn.example/cup.jpg",
      ...Array.from({ length: 12 }, (_, i) => `https://cdn.example/${i}.jpg`),
    ];
    const result = await extractProductLink(
      source,
      options(
        fixture({
          ...product,
          variants: [{ images: images.map((url) => ({ url })) }],
        }),
      ),
    );
    expect(result.candidateImageUrls).toHaveLength(8);
    expect(result.candidateImageUrls[0]).toBe("https://cdn.example/cup.jpg");
    expect(new Set(result.candidateImageUrls).size).toBe(8);
  });
  it.each([
    fixture(null),
    fixture(product, 403),
    { success: false, error: "private remote message" },
    { success: true, data: { product: {} } },
  ])("fails safely on an unavailable or non-product page", async (body) => {
    await expect(
      extractProductLink(source, options(body)),
    ).rejects.toMatchObject({ code: "extraction_failed" });
  });
  it("rejects private DNS before sending the URL to the provider", async () => {
    const input = options();
    await expect(
      extractProductLink(source, {
        ...input,
        transport: {
          resolve: async () => [{ address: "10.0.0.1", family: 4 }],
        },
      }),
    ).rejects.toMatchObject({ code: "blocked_url" });
    expect(input.fetch).not.toHaveBeenCalled();
  });
  it("makes no provider request without server configuration", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const input = options();
    await expect(
      extractProductLink(source, { ...input, apiKey: undefined }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(input.fetch).not.toHaveBeenCalled();
  });
  it.each([401, 402, 429, 500])(
    "does not retry or expose provider errors (%i)",
    async (status) => {
      const input = options();
      input.fetch.mockResolvedValue(
        new Response("test-only-key private remote message", { status }),
      );
      await expect(extractProductLink(source, input)).rejects.toMatchObject({
        code: "unavailable",
        message: "That page is not available right now.",
      });
      expect(input.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("bounds provider response bytes", async () => {
    const input = options();
    input.fetch.mockResolvedValue(
      new Response("x".repeat(256 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(extractProductLink(source, input)).rejects.toMatchObject({
      code: "too_large",
    });
  });
  it("aborts a stalled provider at its deadline", async () => {
    vi.useFakeTimers();
    try {
      const input = options();
      input.fetch.mockImplementation(
        async (_url, init) =>
          await new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("private transport detail")),
              { once: true },
            );
          }),
      );
      const pending = expect(
        extractProductLink(source, { ...input, deadline: Date.now() + 100 }),
      ).rejects.toMatchObject({ code: "timeout" });
      await Promise.all([pending, vi.advanceTimersByTimeAsync(101)]);
    } finally {
      vi.useRealTimers();
    }
  });
});
