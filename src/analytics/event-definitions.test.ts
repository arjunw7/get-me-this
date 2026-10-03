/**
 * Catalog tests: the ten server-authoritative business events and their
 * exact allowed values, matching docs/analytics/tracking-plan.md, plus the
 * complete active ISO 4217 currency allowlist. Compile-time tests prove,
 * against the REAL exported ServerAnalytics.capture() surface, that unknown
 * event names, missing properties, invalid enum values, and extra
 * object-literal properties fail TypeScript compilation.
 */
import { beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ServerAnalytics, EventProperties } from "./types";
import { EVENT_DEFINITIONS, SUPPORTED_CURRENCIES } from "./event-definitions";

// The compile-time boundary is exercised through the actual exported
// analytics surface; the server-only guard is mocked so the test can import
// it in a Node environment (its client-bundle behaviour is proven
// separately in server-only-guard.test.ts and by the production build).
vi.mock("server-only", () => ({}));

const USER_UUID = "00000000-0000-4000-8000-000000000000";
const CONTEXT = { distinctId: USER_UUID };

const TRACKING_PLAN_EVENTS = [
  "auth_completed",
  "onboarding_completed",
  "group_created",
  "invite_sent",
  "invite_accepted",
  "wishlist_item_added",
  "product_extraction_completed",
  "gifting_mode_selected",
  "name_draw_completed",
  "group_activated",
] as const;

const EXPECTED_PROPERTIES: Record<
  (typeof TRACKING_PLAN_EVENTS)[number],
  string[]
> = {
  auth_completed: ["method", "is_new_user"],
  onboarding_completed: ["avatar_selected"],
  group_created: [
    "occasion_type",
    "gifting_mode",
    "currency",
    "has_budget_cap",
  ],
  invite_sent: ["channel", "group_member_count_bucket"],
  invite_accepted: ["was_authenticated"],
  wishlist_item_added: ["entry_method", "has_price", "has_image"],
  product_extraction_completed: [
    "outcome",
    "duration_bucket",
    "manual_fallback_offered",
  ],
  gifting_mode_selected: ["gifting_mode", "changed_from_existing"],
  name_draw_completed: ["participant_count_bucket", "is_redraw"],
  group_activated: [
    "gifting_mode",
    "member_count_bucket",
    "time_to_activation_bucket",
  ],
};

describe("analytics event catalog", () => {
  it("contains exactly the ten tracking-plan events", () => {
    expect(Object.keys(EVENT_DEFINITIONS).sort()).toEqual(
      [...TRACKING_PLAN_EVENTS].sort(),
    );
  });

  it("declares exactly the required property names for every event", () => {
    for (const event of TRACKING_PLAN_EVENTS) {
      expect(Object.keys(EVENT_DEFINITIONS[event].properties).sort()).toEqual(
        EXPECTED_PROPERTIES[event].slice().sort(),
      );
    }
  });

  it("uses the exact approved allowed values for every controlled property", () => {
    expect(EVENT_DEFINITIONS.auth_completed.properties.method).toMatchObject({
      kind: "string-enum",
      values: ["email"],
    });
    expect(
      EVENT_DEFINITIONS.group_created.properties.occasion_type,
    ).toMatchObject({
      kind: "string-enum",
      values: [
        "birthday",
        "diwali",
        "eid",
        "wedding",
        "housewarming",
        "secret_santa",
        "other",
      ],
    });
    expect(
      EVENT_DEFINITIONS.group_created.properties.gifting_mode,
    ).toMatchObject({
      kind: "string-enum",
      values: ["draw_names", "gift_everyone", "share_wishlists_only"],
    });
    expect(EVENT_DEFINITIONS.invite_sent.properties.channel).toMatchObject({
      kind: "string-enum",
      values: ["link", "email"],
    });
    expect(
      EVENT_DEFINITIONS.invite_sent.properties.group_member_count_bucket,
    ).toMatchObject({
      kind: "string-enum",
      values: ["1-4", "5-9", "10+"],
    });
    expect(
      EVENT_DEFINITIONS.wishlist_item_added.properties.entry_method,
    ).toMatchObject({
      kind: "string-enum",
      values: ["manual", "link"],
    });
    expect(
      EVENT_DEFINITIONS.product_extraction_completed.properties.outcome,
    ).toMatchObject({
      kind: "string-enum",
      values: ["succeeded", "partial", "failed"],
    });
    expect(
      EVENT_DEFINITIONS.product_extraction_completed.properties.duration_bucket,
    ).toMatchObject({
      kind: "string-enum",
      values: ["under_2s", "2_to_5s", "5_to_10s", "over_10s"],
    });
    expect(
      EVENT_DEFINITIONS.name_draw_completed.properties.participant_count_bucket,
    ).toMatchObject({
      kind: "string-enum",
      values: ["2-3", "4-6", "7-10", "11+"],
    });
    expect(
      EVENT_DEFINITIONS.group_activated.properties.member_count_bucket,
    ).toMatchObject({
      kind: "string-enum",
      values: ["3-4", "5-9", "10+"],
    });
    expect(
      EVENT_DEFINITIONS.group_activated.properties.time_to_activation_bucket,
    ).toMatchObject({
      kind: "string-enum",
      values: ["under_24h", "1_to_3_days", "4_to_7_days", "over_7_days"],
    });
  });
});

