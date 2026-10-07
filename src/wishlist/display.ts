import { currencyMinorDigits } from "./currency-metadata";

/**
 * Pure display contracts for the wishlist read path (005b). Everything here
 * is deterministic and testable without a DOM or a database: the pinned
 * minor-unit money format (brief resolution 4), the 1:1 desire-level
 * mapping to the approved V18 strings (resolution 5), and the item-count
 * phrasing. The row-to-snapshot mapper is the single shape the UI renders
 * from.
 */

/**
 * The stored `wishlist_items` columns 005b/005g select — the display
 * snapshot shape pinned by the brief's server-data-access contract. 005g
 * claims the converted-money tuple: the four columns are selected
 * explicitly and carried as exact strings, never through a number.
 */
export type WishlistItemRow = {
  id: string;
  copied_from_item_id?: string | null;
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
  converted_amount_minor: string | null;
  converted_currency: string | null;
  conversion_rate_source: string | null;
  conversion_rate_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A complete stored converted-money tuple (005a), carried as exact
 * strings: canonical bigint minor amount, the stored ISO code, the rate
 * source label, and the moment the provider rate was fetched (not the
 * save time). `stale` is evaluated once at server read time against the
 * pinned 24-hour window; staleness never hides the line. The display
 * layer never joins a rates cache.
 */
export type ConvertedMoneyTuple = {
  amountMinor: string;
  currency: string;
  rateSource: string;
  rateAt: string;
  stale: boolean;
};

export type StoredDesireLevel = "really_want" | "would_love" | "just_an_idea";

/** The stored enum mapped 1:1 to the approved V18 display strings. */
export const DESIRE_LEVELS: Readonly<Record<StoredDesireLevel, string>> = {
  really_want: "Really want",
  would_love: "Would love",
  just_an_idea: "Just an idea",
};

const MAX_BIGINT_AMOUNT = "9223372036854775807";

/** Canonical non-negative PostgreSQL bigint decimal string, bounded. */
function isCanonicalMinorAmount(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(0|[1-9][0-9]*)$/.test(value) &&
    (value.length < MAX_BIGINT_AMOUNT.length ||
      (value.length === MAX_BIGINT_AMOUNT.length && value <= MAX_BIGINT_AMOUNT))
  );
}

