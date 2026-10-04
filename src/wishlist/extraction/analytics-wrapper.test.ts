// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The 005f route-wrapper telemetry contract: `product_extraction_completed`
 * is emitted ONLY from this wrapper (never inside handleExtractionPost),
 * admission denials (429/503) emit NOTHING, and no URL, host, reason code,
 * or content ever enters a property. The response is returned unchanged.
 */

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  getSessionUser: vi.fn(),
  handleExtractionPost: vi.fn(),
}));

vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: () => ({ capture: mocks.capture }),
}));
vi.mock("@/src/profile/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("./request-boundary", () => ({
  handleExtractionPost: mocks.handleExtractionPost,
}));
vi.mock("server-only", () => ({}));

import {
  classifyExtractionOutcome,
  extractionDurationBucket,
  handleExtractionPostWithAnalytics,
} from "./analytics-wrapper";

const USER = { id: "00000000-0000-4000-8000-00000000000a", email: null };

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  },
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const COMPLETE_RESULT = {
  sourceUrl: "https://shop.example/product/lamp",
  title: "Mushroom ceramic table lamp",
  retailer: "Fixture Shop",
  originalAmountMinor: "2499",
  originalCurrency: "INR",
  candidateImageUrls: ["https://img.example/lamp-1.webp"],
};

const PARTIAL_RESULT = {
  sourceUrl: "https://shop.example/product/lamp",
  title: null,
  candidateImageUrls: [],
};

beforeEach(() => {
  mocks.capture.mockReset().mockResolvedValue({ ok: true, delivered: true });
  mocks.getSessionUser.mockReset().mockResolvedValue(USER);
  mocks.handleExtractionPost.mockReset();
});

describe("extractionDurationBucket", () => {
  it("maps elapsed milliseconds onto the closed bucket enum", () => {
    expect(extractionDurationBucket(0)).toBe("under_2s");
    expect(extractionDurationBucket(1_999)).toBe("under_2s");
    expect(extractionDurationBucket(2_000)).toBe("2_to_5s");
    expect(extractionDurationBucket(4_999)).toBe("2_to_5s");
    expect(extractionDurationBucket(5_000)).toBe("5_to_10s");
    expect(extractionDurationBucket(9_999)).toBe("5_to_10s");
    expect(extractionDurationBucket(10_000)).toBe("over_10s");
    expect(extractionDurationBucket(120_000)).toBe("over_10s");
  });
});

describe("classifyExtractionOutcome", () => {
  it("classifies a complete result as succeeded and a result with gaps as partial", () => {
    expect(
      classifyExtractionOutcome(
        200,
        JSON.stringify({ result: COMPLETE_RESULT }),
      ),
    ).toBe("succeeded");
    expect(
      classifyExtractionOutcome(
        200,
        JSON.stringify({ result: PARTIAL_RESULT }),
      ),
    ).toBe("partial");
  });

  it("classifies every failure status and body as failed without reading content", () => {
    for (const status of [400, 401, 403, 413, 422, 504]) {
      expect(
        classifyExtractionOutcome(
          status,
          JSON.stringify({ error: { code: "blocked_url", message: "x" } }),
        ),
      ).toBe("failed");
    }
    expect(classifyExtractionOutcome(200, "not json")).toBe("failed");
    expect(classifyExtractionOutcome(200, JSON.stringify({}))).toBe("failed");
  });
});

describe("handleExtractionPostWithAnalytics", () => {
  it("emits succeeded with duration and no fallback for a complete result", async () => {
    mocks.handleExtractionPost.mockResolvedValue(
      jsonResponse(200, { result: COMPLETE_RESULT }),
    );
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    const response = await handleExtractionPostWithAnalytics(request);

    expect(response.status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    const [event, properties, context] = mocks.capture.mock.calls[0];
    expect(event).toBe("product_extraction_completed");
    expect(properties).toEqual({
      outcome: "succeeded",
      duration_bucket: "under_2s",
      manual_fallback_offered: false,
    });
    expect(context).toEqual({ distinctId: USER.id });
  });

  it("emits partial with the manual fallback offered", async () => {
    mocks.handleExtractionPost.mockResolvedValue(
      jsonResponse(200, { result: PARTIAL_RESULT }),
    );
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    await handleExtractionPostWithAnalytics(request);

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture.mock.calls[0][1]).toMatchObject({
      outcome: "partial",
      manual_fallback_offered: true,
    });
  });

  it("emits failed with the manual fallback offered for typed failures", async () => {
    mocks.handleExtractionPost.mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: "blocked_url",
          message: "That link cannot be accessed.",
        },
      }),
    );
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    await handleExtractionPostWithAnalytics(request);

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture.mock.calls[0][1]).toMatchObject({
      outcome: "failed",
      manual_fallback_offered: true,
    });
  });

  it("emits NOTHING for the 429 and 503 admission denials (zero-emission denial discipline)", async () => {
    for (const status of [429, 503]) {
      mocks.capture.mockClear();
      mocks.handleExtractionPost.mockResolvedValue(
        jsonResponse(status, {
          error: {
            code: "unavailable",
            message: "That page is not available right now.",
          },
        }),
      );
      const request = new Request(
        "https://app.example/wishlist/items/extract",
        {
          method: "POST",
          body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
        },
      );
      const response = await handleExtractionPostWithAnalytics(request);
      expect(response.status).toBe(status);
      expect(mocks.capture).not.toHaveBeenCalled();
    }
  });

  it("emits nothing when the identity cannot be resolved", async () => {
    mocks.handleExtractionPost.mockResolvedValue(
      jsonResponse(200, { result: COMPLETE_RESULT }),
    );
    mocks.getSessionUser.mockResolvedValue(null);
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    const response = await handleExtractionPostWithAnalytics(request);
    expect(response.status).toBe(200);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("never emits URL, host, title, price, image, or reason-code content in any property", async () => {
    mocks.handleExtractionPost.mockResolvedValue(
      jsonResponse(200, { result: COMPLETE_RESULT }),
    );
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    await handleExtractionPostWithAnalytics(request);

    const serialized = JSON.stringify(mocks.capture.mock.calls);
    expect(serialized).not.toContain("shop.example");
    expect(serialized).not.toContain("img.example");
    expect(serialized).not.toContain("Mushroom");
    expect(serialized).not.toContain("2499");
    expect(serialized).not.toContain("Fixture Shop");
  });

  it("returns the response byte-for-byte with its headers intact", async () => {
    const original = jsonResponse(422, {
      error: {
        code: "timeout",
        message: "That page took too long to respond.",
      },
    });
    mocks.handleExtractionPost.mockResolvedValue(original);
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    const response = await handleExtractionPostWithAnalytics(request);

    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "timeout",
        message: "That page took too long to respond.",
      },
    });
  });

  it("telemetry failure never changes the response", async () => {
    mocks.handleExtractionPost.mockResolvedValue(
      jsonResponse(200, { result: COMPLETE_RESULT }),
    );
    mocks.capture.mockRejectedValue(new Error("posthog down"));
    const request = new Request("https://app.example/wishlist/items/extract", {
      method: "POST",
      body: JSON.stringify({ url: "https://shop.example/product/lamp" }),
    });
    const response = await handleExtractionPostWithAnalytics(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ result: COMPLETE_RESULT });
  });
});
