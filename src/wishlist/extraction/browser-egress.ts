import "server-only";
import http from "node:http";
import net, { type Socket } from "node:net";
import { resolvePinnedAddress, type TransportDependencies } from "./transport";
import { classifyPublicAddress, compareCanonicalAddresses } from "./ip-policy";
import { parseDestinationUrl, destinationHostname } from "./url-policy";
import { ExtractionError } from "./errors";
export type EgressOptions = {
  readonly transport?: TransportDependencies;
  readonly allowHost?: (hostname: string) => boolean;
  readonly connect?: (address: string, signal: AbortSignal) => Promise<Socket>;
};
/** CONNECT only: Chromium verifies target TLS through a public socket-pinned tunnel. */
export function createBrowserEgress(options: EgressOptions = {}) {
  const sockets = new Set<Socket>();
  let active = 0;
  let windowStart = Date.now();
  let transferred = 0;
  const server = http.createServer(
    { maxHeaderSize: 8192, headersTimeout: 2000, requestTimeout: 2000 },
    (_req, res) => {
      res.writeHead(403);
      res.end();
    },
  );
  const connect =
    options.connect ??
    ((address: string, signal: AbortSignal) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = net.createConnection({
          host: address,
          port: 443,
          signal,
        });
        socket.once("connect", () => resolve(socket));
        socket.once("error", reject);
      }));
  server.on("connect", (request, rawClient, head) => {
    const client = rawClient as Socket;
    client.pause();
    if (Date.now() - windowStart >= 60000) {
      windowStart = Date.now();
      transferred = 0;
    }
    if (active >= 16 || transferred >= 64 * 1024 * 1024) {
      client.end("HTTP/1.1 503 Unavailable\r\n\r\n");
      return;
    }
    active++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let upstream: Socket | undefined;
    let released = false;
    const cleanup = () => {
      if (released) return;
      released = true;
      clearTimeout(timeout);
      controller.abort();
      active--;
      sockets.delete(client);
      if (upstream) sockets.delete(upstream);
      client.destroy();
      upstream?.destroy();
    };
    sockets.add(client);
    client.once("close", cleanup);
    client.once("error", cleanup);
    controller.signal.addEventListener("abort", cleanup, { once: true });
    void (async () => {
      try {
        if (!request.url?.endsWith(":443") || head.length > 8192)
          throw new ExtractionError("blocked_url");
        const url = parseDestinationUrl(`https://${request.url}`);
        if (url.pathname !== "/" || url.search || url.hash)
          throw new ExtractionError("blocked_url");
        if (options.allowHost && !options.allowHost(destinationHostname(url)))
          throw new ExtractionError("blocked_url");
        const address = await resolvePinnedAddress(
          destinationHostname(url),
          options.transport ?? {},
          controller.signal,
          Date.now() + 2000,
        );
        const dialTimer = setTimeout(() => controller.abort(), 2000);
        try {
          upstream = await connect(address.address, controller.signal);
        } finally {
          clearTimeout(dialTimer);
        }
        if (controller.signal.aborted) {
          upstream.destroy();
          throw new ExtractionError("timeout");
        }
        const peer = upstream.remoteAddress
          ? classifyPublicAddress(upstream.remoteAddress)
          : null;
        if (!peer || compareCanonicalAddresses(address, peer) !== 0)
          throw new ExtractionError("blocked_url");
        if (controller.signal.aborted) throw new ExtractionError("timeout");
        sockets.add(upstream);
        upstream.once("error", cleanup);
        upstream.once("close", cleanup);
        client.setTimeout(5000, cleanup);
        upstream.setTimeout(5000, cleanup);
        let tunnelBytes = 0;
        const count = (bytes: Buffer) => {
          tunnelBytes += bytes.length;
          transferred += bytes.length;
          if (tunnelBytes > 16 * 1024 * 1024 || transferred > 64 * 1024 * 1024)
            cleanup();
        };
        client.on("data", count);
        upstream.on("data", count);
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
        client.resume();
      } catch {
        if (!client.destroyed)
          client.end("HTTP/1.1 403 Forbidden\r\n\r\n", cleanup);
        else cleanup();
      }
    })();
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  const shutdown = () => {
    for (const socket of sockets) socket.destroy();
    server.close();
  };
  return { server, shutdown };
}
