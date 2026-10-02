import { CURRENCY_EXPONENTS, type SelectableCurrency } from "./occasions";

/**
 * Exact major-to-minor money conversion (brief 006b): no `parseFloat`, no
 * `Number` multiplication, no rounded scientific notation — BigInt arithmetic
 * on the decimal digits only.
 *
 * The major-unit input accepts digits with an optional single decimal
 * separator (dot or comma) carrying at most the currency's minor-unit
 * exponent fractional digits. Group separators (spaces, commas in
 * digit groups) are rejected so the value is always unambiguous.
 */

export type MoneyParseResult =
  | { ok: true; minorUnits: bigint }
  | { ok: false; reason: "empty" | "format" | "fraction" | "range" };

/** The inclusive upper bound shared with the database: 2^63 - 1. */
export const MAX_MINOR_UNITS = BigInt("9223372036854775807");

export function parseBudgetToMinor(
  rawAmount: string,
  currency: SelectableCurrency,
): MoneyParseResult {
  const exponent = CURRENCY_EXPONENTS[currency];
  const trimmed = rawAmount.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };

  const separatorIndex = findSeparator(trimmed);
  const majorPart =
    separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
  const fractionPart =
    separatorIndex === -1 ? "" : trimmed.slice(separatorIndex + 1);

  if (!/^\d+$/.test(majorPart) || majorPart.length === 0) {
    return { ok: false, reason: "format" };
  }

  if (separatorIndex !== -1) {
    if (!/^\d*$/.test(fractionPart)) return { ok: false, reason: "format" };
    if (fractionPart.length > exponent)
      return { ok: false, reason: "fraction" };
  }

  const scale = BigInt(10) ** BigInt(exponent);
  const fractionPadded = fractionPart.padEnd(exponent, "0");
  const minorUnits =
    BigInt(majorPart) * scale +
    (fractionPadded.length > 0 ? BigInt(fractionPadded) : BigInt(0));

  if (minorUnits < BigInt(1) || minorUnits > MAX_MINOR_UNITS) {
    return { ok: false, reason: "range" };
  }
  return { ok: true, minorUnits };
}

function findSeparator(value: string): number {
  const dot = value.indexOf(".");
  const comma = value.indexOf(",");
  if (dot === -1) return comma;
  if (comma === -1) return dot;
  // Both present: accept only when they mark the same single position, which
  // cannot happen; anything else is a malformed amount.
  return -2;
}
