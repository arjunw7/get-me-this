/**
 * Server-authoritative analytics lane (posthog-node 5.54.1).
 *
 * This module is server-only: importing it from any client context throws
 * at build time (the `server-only` guard) so server analytics can never be
 * pulled into a browser bundle, and server-only secrets can never be
 * referenced by client analytics code.
 *
 * Lifecycle contract:
 * - Unconfigured (missing NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) returns a TRUE
 *   no-op adapter: nothing is captured, retained, or sent.
 * - Configured captures through one safely managed posthog-node client and
 *   awaits `flush()` after every capture. No batching behaviour is claimed.
 * - No signal listeners are installed. Shutdown is explicit, idempotent,
 *   and owned by application lifecycle code.
 */
import "server-only";

import { PostHog } from "posthog-node";

import { validateAnalyticsEvent } from "./validation";
import type {
  AnalyticsCaptureResult,
  ServerAnalytics,
  ServerCaptureContext,
} from "./types";

/** Logs a safe identifier (event/property names only). Never a payload value. */
function logRejection(
  result: Extract<AnalyticsCaptureResult, { ok: false }>,
): void {
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

/** True no-op adapter for the unconfigured server lane. Retains nothing. */
const NOOP_SERVER_ANALYTICS: ServerAnalytics = {
  async capture(event, properties) {
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
  host: string | undefined,
): ServerAnalytics {
  // One safely managed client for the whole server process. Every capture is
  // followed by an awaited flush, so no queued event outlives its request.
  const client = new PostHog(token, host ? { host } : {});
  let shutdownPromise: Promise<void> | undefined;

  return {
    async capture(
      event,
      properties,
      context: ServerCaptureContext,
    ): Promise<AnalyticsCaptureResult> {
      const validated = validateAnalyticsEvent(event, properties);
      if (!validated.ok) {
        logRejection(validated.failure);
        return validated.failure;
      }
      try {
        client.capture({
          distinctId: context.distinctId,
          event,
          properties: properties as Record<string, string | boolean>,
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

  if (!token) {
    return NOOP_SERVER_ANALYTICS;
  }

  const configurationKey = `${token}|${host ?? ""}`;
  if (managedClient && managedClient.configurationKey === configurationKey) {
    return managedClient.analytics;
  }

  const analytics = createConfiguredServerAnalytics(token, host);
  managedClient = { configurationKey, analytics };
  return analytics;
}
