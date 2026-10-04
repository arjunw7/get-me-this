import { ExtractionError } from "./errors";
import { POSTGRES_BIGINT_MAX, SUPPORTED_CURRENCY_EXPONENTS } from "./money";
import { EXTRACTION_MAX_URL_LENGTH, parseDestinationUrl } from "./url-policy";

export type ExtractionResult = {
  readonly sourceUrl: string;
  readonly title?: string | null;
  readonly retailer?: string | null;
  readonly originalAmountMinor?: string | null;
  readonly originalCurrency?: string | null;
  readonly candidateImageUrls: readonly string[];
};

export type ExtractionProposal = {
  readonly sourceUrl: string;
  readonly title?: unknown;
  readonly retailer?: unknown;
  readonly originalAmountMinor?: unknown;
  readonly originalCurrency?: unknown;
  readonly candidateImageUrls?: unknown;
};

const CONTROL_AND_BIDI =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

export function normalizePlainText(
  value: string,
  maximum: number,
): string | null {
  const normalized = value
    .normalize("NFC")
    .replace(CONTROL_AND_BIDI, "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[<>]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return null;
  return Array.from(normalized).slice(0, maximum).join("");
}

function optionalText(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw new ExtractionError("extraction_failed");
  return normalizePlainText(value, maximum);
}

export function validateExtractionResult(
  proposal: ExtractionProposal,
): ExtractionResult {
  const sourceUrl = parseDestinationUrl(proposal.sourceUrl).href;
  const title = optionalText(proposal.title, 200);
  const retailer = optionalText(proposal.retailer, 120);
  const amount = proposal.originalAmountMinor;
  const currency = proposal.originalCurrency;
  if (
    (amount === null || amount === undefined) !==
    (currency === null || currency === undefined)
  ) {
    throw new ExtractionError("extraction_failed");
  }
  if (
    amount !== undefined &&
    amount !== null &&
    (typeof amount !== "string" || !/^(?:0|[1-9]\d*)$/.test(amount))
  ) {
    throw new ExtractionError("extraction_failed");
  }
  if (
    currency !== undefined &&
    currency !== null &&
    (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
  ) {
    throw new ExtractionError("extraction_failed");
  }
  if (
    typeof amount === "string" &&
    (BigInt(amount) > BigInt(POSTGRES_BIGINT_MAX) ||
      typeof currency !== "string" ||
      SUPPORTED_CURRENCY_EXPONENTS[currency] === undefined)
  ) {
    throw new ExtractionError("extraction_failed");
  }
  const rawCandidates = proposal.candidateImageUrls ?? [];
  if (!Array.isArray(rawCandidates) || rawCandidates.length > 8) {
    throw new ExtractionError("extraction_failed");
  }
  const candidateImageUrls = rawCandidates.map((candidate) => {
    if (
      typeof candidate !== "string" ||
      candidate.length > EXTRACTION_MAX_URL_LENGTH
    ) {
      throw new ExtractionError("extraction_failed");
    }
    return parseDestinationUrl(candidate).href;
  });
  return {
    sourceUrl,
    ...(title !== undefined ? { title } : {}),
    ...(retailer !== undefined ? { retailer } : {}),
    ...(amount !== undefined
      ? { originalAmountMinor: amount as string | null }
      : {}),
    ...(currency !== undefined
      ? { originalCurrency: currency as string | null }
      : {}),
    candidateImageUrls,
  };
}
