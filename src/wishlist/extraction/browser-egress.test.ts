import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import { PassThrough } from "node:stream";
import type { Socket } from "node:net";
vi.mock("server-only", () => ({}));
const { createBrowserEgress } = await import("./browser-egress");
async function attempt(
  authority: string,
  answers: readonly { address: string; family: number }[],
  peer?: string,
  allowHost?: (hostname: string) => boolean,
) {
  const connect = vi.fn(async () => {
    if (!peer) throw new Error("unexpected dial");
    const socket = new PassThrough();
    Object.defineProperty(socket, "remoteAddress", { value: peer });
    Object.assign(socket, { setTimeout: () => socket });
    return socket as unknown as Socket;
  });
  const { server, shutdown } = createBrowserEgress({
    transport: { resolve: async () => answers },
    connect,
    allowHost,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error();
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: address.port,
        method: "CONNECT",
        path: authority,
      });
      req.on("connect", (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      req.on("response", (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    return { status, connect };
  } finally {
    shutdown();
  }
}
describe("browser egress", () => {
  it.each([
    "127.0.0.1:443",
    "169.254.169.254:443",
    "[::1]:443",
    "shop.example:80",
    "shop.example:443/path",
    "shop.example:443?redirect=private",
  ])("rejects unsafe CONNECT destination %s before dialing", async (target) => {
    const result = await attempt(target, [
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(result.status).toBe(403);
    expect(result.connect).not.toHaveBeenCalled();
  });
  it("rejects mixed public and private DNS answers", async () => {
    const result = await attempt("shop.example:443", [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    expect(result.status).toBe(403);
    expect(result.connect).not.toHaveBeenCalled();
  });
  it("passes a numeric public address to the dialer instead of resolving again", async () => {
    const result = await attempt("shop.example:443", [
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(result.connect).toHaveBeenCalledWith(
      "93.184.216.34",
      expect.any(AbortSignal),
    );
  });
});

it("rejects a socket peer that differs from the validated DNS address", async () => {
  const result = await attempt(
    "shop.example:443",
    [{ address: "93.184.216.34", family: 4 }],
    "1.1.1.1",
  );
  expect(result.status).toBe(403);
});
it("allows a tunnel only after the actual numeric public peer matches", async () => {
  const result = await attempt(
    "shop.example:443",
    [{ address: "93.184.216.34", family: 4 }],
    "93.184.216.34",
  );
  expect(result.status).toBe(200);
});

it("rejects a public host outside the worker allowlist before dialing", async () => {
  const result = await attempt(
    "attacker.example:443",
    [{ address: "93.184.216.34", family: 4 }],
    "93.184.216.34",
    (host) => host === "www.amazon.in",
  );
  expect(result.status).toBe(403);
  expect(result.connect).not.toHaveBeenCalled();
});
it("allows an approved host only with a matching public peer", async () => {
  const result = await attempt(
    "www.amazon.in:443",
    [{ address: "93.184.216.34", family: 4 }],
    "93.184.216.34",
    (host) => host === "www.amazon.in",
  );
  expect(result.status).toBe(200);
});
