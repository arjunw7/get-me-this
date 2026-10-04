import "server-only";

import { ExtractionError } from "./errors";
import { decimalToMinorUnits } from "./money";
import {
  normalizePlainText,
  validateExtractionResult,
  type ExtractionResult,
} from "./result";
import { resolvePinnedAddress, type TransportDependencies } from "./transport";
import { destinationHostname, parseDestinationUrl } from "./url-policy";

const API_URL = "https://api.firecrawl.dev/v2/scrape";
const MAX_RESPONSE_BYTES = 256 * 1024;
const PROVIDER_TIMEOUT_MS = 30_000;

export type ProviderOptions = {
  readonly signal?: AbortSignal;
  readonly deadline?: number;
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly transport?: TransportDependencies;
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

export async function readProviderJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new ExtractionError("unsupported_content");
  }
  const declared = response.headers.get("content-length");
  if (declared && Number(declared) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ExtractionError("too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ExtractionError("extraction_failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) throw new ExtractionError("timeout");
      const { done, value } = await reader.read();
      if (signal.aborted) throw new ExtractionError("timeout");
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ExtractionError("too_large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function confirmsMoney(
  markdown: unknown,
  money: { amountMinor: string; currency: string },
): boolean {
  if (typeof markdown !== "string") return false;
  const evidence: { amountMinor: string; currency: string }[] = [];
  const add = (amount: string, currency: string) => {
    const parsed = decimalToMinorUnits(amount.replaceAll(",", ""), currency);
    if (parsed) evidence.push(parsed);
  };
  for (const match of markdown.matchAll(
    /\b(AUD|CAD|CHF|EUR|GBP|INR|JPY|NZD|SGD|USD)\s*[:$₹€£]?\s*(\d[\d,]*(?:\.\d+)?)/gu,
  ))
    add(match[2]!, match[1]!);
  for (const match of markdown.matchAll(
    /(\d[\d,]*(?:\.\d+)?)\s*(AUD|CAD|CHF|EUR|GBP|INR|JPY|NZD|SGD|USD)\b/gu,
  ))
    add(match[1]!, match[2]!);
  const symbols: Record<string, string> = {
    "₹": "INR",
    "€": "EUR",
    "£": "GBP",
  };
  for (const match of markdown.matchAll(/([₹€£])\s*(\d[\d,]*(?:\.\d+)?)/gu))
    add(match[2]!, symbols[match[1]!]!);
  // Symbols validate a proposal; they never supply a missing currency.
  // A bare dollar/yen sign cannot disambiguate ISO currencies.
  return (
    evidence.some(
      (item) =>
        item.amountMinor === money.amountMinor &&
        item.currency === money.currency,
    ) &&
    !evidence.some(
      (item) =>
        item.amountMinor === money.amountMinor &&
        item.currency !== money.currency,
    )
  );
}

function productId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "nykaa.com")
    return /\/p\/(\d+)(?:\/|$)/u.exec(url.pathname)?.[1] ?? null;
  if (host === "etsy.com")
    return /\/listing\/(\d+)(?:\/|$)/u.exec(url.pathname)?.[1] ?? null;
  if (host === "ikea.com")
    return /-(\d{8})\/?$/u.exec(url.pathname)?.[1] ?? null;
  if (host === "amazon.in")
    return (
      /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/iu
        .exec(url.pathname)?.[1]
        ?.toUpperCase() ?? null
    );
  if (host === "flipkart.com") return url.searchParams.get("pid");
  return null;
}

