import { describe, expect, it } from "vitest";

import { decimalToMinorUnits } from "./money";

describe("exact decimal money parsing", () => {
  it.each([
    ["123.45", "INR", "12345"],
    ["123.4", "USD", "12340"],
    ["123", "JPY", "123"],
    ["000", "JPY", "0"],
    ["001.20", "INR", "120"],
    ["0", "JPY", "0"],
    ["92233720368547758.07", "INR", "9223372036854775807"],
  ])("maps %s %s using string digits", (decimal, currency, expected) => {
    expect(decimalToMinorUnits(decimal, currency)?.amountMinor ?? null).toBe(
      expected,
    );
  });

  it.each([
    [123.45, "INR"],
    ["1e3", "INR"],
    ["+1", "INR"],
    ["-1", "INR"],
    ["1,000", "INR"],
    ["1.234", "INR"],
    ["1.0", "JPY"],
    ["92233720368547758.08", "INR"],
    ["1.00", "ZZZ"],
    ["1.00", undefined],
  ])("rejects ambiguous or unsupported input %#", (decimal, currency) => {
    expect(decimalToMinorUnits(decimal, currency)).toBeNull();
  });
});
