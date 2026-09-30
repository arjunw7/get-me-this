/**
 * Pure display contracts for the wishlist read path (005b). Everything here
 * is deterministic and testable without a DOM or a database: the pinned
 * minor-unit money format (brief resolution 4), the 1:1 desire-level
 * mapping to the approved V18 strings (resolution 5), and the item-count
 * phrasing. The row-to-snapshot mapper is the single shape the UI renders
 * from.
 */

/**
 * The stored `wishlist_items` columns 005b selects — the display snapshot
 * shape pinned by the brief's server-data-access contract. The converted-
 * money tuple is deliberately absent: 005b never renders conversions
 * (005g owns that contract).
 */
export type WishlistItemRow = {
  id: string;
  title: string;
  source_url: string | null;
  retailer: string | null;
  image_url: string | null;
  image_snapshot_path: string | null;
  note: string | null;
  desire_level: string;
  sort_position: number;
  original_amount_minor: string | null;
  original_currency: string | null;
  created_at: string;
  updated_at: string;
};

export type StoredDesireLevel = "really_want" | "would_love" | "just_an_idea";

/** The stored enum mapped 1:1 to the approved V18 display strings. */
export const DESIRE_LEVELS: Readonly<Record<StoredDesireLevel, string>> = {
  really_want: "Really want",
  would_love: "Would love",
  just_an_idea: "Just an idea",
};

/**
 * Non-default minor-unit digits from SIX ISO 4217 List One, published
 * 2026-09-17 and retrieved 2026-09-30:
 * https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml
 * Entries marked N.A. have no published precision and use the documented
 * two-decimal fallback. No locale is consulted.
 */
const CURRENCY_MINOR_DIGITS: Readonly<Record<string, number>> = {
  BHD: 3,
  BIF: 0,
  CLF: 4,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  UYI: 0,
  UYW: 4,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};
const DEFAULT_MINOR_DIGITS = 2;
const MAX_BIGINT_AMOUNT = "9223372036854775807";

function assertExactMinorAmount(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    value.length > MAX_BIGINT_AMOUNT.length ||
    (value.length === MAX_BIGINT_AMOUNT.length && value > MAX_BIGINT_AMOUNT)
  ) {
    throw new Error(
      "original amount is not a canonical PostgreSQL bigint string",
    );
  }
}

/**
 * The pinned money format (brief resolution 4): the stored original amount
 * in the currency's major units at the currency's minor-unit precision,
 * then a space, then the uppercase ISO 4217 code. 2499 minor INR renders
 * exactly "24.99 INR"; 3500 minor JPY renders exactly "3500 JPY". The
 * original is never replaced by a converted value.
 */
export function formatMoneyMinor(
  amountMinor: string,
  currency: string,
): string {
  assertExactMinorAmount(amountMinor);
  const digits =
    CURRENCY_MINOR_DIGITS[currency.toUpperCase()] ?? DEFAULT_MINOR_DIGITS;
  const padded = amountMinor.padStart(digits + 1, "0");
  const major =
    digits === 0
      ? amountMinor
      : `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
  return `${major} ${currency.toUpperCase()}`;
}

/** The pinned item-count phrasing: "N things", or "1 thing". */
export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "thing" : "things"}`;
}

/**
 * Maps a stored row into the display snapshot, validating the closed
 * desire-level enum. An unknown level is an invariant violation (the
 * column is a Postgres enum): fail loudly rather than render an invented
 * label.
 */
export function toWishlistItemSnapshot(row: WishlistItemRow) {
  if (
    (row.original_amount_minor === null) !==
    (row.original_currency === null)
  ) {
    throw new Error(
      "original amount and currency must both be present or absent",
    );
  }
  if (row.original_amount_minor !== null) {
    assertExactMinorAmount(row.original_amount_minor);
  }
  const desireLevel = DESIRE_LEVELS[row.desire_level as StoredDesireLevel]
    ? (row.desire_level as StoredDesireLevel)
    : null;
  if (desireLevel === null) {
    throw new Error(
      `wishlist_items.desire_level is outside the closed display enum: "${row.desire_level}".`,
    );
  }
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    retailer: row.retailer,
    imageUrl: row.image_url,
    imageSnapshotPath: row.image_snapshot_path,
    note: row.note,
    desireLevel,
    sortPosition: row.sort_position,
    originalAmountMinor: row.original_amount_minor,
    originalCurrency: row.original_currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type WishlistItemSnapshot = ReturnType<typeof toWishlistItemSnapshot>;