function assertExactMinorAmount(value: unknown): asserts value is string {
  if (!isCanonicalMinorAmount(value)) {
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
  const digits = currencyMinorDigits(currency);
  if (digits === null)
    throw new Error("currency has no supported numeric minor-unit precision");
  const padded = amountMinor.padStart(digits + 1, "0");
  const major =
    digits === 0
      ? amountMinor
      : `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
  return `${major} ${currency.toUpperCase()}`;
}

export { currencyMinorDigits };

/**
 * The pinned approximate-conversion contract (005g, dormant until the
 * provider gate). Everything here is exact integer arithmetic on BigInt:
 * rates are never binary floats in transport, storage, or arithmetic, and
 * no `Number`, `parseFloat`, `Intl`, or float appears in the path.
 */

/** The maximum rate fractional digits (005g: at most 12). */
const MAX_RATE_FRACTION_DIGITS = 12;

/**
 * The pinned staleness window (005g): a tuple is stale strictly when
 * `now - conversion_rate_at > 24h` — exactly 24h is not stale, 24h+1s is.
 */
export const CONVERSION_STALENESS_MS = 24 * 60 * 60 * 1000;

/**
 * Parses the pinned rate representation: a positive exact decimal string,
 * no sign, no exponent, no separators, no symbols, at most 12 fractional
 * digits, defined as converted major units per original major unit.
 * Returns the rate's integer digit value and fractional-digit count so
 * the conversion keeps exact integer arithmetic.
 */
export function parseConversionRate(rate: string): {
  value: bigint;
  fractionalDigits: number;
} {
  if (
    !/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(rate) ||
    (rate.includes(".") && rate.split(".")[1].length > MAX_RATE_FRACTION_DIGITS)
  ) {
    throw new Error("conversion rate is not a pinned exact decimal string");
  }
  const value = BigInt(rate.replace(".", ""));
  if (value === BigInt(0)) throw new Error("conversion rate must be positive");
  return {
    value,
    fractionalDigits: rate.includes(".")
      ? (rate.split(".")[1] as string).length
      : 0,
  };
}

/**
 * The pinned round-half-up reference implementation (005g). `d_o`/`d_t`
 * are the minor-digit exponents of the original and converted currencies;
 * `d_r` the rate's fractional-digit count and `R` its digits as an
 * integer. With `N = O × R × 10^d_t` and `D = 10^(d_o + d_r)`:
 * `converted_minor = floor((2N + D) / (2D))` — ties round up (amounts
 * are non-negative). A result above the bigint maximum is an overflow
 * failure: no conversion is stored or shown.
 */
export function convertAmountMinorWithRate(
  originalAmountMinor: string,
  rate: string,
  originalCurrency: string,
  convertedCurrency: string,
): string {
  if (!isCanonicalMinorAmount(originalAmountMinor)) {
    throw new Error("original amount is not a canonical bigint string");
  }
  const dO = currencyMinorDigits(originalCurrency);
  const dT = currencyMinorDigits(convertedCurrency);
  if (dO === null || dT === null) {
    throw new Error("conversion currency has no supported minor-unit digits");
  }
  const { value: R, fractionalDigits: dR } = parseConversionRate(rate);
  const O = BigInt(originalAmountMinor);
  const N = O * R * BigInt(10) ** BigInt(dT);
  const D = BigInt(10) ** BigInt(dO + dR);
  const converted = (BigInt(2) * N + D) / (BigInt(2) * D);
  if (converted > BigInt(MAX_BIGINT_AMOUNT)) {
    throw new Error("converted amount overflows the PostgreSQL bigint range");
  }
  return converted.toString();
}

/**
 * The pinned staleness comparison (005g): strictly older than 24 hours at
 * server read time. A tuple captured exactly 24h ago is not stale; 24h
 * and 1s is. Staleness never hides the line and never blocks the item.
 */
export function isConversionStale(rateAt: string, nowMs: number): boolean {
  const captured = Date.parse(rateAt);
  if (!Number.isFinite(captured)) return true;
  return nowMs - captured > CONVERSION_STALENESS_MS;
}

/** The captured UTC date as `YYYY-MM-DD`, deterministic for any viewer. */
export function formatCapturedUtcDate(rateAt: string): string {
  const captured = new Date(rateAt);
  if (Number.isNaN(captured.getTime())) {
    throw new Error("conversion captured timestamp is not a valid date");
  }
  return captured.toISOString().slice(0, 10);
}

/**
 * The muted approximate line rendered below the original price. The
 * visible text is `≈ {major} {CODE} · {source} · captured {date}`; the
 * accessible text spells out "approximately" (the glyph alone is never
 * announced) with the amount, code, rate source, and captured date.
 * Stale tuples render this identical line with their captured date.
 */
export type ApproximateConversionView = {
  visible: string;
  accessible: string;
  stale: boolean;
};

/**
 * Resolves the approximate-conversion view for a snapshot, or null when
 * the state is original-only: no stored tuple, an incomplete or malformed
 * tuple, an unsupported converted code, an unparseable captured
 * timestamp, or an unsupported original code (whose opaque-price
 * treatment stays original-only). Conversion is never inferred from
 * locale, browser language, or currency symbol. Never throws for
 * converted-tuple faults: any violation degrades to original-only
 * display, never a rendered float or a thrown error in the list view.
 */
export function approximateConversionView(
  snapshot: Pick<
    WishlistItemSnapshot,
    "originalAmountMinor" | "originalCurrency" | "converted"
  >,
): ApproximateConversionView | null {
  if (
    snapshot.originalAmountMinor === null ||
    snapshot.originalCurrency === null ||
    currencyMinorDigits(snapshot.originalCurrency) === null ||
    snapshot.converted === null
  ) {
    return null;
  }
  const converted = snapshot.converted;
  let amountText: string;
  try {
    amountText = formatMoneyMinor(converted.amountMinor, converted.currency);
  } catch {
    return null;
  }
  let capturedDate: string;
  try {
    capturedDate = formatCapturedUtcDate(converted.rateAt);
  } catch {
    return null;
  }
  return {
    visible: `≈ ${amountText} · ${converted.rateSource} · captured ${capturedDate}`,
    accessible: `Approximately ${amountText} — rate source ${converted.rateSource}, captured ${capturedDate}.`,
    stale: converted.stale,
  };
}

/** The pinned item-count phrasing: "N things", or "1 thing". */
export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "thing" : "things"}`;
}

/**
 * Fails the converted tuple safe (005g): an incomplete or malformed
 * stored tuple — which the 005a CHECK should make impossible — omits the
 * approximate line and shows the original, never an invented or partial
 * value. An unsupported converted code degrades the same way.
 */
function optionalConvertedTuple(
  row: WishlistItemRow,
  nowMs: number,
): ConvertedMoneyTuple | null {
  const values = [
    row.converted_amount_minor,
    row.converted_currency,
    row.conversion_rate_source,
    row.conversion_rate_at,
  ];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) return null;
  const [amountMinor, currency, rateSource, rateAt] = values as [
    string,
    string,
    string,
    string,
  ];
  if (!isCanonicalMinorAmount(amountMinor)) return null;
  if (currencyMinorDigits(currency) === null) return null;
  if (Number.isNaN(Date.parse(rateAt))) return null;
  return {
    amountMinor,
    currency,
    rateSource,
    rateAt,
    stale: isConversionStale(rateAt, nowMs),
  };
}

