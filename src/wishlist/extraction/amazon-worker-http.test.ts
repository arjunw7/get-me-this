import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
vi.mock("server-only", () => ({}));
const { createAmazonWorker } = await import("./amazon-worker-http");
const {
  amazonTarget,
  amazonDocumentAllowed,
  amazonResourceAllowed,
  amazonBrokerHostAllowed,
} = await import("./amazon-worker-protocol");
const secret = "test-only-secret-of-at-least-32-characters";
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function start(
  job = vi.fn(async (_target: URL, _signal: AbortSignal) => {
    void _target;
    void _signal;
    return { title: "test-only" };
  }),
) {
  const server = createAmazonWorker(secret, job);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  return { url: `http://127.0.0.1:${address.port}`, job };
}
function request(
  body: unknown = { marketplace: "amazon.in", asin: "B0DGTSRX3R" },
) {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
describe("Amazon worker request boundary", () => {
  it("rejects missing/wrong credentials without starting Chromium", async () => {
    const { url, job } = await start();
    const init = request();
    init.headers.authorization = "Bearer test-only-invalid";
    expect((await fetch(url + "/extract", init)).status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });
  it.each([
    { marketplace: "127.0.0.1", asin: "B0DGTSRX3R" },
    { marketplace: "amazon.in.attacker.example", asin: "B0DGTSRX3R" },
    { marketplace: "amazon.in", asin: "invalid" },
    {
      marketplace: "amazon.in",
      asin: "B0DGTSRX3R",
      url: "https://private.example",
    },
  ])(
    "rejects arbitrary hosts, URLs and malformed IDs before launching",
    async (body) => {
      const { url, job } = await start();
      expect((await fetch(url + "/extract", request(body))).status).toBe(422);
      expect(job).not.toHaveBeenCalled();
    },
  );
  it("constructs only the canonical selected product URL", async () => {
    const { url, job } = await start();
    expect((await fetch(url + "/extract", request())).status).toBe(200);
    expect(job.mock.calls[0]?.[0].href).toBe(
      "https://www.amazon.in/dp/B0DGTSRX3R?th=1&psc=1",
    );
  });
  it("caps input bodies before starting a job", async () => {
    const { url, job } = await start();
    expect(
      (await fetch(url + "/extract", request({ payload: "x".repeat(2000) })))
        .status,
    ).toBe(413);
    expect(job).not.toHaveBeenCalled();
  });
  it("rejects concurrent jobs and releases capacity on completion", async () => {
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    const job = vi.fn(async (_target: URL, _signal: AbortSignal) => {
      void _target;
      void _signal;
      await pending;
      return { title: "test-only" };
    });
    const { url } = await start(job);
    const first = fetch(url + "/extract", request());
    await vi.waitFor(() => expect(job).toHaveBeenCalledTimes(1));
    expect((await fetch(url + "/extract", request())).status).toBe(503);
    release();
    expect((await first).status).toBe(200);
    expect((await fetch(url + "/extract", request())).status).toBe(200);
  });
  it("signals caller cancellation to the browser job", async () => {
    let release: () => void = () => {};
    let observed = false;
    const job = vi.fn(async (_target: URL, signal: AbortSignal) => {
      void _target;
      await new Promise<void>((resolve) => {
        release = resolve;
        signal.addEventListener(
          "abort",
          () => {
            observed = true;
            resolve();
          },
          { once: true },
        );
      });
      return { title: "test-only" };
    });
    const { url } = await start(job);
    const controller = new AbortController();
    const pending = fetch(url + "/extract", {
      ...request(),
      signal: controller.signal,
    }).catch(() => undefined);
    await vi.waitFor(() => expect(job).toHaveBeenCalled());
    controller.abort();
    await vi.waitFor(() => expect(observed).toBe(true));
    release();
    await pending;
  });
});
describe("Amazon-only browser network policy", () => {
  const target = amazonTarget({ marketplace: "amazon.in", asin: "B0DGTSRX3R" });
  it("allows selected main product documents and blocks wrong products/hosts", () => {
    expect(amazonDocumentAllowed(target.href, target)).toBe(true);
    expect(
      amazonDocumentAllowed("https://www.amazon.in/dp/B09MTQ23X4", target),
    ).toBe(false);
    expect(
      amazonDocumentAllowed("https://attacker.example/dp/B0DGTSRX3R", target),
    ).toBe(false);
  });
  it("limits resources and broker destinations to Amazon hosts", () => {
    expect(
      amazonResourceAllowed(
        "https://m.media-amazon.com/images/product.jpg",
        target,
      ),
    ).toBe(true);
    expect(
      amazonResourceAllowed("https://www.amazon.com/dp/B0DGTSRX3R", target),
    ).toBe(false);
    expect(amazonBrokerHostAllowed("m.media-amazon.com")).toBe(true);
    expect(amazonBrokerHostAllowed("www.amazon.in.attacker.example")).toBe(
      false,
    );
    expect(amazonBrokerHostAllowed("127.0.0.1")).toBe(false);
  });
});
