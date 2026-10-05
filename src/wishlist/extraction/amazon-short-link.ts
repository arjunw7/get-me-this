import "server-only";
import { ExtractionError } from "./errors";
import { isAmazonProductUrl, isAmazonUrl } from "./amazon-product";
import { guardedRequest, type TransportDependencies } from "./transport";

/** Reuse the existing pinned, bounded transport; never follow foreign retailers. */
export async function resolveAmazonShortLink(
  source: URL,
  dependencies: TransportDependencies,
  options: { readonly signal: AbortSignal; readonly deadline: number },
): Promise<URL> {
  if (source.protocol !== "https:") throw new ExtractionError("blocked_url");
  const response = await guardedRequest(
    source.href,
    "html",
    {
      ...dependencies,
      resolve: async (hostname, signal) => {
        if (!isAmazonUrl(`https://${hostname}/`))
          throw new ExtractionError("blocked_url");
        if (dependencies.resolve) return dependencies.resolve(hostname, signal);
        const { promises: dns } = await import("node:dns");
        return dns.lookup(hostname, { all: true, verbatim: true });
      },
    },
    { ...options, allowHtmlPrefix: (url) => isAmazonProductUrl(url.href) },
  );
  if (!isAmazonProductUrl(response.finalUrl))
    throw new ExtractionError("unsupported_content");
  return new URL(response.finalUrl);
}
