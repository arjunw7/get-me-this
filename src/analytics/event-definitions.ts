/**
 * Single source of truth for the ten server-authoritative business events.
 *
 * The tracking plan (docs/analytics/tracking-plan.md) defines the catalog,
 * the required properties, and the privacy exclusions. This module encodes
 * that catalog once: TypeScript payload types (src/analytics/types.ts) and
 * the runtime allowlist validator (src/analytics/validation.ts) are both
 * derived from these definitions, so the compile-time and runtime boundaries
 * can never drift apart.
 *
 * No event in this catalog may be emitted from the client lane. The client
 * lane owns only consent-gated session replay, sanitized pageviews, and
 * identity linking.
 */

/** Definition of a property whose only permitted values are listed strings. */
export interface StringEnumPropertyDefinition<
  V extends readonly string[] = readonly string[],
> {
  readonly kind: "string-enum";
  readonly values: V;
}

/** Definition of a property whose only permitted value is `true` or `false`. */
export interface BooleanPropertyDefinition {
  readonly kind: "boolean";
}

export type EventPropertyDefinition =
  StringEnumPropertyDefinition | BooleanPropertyDefinition;

/** Helper that keeps the literal value types of an allowed-value list. */
export const stringEnum = <const V extends readonly string[]>(
  values: V,
): StringEnumPropertyDefinition<V> => ({
  kind: "string-enum",
  values,
});

export const booleanProperty: BooleanPropertyDefinition = { kind: "boolean" };

/**
 * The complete active ISO 4217 alphabetic currency code list.
 *
 * Mirrored verbatim from the official ISO 4217 "List one — Currency and
 * funds" published 2026-09-17 by the ISO maintenance agency (SIX Group):
 * https://www.currency-iso.org/dam/downloads/lists/list_one.xml
 *
 * The mirror is complete and unedited on purpose: analytics must not
 * silently reject a legitimate globally supported currency, and analytics
 * must not independently define product availability. When the product
 * defines its single shared supported-currency constant, that decision
 * replaces this mirror (see docs/analytics/enabling-posthog.md).
 */
export const SUPPORTED_CURRENCIES = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BOV",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHE",
  "CHF",
  "CHW",
  "CLF",
  "CLP",
  "CNY",
  "COP",
  "COU",
  "CRC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MXV",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "USN",
  "UYI",
  "UYU",
  "UYW",
  "UZS",
  "VED",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAD",
  "XAF",
  "XAG",
  "XAU",
  "XBA",
  "XBB",
  "XBC",
  "XBD",
  "XCD",
  "XCG",
  "XDR",
  "XOF",
  "XPD",
  "XPF",
  "XPT",
  "XSU",
  "XTS",
  "XUA",
  "XXX",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
] as const;

export interface EventDefinition {
  readonly properties: Readonly<Record<string, EventPropertyDefinition>>;
}

/**
 * The ten server-authoritative business events with their exact allowed
 * values. Every controlled property is an enum or a strict boolean; no
 * free-form strings, raw prices, user content, or identifiers other than
 * internal UUIDs passed as the distinct id / group context by the adapter.
 */
export const EVENT_DEFINITIONS = {
  auth_completed: {
    properties: {
      // v1 authentication is email OTP/magic-link only; the enum is kept so a
      // future provider does not loosen the boundary silently.
      method: stringEnum(["email"]),
      is_new_user: booleanProperty,
    },
  },
  onboarding_completed: {
    properties: {
      avatar_selected: booleanProperty,
    },
  },
  group_created: {
    properties: {
      occasion_type: stringEnum([
        "birthday",
        "diwali",
        "eid",
        "wedding",
        "housewarming",
        "secret_santa",
        "other",
      ]),
      gifting_mode: stringEnum([
        "draw_names",
        "gift_everyone",
        "share_wishlists_only",
      ]),
      currency: stringEnum(SUPPORTED_CURRENCIES),
      has_budget_cap: booleanProperty,
    },
  },
  invite_sent: {
    properties: {
      channel: stringEnum(["link", "email"]),
      group_member_count_bucket: stringEnum(["1-4", "5-9", "10+"]),
    },
  },
  invite_accepted: {
    properties: {
      was_authenticated: booleanProperty,
    },
  },
  wishlist_item_added: {
    properties: {
      entry_method: stringEnum(["manual", "link"]),
      has_price: booleanProperty,
      has_image: booleanProperty,
    },
  },
  product_extraction_completed: {
    properties: {
      outcome: stringEnum(["succeeded", "partial", "failed"]),
      duration_bucket: stringEnum([
        "under_2s",
        "2_to_5s",
        "5_to_10s",
        "over_10s",
      ]),
      manual_fallback_offered: booleanProperty,
    },
  },
  gifting_mode_selected: {
    properties: {
      gifting_mode: stringEnum([
        "draw_names",
        "gift_everyone",
        "share_wishlists_only",
      ]),
      changed_from_existing: booleanProperty,
    },
  },
  name_draw_completed: {
    properties: {
      participant_count_bucket: stringEnum(["2-3", "4-6", "7-10", "11+"]),
      is_redraw: booleanProperty,
    },
  },
  group_activated: {
    properties: {
      gifting_mode: stringEnum([
        "draw_names",
        "gift_everyone",
        "share_wishlists_only",
      ]),
      member_count_bucket: stringEnum(["3-4", "5-9", "10+"]),
      time_to_activation_bucket: stringEnum([
        "under_24h",
        "1_to_3_days",
        "4_to_7_days",
        "over_7_days",
      ]),
    },
  },
} as const satisfies Record<string, EventDefinition>;

export type AnalyticsEventName = keyof typeof EVENT_DEFINITIONS;

/** Every property name used anywhere in the catalog (for tests). */
export type CatalogPropertyName = {
  [E in AnalyticsEventName]: keyof (typeof EVENT_DEFINITIONS)[E]["properties"];
}[AnalyticsEventName];
