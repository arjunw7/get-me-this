/**
 * Server-authoritative analytics lane (posthog-node 5.54.1).
 *
 * This module is server-only: importing it from any client context throws
 * at build time (the `server-only` guard) so server analytics can never be
 * pulled into a browser bundle, and server-only secrets can never be
 * referenced by client analytics code.
 *
 * Lifecycle contract:
 * - PostHog counts as configured ONLY when both the project token and the
 *   host are present. Any partial configuration returns a TRUE no-op
 *   adapter: nothing is captured, retained, or sent, and no SDK client is
 *   constructed.
 * - Configured captures through one safely managed posthog-node client and
 *   awaits `flush()` after every capture. No batching behaviour is claimed.
 * - No signal listeners are installed. Shutdown is explicit, idempotent,
 *   and owned by application lifecycle code.
 *
 * Identity context contract: `distinctId` and the optional group id are
 * runtime-validated as UUIDs before capture. Invalid identifiers —
 * including emails and names — return a safe `invalid-context` failure and
 * never reach PostHog.
 */
import "server-only";

import { PostHog } from "posthog-node";
import { cookies } from "next/headers";
import { ANALYTICS_CONSENT_COOKIE } from "./consent";

async function hasRequestConsent(): Promise<boolean> {
  try {
    return (await cookies()).get(ANALYTICS_CONSENT_COOKIE)?.value === "granted";
  } catch {
    return false;
  } // No request context (jobs/build) never implies consent.
}

import { isUuid, validateAnalyticsEvent } from "./validation";
import type {
  AnalyticsCaptureResult,
  EventProperties,
  ServerAnalytics,
  ServerCaptureContext,
} from "./types";
import type { AnalyticsEventName } from "./event-definitions";

type CaptureFailure = Extract<AnalyticsCaptureResult, { ok: false }>;

/** Logs a safe identifier (event/property names only). Never a payload value. */
function logRejection(result: CaptureFailure): void {
  console.warn(
    `[analytics] capture rejected: ${result.code} (${result.detail})`,
  );
}

const sendFailure = (): AnalyticsCaptureResult => ({
  ok: false,
  code: "send-failed",
  // Deliberately opaque: error payloads may contain user content and are a
  // tracking-plan prohibited class. Only the class of failure is reported.
  detail: "posthog-node capture or flush threw",
});

/** Runtime context validation for untyped or dynamic callers. */
function validateContext(
  context: ServerCaptureContext,
): CaptureFailure | undefined {
  if (typeof context?.distinctId !== "string" || !isUuid(context.distinctId)) {
    return {
      ok: false,
      code: "invalid-context",
      // Safe identifier: the context key only, never the value.
      detail: "context.distinctId must be an internal UUID",
    };
  }
  if (context.group && !isUuid(context.group.id)) {
    return {
      ok: false,
      code: "invalid-context",
      detail: "context.group.id must be an internal group UUID",
    };
  }
  return undefined;
}

/** True no-op adapter for the unconfigured server lane. Retains nothing. */
const NOOP_SERVER_ANALYTICS: ServerAnalytics = {
  async capture<E extends AnalyticsEventName>(
    event: E,
    properties: EventProperties<E>,
    context: ServerCaptureContext,
  ): Promise<AnalyticsCaptureResult> {
    const contextFailure = validateContext(context);
    if (contextFailure) {
      logRejection(contextFailure);
      return contextFailure;
    }
    const validated = validateAnalyticsEvent(event, properties);
    if (!validated.ok) {
      logRejection(validated.failure);
      return validated.failure;
    }
    return { ok: true, delivered: false };
  },
  async shutdown() {
    // Inert by design: there is no client to shut down.
  },
};

interface ManagedClient {
  readonly configurationKey: string;
  readonly analytics: ServerAnalytics;
}

let managedClient: ManagedClient | undefined;

function createConfiguredServerAnalytics(
  token: string,
  host: string,
): ServerAnalytics {
  // One safely managed client for the whole server process. Every capture is
  // followed by an awaited flush, so no queued event outlives its request.
  const client = new PostHog(token, {
    host,
    requestTimeout: 2000,
    fetchRetryCount: 0,
  });
  let shutdownPromise: Promise<void> | undefined;

  return {
    async capture<E extends AnalyticsEventName>(
      event: E,
      properties: EventProperties<E>,
      context: ServerCaptureContext,
    ): Promise<AnalyticsCaptureResult> {
      const contextFailure = validateContext(context);
      if (contextFailure) {
        logRejection(contextFailure);
        return contextFailure;
      }
      const validated = validateAnalyticsEvent(event, properties);
      if (!validated.ok) {
        logRejection(validated.failure);
        return validated.failure;
      }
      if (!(await hasRequestConsent())) return { ok: true, delivered: false };
      try {
        client.capture({
          distinctId: context.distinctId,
          event,
          properties: { ...properties, $ip: null, $geoip_disable: true },
          groups: context.group ? { group: context.group.id } : undefined,
        });
        await client.flush();
        return { ok: true, delivered: true };
      } catch {
        return sendFailure();
      }
    },
    shutdown(): Promise<void> {
      // Idempotent: every call after the first returns the same promise. No
      // signal listeners are installed here; the application decides when
      // the server analytics lifecycle ends.
      if (!shutdownPromise) {
        shutdownPromise = client.shutdown().catch(() => {
          // Shutdown is best-effort: a failed drain must never propagate.
        });
      }
      return shutdownPromise;
    },
  };
}

/**
 * Returns the server analytics boundary for this process.
 *
 * Reads only the public PostHog configuration. Server-only secrets
 * (SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY) are never read here.
 */
export function getServerAnalytics(): ServerAnalytics {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !host) {
    // Token-only, host-only, or empty configuration is unconfigured: a true
    // no-op adapter, and no SDK client is constructed.
    return NOOP_SERVER_ANALYTICS;
  }

  const configurationKey = `${token}|${host}`;
  if (managedClient && managedClient.configurationKey === configurationKey) {
    return managedClient.analytics;
  }

  const analytics = createConfiguredServerAnalytics(token, host);
  managedClient = { configurationKey, analytics };
  return analytics;
}
