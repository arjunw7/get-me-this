/**
 * Shared, closed vocabularies for group creation (brief 006b). The client
 * renders these; the Server Action and the database repeat the validation —
 * client state is input, never authority.
 */

export const OCCASIONS = [
  { value: "diwali", label: "Diwali" },
  { value: "eid", label: "Eid" },
  { value: "birthday", label: "Birthday" },
  { value: "wedding", label: "Wedding" },
  { value: "housewarming", label: "Housewarming" },
  { value: "secret_santa", label: "Secret Santa" },
  { value: "other", label: "Something else" },
] as const;

export type OccasionType = (typeof OCCASIONS)[number]["value"];

/**
 * The user-visible occasion stored with the group. `other` stores the exact
 * approved phrase "Something else"; this slice has no free-form occasion.
 */
export function occasionLabel(value: OccasionType): string {
  const match = OCCASIONS.find((occasion) => occasion.value === value);
  return match ? match.label : "Something else";
}

export const GIFTING_MODES = [
  {
    value: "secret_draw",
    name: "Draw names privately",
    short: "Everyone gets one recipient.",
  },
  {
    value: "gift_everyone",
    name: "Gift everyone",
    short: "Everyone buys for every other member, with a budget per person.",
  },
  {
    value: "wishlist_only",
    name: "Share wishlists only",
    short: "No assignments. People browse and reserve gifts privately.",
  },
] as const;

export type GiftingMode = (typeof GIFTING_MODES)[number]["value"];

/** The initial visible currency set, matching Version 18 exactly. */
export const SELECTABLE_CURRENCIES = ["INR", "USD", "GBP", "EUR"] as const;

export type SelectableCurrency = (typeof SELECTABLE_CURRENCIES)[number];

/**
 * ISO 4217 minor-unit exponents for the selectable currencies. The UI and
 * the database share the exact money bounds; expansion of this set is a
 * separate reviewed decision.
 */
export const CURRENCY_EXPONENTS: Record<SelectableCurrency, 0 | 2 | 3> = {
  INR: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
};
