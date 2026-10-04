import "server-only";
import { ExtractionError } from "./errors";
import { readProviderJson, type ProviderOptions } from "./firecrawl";
import { ExtractionLimiter } from "./limiter";
import { decimalToMinorUnits } from "./money";
import { validateExtractionResult, type ExtractionResult } from "./result";
import { destinationHostname, parseDestinationUrl } from "./url-policy";
import { resolvePinnedAddress } from "./transport";

const API = "https://api.firecrawl.dev/v2/interact";
const hosts = new Set([
  "amazon.in",
  "amazon.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.ca",
  "amazon.com.au",
  "amazon.co.jp",
  "amazon.com.br",
  "amazon.com.mx",
  "amazon.ae",
  "amazon.sa",
  "amazon.sg",
  "amazon.nl",
  "amazon.se",
  "amazon.pl",
  "amazon.com.tr",
  "amazon.com.be",
]);
const starts = new ExtractionLimiter({ processRate: 2, processConcurrency: 2 });
function admitBrowser(): boolean {
  const result = starts.acquire("amazon");
  if (!result.ok) return false;
  result.permit.release();
  return true;
}
function asin(url: URL): string | null {
  return (
    /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/iu
      .exec(url.pathname)?.[1]
      ?.toUpperCase() ?? null
  );
}
export function isAmazonProductUrl(raw: string): boolean {
  try {
    const url = parseDestinationUrl(raw);
    return hosts.has(url.hostname.replace(/^www\./u, "")) && asin(url) !== null;
  } catch {
    return false;
  }
}

/** Static read-only DOM program; the URL is a JSON string, never executable input. */
export function amazonBrowserCode(source: string): string {
  return `await page.setViewportSize({width:1440,height:1000});
await page.setExtraHTTPHeaders({'Accept-Language':'en-IN,en;q=0.9'});
const response=await page.goto(${JSON.stringify(source)},{waitUntil:'domcontentloaded',timeout:18000});
await page.waitForTimeout(1500);
const product=await page.evaluate(()=>{
 const text=(selector)=>document.querySelector(selector)?.textContent?.trim()||null;
 const prices=Array.from(document.querySelectorAll('#corePrice_feature_div .apex-pricetopay-value .a-offscreen, #corePriceDisplay_desktop_feature_div .apex-pricetopay-value .a-offscreen')).map(e=>e.textContent?.trim()).filter(Boolean).slice(0,8);
 const currencies=Array.from(document.querySelectorAll('script')).flatMap(e=>Array.from((e.textContent||'').matchAll(/"currencyInfo"\\s*:\\s*\\{\\s*"code"\\s*:\\s*"([A-Z]{3})"/g),m=>m[1]));
 const unique=Array.from(new Set(currencies));
 return {title:text('#productTitle'),asin:document.querySelector('input#ASIN')?.value||null,image:document.querySelector('#landingImage')?.getAttribute('src')||null,prices,currency:unique.length===1?unique[0]:null,unavailable:/currently unavailable|temporarily out of stock/i.test(text('#availability')||''),blocked:!!document.querySelector('form[action*="validateCaptcha"],input#captchacharacters')};
});
console.log(JSON.stringify({...product,status:response?.status()||0,finalUrl:page.url()}));`;
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function proposal(source: URL, value: unknown): ExtractionResult {
  const data = object(value);
  const finalUrl =
    typeof data.finalUrl === "string"
      ? parseDestinationUrl(data.finalUrl)
      : null;
  if (
    typeof data.status !== "number" ||
    data.status < 200 ||
    data.status >= 300 ||
    data.blocked !== false ||
    !finalUrl ||
    finalUrl.hostname.replace(/^www\./u, "") !==
      source.hostname.replace(/^www\./u, "") ||
    asin(finalUrl) !== asin(source) ||
    data.asin !== asin(source) ||
    typeof data.title !== "string" ||
    !data.title.trim()
  )
    throw new ExtractionError("extraction_failed");
  const prices = Array.isArray(data.prices)
    ? [
        ...new Set(
          data.prices
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim()),
        ),
      ]
    : [];
  let money: ReturnType<typeof decimalToMinorUnits> = null;
  if (
    data.unavailable === false &&
    prices.length === 1 &&
    typeof data.currency === "string"
  ) {
    const match =
      /^(₹|£|€|\$|INR|USD|CAD|AUD|GBP|EUR)\s*(\d[\d,]*(?:\.\d+)?)$/u.exec(
        prices[0]!,
      );
    const symbols: Record<string, string> = {
      "₹": "INR",
      "£": "GBP",
      "€": "EUR",
    };
    if (
      match &&
      (match[1] === "$"
        ? ["USD", "CAD", "AUD", "NZD", "SGD"].includes(data.currency)
        : (symbols[match[1]!] ?? match[1]) === data.currency)
    )
      money = decimalToMinorUnits(match[2]!.replaceAll(",", ""), data.currency);
  }
  const images: string[] = [];
  if (typeof data.image === "string") {
    try {
      images.push(parseDestinationUrl(data.image).href);
    } catch {
      /* Manual entry can supply an image. */
    }
  }
  const result = validateExtractionResult({
    sourceUrl: source.href,
    title: data.title,
    retailer: source.hostname.replace(/^www\./u, ""),
    candidateImageUrls: images,
    ...(money
      ? {
          originalAmountMinor: money.amountMinor,
          originalCurrency: money.currency,
        }
      : {}),
  });
  if (!result.title) throw new ExtractionError("extraction_failed");
  return result;
}

