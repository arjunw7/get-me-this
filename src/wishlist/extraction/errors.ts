export const EXTRACTION_ERROR_CODES = [
  "invalid_url",
  "blocked_url",
  "unavailable",
  "too_large",
  "timeout",
  "unsupported_content",
  "extraction_failed",
] as const;

export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];

const SAFE_MESSAGES: Readonly<Record<ExtractionErrorCode, string>> = {
  invalid_url: "Enter a valid public product link.",
  blocked_url: "That link cannot be accessed.",
  unavailable: "That page is not available right now.",
  too_large: "That page is too large to import safely.",
  timeout: "That page took too long to respond.",
  unsupported_content: "That link does not contain a supported product page.",
  extraction_failed:
    "We could not import that link. You can still add it manually.",
};

/** An internal typed failure whose message is always safe for a browser. */
export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;

  constructor(code: ExtractionErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = "ExtractionError";
    this.code = code;
  }
}

export function extractionErrorResponse(error: unknown): {
  readonly code: ExtractionErrorCode;
  readonly message: string;
} {
  const safe =
    error instanceof ExtractionError
      ? error
      : new ExtractionError("extraction_failed");
  return { code: safe.code, message: safe.message };
}
