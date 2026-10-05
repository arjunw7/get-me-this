import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { extractBrowserProduct } = await import("./product-browser");
const { extractProductLink } = await import("./product-link");
const source = "https://shop.example/products/a";
const product = {
  status: 200,
  finalUrl: source,
  title: "Blue cup",
  images: ["/cup.jpg"],
  blocked: false,
  body: "Current price INR 123.45",
  price: "123.45",
  currency: "INR",
};
function options() {
  return {
    apiKey: "",
    browserWorkerUrl: "https://browser.example/extract",
    browserWorkerSecret: "test-only-browser-secret-32-characters",
    fetch: vi.fn<typeof fetch>(async () => Response.json(product)),
    transport: {
      resolve: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    },
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("independent product browser client", () => {
  it("uses the worker when Firecrawl is unconfigured", async () => {
    const input = options();
    expect(await extractProductLink(source, input)).toMatchObject({
      sourceUrl: source,
      title: product.title,
      originalAmountMinor: "12345",
      originalCurrency: "INR",
      candidateImageUrls: ["https://shop.example/cup.jpg"],
    });
    expect(input.fetch).toHaveBeenCalledTimes(1);
    expect(input.fetch).toHaveBeenCalledWith(
      "https://browser.example/extract-product",
      expect.objectContaining({
        redirect: "error",
        body: JSON.stringify({ url: source }),
      }),
    );
  });
  it("falls back after exhausted Firecrawl credits", async () => {
    const input = options();
    input.apiKey = "test-only-firecrawl";
    input.fetch.mockResolvedValueOnce(
      Response.json({ error: "credits exhausted" }, { status: 402 }),
    );
    expect((await extractProductLink(source, input)).title).toBe(product.title);
    expect(input.fetch).toHaveBeenCalledTimes(2);
  });
  it("upgrades HTTP acquisition while retaining the pasted URL", async () => {
    const input = options();
    expect(
      (await extractBrowserProduct(source.replace("https:", "http:"), input))
        .sourceUrl,
    ).toBe(source.replace("https:", "http:"));
    expect(input.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ url: source }) }),
    );
  });
  it.each([
    { ...product, status: 403 },
    { ...product, blocked: true },
    { ...product, finalUrl: "https://shop.example/" },
    { ...product, canonical: "https://other.example/products/a" },
    { ...product, title: "" },
  ])("rejects blocked, wrong or empty products", async (value) => {
    const input = options();
    input.fetch.mockResolvedValue(Response.json(value));
    await expect(extractBrowserProduct(source, input)).rejects.toMatchObject({
      code: "extraction_failed",
    });
  });
  it.each([
    { ...product, currency: null },
    { ...product, body: "MRP INR 123.45" },
    { ...product, body: "USD 123.45" },
    { ...product, price: "123.456" },
  ])("keeps unsupported or unconfirmed money editable", async (value) => {
    const input = options();
    input.fetch.mockResolvedValue(Response.json(value));
    expect(
      (await extractBrowserProduct(source, input)).originalAmountMinor,
    ).toBeUndefined();
  });
  it("discards wrong structured data while retaining matching page title/image", async () => {
    const input = options();
    input.fetch.mockResolvedValue(
      Response.json({
        ...product,
        productUrl: "https://shop.example/products/wrong",
        pageTitle: "Page cup",
        pageImage: "https://shop.example/page-cup.jpg",
      }),
    );
    const result = await extractBrowserProduct(source, input);
    expect(result).toMatchObject({
      title: "Page cup",
      candidateImageUrls: ["https://shop.example/page-cup.jpg"],
    });
    expect(result.originalAmountMinor).toBeUndefined();
  });
  it("blocks private DNS before sending the URL", async () => {
    const input = options();
    input.transport.resolve.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(extractBrowserProduct(source, input)).rejects.toMatchObject({
      code: "blocked_url",
    });
    expect(input.fetch).not.toHaveBeenCalled();
  });
  it("caps worker output", async () => {
    const input = options();
    input.fetch.mockResolvedValue(Response.json({ body: "x".repeat(17000) }));
    await expect(extractBrowserProduct(source, input)).rejects.toMatchObject({
      code: "too_large",
    });
  });
  it("refuses an unsafe worker endpoint", async () => {
    await expect(
      extractBrowserProduct(source, {
        ...options(),
        browserWorkerUrl: "https://secret@worker.example/extract",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