export async function extractAmazonProduct(
  raw: string,
  options: ProviderOptions & { readonly admit?: () => boolean } = {},
): Promise<ExtractionResult> {
  const source = parseDestinationUrl(raw);
  if (!isAmazonProductUrl(source.href))
    throw new ExtractionError("unsupported_content");
  const key = options.apiKey ?? process.env.FIRECRAWL_API_KEY;
  if (!key?.trim()) throw new ExtractionError("unavailable");
  const remaining = Math.min(
    30000,
    (options.deadline ?? Date.now() + 30000) - Date.now(),
  );
  if (remaining < 1000 || options.signal?.aborted)
    throw new ExtractionError("timeout");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, remaining);
  const transport = options.fetch ?? fetch;
  let session: string | undefined;
  const request = async (path: string, body: unknown, signal: AbortSignal) => {
    const response = await transport(path, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ExtractionError("unavailable");
    }
    return object(await readProviderJson(response, signal));
  };
  try {
    await resolvePinnedAddress(
      destinationHostname(source),
      options.transport ?? {},
      controller.signal,
      Date.now() + remaining,
    );
    if (!(options.admit ?? admitBrowser)())
      throw new ExtractionError("unavailable");
    const created = await request(
      API,
      { ttl: 30, activityTtl: 10, streamWebView: false },
      controller.signal,
    );
    if (
      created.success !== true ||
      typeof created.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(created.id)
    )
      throw new ExtractionError("extraction_failed");
    session = created.id;
    const executed = await request(
      `${API}/${session}/execute`,
      { code: amazonBrowserCode(source.href), language: "node", timeout: 23 },
      controller.signal,
    );
    if (
      executed.success !== true ||
      executed.exitCode !== 0 ||
      executed.killed === true ||
      typeof executed.stdout !== "string"
    )
      throw new ExtractionError("extraction_failed");
    if (controller.signal.aborted) throw new ExtractionError("timeout");
    return proposal(source, JSON.parse(executed.stdout.trim()) as unknown);
  } catch (error) {
    if (controller.signal.aborted) throw new ExtractionError("timeout");
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("extraction_failed");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    if (session) {
      // Cleanup must run even after cancellation; provider TTL bounds orphan lifetime.
      try {
        const response = await transport(`${API}/${session}`, {
          method: "DELETE",
          redirect: "error",
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(3000),
        });
        await response.body?.cancel();
      } catch {
        /* No provider errors or session URLs enter logs. */
      }
    }
  }
}
