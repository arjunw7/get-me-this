/**
 * Runtime allowlist validator, generated from EVENT_DEFINITIONS.
 *
 * This is the enforcement boundary the approved plan requires: unknown keys,
 * missing keys, invalid enum values, and wrong primitive types are rejected
 * *before* anything reaches an adapter. It does not rely on TypeScript
 * excess-property checks or on a prohibited-key blacklist: only the exact
 * catalog is accepted.
 */
import type {
  AnalyticsEventName,
  EventPropertyDefinition,
} from "./event-definitions";
import { EVENT_DEFINITIONS } from "./event-definitions";
import type { AnalyticsCaptureResult } from "./types";

type ValidationFailure = Extract<AnalyticsCaptureResult, { ok: false }>;

/**
 * Validates one payload against the catalog. Returns a discriminated result;
 * never inspects or returns payload values, so a rejection can be logged
 * safely (the failure carries only the event and property names).
 */
export function validateAnalyticsEvent(
  event: string,
  properties: unknown,
): { ok: true } | { ok: false; failure: ValidationFailure } {
  if (!Object.hasOwn(EVENT_DEFINITIONS, event)) {
    return {
      ok: false,
      failure: { ok: false, code: "unknown-event", detail: `event "${event}"` },
    };
  }

  if (typeof properties !== "object" || properties === null) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: "invalid-property-type",
        detail: "payload must be an object",
      },
    };
  }

  const definition: Record<string, EventPropertyDefinition> = (
    EVENT_DEFINITIONS as Record<
      string,
      { properties: Record<string, EventPropertyDefinition> }
    >
  )[event].properties;

  const received = properties as Record<string, unknown>;
  const receivedKeys = Object.keys(received);

  for (const key of Object.keys(definition)) {
    if (!Object.hasOwn(received, key)) {
      return {
        ok: false,
        failure: {
          ok: false,
          code: "missing-key",
          detail: `"${event}" is missing "${key}"`,
        },
      };
    }
  }

  for (const key of receivedKeys) {
    if (!Object.hasOwn(definition, key)) {
      return {
        ok: false,
        failure: {
          ok: false,
          code: "unknown-key",
          detail: `"${event}" does not allow "${key}"`,
        },
      };
    }

    const propertyDefinition = definition[key];
    const value = received[key];

    if (propertyDefinition.kind === "boolean") {
      if (typeof value !== "boolean") {
        return {
          ok: false,
          failure: {
            ok: false,
            code: "invalid-property-type",
            detail: `"${event}"."${key}" must be boolean`,
          },
        };
      }
    } else {
      if (
        typeof value !== "string" ||
        !propertyDefinition.values.includes(value)
      ) {
        return {
          ok: false,
          failure: {
            ok: false,
            code: "invalid-enum-value",
            detail: `"${event}"."${key}" has a value outside its allowed list`,
          },
        };
      }
    }
  }

  return { ok: true };
}

/** Type-level guard used by the adapters: narrows to a catalog event name. */
export function isAnalyticsEventName(
  event: string,
): event is AnalyticsEventName {
  return Object.hasOwn(EVENT_DEFINITIONS, event);
}

/**
 * Shared UUID check for identity context. Analytics distinct ids and group
 * ids must be internal UUIDs — never an email, display name, or other
 * identifier.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
