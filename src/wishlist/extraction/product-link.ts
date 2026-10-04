import "server-only";
import { extractAmazonProduct } from "./amazon-browser";
import { isAmazonUrl } from "./amazon-product";
import {
  extractProductLink as scrapeProduct,
  type ProviderOptions,
} from "./firecrawl";
export function extractProductLink(
  sourceUrl: string,
  options: ProviderOptions = {},
) {
  return isAmazonUrl(sourceUrl)
    ? extractAmazonProduct(sourceUrl, options)
    : scrapeProduct(sourceUrl, options);
}
