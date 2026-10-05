import "server-only";
import { extractAmazonProduct } from "./amazon-browser";
import { isAmazonUrl } from "./amazon-product";
import { ExtractionError } from "./errors";
import { extractProductLink as scrapeProduct } from "./firecrawl";
import { extractBrowserProduct, type BrowserOptions } from "./product-browser";
import type { ExtractionResult } from "./result";

export async function extractProductLink(
  sourceUrl: string,
  options: BrowserOptions = {},
) {
  if (options.signal?.aborted) throw new ExtractionError("timeout");
  if (isAmazonUrl(sourceUrl)) return extractAmazonProduct(sourceUrl, options);
  const deadline = Math.min(
    options.deadline ?? Date.now() + 35000,
    Date.now() + 35000,
  );
  let partial: ExtractionResult | undefined;
  try {
    partial = await scrapeProduct(sourceUrl, {
      ...options,
      deadline: Math.min(deadline, Date.now() + 8000),
    });
    if (partial.title && partial.candidateImageUrls.length) return partial;
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error instanceof ExtractionError &&
        ["invalid_url", "blocked_url"].includes(error.code))
    )
      throw error;
  }
  if (options.signal?.aborted || deadline <= Date.now())
    throw new ExtractionError("timeout");
  try {
    return await extractBrowserProduct(sourceUrl, { ...options, deadline });
  } catch (error) {
    if (partial && !options.signal?.aborted) return partial;
    throw error;
  }
}