describe("currency allowlist", () => {
  it("is the complete active ISO 4217 alphabetic list (178 codes)", () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(178);
    expect(new Set(SUPPORTED_CURRENCIES).size).toBe(178);
    for (const code of SUPPORTED_CURRENCIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("includes globally supported currencies and current 2024/2025 revisions", () => {
    expect(SUPPORTED_CURRENCIES).toContain("USD");
    expect(SUPPORTED_CURRENCIES).toContain("EUR");
    expect(SUPPORTED_CURRENCIES).toContain("GBP");
    expect(SUPPORTED_CURRENCIES).toContain("INR");
    // Zimbabwe Gold replaced the Zimbabwe dollar (ZWL) in 2024.
    expect(SUPPORTED_CURRENCIES).toContain("ZWG");
    expect(SUPPORTED_CURRENCIES).not.toContain("ZWL");
    // The Caribbean guilder was added in 2025.
    expect(SUPPORTED_CURRENCIES).toContain("XCG");
  });
});

describe("typed event boundary (compile-time, real ServerAnalytics surface)", () => {
  let analytics: ServerAnalytics;

  beforeAll(async () => {
    const { getServerAnalytics } = await import("./server");
    analytics = getServerAnalytics();
  });

  it("derives the exact payload type for a catalog event", () => {
    expectTypeOf<EventProperties<"auth_completed">>().toEqualTypeOf<{
      readonly method: "email";
      readonly is_new_user: boolean;
    }>();

    expectTypeOf<
      EventProperties<"product_extraction_completed">
    >().toEqualTypeOf<{
      readonly outcome: "succeeded" | "partial" | "failed";
      readonly duration_bucket:
        "under_2s" | "2_to_5s" | "5_to_10s" | "over_10s";
      readonly manual_fallback_offered: boolean;
    }>();
  });

  it("accepts a valid catalog payload on the real capture surface", () => {
    void analytics.capture(
      "auth_completed",
      { method: "email", is_new_user: true },
      CONTEXT,
    );
  });

  it("rejects unknown event names at compile time", () => {
    // @ts-expect-error "group_deleted" is not a catalog event.
    analytics.capture("group_deleted", {}, CONTEXT);
  });

  it("rejects unsupported property values at compile time", () => {
    analytics.capture(
      "invite_sent",
      {
        // @ts-expect-error "sms" is not an approved channel.
        channel: "sms",
        group_member_count_bucket: "1-4",
      },
      CONTEXT,
    );
  });

  it("rejects missing and extra object-literal properties at compile time", () => {
    // @ts-expect-error "was_authenticated" is required.
    analytics.capture("invite_accepted", {}, CONTEXT);

    analytics.capture(
      "invite_accepted",
      {
        was_authenticated: true,
        // @ts-expect-error "group_name" is not an allowed property.
        group_name: "Arjun's birthday",
      },
      CONTEXT,
    );
  });
});
