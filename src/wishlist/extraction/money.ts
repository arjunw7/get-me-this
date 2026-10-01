const BIGINT_MAX = BigInt("9223372036854775807");

// The initial standards-based extractor supports currencies used by the v1
// product examples. Extending this table requires an explicit ISO 4217
// exponent review; no currency is inferred from locale or symbol.
export const SUPPORTED_CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  AUD: 2,
  CAD: 2,
  CHF: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  JPY: 0,
  NZD: 2,
  SGD: 2,
  USD: 2,
};

export function decimalToMinorUnits(
  decimal: unknown,
  currency: unknown,
): { readonly amountMinor: string; readonly currency: string } | null {
  if (typeof decimal !== "string" || typeof currency !== "string") return null;
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const exponent = SUPPORTED_CURRENCY_EXPONENTS[currency];
  if (exponent === undefined || !/^\d+(?:\.\d+)?$/.test(decimal)) {
    return null;
  }
  const [whole, fraction = ""] = decimal.split(".");
  if (fraction.length > exponent || (exponent === 0 && fraction.length > 0)) {
    return null;
  }
  const digits = `${whole}${fraction.padEnd(exponent, "0")}`.replace(
    /^0+(?=\d)/,
    "",
  );
  const amount = BigInt(digits);
  if (amount > BIGINT_MAX) return null;
  return { amountMinor: amount.toString(), currency };
}

export const POSTGRES_BIGINT_MAX = BIGINT_MAX.toString();
