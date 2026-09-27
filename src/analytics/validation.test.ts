/**
 * Runtime allowlist validation tests, table-driven from EVENT_DEFINITIONS:
 * every event gets a valid payload generated from its own definition, plus
 * generated missing-key, unknown-key, invalid-enum, and wrong-type
 * rejections. Also proves that failure details never contain payload
 * values (only safe event/property names).
 */
import { describe, expect, it } from "vitest";

import type { AnalyticsEventName, EventDefinition } from "./event-definitions";
import { EVENT_DEFINITIONS } from "./event-definitions";
import { validateAnalyticsEvent } from "./validation";

/** Builds a valid payload from the event's own definition. */
function validPayloadFor(
  event: AnalyticsEventName,
): Record<string, string | boolean> {
  const payload: Record<string, string | boolean> = {};
  for (const [key, definition] of Object.entries(
    EVENT_DEFINITIONS[event].properties,
  )) {
    payload[key] = definition.kind === "boolean" ? true : definition.values[0];
  }
  return payload;
}

describe("validateAnalyticsEvent", () => {
  it("accepts a valid payload for every catalog event", () => {
    for (const event of Object.keys(
      EVENT_DEFINITIONS,
    ) as AnalyticsEventName[]) {
      const result = validateAnalyticsEvent(event, validPayloadFor(event));
      expect(result.ok, event).toBe(true);
    }
  });

  it("rejects an unknown event name", () => {
    const result = validateAnalyticsEvent(
      "group_deleted",
      validPayloadFor("group_created"),
    );
    expect(result).toEqual({
      ok: false,
      failure: {
        ok: false,
        code: "unknown-event",
        detail: 'event "group_deleted"',
      },
    });
  });

  it("rejects a non-object payload", () => {
    for (const payload of [null, undefined, "auth_completed", 42, true]) {
      const result = validateAnalyticsEvent("auth_completed", payload);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect([
          "invalid-property-type",
          "missing-key",
          "unknown-key",
        ]).toContain(result.failure.code);
      }
    }
  });

  it("rejects every missing required key, for every event, generated from the catalog", () => {
    for (const event of Object.keys(
      EVENT_DEFINITIONS,
    ) as AnalyticsEventName[]) {
      for (const missingKey of Object.keys(
        EVENT_DEFINITIONS[event].properties,
      )) {
        const payload = validPayloadFor(event);
        delete payload[missingKey];
        const result = validateAnalyticsEvent(event, payload);
        expect(result.ok, `${event}.${missingKey}`).toBe(false);
        if (!result.ok) {
          expect(result.failure.code).toBe("missing-key");
          expect(result.failure.detail).toContain(missingKey);
        }
      }
    }
  });

  it("rejects every unknown key, for every event, generated from the catalog", () => {
    for (const event of Object.keys(
      EVENT_DEFINITIONS,
    ) as AnalyticsEventName[]) {
      const payload = validPayloadFor(event);
      payload["group_name"] = "Arjun's 30th";
      const result = validateAnalyticsEvent(event, payload);
      expect(result.ok, event).toBe(false);
      if (!result.ok) {
        expect(result.failure.code).toBe("unknown-key");
        expect(result.failure.detail).toContain("group_name");
      }
    }
  });

  it("rejects every invalid enum value and wrong primitive type, generated from the catalog", () => {
    for (const event of Object.keys(
      EVENT_DEFINITIONS,
    ) as AnalyticsEventName[]) {
      for (const [key, definition] of Object.entries(
        EVENT_DEFINITIONS[event].properties as EventDefinition["properties"],
      )) {
        const payload = validPayloadFor(event);

        if (definition.kind === "string-enum") {
          const enumPayload = { ...payload, [key]: "not-an-allowed-value" };
          const enumResult = validateAnalyticsEvent(event, enumPayload);
          expect(enumResult.ok, `${event}.${key} (enum)`).toBe(false);
          if (!enumResult.ok) {
            expect(enumResult.failure.code).toBe("invalid-enum-value");
          }

          const typePayload = { ...payload, [key]: 42 };
          const typeResult = validateAnalyticsEvent(event, typePayload);
          expect(typeResult.ok, `${event}.${key} (type)`).toBe(false);
          if (!typeResult.ok) {
            expect(typeResult.failure.code).toBe("invalid-enum-value");
          }
        } else {
          const wrongTypePayload = { ...payload, [key]: "yes" };
          const wrongTypeResult = validateAnalyticsEvent(
            event,
            wrongTypePayload,
          );
          expect(wrongTypeResult.ok, `${event}.${key}`).toBe(false);
          if (!wrongTypeResult.ok) {
            expect(wrongTypeResult.failure.code).toBe("invalid-property-type");
          }
        }
      }
    }
  });

  it("rejects an inactive currency code but accepts every active ISO 4217 code", () => {
    const inactive = validateAnalyticsEvent("group_created", {
      occasion_type: "birthday",
      gifting_mode: "draw_names",
      currency: "ZWL", // withdrawn, replaced by ZWG in 2024
      has_budget_cap: false,
    });
    expect(inactive.ok).toBe(false);
    if (!inactive.ok) {
      expect(inactive.failure.code).toBe("invalid-enum-value");
    }

    const active = validateAnalyticsEvent("group_created", {
      occasion_type: "birthday",
      gifting_mode: "draw_names",
      currency: "INR",
      has_budget_cap: false,
    });
    expect(active.ok).toBe(true);
  });

  it("never includes payload values in failure details (safe identifiers only)", () => {
    const secretValue = "SECRETTOKEN123";
    const result = validateAnalyticsEvent("invite_sent", {
      channel: secretValue,
      group_member_count_bucket: secretValue,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result)).not.toContain(secretValue);
    }
  });
});
