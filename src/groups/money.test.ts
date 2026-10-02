import { describe, expect, it } from "vitest";

import { MAX_MINOR_UNITS, parseBudgetToMinor } from "./money";

/** Test-side literals (BigInt literal syntax is target-gated in this repo). */
const n = (value: string) => BigInt(value);

/**
 * Exact money semantics (brief 006b): minor-unit conversion is exact for all
 * accepted values and currency exponents, with no float rounding anywhere.
 */

describe("parseBudgetToMinor", () => {
  it("converts whole major amounts exactly", () => {
    expect(parseBudgetToMinor("2500", "INR")).toEqual({
      ok: true,
      minorUnits: n("250000"),
    });
    expect(parseBudgetToMinor("0", "USD").ok).toBe(false);
  });

  it("converts fractional amounts exactly without float arithmetic", () => {
    expect(parseBudgetToMinor("24.99", "INR")).toEqual({
      ok: true,
      minorUnits: n("2499"),
    });
    expect(parseBudgetToMinor("0.01", "USD")).toEqual({
      ok: true,
      minorUnits: n("1"),
    });
    expect(parseBudgetToMinor("2,5", "GBP")).toEqual({
      ok: true,
      minorUnits: n("250"),
    });
    expect(parseBudgetToMinor("0.1", "EUR")).toEqual({
      ok: true,
      minorUnits: n("10"),
    });
  });

  it("rejects excess fractional digits for the currency exponent", () => {
    expect(parseBudgetToMinor("1.234", "INR")).toEqual({
      ok: false,
      reason: "fraction",
    });
  });

  it("rejects malformed amounts without ever throwing on user input", () => {
    expect(parseBudgetToMinor("", "INR")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(parseBudgetToMinor("abc", "INR")).toEqual({
      ok: false,
      reason: "format",
    });
    expect(parseBudgetToMinor("1 000", "INR")).toEqual({
      ok: false,
      reason: "format",
    });
    expect(parseBudgetToMinor("1.2.3", "INR")).toEqual({
      ok: false,
      reason: "format",
    });
    expect(parseBudgetToMinor("-5", "INR")).toEqual({
      ok: false,
      reason: "format",
    });
    expect(parseBudgetToMinor("1e9", "INR")).toEqual({
      ok: false,
      reason: "format",
    });
  });

  it("shares the exact inclusive bounds with the database", () => {
    expect(parseBudgetToMinor("1", "INR")).toEqual({
      ok: true,
      minorUnits: n("100"),
    });
    expect(parseBudgetToMinor("0.0000000001", "INR")).toEqual({
      ok: false,
      reason: "fraction",
    });
    // The exact database maximum round-trips: 92233720368547758.07 major.
    expect(parseBudgetToMinor("92233720368547758.07", "INR")).toEqual({
      ok: true,
      minorUnits: MAX_MINOR_UNITS,
    });
    // One minor unit above the bound is rejected.
    expect(parseBudgetToMinor("92233720368547758.08", "INR")).toEqual({
      ok: false,
      reason: "range",
    });
  });

  it("ignores surrounding whitespace but rejects grouping separators", () => {
    expect(parseBudgetToMinor("  2500  ", "INR")).toEqual({
      ok: true,
      minorUnits: n("250000"),
    });
    // Three fractional digits after the separator: rejected as excess
    // fraction before the grouping interpretation can ever apply.
    expect(parseBudgetToMinor("2,500", "INR")).toEqual({
      ok: false,
      reason: "fraction",
    });
  });
});
