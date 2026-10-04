import { fulfillWithoutRedirects } from "./route";
import { chromium, type Browser, type BrowserServer } from "playwright-core";
import { createBrowserEgress } from "../../src/wishlist/extraction/browser-egress";
import { createAmazonWorker } from "../../src/wishlist/extraction/amazon-worker-http";
import {
  amazonBrokerHostAllowed,
  amazonDocumentAllowed,
  amazonResourceAllowed,
} from "../../src/wishlist/extraction/amazon-worker-protocol";
import {
  amazonBrowserCode,
  amazonProposal,
} from "../../src/wishlist/extraction/amazon-product";
import { ExtractionError } from "../../src/wishlist/extraction/errors";
const secret = process.env.AMAZON_BROWSER_SECRET;
if (!secret || secret.length < 32)
  throw new Error("Amazon worker authentication is missing");
const egress = createBrowserEgress({ allowHost: amazonBrokerHostAllowed });
egress.server.listen(8081, "127.0.0.1");
const failClosed = () => {
  server.close();
  egress.shutdown();
  // Container restart also terminates any orphaned Chromium processes.
  process.exit(1);
};
const shutdownController = new AbortController();
let terminateActive: (() => Promise<void>) | undefined;
const server = createAmazonWorker(secret, async (target, requestSignal) => {
  const signal = AbortSignal.any([requestSignal, shutdownController.signal]);
  let owner: BrowserServer | undefined;
  let browser: Browser | undefined;
  let closing: Promise<void> | undefined;
  const terminate = () => {
    // Do not memoize cleanup before startup assigns the browser owner.
    if (!owner) return Promise.resolve();
    return (closing ??= (async () => {
      try {
        await owner?.kill();
      } finally {
        await browser?.close().catch(() => undefined);
      }
    })());
  };
  terminateActive = terminate;
  const abort = () => {
    void terminate().catch(() => {
      failClosed();
    });
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new ExtractionError("timeout");
    owner = await chromium.launchServer({
      timeout: 5000,
      headless: true,
      chromiumSandbox: true,
      host: "127.0.0.1",
      proxy: { server: "http://127.0.0.1:8081" },
      args: [
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      ],
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        PLAYWRIGHT_BROWSERS_PATH:
          process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/ms-playwright",
      },
    });
    // Abort may arrive during startup; kill the newly created process too.
    if (signal.aborted) {
      await owner.kill();
      throw new ExtractionError("timeout");
    }
    browser = await chromium.connect(owner.wsEndpoint(), { timeout: 2000 });
    const context = await browser.newContext({
      javaScriptEnabled: false,
      locale: "en-IN",
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
    });
    const page = await context.newPage();
    let requests = 0;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const document = request.resourceType() === "document";
      if (
        ++requests > 80 ||
        request.method() !== "GET" ||
        !document ||
        !amazonResourceAllowed(request.url(), target) ||
        ["script", "xhr", "fetch", "media"].includes(request.resourceType()) ||
        (document &&
          (request.frame() !== page.mainFrame() ||
            !amazonDocumentAllowed(request.url(), target)))
      ) {
        await route.abort();
        return;
      }
      await fulfillWithoutRedirects(route);
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    let output: unknown;
    const program = new Function(
      "page",
      "console",
      `return(async()=>{${amazonBrowserCode(target.href)}})()`,
    );
    await program(page, {
      log: (text: unknown) => {
        if (typeof text !== "string" || Buffer.byteLength(text) > 16384)
          throw new ExtractionError("too_large");
        output = JSON.parse(text) as unknown;
      },
    });
    if (signal.aborted) throw new ExtractionError("timeout");
    amazonProposal(target, output);
    return output;
  } finally {
    signal.removeEventListener("abort", abort);
    // Failure to terminate must stop this container rather than admit another job.
    let cleanupTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      terminate(),
      new Promise<never>((_, reject) => {
        cleanupTimer = setTimeout(
          () => reject(new Error("Browser cleanup exceeded deadline")),
          3000,
        );
      }),
    ])
      .catch(() => {
        failClosed();
      })
      .finally(() => {
        if (cleanupTimer) clearTimeout(cleanupTimer);
      });
    terminateActive = undefined;
  }
});
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
const shutdown = () => {
  shutdownController.abort();
  server.close();
  void terminateActive?.().catch(failClosed);
  egress.shutdown();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
