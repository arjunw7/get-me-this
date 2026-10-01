import { describe, expect, it } from "vitest";

import { isAdmissionDenied, parseExtractResponse } from "./extract-response";

/**
 * The client-side response envelope contract (005f): only a bounded
 * `{ result }` success or a typed `{ error }` failure is accepted; a
 * malformed or unexpected response classifies as malformed and its content
 * is never surfaced.
 */

const COMPLETE = {
  sourceUrl: "https://shop.example/product/lamp",
  title: "Mushroom ceramic table lamp",
  retailer: "Fixture Shop",
  originalAmountMinor: "2499",
  originalCurrency: "INR",
  candidateImageUrls: [
    "https://img.example/lamp-1.webp",
    "https://img.example/lamp-2.webp",
  ],
};

describe("parseExtractResponse", () => {
  it("accepts the bounded { result } success envelope", () => {
    const parsed = parseExtractResponse(200, { result: COMPLETE });
    expect(parsed).toEqual({ kind: "result", result: COMPLETE });
  });

  it("accepts a partial result with omitted or null optional fields", () => {
    const parsed = parseExtractResponse(200, {
      result: {
        sourceUrl: "https://shop.example/product/lamp",
        title: null,
        candidateImageUrls: [],
      },
    });
    expect(parsed).toEqual({
      kind: "result",
      result: {
        sourceUrl: "https://shop.example/product/lamp",
        title: null,
        candidateImageUrls: [],
      },
    });
  });

  it("accepts the { error } failure envelope", () => {
    expect(
      parseExtractResponse(422, {
        error: {
          code: "unavailable",
          message: "That page is not available right now.",
        },
      }),
    ).toEqual({ kind: "failure" });
  });

  it("classifies malformed shapes as malformed", () => {
    const bodies = [
      null,
      "text",
      42,
      [],
      {},
      { unexpected: true },
      { result: { ...COMPLETE, sourceUrl: 7 } },
      { result: { ...COMPLETE, candidateImageUrls: "nope" } },
      { result: { ...COMPLETE, originalAmountMinor: "12.5" } },
      { result: { ...COMPLETE, originalCurrency: "inr" } },
      { result: { ...COMPLETE, originalAmountMinor: null } }, // pair mismatch
      {
        result: {
          ...COMPLETE,
          candidateImageUrls: Array(9).fill("https://x.example/a"),
        },
      },
      { result: { ...COMPLETE, title: "x".repeat(201) } },
      { error: "blocked_url" },
      { error: {} },
      { result: COMPLETE, extra: true },
    ];
    for (const body of bodies) {
      expect(parseExtractResponse(200, body)).toEqual({ kind: "malformed" });
    }
  });

  it("rejects candidate URL lists beyond the eight-candidate bound", () => {
    const nine = Array.from(
      { length: 9 },
      (_, i) => `https://img.example/${i}.webp`,
    );
    expect(
      parseExtractResponse(200, {
        result: { ...COMPLETE, candidateImageUrls: nine },
      }),
    ).toEqual({ kind: "malformed" });
  });
});

describe("isAdmissionDenied", () => {
  it("flags exactly the 429 and 503 admission statuses", () => {
    expect(isAdmissionDenied(429)).toBe(true);
    expect(isAdmissionDenied(503)).toBe(true);
    expect(isAdmissionDenied(200)).toBe(false);
    expect(isAdmissionDenied(422)).toBe(false);
    expect(isAdmissionDenied(504)).toBe(false);
  });
});
