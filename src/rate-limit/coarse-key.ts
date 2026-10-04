import "server-only";

/**
 * Coarse limiter keys (009b). Keys are bounded identifiers — the route
 * family plus a hashed IP prefix for anonymous traffic or the internal user
 * id for authenticated traffic — and never contain raw tokens, addresses,
 * or secret URLs. The raw coarse key is itself excluded from logs at
 * identifier granularity: log lines carry the route family and outcome
 * only.
 */

import { createHash } from "node:crypto";

export type CoarseKeySource =
  | { readonly kind: "ip"; readonly ip: string | null }
  | { readonly kind: "user"; readonly userId: string };

/** The bounded route families. Never a raw path, token, or query. */
export type RouteFamily =
  "invite_landing" | "otp_send" | "otp_verify" | "extraction" | "email_enqueue";

export function coarseKeyFor(
  routeFamily: RouteFamily,
  source: CoarseKeySource,
): string {
  if (source.kind === "user") {
    return `${routeFamily}:u:${source.userId}`;
  }
  // Anonymous traffic: a hashed IP PREFIX (first two /64 groups for IPv6,
  // first three octets for IPv4), so a single browser or coarse network is
  // one budget while the raw address is never stored or logged.
  const ip = source.ip ?? "unknown";
  let prefix: string;
  if (ip.includes(":")) {
    prefix = ip.split(":").slice(0, 2).join(":");
  } else {
    prefix = ip.split(".").slice(0, 3).join(".");
  }
  const digest = createHash("sha256").update(prefix).digest("hex").slice(0, 32);
  return `${routeFamily}:i:${digest}`;
}

/** The first forwarded hop, or the direct peer when no proxy chain exists. */
export function clientIpFor(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
