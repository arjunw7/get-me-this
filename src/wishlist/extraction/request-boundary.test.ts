import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ExtractionError } = await import("./errors");
const { ExtractionLimiter } = await import("./limiter");
const { handleExtractionPost } = await import("./request-boundary");

const ORIGIN = "https://app.example";
const proposal = {
  sourceUrl: "https://shop.example/item",
  title: "A gift",
  candidateImageUrls: [],
};

function request(
  body: BodyInit | null = JSON.stringify({ url: "https://shop.example/item" }),
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}/wishlist/items/extract`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: vi.fn(async () => ({ userId: "user-1", complete: true })),
    trustedOrigin: ORIGIN,
    limiter: new ExtractionLimiter(),
    extract: vi.fn(async () => proposal),
    ...overrides,
  };
}

describe("extraction POST boundary", () => {
  it("uses Firecrawl for the default authenticated extractor", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "test-only-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: {
            metadata: { statusCode: 200 },
            markdown: "USD 12.50",
            product: {
              title: "Managed cup",
              variants: [
                { price: { amount: 12.5, currency: "USD" }, images: [] },
              ],
            },
          },
        }),
      ),
    );
    try {
      const response = await handleExtractionPost(
        request(JSON.stringify({ url: "https://93.184.216.34/cup" })),
        dependencies({ extract: undefined }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        result: {
          sourceUrl: "https://93.184.216.34/cup",
          title: "Managed cup",
          retailer: "93.184.216.34",
          originalAmountMinor: "1250",
          originalCurrency: "USD",
          candidateImageUrls: [],
        },
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it("allows a managed scrape to finish after the old ten-second deadline", async () => {
    vi.useFakeTimers();
    try {
      const pending = handleExtractionPost(
        request(),
        dependencies({
          extract: async () =>
            await new Promise((resolve) =>
              setTimeout(() => resolve(proposal), 20_000),
            ),
        }),
      );
      await vi.advanceTimersByTimeAsync(20_001);
      expect((await pending).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns an authenticated same-origin proposal with privacy headers", async () => {
    const response = await handleExtractionPost(request(), dependencies());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    await expect(response.json()).resolves.toEqual({ result: proposal });
  });

  it("revalidates and narrows the actual response boundary", async () => {
    const response = await handleExtractionPost(
      request(),
      dependencies({
        extract: vi.fn(async () => ({
          ...proposal,
          title: "<b>A gift</b>",
          secretRemoteHeader: "must not escape",
        })),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      result: { ...proposal, title: "A gift" },
    });
  });

  it.each([
    [null, 401],
    [{ userId: "user-1", complete: false }, 403],
  ])(
    "rejects an invalid session before extraction",
    async (session, status) => {
      const extract = vi.fn(async () => proposal);
      const response = await handleExtractionPost(
        request(),
        dependencies({ authenticate: vi.fn(async () => session), extract }),
      );
      expect(response.status).toBe(status);
      expect(extract).not.toHaveBeenCalled();
    },
  );

  it.each([null, "https://evil.example"])(
    "rejects absent or mismatched Origin before extraction",
    async (origin) => {
      const extract = vi.fn(async () => proposal);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (origin) headers.Origin = origin;
      const response = await handleExtractionPost(
        new Request(`${ORIGIN}/wishlist/items/extract`, {
          method: "POST",
          headers,
          body: JSON.stringify({ url: "https://shop.example/item" }),
        }),
        dependencies({ extract }),
      );
      expect(response.status).toBe(403);
      expect(extract).not.toHaveBeenCalled();
    },
  );

  describe("with APP_ORIGIN unconfigured (same-origin fallback, ARJ-62)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("admits a same-origin request instead of denying every caller", async () => {
      vi.stubEnv("APP_ORIGIN", "");
      const extract = vi.fn(async () => proposal);
      const response = await handleExtractionPost(
        request(),
        dependencies({ extract, trustedOrigin: undefined }),
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ result: proposal });
      expect(extract).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["https://evil.example"], // cross-site origin
      ["http://app.example"], // same host, downgraded scheme
    ])("rejects a mismatched Origin before extraction", async (origin) => {
      vi.stubEnv("APP_ORIGIN", "");
      const extract = vi.fn(async () => proposal);
      const response = await handleExtractionPost(
        request(undefined, { Origin: origin }),
        dependencies({ extract, trustedOrigin: undefined }),
      );
      expect(response.status).toBe(403);
      expect(extract).not.toHaveBeenCalled();
    });

    it("rejects an absent Origin before extraction", async () => {
      vi.stubEnv("APP_ORIGIN", "");
      const extract = vi.fn(async () => proposal);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const response = await handleExtractionPost(
        new Request(`${ORIGIN}/wishlist/items/extract`, {
          method: "POST",
          headers,
          body: JSON.stringify({ url: "https://shop.example/item" }),
        }),
        dependencies({ extract, trustedOrigin: undefined }),
      );
      expect(response.status).toBe(403);
      expect(extract).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["not json", "application/json"],
    ["[]", "application/json"],
    [
      JSON.stringify({ url: "https://shop.example", extra: true }),
      "application/json",
    ],
    [JSON.stringify({ url: 1 }), "application/json"],
    [JSON.stringify({ url: "https://shop.example" }), "text/plain"],
  ])(
    "rejects malformed or non-JSON bodies with zero extraction",
    async (body, type) => {
      const extract = vi.fn(async () => proposal);
      const response = await handleExtractionPost(
        request(body, { "Content-Type": type }),
        dependencies({ extract }),
      );
      expect(response.status).toBe(400);
      expect(extract).not.toHaveBeenCalled();
    },
  );

  it("aborts an over-8-KiB body before extraction", async () => {
    const extract = vi.fn(async () => proposal);
    const response = await handleExtractionPost(
      request(
        JSON.stringify({ url: `https://shop.example/${"x".repeat(8_192)}` }),
      ),
      dependencies({ extract }),
    );
    expect(response.status).toBe(413);
    expect(extract).not.toHaveBeenCalled();
  });

  it("times out a stalled inbound stream with zero extraction and releases capacity", async () => {
    vi.useFakeTimers();
    try {
      const release = vi.fn();
      const extract = vi.fn(async () => proposal);
      const stream = new ReadableStream<Uint8Array>({ start() {} });
      const stalledRequest = new Request(`${ORIGIN}/wishlist/items/extract`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      const pending = handleExtractionPost(
        stalledRequest,
        dependencies({
          extract,
          limiter: { acquire: () => ({ ok: true, permit: { release } }) },
        }),
      );
      await vi.advanceTimersByTimeAsync(2_001);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(extract).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases capacity when the client aborts active extraction", async () => {
    const controller = new AbortController();
    const release = vi.fn();
    const extract = vi.fn(
      async (_url: string, options: { signal: AbortSignal }) =>
        await new Promise<never>((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new ExtractionError("timeout")),
            { once: true },
          );
        }),
    );
    const activeRequest = new Request(`${ORIGIN}/wishlist/items/extract`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://shop.example/item" }),
      signal: controller.signal,
    });
    const pending = handleExtractionPost(
      activeRequest,
      dependencies({
        extract,
        limiter: { acquire: () => ({ ok: true, permit: { release } }) },
      }),
    );
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(504);
    expect(release).toHaveBeenCalledOnce();
  });

  it("honors a caller already aborted before authentication completes", async () => {
    const controller = new AbortController();
    controller.abort();
    const extract = vi.fn(async () => proposal);
    const abortedRequest = new Request(`${ORIGIN}/wishlist/items/extract`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://shop.example/item" }),
      signal: controller.signal,
    });
    const response = await handleExtractionPost(
      abortedRequest,
      dependencies({ extract }),
    );
    expect(response.status).toBe(504);
    expect(extract).not.toHaveBeenCalled();
  });

  it("includes authentication in the managed-scrape route-entry deadline", async () => {
    vi.useFakeTimers();
    try {
      const extract = vi.fn(async () => proposal);
      const pending = handleExtractionPost(
        request(),
        dependencies({
          authenticate: vi.fn(async () => await new Promise(() => undefined)),
          extract,
        }),
      );
      await vi.advanceTimersByTimeAsync(35_001);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(extract).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases an acquired permit after malformed JSON", async () => {
    const release = vi.fn();
    const response = await handleExtractionPost(
      request("not-json"),
      dependencies({
        limiter: { acquire: () => ({ ok: true, permit: { release } }) },
      }),
    );
    expect(response.status).toBe(400);
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns generic typed failures without echoing URL or exception detail", async () => {
    const extract = vi.fn(async () => {
      throw new Error(
        "secret retailer response https://shop.example/?token=secret",
      );
    });
    const response = await handleExtractionPost(
      request(),
      dependencies({ extract }),
    );
    const text = await response.text();
    expect(response.status).toBe(422);
    expect(text).toContain("extraction_failed");
    expect(text).not.toMatch(/secret|shop\.example|token/);
  });

  it("maps rate and concurrency exhaustion to generic 429/503 responses", async () => {
    for (const [reason, status] of [
      ["rate", 429],
      ["concurrency", 503],
    ] as const) {
      const response = await handleExtractionPost(
        request(),
        dependencies({ limiter: { acquire: () => ({ ok: false, reason }) } }),
      );
      expect(response.status).toBe(status);
    }
  });

  it.each([
    ["success", null],
    ["typed failure", new ExtractionError("timeout")],
    ["exception", new Error("failure")],
  ])("releases concurrency after %s", async (_name, failure) => {
    const release = vi.fn();
    const response = await handleExtractionPost(
      request(),
      dependencies({
        limiter: {
          acquire: () => ({ ok: true, permit: { release } }),
        },
        extract: vi.fn(async () => {
          if (failure) throw failure;
          return proposal;
        }),
      }),
    );
    expect(response.status).toBe(
      failure ? (failure instanceof ExtractionError ? 504 : 422) : 200,
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
