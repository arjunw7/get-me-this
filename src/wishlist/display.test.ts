import { describe, expect, it } from "vitest";

import {
  CONVERSION_STALENESS_MS,
  DESIRE_LEVELS,
  type StoredDesireLevel,
  type WishlistItemRow,
  approximateConversionView,
  convertAmountMinorWithRate,
  formatCapturedUtcDate,
  formatItemCount,
  formatMoneyMinor,
  isConversionStale,
  parseConversionRate,
  toWishlistItemSnapshot,
} from "./display";

/**
 * The pure display contracts of the wishlist read path (005b) and the
 * pinned approximate-conversion contract (005g, dormant): the minor-unit
 * money format, the round-half-up reference implementation, the rate
 * rejection table, the 24-hour staleness boundary, and the UTC captured
 * date — all exact BigInt/string math with no floating point.
 */
describe("formatMoneyMinor", () => {
  it("renders the stored original amount in major units with the pinned format", () => {
    expect(formatMoneyMinor("2499", "INR")).toBe("24.99 INR");
  });

  it("keeps zero-decimal currencies free of fractional digits", () => {
    expect(formatMoneyMinor("3500", "JPY")).toBe("3500 JPY");
    expect(formatMoneyMinor("132000", "JPY")).toBe("132000 JPY");
    expect(formatMoneyMinor("0", "JPY")).toBe("0 JPY");
    expect(formatMoneyMinor("0", "INR")).toBe("0.00 INR");
  });

  it("uses the ISO 4217 digit table, defaulting to two decimals", () => {
    expect(formatMoneyMinor("249900", "INR")).toBe("2499.00 INR");
    expect(formatMoneyMinor("1250", "USD")).toBe("12.50 USD");
    // Zero-decimal table entries beyond the brief's example.
    expect(formatMoneyMinor("4500", "KRW")).toBe("4500 KRW");
    expect(formatMoneyMinor("4500", "VND")).toBe("4500 VND");
    // Three-decimal currencies.
    expect(formatMoneyMinor("1250", "KWD")).toBe("1.250 KWD");
    expect(() => formatMoneyMinor("100", "XYZ")).toThrow();
  });

  it("uses current non-default precision for supported currencies", () => {
    expect(formatMoneyMinor("1234", "CLP")).toBe("1234 CLP");
    expect(formatMoneyMinor("1234", "UGX")).toBe("1234 UGX");
    expect(formatMoneyMinor("1234", "JOD")).toBe("1.234 JOD");
    expect(formatMoneyMinor("1234", "TND")).toBe("1.234 TND");
    expect(formatMoneyMinor("1234", "KWD")).toBe("1.234 KWD");
    expect(formatMoneyMinor("1234", "JPY")).toBe("1234 JPY");
    expect(formatMoneyMinor("1234", "INR")).toBe("12.34 INR");
    expect(() => formatMoneyMinor("1234", "XYZ")).toThrow();
  });

  it("pins every exponent class from 005g criterion 1, including four-decimal CLF", () => {
    // Zero-decimal.
    expect(formatMoneyMinor("3500", "JPY")).toBe("3500 JPY");
    // Two-decimal.
    expect(formatMoneyMinor("2499", "INR")).toBe("24.99 INR");
    expect(formatMoneyMinor("2499", "USD")).toBe("24.99 USD");
    expect(formatMoneyMinor("2499", "GBP")).toBe("24.99 GBP");
    expect(formatMoneyMinor("2499", "EUR")).toBe("24.99 EUR");
    // Three-decimal.
    expect(formatMoneyMinor("1250", "KWD")).toBe("1.250 KWD");
    expect(formatMoneyMinor("1250", "JOD")).toBe("1.250 JOD");
    expect(formatMoneyMinor("1250", "TND")).toBe("1.250 TND");
    // Four-decimal.
    expect(formatMoneyMinor("12500", "CLF")).toBe("1.2500 CLF");
  });

  it("uppercases the currency code", () => {
    expect(formatMoneyMinor("100", "usd")).toBe("1.00 USD");
  });

  it("keeps every digit at and beyond the JavaScript safe-integer boundary", () => {
    expect(formatMoneyMinor("9007199254740990", "INR")).toBe(
      "90071992547409.90 INR",
    );
    expect(formatMoneyMinor("9007199254740991", "KWD")).toBe(
      "9007199254740.991 KWD",
    );
  });

  it("formats the full PostgreSQL bigint range from exact decimal strings", () => {
    expect(formatMoneyMinor("9007199254740993", "INR")).toBe(
      "90071992547409.93 INR",
    );
    expect(formatMoneyMinor("9223372036854775807", "INR")).toBe(
      "92233720368547758.07 INR",
    );
  });

  it("rejects malformed, out-of-range, and numeric transport values", () => {
    for (const amount of [
      "01",
      "-1",
      "1.5",
      "1e3",
      "9223372036854775808",
      2499,
      BigInt(2499),
    ]) {
      expect(() => formatMoneyMinor(amount as never, "INR")).toThrow();
    }
  });
});

