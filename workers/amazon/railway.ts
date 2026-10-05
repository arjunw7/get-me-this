import { fulfillProductResource } from "./product-route";
import { readProductDom } from "../../src/wishlist/extraction/product-browser-dom";
import {
  createProductRequestPolicy,
  productResourceAllowed,
} from "../../src/wishlist/extraction/product-browser-protocol";
import { productBrowserProposal } from "../../src/wishlist/extraction/product-browser-result";
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
const productEgress = createBrowserEgress();
productEgress.server.listen(8082, "127.0.0.1");
const failClosed = () => {
  server.close();
  egress.shutdown();
  productEgress.shutdown();
  // Container restart also terminates any orphaned Chromium processes.
  process.exit(1);
};
const shutdownController = new AbortController();
let terminateActive: (() => Promise<void>) | undefined;
const run = async (
  target: URL,
  requestSignal: AbortSignal,
  generic = false,
) => {
  const signal = AbortSignal.any([requestSignal, shutdownController.signal]);
  let phase = "launch";
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
      proxy: {
        server: generic ? "http://127.0.0.1:8082" : "http://127.0.0.1:8081",
      },
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
    phase = "connect";
    browser = await chromium.connect(owner.wsEndpoint(), { timeout: 2000 });
    phase = "context";
    const context = await browser.newContext({
      javaScriptEnabled: generic,
      locale: "en-IN",
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
    });
    const page = await context.newPage();
    let requests = 0;
    let pendingRedirect: string | undefined;
    const productPolicy = createProductRequestPolicy(target);
    context.on("page", (other) => {
      if (other !== page) void other.close();
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const document = request.resourceType() === "document";
      if (generic) {
        if (
          !productPolicy.admit(
            request.url(),
            request.method(),
            request.resourceType(),
            request.frame() === page.mainFrame(),
          )
        ) {
          await route.abort();
          return;
        }
      } else if (
        ++requests > 80 ||
        request.method() !== "GET" ||
        !document ||
        !amazonResourceAllowed(request.url(), target) ||
        request.frame() !== page.mainFrame() ||
        !amazonDocumentAllowed(request.url(), target)
      ) {
        await route.abort();
        return;
      }
      if (generic)
        await fulfillProductResource(
          route,
          document
            ? (url) => {
                pendingRedirect = url;
              }
            : undefined,
        );
      else await fulfillWithoutRedirects(route);
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    let output: unknown;
    phase = "acquire";
    if (generic) {
      let current = target;
      // Automatic redirects are refused by acquisition. Follow document redirects
      // explicitly so each next URL re-enters routing and the public pinned broker.
      let response;
      for (let redirects = 0; ; redirects++) {
        pendingRedirect = undefined;
        productPolicy.navigate(current);
        response = await page.goto(current.href, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        if (!pendingRedirect) break;
        if (redirects >= 3) throw new ExtractionError("unavailable");
        current = new URL(pendingRedirect, current);
        if (!productResourceAllowed(current.href))
          throw new ExtractionError("blocked_url");
      }
      await page.waitForTimeout(1200);
      const metadata = await page.evaluate(readProductDom);
      output = {
        ...metadata,
        finalUrl: page.url(),
        status: response?.status() ?? 0,
      };
      // Preserve useful name/images even when visible text cannot fit the API.
      if (Buffer.byteLength(JSON.stringify(output)) > 16384) {
        metadata.body = "";
        while (
          metadata.images.length &&
          Buffer.byteLength(
            JSON.stringify({
              ...metadata,
              finalUrl: page.url(),
              status: response?.status() ?? 0,
            }),
          ) > 16384
        )
          metadata.images.pop();
        output = {
          ...metadata,
          finalUrl: page.url(),
          status: response?.status() ?? 0,
        };
      }
    } else {
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
    }
    if (signal.aborted) throw new ExtractionError("timeout");
    phase = "validate";
    if (generic) productBrowserProposal(target, output);
    else amazonProposal(target, output);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const category = [
      ["namespace", /operation not permitted|namespace|no usable sandbox/i],
      ["proxy", /ERR_PROXY|ERR_TUNNEL/i],
      ["dns", /ERR_NAME_NOT_RESOLVED/i],
      ["tls", /ERR_CERT|certificate/i],
      ["timeout", /timeout|timed out/i],
      ["closed", /has been closed|Target closed/i],
    ] as const;
    // Fixed identifiers only: never browser messages, URLs, session IDs or keys.
    console.warn(
      JSON.stringify({
        event: "amazon-worker-failed",
        phase,
        category:
          category.find(([, pattern]) => pattern.test(message))?.[0] ??
          "unknown",
      }),
    );
    throw error;
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
};
const server = createAmazonWorker(
  secret,
  (target, signal) => run(target, signal),
  (target, signal) => run(target, signal, true),
);
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
const shutdown = () => {
  shutdownController.abort();
  server.close();
  void terminateActive?.().catch(failClosed);
  egress.shutdown();
  productEgress.shutdown();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
