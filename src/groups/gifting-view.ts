/**
 * Pure presentation helpers for the gift-everyone checklist screen (008b).
 * No database, session, or environment access: these are the truthful-state
 * and mode-dispatch decisions the server render and the tests share.
 */

export type GiftingMode = "secret_draw" | "gift_everyone" | "wishlist_only";

/** Dispatch only after the authorized active-room projection has succeeded. */
export function giftingRouteState(
  mode: string | null,
  groupStatus: string | null,
): "checklist" | "secret" | "browse" | "not-found" {
  if (groupStatus !== "active") return "not-found";
  if (mode === "gift_everyone") return "checklist";
  if (mode === "secret_draw") return "secret";
  if (mode === "wishlist_only") return "browse";
  return "not-found";
}

/** Truthful, never color-only state text for a checklist row. */
export function statusLabel(status: "todo" | "completed" | null): string {
  return status === "completed" ? "Completed" : "To gift";
}

/**
 * The per-person budget guidance line, rendered from integer minor units
 * and the stored currency. Presentation only — never enforcement.
 */
export function budgetLine(
  amountMinor: number | null,
  currency: string | null,
): string | null {
  if (amountMinor === null || currency === null) return null;
  const major = amountMinor / 100;
  return `Budget guidance: ${currency} ${major.toFixed(2)} per person`;
}
