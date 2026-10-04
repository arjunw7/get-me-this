import { ExtractionError } from "./errors";
import { amazonAsin, isAmazonProductUrl } from "./amazon-product";
import { parseDestinationUrl } from "./url-policy";
const cdnHosts = new Set([
  "m.media-amazon.com",
  "images-eu.ssl-images-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images-fe.ssl-images-amazon.com",
]);
export function amazonTarget(value: unknown): URL {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ExtractionError("unsupported_content");
  const fields = value as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 2 ||
    typeof fields.marketplace !== "string" ||
    typeof fields.asin !== "string" ||
    !/^[A-Z0-9]{10}$/u.test(fields.asin) ||
    !/^[a-z.]+$/u.test(fields.marketplace)
  )
    throw new ExtractionError("unsupported_content");
  const url = new URL(
    `https://www.${fields.marketplace}/dp/${fields.asin}?th=1&psc=1`,
  );
  if (!isAmazonProductUrl(url.href))
    throw new ExtractionError("unsupported_content");
  return url;
}
export function amazonResourceAllowed(raw: string, target: URL): boolean {
  try {
    const url = parseDestinationUrl(raw);
    return (
      url.protocol === "https:" &&
      (url.hostname === target.hostname || cdnHosts.has(url.hostname))
    );
  } catch {
    return false;
  }
}
export function amazonDocumentAllowed(raw: string, target: URL): boolean {
  try {
    const url = parseDestinationUrl(raw);
    return (
      url.protocol === "https:" &&
      url.hostname === target.hostname &&
      amazonAsin(url) === amazonAsin(target)
    );
  } catch {
    return false;
  }
}
export function amazonBrokerHostAllowed(hostname: string): boolean {
  return (
    cdnHosts.has(hostname) ||
    isAmazonProductUrl(`https://${hostname}/dp/B000000000`)
  );
}
