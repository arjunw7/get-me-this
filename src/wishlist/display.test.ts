import { describe, expect, it } from "vitest";

import {
  DESIRE_LEVELS,
  type StoredDesireLevel,
  type WishlistItemRow,
  formatItemCount,
  formatMoneyMinor,
  toWishlistItemSnapshot,
} from "./display";

/**
 * The pure display contracts of the wishlist read path (005b): the pinned
 * minor-unit money format, the 1:1 desire-level mapping to the approved V18
 * strings, and the item-count phrasing.
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
});
