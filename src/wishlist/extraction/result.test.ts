import { describe, expect, it } from "vitest";

import { normalizePlainText, validateExtractionResult } from "./result";

describe("extraction result validation", () => {
  it("normalizes plain text and removes controls and bidi overrides", () => {
    expect(
      normalizePlainText(
        "  A\u202E <script>bad()</script> <b>nice</b>\n\t gift\u0000  ",
        200,
      ),
    ).toBe("A bad() nice gift");
  });

  it("bounds fields and exposes only the narrow result schema", () => {
    const result = validateExtractionResult({
      sourceUrl: "https://shop.example/item?q=1",
      title: "x".repeat(250),
      retailer: "Shop",
      candidateImageUrls: ["https://images.example/a.jpg"],
    });
    expect(Array.from(result.title ?? "")).toHaveLength(200);
    expect(result).toEqual({
      sourceUrl: "https://shop.example/item?q=1",
      title: "x".repeat(200),
      retailer: "Shop",
      candidateImageUrls: ["https://images.example/a.jpg"],
    });
  });

  it("requires money fields as a valid pair", () => {
    expect(() =>
      validateExtractionResult({
        sourceUrl: "https://shop.example/item",
        originalAmountMinor: "100",
        candidateImageUrls: [],
      }),
    ).toThrow();
  });

  it("rejects more than eight candidate URLs", () => {
    expect(() =>
      validateExtractionResult({
        sourceUrl: "https://shop.example/item",
        candidateImageUrls: Array.from(
          { length: 9 },
          (_, index) => `https://images.example/${index}.jpg`,
        ),
      }),
    ).toThrow();
  });
});