describe("formatItemCount", () => {
  it("uses the approved 'N things' / '1 thing' phrasing", () => {
    expect(formatItemCount(0)).toBe("0 things");
    expect(formatItemCount(1)).toBe("1 thing");
    expect(formatItemCount(3)).toBe("3 things");
  });
});

describe("desire level display mapping", () => {
  it("maps every stored enum value 1:1 to the approved V18 string", () => {
    expect(DESIRE_LEVELS.really_want).toBe("Really want");
    expect(DESIRE_LEVELS.would_love).toBe("Would love");
    expect(DESIRE_LEVELS.just_an_idea).toBe("Just an idea");
  });
});

describe("toWishlistItemSnapshot", () => {
  it("maps a stored row into the display snapshot with explicit fields only", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000002",
      title: "Ceramic pour-over coffee set",
      source_url: "https://example.invalid/products/pour-over-set",
      retailer: "Fixture Roasters",
      image_url: "https://example.invalid/images/pour-over.jpg",
      image_snapshot_path: null,
      note: "The matte one, not the glossy one.",
      desire_level: "really_want",
      sort_position: 1,
      original_amount_minor: "249900",
      original_currency: "INR",
      converted_amount_minor: null,
      converted_currency: null,
      conversion_rate_source: null,
      conversion_rate_at: null,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
    };
    const snapshot = toWishlistItemSnapshot(row);
    expect(snapshot).toEqual({
      id: row.id,
      title: row.title,
      sourceUrl: row.source_url,
      retailer: row.retailer,
      imageUrl: row.image_url,
      imageSnapshotPath: null,
      note: row.note,
      desireLevel: "really_want",
      sortPosition: 1,
      originalAmountMinor: "249900",
      originalCurrency: "INR",
      converted: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });

  it("carries null optional fields through untouched", () => {
    const snapshot = toWishlistItemSnapshot({
      id: "00000000-0000-4000-8000-000000000004",
      title: "Mechanical keyboard keycaps",
      source_url: null,
      retailer: null,
      image_url: null,
      image_snapshot_path: "items/snapshot.jpg",
      note: null,
      desire_level: "just_an_idea",
      sort_position: 3,
      original_amount_minor: null,
      original_currency: null,
      converted_amount_minor: null,
      converted_currency: null,
      conversion_rate_source: null,
      conversion_rate_at: null,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
    });
    expect(snapshot.sourceUrl).toBeNull();
    expect(snapshot.retailer).toBeNull();
    expect(snapshot.imageUrl).toBeNull();
    expect(snapshot.imageSnapshotPath).toBe("items/snapshot.jpg");
    expect(snapshot.note).toBeNull();
    expect(snapshot.originalAmountMinor).toBeNull();
    expect(snapshot.originalCurrency).toBeNull();
    expect(snapshot.converted).toBeNull();
  });

  it("preserves the exact full-bigint amount string in the snapshot", () => {
    const row: WishlistItemRow = {
      id: "00000000-0000-4000-8000-000000000010",
      title: "Large original",
      source_url: null,
      retailer: null,
      image_url: null,
      image_snapshot_path: null,
      note: null,
      desire_level: "would_love",
      sort_position: 1,
      original_amount_minor: "9223372036854775807",
      original_currency: "INR",
      converted_amount_minor: null,
      converted_currency: null,
      conversion_rate_source: null,
      conversion_rate_at: null,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
    };
    expect(toWishlistItemSnapshot(row).originalAmountMinor).toBe(
      "9223372036854775807",
    );
    expect(() =>
      toWishlistItemSnapshot({ ...row, original_amount_minor: 2499 as never }),
    ).toThrow();
    expect(() =>
      toWishlistItemSnapshot({ ...row, original_currency: null }),
    ).toThrow();
  });

  it("refuses a row whose desire level is outside the closed enum", () => {
    // The column is a Postgres enum, so this is an invariant violation, not
    // a display state: fail loudly rather than render an invented label.
    const impostor = {
      id: "00000000-0000-4000-8000-000000000009",
      title: "Impossible item",
      source_url: null,
      retailer: null,
      image_url: null,
      image_snapshot_path: null,
      note: null,
      desire_level: "kind_of",
      sort_position: 1,
      original_amount_minor: null,
      original_currency: null,
      created_at: "2026-09-30T00:00:00.000Z",
      updated_at: "2026-09-30T00:00:00.000Z",
    } as unknown as WishlistItemRow;
    expect(() => toWishlistItemSnapshot(impostor)).toThrow();
  });

  it("types the accepted desire levels as the stored enum", () => {
    const levels: readonly StoredDesireLevel[] = [
      "really_want",
      "would_love",
      "just_an_idea",
    ];
    expect(new Set(levels)).toEqual(new Set(Object.keys(DESIRE_LEVELS)));
  });

  it("carries a complete supported converted tuple as exact strings", () => {
    const now = Date.parse("2026-10-02T00:00:00.000Z");
    const snapshot = toWishlistItemSnapshot(
      {
        ...baseRow(),
        original_amount_minor: "2499",
        original_currency: "INR",
        converted_amount_minor: "2999",
        converted_currency: "USD",
        conversion_rate_source: "fixture-provider quote fx-1",
        conversion_rate_at: "2026-10-01T12:00:00.000Z",
      },
      now,
    );
    expect(snapshot.converted).toEqual({
      amountMinor: "2999",
      currency: "USD",
      rateSource: "fixture-provider quote fx-1",
      rateAt: "2026-10-01T12:00:00.000Z",
      stale: false,
    });
  });

  it("marks a tuple older than 24 hours stale at the read clock", () => {
    const row = {
      ...baseRow(),
      original_amount_minor: "2499",
      original_currency: "INR",
      converted_amount_minor: "2999",
      converted_currency: "USD",
      conversion_rate_source: "fixture-provider quote fx-1",
      conversion_rate_at: "2026-10-01T12:00:00.000Z",
    };
    const capturedMs = Date.parse("2026-10-01T12:00:00.000Z");
    expect(
      toWishlistItemSnapshot(row, capturedMs + CONVERSION_STALENESS_MS)
        .converted?.stale,
    ).toBe(false);
    expect(
      toWishlistItemSnapshot(row, capturedMs + CONVERSION_STALENESS_MS + 1000)
        .converted?.stale,
    ).toBe(true);
  });

  it("degrades an incomplete converted tuple to original-only display", () => {
    const base = {
      ...baseRow(),
      original_amount_minor: "2499",
      original_currency: "INR",
    };
    for (const partial of [
      {
        converted_amount_minor: "2999",
        converted_currency: null,
        conversion_rate_source: "fixture",
        conversion_rate_at: "2026-10-01T12:00:00.000Z",
      },
      {
        converted_amount_minor: "2999",
        converted_currency: "USD",
        conversion_rate_source: null,
        conversion_rate_at: "2026-10-01T12:00:00.000Z",
      },
      {
        converted_amount_minor: "2999",
        converted_currency: "USD",
        conversion_rate_source: "fixture",
        conversion_rate_at: null,
      },
    ]) {
      expect(
        toWishlistItemSnapshot({ ...base, ...partial }).converted,
      ).toBeNull();
    }
  });

  it("degrades a malformed converted amount, unsupported code, or bad timestamp to original-only display", () => {
    const base = {
      ...baseRow(),
      original_amount_minor: "2499",
      original_currency: "INR",
    };
    for (const malformed of [
      {
        converted_amount_minor: "12.5" as unknown as string,
        converted_currency: "USD",
        conversion_rate_source: "fixture",
        conversion_rate_at: "2026-10-01T12:00:00.000Z",
      },
      {
        converted_amount_minor: "9223372036854775808",
        converted_currency: "USD",
        conversion_rate_source: "fixture",
        conversion_rate_at: "2026-10-01T12:00:00.000Z",
      },
      {
        converted_amount_minor: "2999",
        converted_currency: "XYZ",
        conversion_rate_source: "fixture",
        conversion_rate_at: "2026-10-01T12:00:00.000Z",
      },
      {
        converted_amount_minor: "2999",
        converted_currency: "USD",
        conversion_rate_source: "fixture",
        conversion_rate_at: "not-a-timestamp",
      },
    ]) {
      const snapshot = toWishlistItemSnapshot({ ...base, ...malformed });
      expect(snapshot.originalAmountMinor).toBe("2499");
      expect(snapshot.converted).toBeNull();
    }
  });
});

