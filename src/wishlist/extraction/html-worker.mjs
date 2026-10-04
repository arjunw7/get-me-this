import { parentPort, workerData } from "node:worker_threads";
import { amazonProductMetadata } from "./amazon-markup.mjs";
import {
  decodeHtmlEntities,
  isChallengePage,
  selectIdentifiedRecord,
} from "./metadata-selection.mjs";

const MAX_NODES = 50_000;
const MAX_HTML_DEPTH = 64;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_BLOCKS = 16;
const MAX_JSON_TEXT = 128 * 1024;
const MAX_VALUE = 8 * 1024;
const MAX_IMAGES = 32;
const MAX_IMAGE_TEXT = 32 * 1024;

const byteLength = (value) => Buffer.byteLength(value, "utf8");

function fail() {
  throw new Error("bounded-parse-failure");
}

function attrs(source) {
  const result = Object.create(null);
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = (match[1] || "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (byteLength(value) > MAX_VALUE) fail();
    if (!(name in result)) result[name] = decodeHtmlEntities(value);
  }
  return result;
}

function jsonDepth(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) fail();
  if (typeof value === "string" && byteLength(value) > MAX_VALUE) fail();
  if (Array.isArray(value)) {
    if (value.length > 32) fail();
    for (const item of value) jsonDepth(item, depth + 1);
  } else if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 64) fail();
    for (const [, item] of entries) jsonDepth(item, depth + 1);
  }
}

function productNodes(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) productNodes(item, output);
  } else if (value && typeof value === "object") {
    const type = value["@type"];
    if (
      type === "Product" ||
      (Array.isArray(type) && type.includes("Product"))
    ) {
      output.push(value);
    }
    if (value["@graph"]) productNodes(value["@graph"], output);
  }
  return output;
}

function addImage(images, value, totals) {
  const values = Array.isArray(value) ? value : [value];
  for (const candidate of values) {
    const text =
      typeof candidate === "string"
        ? candidate
        : candidate &&
            typeof candidate === "object" &&
            typeof candidate.url === "string"
          ? candidate.url
          : null;
    if (!text) continue;
    totals.count += 1;
    totals.text += byteLength(text);
    if (totals.count > MAX_IMAGES || totals.text > MAX_IMAGE_TEXT) fail();
    images.push(text);
  }
}

function parse() {
  const html = workerData.html;
  let nodes = 0;
  let depth = 0;
  const voidTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  let priorEnd = 0;
  for (const match of html.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    if (
      (match.index ?? 0) > priorEnd &&
      html.slice(priorEnd, match.index).trim()
    ) {
      nodes += 1;
    }
    nodes += 1;
    if (nodes > MAX_NODES) fail();
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (token.startsWith("</")) depth = Math.max(0, depth - 1);
    else if (!token.endsWith("/>") && !voidTags.has(tag)) {
      depth += 1;
      if (depth > MAX_HTML_DEPTH) fail();
    }
    priorEnd = (match.index ?? 0) + token.length;
  }
  if (html.slice(priorEnd).trim()) nodes += 1;
  if (nodes > MAX_NODES) fail();

  const metadata = Object.create(null);
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = attrs(match[1] || "");
    const key = (attributes.property || attributes.name || "").toLowerCase();
    if (!key || typeof attributes.content !== "string") continue;
    if (
      [
        "og:title",
        "og:site_name",
        "og:image",
        "product:price:amount",
        "product:price:currency",
      ].includes(key) &&
      !(key in metadata)
    ) {
      metadata[key] = attributes.content;
    }
  }
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (titleMatch && byteLength(titleMatch[1]) > MAX_VALUE) fail();
  const fallbackTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : null;
  if (fallbackTitle && byteLength(fallbackTitle) > MAX_VALUE) fail();
  if (isChallengePage(html, fallbackTitle)) fail();
  let canonicalUrl;
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = attrs(match[1] || "");
    if (
      (attributes.rel || "").toLowerCase().split(/\s+/).includes("canonical")
    ) {
      // Conflicting declarations are ambiguous rather than first-wins.
      if (canonicalUrl !== undefined && canonicalUrl !== attributes.href)
        fail();
      canonicalUrl = attributes.href;
    }
  }

  const jsonBlocks = [];
  let aggregate = 0;
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    const attributes = attrs(match[1] || "");
    if ((attributes.type || "").toLowerCase() !== "application/ld+json")
      continue;
    if (jsonBlocks.length >= MAX_JSON_BLOCKS) fail();
    const source = match[2] || "";
    aggregate += byteLength(source);
    if (aggregate > MAX_JSON_TEXT) fail();
    jsonBlocks.push(source);
  }

  const products = [];
  for (const source of jsonBlocks) {
    try {
      const parsed = JSON.parse(source);
      jsonDepth(parsed);
      productNodes(parsed, products);
    } catch (error) {
      if (error?.message === "bounded-parse-failure") throw error;
    }
  }
  const product = selectIdentifiedRecord(
    products,
    workerData.finalUrl,
    canonicalUrl,
  );
  if (products.length && !product) fail();
  const offers = product?.offers
    ? Array.isArray(product.offers)
      ? product.offers
      : [product.offers]
    : [];
  const offer = selectIdentifiedRecord(
    offers,
    workerData.finalUrl,
    canonicalUrl,
  );
  const ambiguousOffers = offers.length > 0 && !offer;
  // Global Open Graph fields cannot establish which of several products they
  // describe. Once identity matters, keep fields bound to the selected record.
  const usePageMetadata = products.length <= 1;
  const images = [];
  const totals = { count: 0, text: 0 };
  if (usePageMetadata && metadata["og:image"])
    addImage(images, metadata["og:image"], totals);
  if (product?.image) addImage(images, product.image, totals);
  const amazon = workerData.amazonProduct
    ? amazonProductMetadata(html, attrs, MAX_VALUE)
    : {};
  if (amazon.image && images.length === 0)
    addImage(images, amazon.image, totals);
  // Amount and currency must come from the same complete source.
  const money = ambiguousOffers
    ? {}
    : usePageMetadata &&
        offers.length <= 1 &&
        metadata["product:price:amount"] != null &&
        metadata["product:price:currency"] != null
      ? {
          price: metadata["product:price:amount"],
          currency: metadata["product:price:currency"],
        }
      : offer?.price != null && offer?.priceCurrency != null
        ? { price: offer.price, currency: offer.priceCurrency }
        : usePageMetadata
          ? amazon
          : {};

  parentPort.postMessage({
    title:
      (usePageMetadata ? metadata["og:title"] : null) ??
      product?.name ??
      (amazon.title ? decodeHtmlEntities(amazon.title) : null) ??
      fallbackTitle,
    retailer:
      metadata["og:site_name"] ?? amazon.retailer ?? offer?.seller?.name,
    price: money.price,
    currency: money.currency,
    images,
  });
}

try {
  parse();
} catch {
  parentPort.postMessage({ error: true });
}
