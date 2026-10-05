import "server-only";
import { ExtractionError } from "./errors";
import { readProviderJson, type ProviderOptions } from "./firecrawl";
import { resolveAmazonShortLink } from "./amazon-short-link";
import { ExtractionLimiter } from "./limiter";
import { resolvePinnedAddress } from "./transport";
import { destinationHostname, parseDestinationUrl } from "./url-policy";
import {
  amazonAsin,
  amazonProposal,
  isAmazonProductUrl,
  isAmazonShortUrl,
} from "./amazon-product";
export { amazonBrowserCode, isAmazonProductUrl } from "./amazon-product";
const starts = new ExtractionLimiter({
  processRate: 10,
  userRate: 10,
  userConcurrency: 1,
  processConcurrency: 1,
});
type Options = ProviderOptions & {
  readonly workerUrl?: string;
  readonly workerSecret?: string;
  readonly limiter?: ExtractionLimiter;
};
export async function extractAmazonProduct(raw: string, options: Options = {}) {
  const source = parseDestinationUrl(raw);
  if (!isAmazonProductUrl(source.href) && !isAmazonShortUrl(source.href))
    throw new ExtractionError("unsupported_content");
  const workerUrl = options.workerUrl ?? process.env.AMAZON_BROWSER_URL;
  const secret = options.workerSecret ?? process.env.AMAZON_BROWSER_SECRET;
  if (!workerUrl || !secret || secret.length < 32)
    throw new ExtractionError("unavailable");
  try {
    const endpoint = new URL(workerUrl);
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      endpoint.search ||
      endpoint.pathname !== "/extract" ||
      (endpoint.protocol !== "https:" &&
        !(
          endpoint.protocol === "http:" &&
          [
            "127.0.0.1",
            "[::1]",
            "localhost",
            "browser",
            "amazon-browser",
          ].includes(endpoint.hostname)
        ))
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
  const deadline = Date.now() + remaining;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, remaining);
  let permit: ReturnType<typeof starts.acquire> | undefined;
  try {
    permit = (options.limiter ?? starts).acquire("amazon");
    if (!permit.ok) throw new ExtractionError("unavailable");
    const target = isAmazonShortUrl(source.href)
      ? await resolveAmazonShortLink(source, options.transport ?? {}, {
          signal: controller.signal,
          deadline: Math.min(deadline, Date.now() + 8000),
        })
      : source;
    await resolvePinnedAddress(
      destinationHostname(target),
      options.transport ?? {},
      controller.signal,
      deadline,
    );
    const response = await (options.fetch ?? fetch)(workerUrl, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        marketplace: target.hostname.replace(/^www\./u, ""),
        asin: amazonAsin(target),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ExtractionError("unavailable");
    }
    const value = await readProviderJson(response, controller.signal, 16384);
    return { ...amazonProposal(target, value), sourceUrl: source.href };
  } catch (error) {
    if (controller.signal.aborted) throw new ExtractionError("timeout");
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("extraction_failed");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (permit?.ok) permit.permit.release();
  }
}