function proposal(source: URL, value: unknown): ExtractionResult {
  const envelope = record(value);
  const data = record(envelope.data);
  const metadata = record(data.metadata);
  const product = record(data.product);
  // API success alone can represent a retailer's block/interstitial page.
  if (
    envelope.success !== true ||
    typeof metadata.statusCode !== "number" ||
    metadata.statusCode < 200 ||
    metadata.statusCode >= 300 ||
    typeof product.title !== "string" ||
    !product.title.trim()
  ) {
    throw new ExtractionError("extraction_failed");
  }
  const productUrl =
    typeof product.url === "string" ? parseDestinationUrl(product.url) : source;
  const sourceId = productId(source);
  if (
    sourceId &&
    (productId(productUrl) !== sourceId ||
      source.hostname.replace(/^www\./, "") !==
        productUrl.hostname.replace(/^www\./, ""))
  ) {
    throw new ExtractionError("extraction_failed");
  }
  const variants = Array.isArray(product.variants)
    ? product.variants.slice(0, 100)
    : [];
  const images: string[] = [];
  const seen = new Set<string>();
  const admitImage = (raw: unknown) => {
    if (typeof raw !== "string") return;
    try {
      const candidate = parseDestinationUrl(new URL(raw, productUrl).href);
      if (/\/(?:null|undefined|false)(?:\/|$)/u.test(candidate.pathname))
        return;
      if (!seen.has(candidate.href) && images.length < 8) {
        seen.add(candidate.href);
        images.push(candidate.href);
      }
    } catch {
      /* Invalid candidates stay out of the editable proposal. */
    }
  };
  for (const variant of variants) {
    const rawImages = record(variant).images;
    if (!Array.isArray(rawImages)) continue;
    for (const image of rawImages.slice(0, 32)) {
      admitImage(record(image).url);
    }
  }
  if (images.length === 0 && typeof data.markdown === "string") {
    const title = (normalizePlainText(product.title, 200) ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    for (const match of data.markdown.matchAll(
      /!\[([^\]]{0,500})\]\((https?:\/\/[^\s)]+)(?: "[^"]*")?\)/gu,
    )) {
      const alt = match[1]!
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
      if (title.length >= 5 && alt.includes(title)) admitImage(match[2]);
    }
  }
  // Do not choose an arbitrary variant, range minimum or original/list price.
  const price = variants.length === 1 ? record(record(variants[0]).price) : {};
  const amount = price.amount;
  const money =
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= Number.MAX_SAFE_INTEGER
      ? decimalToMinorUnits(String(amount), price.currency)
      : null;
  const result = validateExtractionResult({
    sourceUrl: source.href,
    title: product.title,
    retailer: productUrl.hostname.replace(/^www\./, ""),
    ...(money && confirmsMoney(data.markdown, money)
      ? {
          originalAmountMinor: money.amountMinor,
          originalCurrency: money.currency,
        }
      : {}),
    candidateImageUrls: images,
  });
  if (!result.title) throw new ExtractionError("extraction_failed");
  return result;
}

/** Managed product acquisition; results never save an item automatically. */
export async function extractProductLink(
  sourceUrl: string,
  options: ProviderOptions = {},
): Promise<ExtractionResult> {
  const source = parseDestinationUrl(sourceUrl);
  const key = options.apiKey ?? process.env.FIRECRAWL_API_KEY;
  if (!key?.trim()) throw new ExtractionError("unavailable");
  const remaining = Math.min(
    PROVIDER_TIMEOUT_MS,
    (options.deadline ?? Date.now() + PROVIDER_TIMEOUT_MS) - Date.now(),
  );
  if (remaining <= 0 || options.signal?.aborted)
    throw new ExtractionError("timeout");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, remaining);
  try {
    // This preflight rejects private DNS answers before disclosing the URL.
    // Firecrawl owns subsequent retailer DNS, rendering and redirect policy.
    await resolvePinnedAddress(
      destinationHostname(source),
      options.transport ?? {},
      controller.signal,
      Date.now() + remaining,
    );
    const response = await (options.fetch ?? fetch)(API_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: source.href,
        formats: ["product", "markdown"],
        parsers: [],
        timeout: Math.max(1000, Math.floor(remaining - 1000)),
        location: { country: "IN", languages: ["en-IN"] },
        proxy: "auto",
        skipTlsVerification: false,
        maxAge: 0,
        storeInCache: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ExtractionError("unavailable");
    }
    return proposal(
      source,
      await readProviderJson(response, controller.signal),
    );
  } catch (error) {
    if (controller.signal.aborted) throw new ExtractionError("timeout");
    if (error instanceof ExtractionError) throw error;
    // Neither vendor messages nor the key/URL enter responses or logs.
    throw new ExtractionError("extraction_failed");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
