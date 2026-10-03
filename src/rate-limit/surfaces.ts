import "server-only";

import type { RouteFamily } from "./coarse-key";

/**
 * The pinned 009b limits, chosen generously for real friend groups and
 * hostile to scripts. Each surface's denial maps to that surface's EXISTING
 * generic failure state — never a new error that distinguishes rate limiting
 * from invalid input.
 *
 * Platform-first auth limits: Supabase Auth's built-in per-identity and
 * per-IP send/verify limits are the primary OTP brute-force and email-flood
 * control (staging configuration, owner-gated enablement — see
 * docs/architecture/abuse-controls.md). The application layer here is the
 * second, authoritative-durable layer, never a replacement.
 *
 * Environment overrides exist for tests and operational breathing room
 * (LIMIT_<FAMILY>_MAX, LIMIT_<FAMILY>_WINDOW_SECONDS); unset values use the
 * pins below.
 */

export type SurfaceLimit = {
  readonly max: number;
  readonly windowSeconds: number;
};

function pinned(
  family: string,
  max: number,
  windowSeconds: number,
): SurfaceLimit {
  const envMax = process.env[`LIMIT_${family.toUpperCase()}_MAX`]?.trim();
  const envWindow =
    process.env[`LIMIT_${family.toUpperCase()}_WINDOW_SECONDS`]?.trim();
  return {
    max: envMax && /^\d+$/.test(envMax) ? Number(envMax) : max,
    windowSeconds:
      envWindow && /^\d+$/.test(envWindow) ? Number(envWindow) : windowSeconds,
  };
}

export const SURFACE_LIMITS: Record<RouteFamily, SurfaceLimit> = {
  // Raw invitation landings per coarse key: generous for a friend group
  // clicking a shared link around, hostile to a token-guessing script.
  invite_landing: pinned("invite_landing", 120, 300),
  // OTP sends per coarse key: Supabase Auth's own per-identity/IP limits are
  // primary; this bounds a distributed flood from one coarse network.
  otp_send: pinned("otp_send", 10, 600),
  // OTP verifies per coarse key: far above any human's six-code retries.
  otp_verify: pinned("otp_verify", 30, 600),
  // Extraction attempts per authenticated user: the manual fallback is the
  // designed degradation, never an outage.
  extraction: pinned("extraction", 30, 60),
  // Email-worker enqueues per group: bounds an enqueue storm under the
  // Resend free-tier quota (with the worker's own ceiling inside it).
  email_enqueue: pinned("email_enqueue", 20, 3600),
};
