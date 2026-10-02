import type {
  GiftingMode,
  OccasionType,
  SelectableCurrency,
} from "./occasions";

/**
 * Canonical group-creation payload, version 1 (brief 006b).
 *
 * The database computes the canonical payload and its digest itself; this
 * module mirrors the exact normalization so the browser can bind a draft
 * request key to the digest of the payload it is about to send. The submitted
 * digest is never trusted by the database — it exists only so the client can
 * detect a changed payload before sending it.
 *
 * Explicit nulls are part of the contract: this slice has no optional
 * location or description controls.
 */
export interface CanonicalPayloadV1 {
  readonly contract_version: 1;
  readonly name: string;
  readonly occasion_type: OccasionType;
  /** A real YYYY-MM-DD calendar date, never UTC-shifted. */
  readonly occasion_date: string;
  /** The browser-resolved IANA time-zone identifier (at most 64 characters). */
  readonly time_zone: string;
  readonly location: null;
  readonly description: null;
  /** Exact positive integer minor units, as decimal digits. */
  readonly budget_amount_minor: string;
  readonly budget_currency: SelectableCurrency;
  readonly mode: GiftingMode;
  readonly organizer_participating: true;
}

/**
 * The versioned deterministic UTF-8 serialization of canonical payload v1.
 * The name cannot contain a newline after normalization (whitespace runs
 * collapse to one space), so the line-based framing is unambiguous for the
 * values this payload can carry.
 */
export function canonicalPayloadSerialization(
  payload: CanonicalPayloadV1,
): string {
  return [
    "getmethis:create-group:v1",
    `name=${payload.name}`,
    `occasion_type=${payload.occasion_type}`,
    `occasion_date=${payload.occasion_date}`,
    `time_zone=${payload.time_zone}`,
    `location=${payload.location ?? ""}`,
    `description=${payload.description ?? ""}`,
    `budget_amount_minor=${payload.budget_amount_minor}`,
    `budget_currency=${payload.budget_currency}`,
    `mode=${payload.mode}`,
    "",
  ].join("\n");
}

/**
 * SHA-256 over the canonical serialization, as lowercase hex. Uses the
 * Web Crypto API (available in browsers and Node >= 20) — never a
 * float-based shortcut.
 */
export async function canonicalPayloadDigest(
  payload: CanonicalPayloadV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalPayloadSerialization(payload),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
