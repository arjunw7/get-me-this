import {
  CURRENCY_EXPONENTS,
  type SelectableCurrency,
} from "@/src/groups/occasions";

/**
 * Deterministic presentation for the invitation preview (brief 006c, and
 * the hard-won ARJ-27/006b lesson): the locale and IANA time zone are
 * PINNED for every rendered date and amount, so visual baselines are
 * byte-identical across server/client locales, devices, and CI runners.
 * The stored instant and minor-unit amount stay authoritative; only the
 * presentation is pinned.
 */

const PINNED_LOCALE = "en-IN";
const PINNED_TIME_ZONE = "Asia/Kolkata";

/**
 * The exact minor-unit currency formatter: an exact integer amount of
 * minor units rendered in the currency's own convention. Null amounts
 * (groups without a budget) render null.
 */
export function formatBudget(
  amountMinor: number | null,
  currency: string | null,
): string | null {
  if (amountMinor === null || currency === null) return null;
  if (!Number.isInteger(amountMinor) || amountMinor < 0) return null;
  if (!(currency in CURRENCY_EXPONENTS)) return null;
  const exponent = CURRENCY_EXPONENTS[currency as SelectableCurrency];
  const major = amountMinor / 10 ** exponent;
  return new Intl.NumberFormat(PINNED_LOCALE, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(major);
}

/**
 * The occasion date rendered from the stored instant WITHOUT inventing a
 * viewer-local shift: the wall-clock presentation derives from the group's
 * stored semantics through the pinned zone, never the viewer's device
 * zone.
 */
export function formatOccasionDate(occasionAtIso: string): string | null {
  const parsed = new Date(occasionAtIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(PINNED_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: PINNED_TIME_ZONE,
  }).format(parsed);
}

/** Approved gifting-mode product terms for the preview line. */
export function giftingModeCopy(mode: string): string {
  switch (mode) {
    case "secret_draw":
      return "Names are drawn privately.";
    case "gift_everyone":
      return "Everyone gifts every other member.";
    case "wishlist_only":
      return "Wishlists are shared; gifts are picked privately.";
    default:
      return "Wishlists are shared; gifts are picked privately.";
  }
}
