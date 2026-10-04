import type { MemberWishlistItem } from "./member-wishlist-data";
import { formatMoneyMinor } from "@/src/wishlist/display";

/** Exact original-currency comparison; unknown and foreign prices never count as a fit. */
export function budgetFit(
  item: MemberWishlistItem,
  amount: string | null,
  currency: string | null,
): "within" | "over" | "unknown" {
  if (
    amount === null ||
    currency === null ||
    item.originalCurrency !== currency ||
    item.originalAmountMinor === null
  )
    return "unknown";
  return BigInt(item.originalAmountMinor) <= BigInt(amount) ? "within" : "over";
}

export function giftingMoney(
  amount: string | null,
  currency: string | null,
): string | null {
  if (amount === null || currency === null) return null;
  const exact = formatMoneyMinor(amount, currency);
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    GBP: "£",
    EUR: "€",
  };
  if (!symbols[currency]) return exact;
  const number = exact.slice(0, -(currency.length + 1));
  const [whole, fraction] = number.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symbols[currency]}${grouped}${fraction && !/^0+$/.test(fraction) ? `.${fraction}` : ""}`;
}

export function giftingBudgetLabel(
  item: MemberWishlistItem,
  amount: string | null,
  currency: string | null,
): string | undefined {
  const fit = budgetFit(item, amount, currency);
  if (fit === "within") return "Within budget";
  if (fit === "over")
    return `${giftingMoney((BigInt(item.originalAmountMinor!) - BigInt(amount!)).toString(), currency)} over budget`;
  return undefined;
}
