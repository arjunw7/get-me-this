import "server-only";
import { chromium, type Browser } from "playwright-core";
import { ExtractionError } from "./errors";
import { type ProviderOptions } from "./firecrawl";
import { ExtractionLimiter } from "./limiter";
import { resolvePinnedAddress } from "./transport";
import { destinationHostname, parseDestinationUrl } from "./url-policy";
import {
  amazonAsin,
  amazonBrowserCode,
  amazonProposal,
  isAmazonProductUrl,
} from "./amazon-product";
export { amazonBrowserCode, isAmazonProductUrl } from "./amazon-product";
const starts = new ExtractionLimiter({
  processRate: 10,
  processConcurrency: 1,
});
type Options = ProviderOptions & {
  readonly workerUrl?: string;
  readonly workerSecret?: string;
  readonly limiter?: ExtractionLimiter;
  readonly connect?: typeof chromium.connect;
};
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ExtractionError("timeout"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
async function close(browser: Browser): Promise<void> {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      timer.unref();
    }),
  ]);
}
export async function extractAmazonProduct(raw: string, options: Options = {}) {
  const source = parseDestinationUrl(raw);
  if (!isAmazonProductUrl(source.href))
    throw new ExtractionError("unsupported_content");
  const workerUrl = options.workerUrl ?? process.env.AMAZON_BROWSER_WS_URL;
  const secret = options.workerSecret ?? process.env.AMAZON_BROWSER_SECRET;
  if (!workerUrl || !secret || secret.length < 32)
    throw new ExtractionError("unavailable");
  try {
    const endpoint = new URL(workerUrl);
    if (
      !["ws:", "wss:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      endpoint.search ||
      endpoint.pathname !== "/session" ||
      (endpoint.protocol === "ws:" &&
        ![
          "127.0.0.1",
          "[::1]",
          "localhost",
          "browser",
          "amazon-browser",
        ].includes(endpoint.hostname) &&
        !endpoint.hostname.endsWith(".railway.internal"))
    )
      throw new Error();
  } catch {
    throw new ExtractionError("unavailable");
  }
  const remaining = Math.min(
    30000,
    (options.deadline ?? Date.now() + 30000) - Date.now(),
  );
  if (remaining < 1000 || options.signal?.aborted)
    throw new ExtractionError("timeout");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, remaining);
  let browser: Browser | undefined;
  let permit: ReturnType<typeof starts.acquire> | undefined;
  try {
    await resolvePinnedAddress(
      destinationHostname(source),
      options.transport ?? {},
      controller.signal,
      Date.now() + remaining,
    );
    permit = (options.limiter ?? starts).acquire("amazon");
    if (!permit.ok) throw new ExtractionError("unavailable");
    const connecting = (options.connect ?? chromium.connect.bind(chromium))(
      workerUrl,
      {
        timeout: Math.min(5000, remaining),
        headers: { authorization: `Bearer ${secret}` },
      },
    );
    void connecting.then(
      async (value) => {
        if (controller.signal.aborted) await close(value);
      },
      () => undefined,
    );
    browser = await raceAbort(connecting, controller.signal);
    const context = await raceAbort(
      browser.newContext({
        locale: "en-IN",
        viewport: { width: 1440, height: 1000 },
        serviceWorkers: "block",
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
      }),
      controller.signal,
    );
    let requests = 0;
    await context.route("**/*", async (route) => {
      try {
        parseDestinationUrl(route.request().url());
        if (++requests > 120) throw new Error();
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await raceAbort(context.newPage(), controller.signal);
    // Only a fixed retailer host and selected ASIN go to the browser; no
    // pasted query, credentials, fragment or executable input is forwarded.
    const canonical = `https://www.${source.hostname.replace(/^www\./u, "")}/dp/${amazonAsin(source)}?th=1&psc=1`;
    let output: unknown;
    const program = new Function(
      "page",
      "console",
      `return (async()=>{${amazonBrowserCode(canonical)}})()`,
    );
    await raceAbort(
      program(page, {
        log: (text: unknown) => {
          if (typeof text !== "string" || Buffer.byteLength(text) > 16384)
            throw new ExtractionError("too_large");
          output = JSON.parse(text) as unknown;
        },
      }) as Promise<void>,
      controller.signal,
    );
    return amazonProposal(source, output);
  } catch (error) {
    if (controller.signal.aborted) throw new ExtractionError("timeout");
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("extraction_failed");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (browser) await close(browser);
    if (permit?.ok) permit.permit.release();
  }
}