function baseRow(): WishlistItemRow {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Ceramic pour-over coffee set",
    source_url: null,
    retailer: null,
    image_url: null,
    image_snapshot_path: null,
    note: null,
    desire_level: "would_love",
    sort_position: 1,
    original_amount_minor: null,
    original_currency: null,
    converted_amount_minor: null,
    converted_currency: null,
    conversion_rate_source: null,
    conversion_rate_at: null,
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:00:00.000Z",
  };
}

describe("parseConversionRate", () => {
  it("accepts positive exact decimal strings with at most 12 fractional digits", () => {
    expect(parseConversionRate("1")).toEqual({
      value: BigInt(1),
      fractionalDigits: 0,
    });
    expect(parseConversionRate("0.5")).toEqual({
      value: BigInt(5),
      fractionalDigits: 1,
    });
    expect(parseConversionRate("83.123456789012")).toEqual({
      value: BigInt("83123456789012"),
      fractionalDigits: 12,
    });
    expect(parseConversionRate("0.000000000001")).toEqual({
      value: BigInt(1),
      fractionalDigits: 12,
    });
  });

  it("rejects signs, exponents, separators, symbols, blanks, and non-strings", () => {
    for (const rate of [
      "+1",
      "-1",
      "1e3",
      "1.2e3",
      "1,5",
      "1.234.5",
      " 1",
      "1 ",
      ".5",
      "5.",
      "₹83",
      "",
      "NaN",
      0.5,
      83,
      BigInt(83),
      null,
      undefined,
    ]) {
      expect(() => parseConversionRate(rate as never)).toThrow();
    }
  });

  it("rejects zero, negative-zero-like values, more than 12 fractional digits, and non-canonical zeros", () => {
    for (const rate of [
      "0",
      "0.0",
      "0.000000000000",
      "00",
      "00.5",
      "0.1234567890125",
      "1.1234567890125",
    ]) {
      expect(() => parseConversionRate(rate)).toThrow();
    }
  });
});

