import "server-only";
import { ExtractionError } from "./errors";
import { readProviderJson, type ProviderOptions } from "./firecrawl";
import { productBrowserProposal } from "./product-browser-result";
import { resolvePinnedAddress } from "./transport";
import { destinationHostname, parseDestinationUrl } from "./url-policy";
export type BrowserOptions = ProviderOptions & {
  readonly browserWorkerUrl?: string;
  readonly browserWorkerSecret?: string;
};
export async function extractBrowserProduct(
  raw: string,
  options: BrowserOptions = {},
) {
  const source = parseDestinationUrl(raw);
  const target = new URL(source);
  target.protocol = "https:";
  const configured =
    options.browserWorkerUrl ??
    (process.env.PRODUCT_BROWSER_URL || undefined) ??
    process.env.AMAZON_BROWSER_URL;
  const secret =
    options.browserWorkerSecret ??
    (process.env.PRODUCT_BROWSER_SECRET || undefined) ??
    process.env.AMAZON_BROWSER_SECRET;
  if (!configured || !secret || secret.length < 32)
    throw new ExtractionError("unavailable");
  let endpoint: URL;
  try {
    endpoint = new URL(configured);
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      endpoint.search ||
      !["/extract", "/extract-product"].includes(endpoint.pathname) ||
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
    endpoint.pathname = "/extract-product";
  } catch {
    throw new ExtractionError("unavailable");
  }
  const deadline = Math.min(
    options.deadline ?? Date.now() + 27000,
    Date.now() + 27000,
  );
  if (options.signal?.aborted || deadline <= Date.now())
    throw new ExtractionError("timeout");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, deadline - Date.now());
  try {
    await resolvePinnedAddress(
      destinationHostname(target),
      options.transport ?? {},
      controller.signal,
      deadline,
    );
    const response = await (options.fetch ?? fetch)(endpoint.href, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: target.href }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ExtractionError("unavailable");
    }
    return productBrowserProposal(
      source,
      await readProviderJson(response, controller.signal, 16384),
    );
  } catch (error) {
    if (controller.signal.aborted) throw new ExtractionError("timeout");
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("extraction_failed");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
