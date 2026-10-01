import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ExtractionError } = await import("./errors");
const { guardedRequest, resolvePinnedAddress } = await import("./transport");
type PinnedConnection = import("./transport").PinnedConnection;
type TransportDependencies = import("./transport").TransportDependencies;

function mockResolver(
  implementation: NonNullable<TransportDependencies["resolve"]>,
) {
  return vi.fn(implementation);
}

function mockDial(implementation: NonNullable<TransportDependencies["dial"]>) {
  return vi.fn(implementation);
}

class FakeConnection implements PinnedConnection {
  readonly writes: Uint8Array[] = [];
  destroyed = false;

  constructor(
    readonly remoteAddress: string,
    private readonly chunks: readonly Uint8Array[],
  ) {}

  write(bytes: Uint8Array): void {
    this.writes.push(bytes);
  }

  destroy(): void {
    this.destroyed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    for (const chunk of this.chunks) yield chunk;
  }
}

class StallingConnection extends FakeConnection {
  constructor(
    remoteAddress: string,
    private readonly firstChunk: Uint8Array,
  ) {
    super(remoteAddress, []);
  }

  override async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    yield this.firstChunk;
    await new Promise(() => undefined);
  }
}

const encoder = new TextEncoder();

function response(
  status: number,
  headers: Readonly<Record<string, string>>,
  body = "",
): Uint8Array {
  return encoder.encode(
    [
      `HTTP/1.1 ${status} Test`,
      ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
      "",
      body,
    ].join("\r\n"),
  );
}

function code(error: unknown): string {
  return error instanceof ExtractionError ? error.code : "unknown";
}