describe("convertAmountMinorWithRate (pinned round-half-up reference)", () => {
  it("rounds exact .5 minor-unit ties up and rejects half-even", () => {
    // Two-decimal target: 1.25 USD at 0.5 → 62.5 INR minor → 63 (half-even would say 62).
    expect(convertAmountMinorWithRate("125", "0.5", "USD", "INR")).toBe("63");
    // Zero-decimal target: 0.01 INR at 50 → 0.5 JPY minor → 1 (half-even would say 0).
    expect(convertAmountMinorWithRate("1", "50", "INR", "JPY")).toBe("1");
    // Three-decimal target: 0.001 KWD at 0.5 → 0.5 KWD minor → 1.
    expect(convertAmountMinorWithRate("1", "0.5", "KWD", "KWD")).toBe("1");
    // Four-decimal target: 0.0001 CLF at 0.5 → 0.5 CLF minor → 1.
    expect(convertAmountMinorWithRate("1", "0.5", "CLF", "CLF")).toBe("1");
  });

  it("rounds just below .5 down and above .5 up across exponent classes", () => {
    // Two-decimal target: 0.49/0.51 minor boundaries.
    expect(convertAmountMinorWithRate("1", "0.49", "USD", "INR")).toBe("0");
    expect(convertAmountMinorWithRate("1", "0.51", "USD", "INR")).toBe("1");
    // Three-decimal target.
    expect(convertAmountMinorWithRate("1", "0.4999", "KWD", "KWD")).toBe("0");
    expect(convertAmountMinorWithRate("1", "0.5001", "KWD", "KWD")).toBe("1");
    // Zero-decimal target: 0.01 INR at 49/51 → 0/1 JPY.
    expect(convertAmountMinorWithRate("1", "49", "INR", "JPY")).toBe("0");
    expect(convertAmountMinorWithRate("1", "51", "INR", "JPY")).toBe("1");
  });

  it("converts a 12-fractional-digit rate exactly with no float in the path", () => {
    // 10000 INR major at 0.123456789012 → 1234.56789012 USD major
    // → 123456.789012 minor → round half up → 123457.
    expect(
      convertAmountMinorWithRate("1000000", "0.123456789012", "INR", "USD"),
    ).toBe("123457");
  });

  it("keeps zero and ordinary amounts exact", () => {
    expect(convertAmountMinorWithRate("0", "83.5", "INR", "USD")).toBe("0");
    expect(convertAmountMinorWithRate("2499", "1", "INR", "INR")).toBe("2499");
    expect(convertAmountMinorWithRate("3500", "1", "JPY", "JPY")).toBe("3500");
  });

  it("fails safe on overflow past the bigint maximum with no converted value", () => {
    expect(() =>
      convertAmountMinorWithRate("9223372036854775807", "1000", "INR", "INR"),
    ).toThrow();
  });

  it("rejects non-canonical amounts and unsupported currencies on either side", () => {
    expect(() => convertAmountMinorWithRate("01", "1", "INR", "USD")).toThrow();
    expect(() => convertAmountMinorWithRate("-1", "1", "INR", "USD")).toThrow();
    expect(() =>
      convertAmountMinorWithRate("100", "1", "XYZ", "USD"),
    ).toThrow();
    expect(() =>
      convertAmountMinorWithRate("100", "1", "INR", "XYZ"),
    ).toThrow();
  });

  it("round-trips the bigint maximum at an identity rate", () => {
    expect(
      convertAmountMinorWithRate("9223372036854775807", "1", "INR", "INR"),
    ).toBe("9223372036854775807");
  });
});