/**
 * Maps a stored row into the display snapshot, validating the closed
 * desire-level enum. An unknown level is an invariant violation (the
 * column is a Postgres enum): fail loudly rather than render an invented
 * label. Converted-tuple faults degrade to original-only display instead
 * of throwing. `nowMs` is the server clock at read time, pinning the
 * staleness evaluation for the converted tuple; the default is the mapper
 * call time, which for the server read is the read time.
 */
export function toWishlistItemSnapshot(
  row: WishlistItemRow,
  nowMs: number = Date.now(),
) {
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
    ...(row.copied_from_item_id ? { isCopied: true as boolean } : {}),
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
    converted: optionalConvertedTuple(row, nowMs),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type WishlistItemSnapshot = ReturnType<typeof toWishlistItemSnapshot>;

/**
 * The client-safe item view (005f): the raw private Storage object path is
 * stripped before anything crosses into a client component, and the
 * snapshot-first image source is precomputed server-side — the
 * short-expiry signed snapshot URL when one could be created, else the
 * remote `image_url`, else null (the branded placeholder), exactly per
 * 005a resolution 7's pinned fallback order.
 */
export type WishlistItemView = Omit<
  WishlistItemSnapshot,
  "imageSnapshotPath" | "imageUrl"
> & { readonly imageSrc: string | null };

/**
 * Maps a server-side display snapshot into the client-safe view. The raw
 * path never leaves the server: it is dropped here and replaced by the
 * resolved image source.
 */
export function toItemView(
  snapshot: WishlistItemSnapshot,
  signedUrl: string | null,
): WishlistItemView {
  const { imageSnapshotPath, imageUrl, ...rest } = snapshot;
  void imageSnapshotPath;
  void imageUrl;
  return { ...rest, imageSrc: signedUrl ?? snapshot.imageUrl };
}

/** The owner's wishlist rendered as client-safe views. */
export type OwnWishlistView = {
  readonly wishlistId: string;
  readonly items: readonly WishlistItemView[];
};