describe("guarded outbound transport", () => {
  let connections: FakeConnection[];
  let dial: ReturnType<typeof mockDial>;
  let resolve: ReturnType<typeof mockResolver>;
  let dependencies: TransportDependencies;

  beforeEach(() => {
    connections = [];
    resolve = mockResolver(async () => [{ address: "8.8.8.8", family: 4 }]);
    dial = mockDial(async ({ address }) => {
      const connection = new FakeConnection(address.address, [
        response(
          200,
          {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": "2",
          },
          "ok",
        ),
      ]);
      connections.push(connection);
      return connection;
    });
    dependencies = { resolve, dial };
  });

  it("resolves every answer, sorts deterministically, and pins the selected peer", async () => {
    resolve.mockResolvedValue([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ]);
    const selected = await resolvePinnedAddress(
      "shop.example",
      dependencies,
      new AbortController().signal,
      Date.now() + 10_000,
    );
    expect(selected.address).toBe("1.1.1.1");
  });

  it("fails a mixed public/private answer set before any dial", async () => {
    resolve.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "blocked_url");
    expect(dial).not.toHaveBeenCalled();
  });

  it.each([
    [[] as { address: string; family: number }[]],
    [
      Array.from({ length: 33 }, (_, index) => ({
        address: `8.8.8.${index + 1}`,
        family: 4,
      })),
    ],
  ])("fails empty or excessive DNS answers closed", async (answers) => {
    resolve.mockResolvedValue(answers);
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toBeInstanceOf(ExtractionError);
    expect(dial).not.toHaveBeenCalled();
  });

  it("verifies the connected peer before sending application bytes", async () => {
    dial.mockImplementation(async () => {
      const connection = new FakeConnection("1.1.1.1", []);
      connections.push(connection);
      return connection;
    });
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "blocked_url");
    expect(connections[0]?.writes).toHaveLength(0);
    expect(connections[0]?.destroyed).toBe(true);
  });

  it("sends a minimal identity request without cookies or authorization", async () => {
    const result = await guardedRequest(
      "https://shop.example/item?q=1",
      "html",
      dependencies,
    );
    expect(new TextDecoder().decode(result.body)).toBe("ok");
    const sent = new TextDecoder().decode(connections[0]!.writes[0]);
    expect(sent).toContain("GET /item?q=1 HTTP/1.1");
    expect(sent).toContain("Host: shop.example");
    expect(sent).toContain("Accept-Encoding: identity");
    expect(sent).toContain("Connection: close");
    expect(sent).not.toMatch(/cookie|authorization/i);
    expect(connections[0]?.destroyed).toBe(true);
  });

  it("revalidates a redirect and makes zero target dials when it becomes private", async () => {
    dial.mockImplementationOnce(async ({ address }) => {
      const connection = new FakeConnection(address.address, [
        response(302, { Location: "https://private.example/item" }),
      ]);
      connections.push(connection);
      return connection;
    });
    resolve
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "blocked_url");
    expect(dial).toHaveBeenCalledTimes(1);
  });

  it("rejects an HTTPS downgrade without dialing the redirect target", async () => {
    dial.mockImplementationOnce(async ({ address }) => {
      const connection = new FakeConnection(address.address, [
        response(302, { Location: "http://public.example/item" }),
      ]);
      connections.push(connection);
      return connection;
    });
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "blocked_url");
    expect(dial).toHaveBeenCalledTimes(1);
  });

  it("allows three redirects, uses a fresh socket per hop, and denies a fourth", async () => {
    dial.mockImplementation(async ({ address }) => {
      const index = connections.length;
      const connection = new FakeConnection(address.address, [
        response(302, { Location: `https://hop${index + 1}.example/item` }),
      ]);
      connections.push(connection);
      return connection;
    });
    await expect(
      guardedRequest("https://hop0.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "unavailable");
    expect(dial).toHaveBeenCalledTimes(4);
    expect(new Set(connections).size).toBe(4);
    expect(connections.every((connection) => connection.destroyed)).toBe(true);
  });

  it.each([
    ["Content-Encoding", "gzip", "unsupported_content"],
    ["Content-Type", "application/json", "unsupported_content"],
    ["Content-Length", String(1_048_577), "too_large"],
  ])("rejects unsafe %s responses", async (header, value, expected) => {
    dial.mockImplementation(async ({ address }) => {
      const headers = {
        "Content-Type": "text/html",
        "Content-Length": "0",
        [header]: value,
      };
      return new FakeConnection(address.address, [response(200, headers)]);
    });
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === expected);
  });

  it("rejects 101 header fields before reading a body", async () => {
    dial.mockImplementation(async ({ address }) => {
      const headers = Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [`X-${index}`, "x"]),
      );
      return new FakeConnection(address.address, [response(200, headers)]);
    });
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "too_large");
  });

  it("rejects response headers over 16 KiB", async () => {
    dial.mockImplementation(
      async ({ address }) =>
        new FakeConnection(address.address, [
          response(200, {
            "Content-Type": "text/html",
            "X-Fill": "x".repeat(16 * 1_024),
          }),
        ]),
    );
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "too_large");
  });

  it("accepts a bounded body without Content-Length", async () => {
    dial.mockImplementation(
      async ({ address }) =>
        new FakeConnection(address.address, [
          response(200, { "Content-Type": "text/html" }, "ok"),
        ]),
    );
    const result = await guardedRequest(
      "https://shop.example/item",
      "html",
      dependencies,
    );
    expect(new TextDecoder().decode(result.body)).toBe("ok");
  });

  it.each([
    ["1", "ok"],
    ["3", "ok"],
  ])("rejects a lying Content-Length of %s", async (length, body) => {
    dial.mockImplementation(
      async ({ address }) =>
        new FakeConnection(address.address, [
          response(
            200,
            { "Content-Type": "text/html", "Content-Length": length },
            body,
          ),
        ]),
    );
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "unavailable");
  });

  it("rejects an oversized body without Content-Length", async () => {
    dial.mockImplementation(
      async ({ address }) =>
        new FakeConnection(address.address, [
          response(
            200,
            { "Content-Type": "text/html" },
            "x".repeat(1_024 * 1_024 + 1),
          ),
        ]),
    );
    await expect(
      guardedRequest("https://shop.example/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "too_large");
  });

  it("rejects an image Content-Length over 5 MiB before reading it", async () => {
    dial.mockImplementation(
      async ({ address }) =>
        new FakeConnection(address.address, [
          response(200, {
            "Content-Type": "image/png",
            "Content-Length": String(5 * 1_024 * 1_024 + 1),
          }),
        ]),
    );
    await expect(
      guardedRequest("https://images.example/item", "image", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "too_large");
  });

  it("decodes a bounded chunked body", async () => {
    dial.mockImplementation(
      async ({ address }) =>
        new FakeConnection(address.address, [
          response(
            200,
            { "Content-Type": "text/html", "Transfer-Encoding": "chunked" },
            "2\r\nok\r\n0\r\n\r\n",
          ),
        ]),
    );
    const result = await guardedRequest(
      "https://shop.example/item",
      "html",
      dependencies,
    );
    expect(new TextDecoder().decode(result.body)).toBe("ok");
  });

  it("does no DNS or dial work for a blocked initial literal", async () => {
    await expect(
      guardedRequest("http://127.0.0.1/item", "html", dependencies),
    ).rejects.toSatisfy((error: unknown) => code(error) === "blocked_url");
    expect(resolve).not.toHaveBeenCalled();
    expect(dial).not.toHaveBeenCalled();
  });

  it("enforces the independent DNS deadline", async () => {
    vi.useFakeTimers();
    try {
      resolve = mockResolver(async () => await new Promise(() => undefined));
      const pending = guardedRequest("https://shop.example/item", "html", {
        resolve,
        dial,
      });
      const assertion = expect(pending).rejects.toSatisfy(
        (error: unknown) => code(error) === "timeout",
      );
      await vi.advanceTimersByTimeAsync(2_001);
      await assertion;
      expect(dial).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the independent connect deadline", async () => {
    vi.useFakeTimers();
    try {
      let resolveDial: ((connection: PinnedConnection) => void) | undefined;
      let dialSignal: AbortSignal | undefined;
      dial = mockDial(
        async ({ signal }) =>
          await new Promise<PinnedConnection>((resolve) => {
            dialSignal = signal;
            resolveDial = resolve;
          }),
      );
      const pending = guardedRequest("https://shop.example/item", "html", {
        resolve,
        dial,
      });
      const assertion = expect(pending).rejects.toSatisfy(
        (error: unknown) => code(error) === "timeout",
      );
      await vi.advanceTimersByTimeAsync(2_001);
      await assertion;
      expect(dialSignal?.aborted).toBe(true);
      const late = new FakeConnection("8.8.8.8", []);
      resolveDial?.(late);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(late.destroyed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the independent response-header deadline", async () => {
    vi.useFakeTimers();
    try {
      const stalled = new FakeConnection("8.8.8.8", []);
      stalled[Symbol.asyncIterator] = () => ({
        next: async () => await new Promise(() => undefined),
      });
      dial = mockDial(async () => stalled);
      const pending = guardedRequest("https://shop.example/item", "html", {
        resolve,
        dial,
      });
      const assertion = expect(pending).rejects.toSatisfy(
        (error: unknown) => code(error) === "timeout",
      );
      await vi.advanceTimersByTimeAsync(2_001);
      await assertion;
      expect(stalled.writes).toHaveLength(1);
      expect(stalled.destroyed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the one-second body-idle deadline and closes the socket", async () => {
    vi.useFakeTimers();
    try {
      const stalled = new StallingConnection(
        "8.8.8.8",
        response(200, { "Content-Type": "text/html" }),
      );
      dial = mockDial(async () => stalled);
      const pending = guardedRequest("https://shop.example/item", "html", {
        resolve,
        dial,
      });
      const assertion = expect(pending).rejects.toSatisfy(
        (error: unknown) => code(error) === "timeout",
      );
      await vi.advanceTimersByTimeAsync(1_001);
      await assertion;
      expect(stalled.destroyed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the socket when the caller cancels", async () => {
    const controller = new AbortController();
    const stalled = new StallingConnection(
      "8.8.8.8",
      response(200, { "Content-Type": "text/html" }),
    );
    dial = mockDial(async () => stalled);
    const pending = guardedRequest(
      "https://shop.example/item",
      "html",
      { resolve, dial },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(stalled.writes).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toSatisfy(
      (error: unknown) => code(error) === "timeout",
    );
    expect(stalled.destroyed).toBe(true);
  });

  it("passes the original hostname and selected IP to a fresh TLS dial", async () => {
    await guardedRequest("https://shop.example/item", "html", dependencies);
    expect(dial).toHaveBeenCalledWith(
      expect.objectContaining({
        address: expect.objectContaining({ address: "8.8.8.8" }),
        hostname: "shop.example",
        port: 443,
        tls: true,
      }),
    );
  });
});
