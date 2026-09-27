/**
 * Typed analytics boundary. Every payload type here is *derived* from
 * EVENT_DEFINITIONS so the runtime catalog and the compile-time types can
 * never drift. Unknown event names and unsupported properties fail
 * TypeScript compilation; the runtime validator
 * (src/analytics/validation.ts) enforces the same allowlist before capture.
 */
import type {
  AnalyticsEventName,
  BooleanPropertyDefinition,
  EventDefinition,
  StringEnumPropertyDefinition,
} from "./event-definitions";
import { EVENT_DEFINITIONS } from "./event-definitions";

/** Resolves a property definition to its permitted value type. */
export type PropertyValueType<D> = D extends { kind: "boolean" }
  ? boolean
  : D extends { values: readonly (infer V)[] }
    ? V
    : never;

/** The exact permitted payload for one catalog event. */
export type EventProperties<E extends AnalyticsEventName> = {
  readonly [
    K in keyof (typeof EVENT_DEFINITIONS)[E]["properties"]
  ]: PropertyValueType<(typeof EVENT_DEFINITIONS)[E]["properties"][K]>;
};

// Compile-time proof helpers used by the type-level tests.
type DefinitionOf<E extends AnalyticsEventName> =
  (typeof EVENT_DEFINITIONS)[E] extends EventDefinition
    ? (typeof EVENT_DEFINITIONS)[E]
    : never;

export type DefinitionOfEvent<E extends AnalyticsEventName> = DefinitionOf<E>;

/** Runtime shape used by the validator (imported lazily by tests). */
export type RuntimePropertyDefinition =
  StringEnumPropertyDefinition | BooleanPropertyDefinition;

/** Result of a validated capture attempt. Never thrown to product code. */
export type AnalyticsCaptureResult =
  | { readonly ok: true; readonly delivered: boolean }
  | {
      readonly ok: false;
      readonly code:
        | "unknown-event"
        | "missing-key"
        | "unknown-key"
        | "invalid-enum-value"
        | "invalid-property-type"
        | "invalid-context"
        | "send-failed";
      /** Safe identifier: the property name or event name only, never a value. */
      readonly detail: string;
    };

/**
 * Server-authoritative analytics boundary. Product code receives this
 * interface only; it can never touch posthog-node directly (enforced by the
 * SDK-ownership ESLint rule).
 */
export interface ServerAnalytics {
  /**
   * Validates the payload against the catalog and, when the server lane is
   * configured, captures and flushes it. Generic over the catalog event
   * name: unknown names and unsupported properties fail TypeScript
   * compilation, while runtime validation still guards untyped or dynamic
   * callers. Never throws; a rejected payload or a delivery failure is
   * reported through the result.
   */
  capture<E extends AnalyticsEventName>(
    event: E,
    properties: EventProperties<E>,
    context: ServerCaptureContext,
  ): Promise<AnalyticsCaptureResult>;
  /** Explicit, idempotent application-controlled shutdown. */
  shutdown(): Promise<void>;
}

/**
 * Identity context for a server capture. The distinct id is always the
 * internal Supabase user UUID; group context uses the internal group UUID.
 * No email, display name, or group name may ever reach analytics.
 */
export interface ServerCaptureContext {
  readonly distinctId: string;
  readonly group?: { readonly id: string };
}
