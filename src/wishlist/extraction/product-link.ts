import "server-only";
import { extractAmazonProduct, isAmazonProductUrl } from "./amazon-browser";
import {
  extractProductLink as scrapeProduct,
  type ProviderOptions,
} from "./firecrawl";
export function extractProductLink(
  sourceUrl: string,
  options: ProviderOptions = {},
) {
  return isAmazonProductUrl(sourceUrl)
    ? extractAmazonProduct(sourceUrl, options)
    : scrapeProduct(sourceUrl, options);
}
