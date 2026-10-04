import "server-only";

/**
 * The raw-landing limiter guard (009b): one authoritative decision before
 * any 006c work happens, keyed per coarse network/browser and never global.
 * A denial returns the SAME unavailable response as an invalid token —
 * constructed by the one shared builder — so sustained guessing receives
 * the identical unavailable state at every attempt count, up to the
 * limiter's threshold and beyond it.
 *
 * Per-key isolation is structural: the 006c envelope inventory is keyed per
 * browser/coarse-network (never global), and the limiter budget is consumed
 * from the requester's own coarse key only, so one key's sustained traffic
 * can never exhaust another browser's envelope budget.
 */

import { headers } from "next/headers";

import {
  createEmailServiceClient,
  getEmailServiceConfig,
} from "@/src/email/service";
import { clientIpFor } from "@/src/rate-limit/coarse-key";
import {
  abuseLimitsEnabled,
  durableIncrementFromClient,
  enforceLimit,
} from "@/src/rate-limit/window-limiter";

export async function enforceInviteLandingLimit(): Promise<boolean> {
  if (!abuseLimitsEnabled()) return true;
  try {
    const headerList = await headers();
    const config = getEmailServiceConfig();
    const durable = durableIncrementFromClient(
      config ? createEmailServiceClient(config) : null,
    );
    const decision = await enforceLimit({
      routeFamily: "invite_landing",
      source: { kind: "ip", ip: clientIpFor(headerList) },
      durable,
    });
    return decision.allowed;
  } catch {
    // The limiter must never throw into the landing path; availability is
    // governed by the durable layer's own fail-open posture and the
    // database invariants remain the authority.
    return true;
  }
}
