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
  original_amount_minor: number | null;
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
 * ISO 4217 minor-unit (decimal) digits for the currencies Phase 4 can
 * display, pinned by unit tests. Zero-decimal currencies render no
 * fractional digits; three-decimal currencies keep their precision; every
 * other code defaults to two. No locale is ever consulted (brief
 * resolution 4: "No locale-invented symbol sets").
 */
const CURRENCY_MINOR_DIGITS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  VND: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};
const DEFAULT_MINOR_DIGITS = 2;

/**
 * The pinned money format (brief resolution 4): the stored original amount
 * in the currency's major units at the currency's minor-unit precision,
 * then a space, then the uppercase ISO 4217 code. 2499 minor INR renders
 * exactly "24.99 INR"; 3500 minor JPY renders exactly "3500 JPY". The
 * original is never replaced by a converted value.
 */
export function formatMoneyMinor(
  amountMinor: number,
  currency: string,
): string {
  const digits =
    CURRENCY_MINOR_DIGITS[currency.toUpperCase()] ?? DEFAULT_MINOR_DIGITS;
  const major = (amountMinor / 10 ** digits).toFixed(digits);
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
