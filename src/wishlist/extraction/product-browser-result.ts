import { confirmsMoney } from "./product-money-evidence";
import { ExtractionError } from "./errors";
import { decimalToMinorUnits } from "./money";
import { validateExtractionResult, type ExtractionResult } from "./result";
import { parseDestinationUrl } from "./url-policy";
import { sameProduct } from "./product-browser-protocol";
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function productBrowserProposal(
  source: URL,
  value: unknown,
): ExtractionResult {
  const data = object(value);
  if (
    typeof data.status !== "number" ||
    data.status < 200 ||
    data.status >= 300 ||
    data.blocked !== false ||
    typeof data.finalUrl !== "string"
  )
    throw new ExtractionError("extraction_failed");
  const final = parseDestinationUrl(data.finalUrl);
  if (final.protocol !== "https:" || !sameProduct(source, final))
    throw new ExtractionError("extraction_failed");
  if (
    typeof data.canonical === "string" &&
    !sameProduct(
      source,
      parseDestinationUrl(new URL(data.canonical, final).href),
    )
  )
    throw new ExtractionError("extraction_failed");
  let structuredMatches = true;
  if (typeof data.productUrl === "string") {
    try {
      structuredMatches = sameProduct(
        source,
        parseDestinationUrl(new URL(data.productUrl, final).href),
      );
    } catch {
      structuredMatches = false;
    }
  }
  // A bad structured product cannot supply fields; the independently matching
  // final/canonical page may still offer its own visible title and Open Graph image.
  const title = structuredMatches ? data.title : data.pageTitle;
  const rawImages = structuredMatches ? data.images : [data.pageImage];
  const money = structuredMatches
    ? decimalToMinorUnits(data.price, data.currency)
    : null;
  const body = typeof data.body === "string" ? data.body.slice(0, 16000) : "";
  const visibleMoney = money && confirmsMoney(body, money);
  const images: string[] = [];
  if (Array.isArray(rawImages))
    for (const raw of rawImages.slice(0, 8)) {
      if (typeof raw !== "string") continue;
      try {
        const url = parseDestinationUrl(new URL(raw, final).href);
        if (!images.includes(url.href)) images.push(url.href);
      } catch {
        /* Unsafe images are omitted. */
      }
    }
  const result = validateExtractionResult({
    sourceUrl: source.href,
    title,
    retailer: final.hostname.replace(/^www\./u, ""),
    candidateImageUrls: images,
    ...(visibleMoney && money
      ? {
          originalAmountMinor: money.amountMinor,
          originalCurrency: money.currency,
        }
      : {}),
  });
  if (!result.title) throw new ExtractionError("extraction_failed");
  return result;
}
