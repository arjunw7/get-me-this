import { ExtractionError } from "./errors";
import { parseDestinationUrl } from "./url-policy";
import { isAmazonUrl } from "./amazon-product";

export function productBrowserTarget(value: unknown): URL {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ExtractionError("unsupported_content");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 1 || typeof data.url !== "string")
    throw new ExtractionError("unsupported_content");
  const target = parseDestinationUrl(data.url);
  if (target.protocol !== "https:" || isAmazonUrl(target.href))
    throw new ExtractionError("unsupported_content");
  return target;
}

/** HTTPS only. Public DNS and connected-peer checks belong to the broker. */
export function productResourceAllowed(raw: string): boolean {
  try {
    return parseDestinationUrl(raw).protocol === "https:";
  } catch {
    return false;
  }
}

export function sameProduct(source: URL, candidate: URL): boolean {
  const host = (url: URL) => url.hostname.replace(/^www\./u, "");
  if (host(source) !== host(candidate)) return false;
  const id = (url: URL): string | null => {
    switch (host(url)) {
      case "nykaa.com":
        return /\/p\/(\d+)(?:\/|$)/u.exec(url.pathname)?.[1] ?? null;
      case "etsy.com":
        return /\/listing\/(\d+)(?:\/|$)/u.exec(url.pathname)?.[1] ?? null;
      case "ikea.com":
        return /-(\d{8})\/?$/u.exec(url.pathname)?.[1] ?? null;
      case "flipkart.com":
        return url.searchParams.get("pid");
      default:
        return null;
    }
  };
  const query = (url: URL) => {
    const parameters = new URLSearchParams(url.search);
    for (const key of Array.from(parameters.keys()))
      if (/^utm_/iu.test(key) || ["gclid", "fbclid", "msclkid"].includes(key))
        parameters.delete(key);
    parameters.sort();
    return parameters.toString();
  };
  if (query(source) !== query(candidate)) return false;
  const expected = id(source);
  return expected
    ? id(candidate) === expected
    : source.pathname.replace(/\/$/u, "") ===
        candidate.pathname.replace(/\/$/u, "");
}

/** Only explicit, bounded document navigation may start; page scripts cannot redirect. */
export function createProductRequestPolicy(target: URL) {
  let admittedDocument = target.href;
  let documentStarted = false;
  let documents = 0;
  let requests = 0;
  return {
    navigate(url: URL) {
      if (++documents > 4 || !productResourceAllowed(url.href))
        throw new ExtractionError("blocked_url");
      admittedDocument = url.href;
      documentStarted = false;
    },
    admit(raw: string, method: string, resource: string, mainFrame: boolean) {
      if (
        ++requests > 160 ||
        method !== "GET" ||
        !productResourceAllowed(raw) ||
        ["image", "font", "media", "other"].includes(resource)
      )
        return false;
      if (resource === "document") {
        if (!mainFrame || documentStarted || raw !== admittedDocument)
          return false;
        documentStarted = true;
      }
      return true;
    },
  };
}
