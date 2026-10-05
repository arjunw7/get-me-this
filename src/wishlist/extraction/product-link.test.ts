import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  fire: vi.fn(),
  browser: vi.fn(),
  amazon: vi.fn(),
}));
vi.mock("./firecrawl", () => ({ extractProductLink: mocks.fire }));
vi.mock("./product-browser", () => ({ extractBrowserProduct: mocks.browser }));
vi.mock("./amazon-browser", () => ({ extractAmazonProduct: mocks.amazon }));
const { extractProductLink } = await import("./product-link");
const { ExtractionError } = await import("./errors");
const source = "https://shop.example/products/a";
const result = {
  sourceUrl: source,
  title: "Product",
  candidateImageUrls: ["https://cdn.example/a.jpg"],
};
afterEach(() => vi.resetAllMocks());
describe("product provider routing", () => {
  it.each(["https://amazon.in/dp/B0DGTSRX3R", "https://amzn.in/d/08uwFjwv"])(
    "routes Amazon directly: %s",
    async (url) => {
      mocks.amazon.mockResolvedValue(result);
      expect(await extractProductLink(url)).toBe(result);
      expect(mocks.amazon).toHaveBeenCalledWith(url, {});
      expect(mocks.fire).not.toHaveBeenCalled();
      expect(mocks.browser).not.toHaveBeenCalled();
    },
  );
  it("keeps a usable Firecrawl proposal without spending browser capacity", async () => {
    mocks.fire.mockResolvedValue(result);
    expect(await extractProductLink(source)).toBe(result);
    expect(mocks.browser).not.toHaveBeenCalled();
  });
  it.each([
    "unavailable",
    "timeout",
    "extraction_failed",
    "too_large",
    "unsupported_content",
  ] as const)("falls back after provider %s", async (code) => {
    mocks.fire.mockRejectedValue(new ExtractionError(code));
    mocks.browser.mockResolvedValue(result);
    expect(await extractProductLink(source)).toBe(result);
    expect(mocks.browser).toHaveBeenCalledTimes(1);
  });
  it("falls back on incomplete metadata and preserves it if the browser also fails", async () => {
    const partial = { ...result, candidateImageUrls: [] };
    mocks.fire.mockResolvedValue(partial);
    mocks.browser.mockRejectedValue(new ExtractionError("unavailable"));
    expect(await extractProductLink(source)).toBe(partial);
  });
  it.each(["invalid_url", "blocked_url"] as const)(
    "does not retry an unsafe admission: %s",
    async (code) => {
      mocks.fire.mockRejectedValue(new ExtractionError(code));
      await expect(extractProductLink(source)).rejects.toMatchObject({ code });
      expect(mocks.browser).not.toHaveBeenCalled();
    },
  );
  it("does not start fallback after cancellation", async () => {
    const controller = new AbortController();
    mocks.fire.mockImplementation(async () => {
      controller.abort();
      throw new ExtractionError("timeout");
    });
    await expect(
      extractProductLink(source, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(mocks.browser).not.toHaveBeenCalled();
  });
  it("keeps a single overall deadline while reserving time for the browser", async () => {
    const now = Date.now(),
      deadline = now + 35000;
    mocks.fire.mockRejectedValue(new ExtractionError("timeout"));
    mocks.browser.mockResolvedValue(result);
    await extractProductLink(source, { deadline });
    expect(mocks.fire.mock.calls[0]![1].deadline).toBeLessThanOrEqual(
      now + 8100,
    );
    expect(mocks.browser.mock.calls[0]![1].deadline).toBe(deadline);
  });
  it("propagates final failure to the editable manual-entry boundary", async () => {
    mocks.fire.mockRejectedValue(new ExtractionError("unavailable"));
    mocks.browser.mockRejectedValue(new ExtractionError("extraction_failed"));
    await expect(extractProductLink(source)).rejects.toMatchObject({
      code: "extraction_failed",
    });
  });
});
