import { SUPPORTED_CURRENCIES } from "../analytics/event-definitions";

/**
 * Frozen from SIX ISO 4217 List One, published 2026-09-17:
 * https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
 * Numeric minor digits only are accepted; entries marked N.A. are excluded.
 */
const NO_NUMERIC_MINOR_UNIT = new Set([
  "BOV", "CHE", "CHW", "COU", "MXV", "USN", "XAG", "XAU", "XBA", "XBB",
  "XBC", "XBD", "XDR", "XPD", "XPT", "XSU", "XTS", "XUA", "XXX",
]);

const NON_TWO_DIGIT_MINOR_UNITS: Readonly<Record<string, number>> = {
  BHD: 3, BIF: 0, CLF: 4, CLP: 0, DJF: 0, GNF: 0, IQD: 3, ISK: 0, JOD: 3,
  JPY: 0, KMF: 0, KRW: 0, KWD: 3, LYD: 3, OMR: 3, PYG: 0, RWF: 0, TND: 3,
  UGX: 0, UYI: 0, UYW: 4, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
};

const CURRENCY_MINOR_DIGITS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    SUPPORTED_CURRENCIES.filter((code) => !NO_NUMERIC_MINOR_UNIT.has(code)).map(
      (code) => [code, NON_TWO_DIGIT_MINOR_UNITS[code] ?? 2],
    ),
  ),
);

export function currencyMinorDigits(code: string): number | null {
  return CURRENCY_MINOR_DIGITS[code.toUpperCase()] ?? null;
}

export const SUPPORTED_CURRENCY_CODES = Object.freeze(
  Object.keys(CURRENCY_MINOR_DIGITS),
);
