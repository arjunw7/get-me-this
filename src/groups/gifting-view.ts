/**
 * Pure presentation helpers for the gift-everyone checklist screen (008b).
 * No database, session, or environment access: these are the truthful-state
 * and mode-dispatch decisions the server render and the tests share.
 */

export type GiftingMode = "secret_draw" | "gift_everyone" | "wishlist_only";

/**
 * Route dispatch for /groups/[groupId]/gifting. Only an active
 * `gift_everyone` group renders the checklist; every other mode — and any
 * unknown mode value — resolves to the same generic not-found result as an
 * outsider request. The dispatch reads only reviewed server projections of
 * the stored mode; no client claim can alter it.
 */
export function giftingRouteState(
  mode: string | null,
  groupStatus: string | null,
): "checklist" | "not-found" {
  return mode === "gift_everyone" && groupStatus === "active"
    ? "checklist"
    : "not-found";
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
