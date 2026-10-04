import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";
import { chromium, type BrowserServer } from "playwright-core";
const secret = process.env.AMAZON_BROWSER_SECRET;
const proxy = process.env.BROWSER_EGRESS_PROXY;
if (!secret || secret.length < 32 || !proxy)
  throw new Error("Browser worker configuration is missing");
let busy = false;
const server = http.createServer(
  { maxHeaderSize: 8192, headersTimeout: 2000, requestTimeout: 2000 },
  (req, res) => {
    res.writeHead(req.url === "/health" ? 200 : 404);
    res.end();
  },
);
server.on("upgrade", (request, client, head) => {
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.authorization ?? "");
  if (
    request.url !== "/session" ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    client.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  if (busy) {
    client.end("HTTP/1.1 503 Busy\r\n\r\n");
    return;
  }
  busy = true;
  let browser: BrowserServer | undefined;
  let upstream: net.Socket | undefined;
  let ended = false;
  let launchDone = false;
  const timeout = setTimeout(() => {
    void cleanup();
  }, 28000);
  async function cleanup() {
    if (ended) return;
    ended = true;
    clearTimeout(timeout);
    client.destroy();
    upstream?.destroy();
    if (browser) {
      try {
        await browser.kill();
      } catch {
        process.exitCode = 1;
        server.close();
      }
    }
    if (browser || launchDone) busy = false;
  }
  client.pause();
  client.once("close", () => {
    void cleanup();
  });
  client.once("error", () => {
    void cleanup();
  });
  void (async () => {
    try {
      browser = await chromium.launchServer({
        timeout: 5000,
        headless: true,
        chromiumSandbox: true,
        host: "127.0.0.1",
        proxy: { server: proxy },
        args: [
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ],
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "/tmp",
          PLAYWRIGHT_BROWSERS_PATH:
            process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/ms-playwright",
        },
      });
      launchDone = true;
      if (ended) {
        await browser.kill();
        busy = false;
        return;
      }
      const endpoint = new URL(browser.wsEndpoint());
      upstream = net.createConnection({
        host: "127.0.0.1",
        port: Number(endpoint.port),
      });
      upstream.once("error", () => {
        void cleanup();
      });
      upstream.once("close", () => {
        void cleanup();
      });
      upstream.once("connect", () => {
        if (ended) {
          upstream?.destroy();
          return;
        }
        const headers = Object.entries(request.headers)
          .filter(([key]) => key !== "authorization" && key !== "host")
          .map(
            ([key, value]) =>
              `${key}: ${Array.isArray(value) ? value.join(", ") : value}`,
          );
        upstream!.write(
          `GET ${endpoint.pathname} HTTP/1.1\r\nHost: 127.0.0.1:${endpoint.port}\r\n${headers.join("\r\n")}\r\n\r\n`,
        );
        if (head.length) upstream!.write(head);
        client.pipe(upstream!);
        upstream!.pipe(client);
        client.resume();
      });
    } catch {
      launchDone = true;
      void cleanup();
      if (ended) busy = false;
    }
  })();
});
server.listen(Number(process.env.PORT ?? 3105), process.env.HOST ?? "0.0.0.0");
process.on("SIGTERM", () => server.close());
