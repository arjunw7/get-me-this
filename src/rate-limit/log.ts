import "server-only";

/**
 * Maintainer-facing structured abuse telemetry (009b). Log lines carry
 * identifiers and coarse categories only: the route family, the limiter
 * outcome, and the coarse key KIND ("ip" | "user"). Never the raw coarse
 * key (hashed-IP material is still excluded at identifier granularity),
 * never raw tokens, addresses, secret URLs, or request bodies. No new
 * PostHog event; the tracking plan is untouched.
 */

export type AbuseLogFields = {
  route_family?: string;
  key_kind?: string;
  error_category?: string;
  /** Count-bearing facts only — never identities. */
  attempt_count?: number;
};

const ALLOWED_FIELD_NAMES: readonly string[] = [
  "route_family",
  "key_kind",
  "error_category",
  "attempt_count",
];

export function logAbuseEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: AbuseLogFields,
): void {
  const entries: Array<[string, string | number]> = [["event", event]];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (!ALLOWED_FIELD_NAMES.includes(key)) continue;
    entries.push([key, value]);
  }
  const line = JSON.stringify(Object.fromEntries(entries));
  if (level === "info") console.log(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
