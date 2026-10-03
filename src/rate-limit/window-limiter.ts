import "server-only";

/**
 * The two-layer fixed-window limiter (009b).
 *
 * Layer 1 — in-process best-effort: per-instance counters are PROBABILISTIC
 * across Railway's multi-instance deployments (each instance sees only its
 * own traffic), so this layer is a cheap first filter, never the control.
 *
 * Layer 2 — the authoritative durable layer: private.rate_limit_increment
 * (migration 20261014010000) through the server-side service client. Its
 * verdict is the decision. The in-process layer can only deny early; a
 * false "allowed" in layer 1 is corrected by layer 2.
 *
 * Denials are logged with identifiers and coarse categories only (route
 * family, outcome, key KIND — never the raw coarse key, which could embed
 * hashed-IP material; never request bodies).
 *
 * Availability posture: if the durable layer is unreachable (database
 * down), the limiter fails OPEN — a rate limiter must not convert a
 * database outage into a total application outage. Database-level
 * invariants (006a/006c/007c/008c locks, CAS, one-use, generations,
 * tombstones, envelope cap) remain the authority in every state; no limiter
 * can be bypassed into revealing state the database forbids. The fail-closed
 * surfaces are CAPTCHA-gated OTP sends (src/auth/captcha.ts), where the
 * brief requires closure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logAbuseEvent } from "./log";
import type { CoarseKeySource, RouteFamily } from "./coarse-key";
import { coarseKeyFor } from "./coarse-key";
import { SURFACE_LIMITS } from "./surfaces";

export type LimiterDecision = {
  readonly allowed: boolean;
  /** The route family — a safe identifier, not the coarse key. */
  readonly routeFamily: RouteFamily;
  readonly layer: "in_process" | "durable" | "disabled";
};

/**
 * Staged enablement (009b): the controls ship wired but are enabled by
 * deployment configuration — `ABUSE_LIMITS_ENABLED=1` on the service (and
 * the CAPTCHA configuration for the OTP-send gate). Local development and
 * the stack-gated e2e suites run with the controls off, so approved flows
 * and pinned baselines are untouched; the unit suites exercise the enabled
 * behavior against injected clocks and stubbed verifiers. The kill switch
 * is the same setting: clearing it disables every control without a code
 * deploy (a short restart applies the env change).
 */
export function abuseLimitsEnabled(): boolean {
  const flag = process.env.ABUSE_LIMITS_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

type InProcessWindow = {
  readonly bucketStart: number;
  readonly windowMs: number;
  readonly count: number;
};

const inProcessWindows = new Map<string, InProcessWindow>();

function inProcessAdmit(
  key: string,
  windowMs: number,
  max: number,
  now: number,
): boolean {
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const current = inProcessWindows.get(key);
  if (!current || current.bucketStart !== bucketStart) {
    inProcessWindows.set(key, { bucketStart, windowMs, count: 1 });
    return true;
  }
  if (current.count >= max) return false;
  inProcessWindows.set(key, {
    bucketStart,
    windowMs,
    count: current.count + 1,
  });
  return true;
}

/** Bounded in-memory map: a bucket whose own window has passed is pruned —
 * a new admission for that key would compute a fresh bucket anyway, so the
 * entry can no longer be current. */
function prune(now: number): void {
  for (const [key, window] of inProcessWindows) {
    if (now - window.bucketStart > window.windowMs) {
      inProcessWindows.delete(key);
    }
  }
}

export type DurableIncrement = (
  key: string,
  windowSeconds: number,
  max: number,
) => Promise<boolean>;

/**
 * The service-role durable increment bound to the deployed stack's
 * Supabase configuration. Returns null when the stack is unconfigured
 * (documentation-stage builds), in which case the limiter degrades to the
 * in-process layer alone and says so in the logs.
 */
export function durableIncrementFromClient(
  client: SupabaseClient | null,
): DurableIncrement | null {
  if (!client) return null;
  return async (key, windowSeconds, max) => {
    const { data, error } = await client.rpc("rate_limit_increment", {
      p_limit_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error || typeof data !== "boolean") {
      // Unreachable durable layer: fail open (see module note), loudly.
      logAbuseEvent("warn", "limiter_durable_unavailable", {});
      return true;
    }
    return data;
  };
}

export type EnforceLimitArgs = {
  readonly routeFamily: RouteFamily;
  readonly source: CoarseKeySource;
  readonly durable: DurableIncrement | null;
  readonly now?: number;
};

/** The limiter decision for one request. Never throws. */
export async function enforceLimit(
  args: EnforceLimitArgs,
): Promise<LimiterDecision> {
  const { routeFamily, source, durable } = args;
  if (!abuseLimitsEnabled()) {
    return { allowed: true, routeFamily, layer: "disabled" };
  }
  const now = args.now ?? Date.now();
  const limit = SURFACE_LIMITS[routeFamily];
  const coarseKey = coarseKeyFor(routeFamily, source);

  // Layer 1: probabilistic per-instance first filter.
  if (
    !inProcessAdmit(`${coarseKey}`, limit.windowSeconds * 1000, limit.max, now)
  ) {
    logAbuseEvent("warn", "limiter_denied", {
      route_family: routeFamily,
      key_kind: source.kind,
    });
    return { allowed: false, routeFamily, layer: "in_process" };
  }
  prune(now);

  // Layer 2: the authoritative durable verdict.
  if (durable) {
    const allowed = await durable(coarseKey, limit.windowSeconds, limit.max);
    if (!allowed) {
      logAbuseEvent("warn", "limiter_denied", {
        route_family: routeFamily,
        key_kind: source.kind,
      });
      return { allowed: false, routeFamily, layer: "durable" };
    }
  }
  return {
    allowed: true,
    routeFamily,
    layer: durable ? "durable" : "in_process",
  };
}

export { inProcessWindows as _inProcessWindowsForTests };
