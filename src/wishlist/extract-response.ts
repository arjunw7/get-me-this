/**
 * Client-side extraction response validation (005f).
 *
 * The browser client posts `{ url }` to the same-origin extract route and
 * must treat every response as untrusted input: the response is accepted
 * only when it matches the pinned envelope — `{ result }` on success and
 * `{ error }` on failure, per `src/wishlist/extraction/request-boundary.ts`
 * — with every field inside the bounded `ExtractionResult` shape. A
 * malformed or unexpected response classifies as `malformed` and renders
 * the generic failure state; the raw body is never rendered, stored, or
 * logged. This module is intentionally pure (no server-only imports): it
 * runs in the browser and in unit tests.
 */

const MAX_URL_LENGTH = 2_048;
const MAX_CANDIDATES = 8;

export type ExtractionResultShape = {
  readonly sourceUrl: string;
  readonly title?: string | null;
  readonly retailer?: string | null;
  readonly originalAmountMinor?: string | null;
  readonly originalCurrency?: string | null;
  readonly candidateImageUrls: readonly string[];
};

export type ParsedExtractResponse =
  | { kind: "result"; result: ExtractionResultShape }
  | { kind: "failure" }
  | { kind: "malformed" };

function isOptionalText(value: unknown, maximum: number): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && [...value].length <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isValidResult(value: unknown): value is ExtractionResultShape {
  if (!isRecord(value)) return false;
  const { sourceUrl, title, retailer, originalAmountMinor, originalCurrency } =
    value;
  if (typeof sourceUrl !== "string" || sourceUrl.length > MAX_URL_LENGTH)
    return false;
  if (!isOptionalText(title, 200)) return false;
  if (!isOptionalText(retailer, 120)) return false;
  if (!isOptionalText(originalAmountMinor, 40)) return false;
  if (
    originalAmountMinor !== undefined &&
    originalAmountMinor !== null &&
    (typeof originalAmountMinor !== "string" ||
      !/^(?:0|[1-9]\d*)$/.test(originalAmountMinor))
  )
    return false;
  if (
    originalCurrency !== undefined &&
    originalCurrency !== null &&
    (typeof originalCurrency !== "string" ||
      !/^[A-Z]{3}$/.test(originalCurrency))
  )
    return false;
  if (
    (originalAmountMinor === undefined || originalAmountMinor === null) !==
    (originalCurrency === undefined || originalCurrency === null)
  )
    return false;
  const candidates = value.candidateImageUrls;
  if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES)
    return false;
  return candidates.every(
    (candidate) =>
      typeof candidate === "string" && candidate.length <= MAX_URL_LENGTH,
  );
}

/**
 * Classifies the parsed JSON body of an extract response. The HTTP status
 * only separates admission denials (no body contract beyond `{ error }`);
 * the envelope itself decides between result, failure, and malformed.
 */
export function parseExtractResponse(
  status: number,
  body: unknown,
): ParsedExtractResponse {
  if (!isRecord(body)) return { kind: "malformed" };
  const keys = Object.keys(body);
  if (keys.length !== 1) return { kind: "malformed" };
  if (keys[0] === "result")
    return isValidResult(body.result)
      ? { kind: "result", result: body.result }
      : { kind: "malformed" };
  if (keys[0] === "error") {
    const error = body.error;
    if (isRecord(error) && typeof error.code === "string" && error.code)
      return { kind: "failure" };
    return { kind: "malformed" };
  }
  return { kind: "malformed" };
}

/** Admission denials (429/503) resolve to the failed state like any other. */
export function isAdmissionDenied(status: number): boolean {
  return status === 429 || status === 503;
}
