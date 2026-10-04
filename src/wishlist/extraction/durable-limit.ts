import "server-only";

import {
  createEmailServiceClient,
  getEmailServiceConfig,
} from "@/src/email/service";
import {
  durableIncrementFromClient,
  abuseLimitsEnabled,
} from "@/src/rate-limit/window-limiter";

/**
 * The 009b durable per-user extraction limit: the authoritative layer paired
 * with the per-instance ExtractionLimiter (which stays the first filter).
 * A denial degrades THIS user to the manual-entry fallback through the
 * existing rate-denial response — other users are unaffected, the SSRF
 * boundary (005e) is untouched, and a flood never becomes a server-wide
 * outage.
 */
export async function durableExtractionLimit(
  userId: string,
): Promise<boolean | null> {
  if (!abuseLimitsEnabled()) return null;
  try {
    const config = getEmailServiceConfig();
    const durable = durableIncrementFromClient(
      config ? createEmailServiceClient(config) : null,
    );
    if (!durable) return null;
    return await durable(`extraction:u:${userId}`, 60, 30);
  } catch {
    // The limiter never converts a configuration gap into an outage; the
    // per-instance layer and the database invariants remain in force.
    return null;
  }
}