describe("isConversionStaleness (pinned 24-hour boundary)", () => {
  const captured = "2026-10-01T00:00:00.000Z";
  const capturedMs = Date.parse(captured);
  expect(CONVERSION_STALENESS_MS).toBe(24 * 60 * 60 * 1000);

  it("is not stale at 23h59m59s, exactly 24h, or in the future", () => {
    expect(
      isConversionStale(captured, capturedMs + 23 * 60 * 60 * 1000 - 1000),
    ).toBe(false);
    expect(
      isConversionStale(captured, capturedMs + CONVERSION_STALENESS_MS),
    ).toBe(false);
    expect(isConversionStale(captured, capturedMs - 60 * 60 * 1000)).toBe(
      false,
    );
  });

  it("is stale at 24 hours and 1 second", () => {
    expect(
      isConversionStale(captured, capturedMs + CONVERSION_STALENESS_MS + 1000),
    ).toBe(true);
  });

  it("treats an unparseable timestamp as stale (never shown as fresh)", () => {
    expect(isConversionStale("not-a-timestamp", capturedMs)).toBe(true);
  });
});

describe("formatCapturedUtcDate", () => {
  it("renders the captured UTC date as YYYY-MM-DD regardless of source offset", () => {
    expect(formatCapturedUtcDate("2026-10-01T12:00:00.000Z")).toBe(
      "2026-10-01",
    );
    expect(formatCapturedUtcDate("2026-10-01T05:30:00+05:30")).toBe(
      "2026-10-01",
    );
    expect(formatCapturedUtcDate("2026-09-30T23:59:59-05:00")).toBe(
      "2026-10-01",
    );
  });

  it("throws for an unparseable timestamp instead of rendering an invented date", () => {
    expect(() => formatCapturedUtcDate("not-a-timestamp")).toThrow();
  });
});

