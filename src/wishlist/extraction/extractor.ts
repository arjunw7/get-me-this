import "server-only";

import { Worker } from "node:worker_threads";

import { ExtractionError } from "./errors";
import { decimalToMinorUnits } from "./money";
import {
  normalizePlainText,
  validateExtractionResult,
  type ExtractionResult,
} from "./result";
import { guardedRequest, type TransportDependencies } from "./transport";
import { parseDestinationUrl } from "./url-policy";

const PARSER_TIMEOUT_MS = 500;

type WorkerResult = {
  readonly error?: boolean;
  readonly title?: unknown;
  readonly retailer?: unknown;
  readonly price?: unknown;
  readonly currency?: unknown;
  readonly images?: unknown;
};

function decodeHtml(
  bytes: Uint8Array,
  charset: string | null,
  truncated = false,
): string {
  try {
    const encoding =
      charset === "iso-8859-1" || charset === "windows-1252"
        ? "windows-1252"
        : "utf-8";
    // A prefix may stop between UTF-8 bytes. Streaming mode discards only
    // that unfinished trailing character; malformed bytes still fail.
    return new TextDecoder(encoding, { fatal: true }).decode(bytes, {
      stream: truncated,
    });
  } catch {
    throw new ExtractionError("unsupported_content");
  }
}

async function parseInWorker(
  html: string,
  amazonProduct: boolean,
  finalUrl: string,
  signal?: AbortSignal,
): Promise<WorkerResult> {
  if (signal?.aborted) throw new ExtractionError("timeout");
  return await new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./html-worker.mjs", import.meta.url), {
      workerData: { html, amazonProduct, finalUrl },
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate();
      callback();
    };
    const abort = () => finish(() => reject(new ExtractionError("timeout")));
    const timer = setTimeout(abort, PARSER_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (message: WorkerResult) => {
      finish(() => {
        if (message.error) reject(new ExtractionError("extraction_failed"));
        else resolve(message);
      });
    });
    worker.once("error", () =>
      finish(() => reject(new ExtractionError("extraction_failed"))),
    );
    worker.once("exit", (code) => {
      if (code !== 0) {
        finish(() => reject(new ExtractionError("extraction_failed")));
      }
    });
  });
}

function safeWorkerText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length > 8 * 1_024) return null;
  return normalizePlainText(value, maximum);
}

export async function extractProductLink(
  sourceUrl: string,
  options: {
    readonly signal?: AbortSignal;
    readonly deadline?: number;
    readonly transport?: TransportDependencies;
  } = {},
): Promise<ExtractionResult> {
  const admittedSource = parseDestinationUrl(sourceUrl).href;
  const response = await guardedRequest(
    admittedSource,
    "html",
    options.transport,
    {
      signal: options.signal,
      deadline: options.deadline,
      allowHtmlPrefix: (destination) => isAmazonProduct(destination.href),
    },
  );
  const metadata = await parseInWorker(
    decodeHtml(response.body, response.charset, response.truncated),
    isAmazonProduct(response.finalUrl),
    response.finalUrl,
    options.signal,
  );
  const title = safeWorkerText(metadata.title, 200);
  const retailer = safeWorkerText(metadata.retailer, 120);
  const money = decimalToMinorUnits(metadata.price, metadata.currency);
  const rawImages = Array.isArray(metadata.images) ? metadata.images : [];
  if (rawImages.length > 32) throw new ExtractionError("extraction_failed");
  let aggregateImageText = 0;
  const candidateImageUrls: string[] = [];
  const seen = new Set<string>();
  for (const rawImage of rawImages) {
    if (typeof rawImage !== "string") continue;
    aggregateImageText += rawImage.length;
    if (aggregateImageText > 32 * 1_024) {
      throw new ExtractionError("extraction_failed");
    }
    let candidate: string;
    try {
      candidate = parseDestinationUrl(
        new URL(rawImage, response.finalUrl).href,
      ).href;
    } catch {
      continue;
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidateImageUrls.push(candidate);
    }
    if (candidateImageUrls.length === 8) break;
  }
  return validateExtractionResult({
    sourceUrl: admittedSource,
    title,
    retailer,
    ...(money
      ? {
          originalAmountMinor: money.amountMinor,
          originalCurrency: money.currency,
        }
      : {}),
    candidateImageUrls,
  });
}

function isAmazonProduct(url: string): boolean {
  const destination = new URL(url);
  return (
    (destination.hostname === "amazon.in" ||
      destination.hostname === "www.amazon.in") &&
    /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(destination.pathname)
  );
}

export const PARSER_LIMITS = {
  workerMs: PARSER_TIMEOUT_MS,
  workerHeapMb: 64,
  nodes: 50_000,
  htmlDepth: 64,
  jsonDepth: 8,
  jsonBlocks: 16,
  jsonSourceBytes: 128 * 1_024,
  metadataValueBytes: 8 * 1_024,
  rawImages: 32,
  imageUrlTextBytes: 32 * 1_024,
} as const;