describe("approximateConversionView", () => {
  const converted = {
    amountMinor: "2999",
    currency: "USD",
    rateSource: "fixture-provider quote fx-1",
    rateAt: "2026-10-01T12:00:00.000Z",
    stale: false,
  };

  it("renders the muted approximate line with amount, code, source, and captured UTC date", () => {
    const view = approximateConversionView({
      originalAmountMinor: "2499",
      originalCurrency: "INR",
      converted,
    });
    expect(view).not.toBeNull();
    expect(view?.visible).toBe(
      "≈ 29.99 USD · fixture-provider quote fx-1 · captured 2026-10-01",
    );
    expect(view?.accessible).toBe(
      "Approximately 29.99 USD — rate source fixture-provider quote fx-1, captured 2026-10-01.",
    );
    expect(view?.stale).toBe(false);
  });

  it("renders a stale tuple as the identical line with its captured date", () => {
    const fresh = approximateConversionView({
      originalAmountMinor: "2499",
      originalCurrency: "INR",
      converted,
    });
    const stale = approximateConversionView({
      originalAmountMinor: "2499",
      originalCurrency: "INR",
      converted: { ...converted, stale: true },
    });
    expect(stale?.stale).toBe(true);
    expect(stale?.visible).toBe(fresh?.visible);
    expect(stale?.accessible).toBe(fresh?.accessible);
  });

  it("returns null for original-only, opaque-original, and malformed states", () => {
    for (const snapshot of [
      { originalAmountMinor: "2499", originalCurrency: "INR", converted: null },
      {
        originalAmountMinor: null,
        originalCurrency: null,
        converted,
      },
      {
        originalAmountMinor: "9007199254740993",
        originalCurrency: "XYZ",
        converted,
      },
      {
        originalAmountMinor: "2499",
        originalCurrency: "INR",
        converted: { ...converted, amountMinor: "12.5" },
      },
      {
        originalAmountMinor: "2499",
        originalCurrency: "INR",
        converted: { ...converted, currency: "XYZ" },
      },
      {
        originalAmountMinor: "2499",
        originalCurrency: "INR",
        converted: { ...converted, rateAt: "not-a-timestamp" },
      },
    ]) {
      expect(approximateConversionView(snapshot)).toBeNull();
    }
  });
});

it("maps private copy provenance to only a destination flag", () => {
  const snapshot = toWishlistItemSnapshot({
    ...baseRow(),
    copied_from_item_id: "00000000-0000-4000-8000-000000000001",
  });
  expect(snapshot.isCopied).toBe(true);
  expect(snapshot).not.toHaveProperty("copied_from_item_id");
  expect(toWishlistItemSnapshot(baseRow()).isCopied).toBeUndefined();
});
