/**
 * Client-lane privacy boundary.
 *
 * Input masking and replay block attributes are not sufficient: pageviews and
 * autocapture can collect full URLs, query parameters, fragments, referrers,
 * link destinations, element text, and attributes. This module normalizes
 * every route the client lane may ever emit to an APPROVED ROUTE TEMPLATE,
 * and reduces autocapture events to an approved property allowlist, using
 * only mechanisms supported by the pinned posthog-js (1.434.15):
 * `before_send`, autocapture allowlists/masks, and session-recording
 * block/mask classes.
 *
 * Scope of proof: unit/jsdom tests prove initialization options, consent
 * gating, sensitive-region attributes, and selector coverage. They do NOT
 * prove the recorder's emitted payload is masked; that verification happens
 * in staging with synthetic values before recording is ever enabled
 * (see docs/analytics/enabling-posthog.md).
 */

/**
 * Approved route templates. A `:name` segment accepts any concrete segment
 * and is emitted as the literal placeholder, never the real value. Paths
 * that match no template are emitted as `/:unlisted` — a raw path segment is
 * never emitted. Query strings and fragments are never emitted anywhere.
 */
const ROUTE_TEMPLATES: readonly (readonly (string | `:${string}`)[])[] = [
  [], // "/"
  ["onboarding"],
  ["invite", ":token"],
  ["auth", "callback"],
  ["groups", ":groupId"],
];

/** Extracts the pathname from a path or URL, dropping query and fragment. */
function pathnameOf(value: string): string {
  if (value.includes("://")) {
    try {
      return new URL(value).pathname;
    } catch {
      return "/:unlisted";
    }
  }
  const withoutQuery = value.split("?")[0].split("#")[0];
  return withoutQuery;
} /** Normalizes a concrete path or URL to its approved route template. */
export function sanitizeRoutePath(value: string): string {
  const rawPath = pathnameOf(value);
  const segments = rawPath.split("/").filter((segment) => segment.length > 0);

  for (const template of ROUTE_TEMPLATES) {
    if (template.length !== segments.length) {
      continue;
    }
    const matches = template.every((part, index) =>
      part.startsWith(":")
        ? segments[index].length > 0
        : segments[index] === part,
    );
    if (matches) {
      return template.length === 0 ? "/" : `/${template.join("/")}`;
    }
  }

  // Never emit an unlisted route's concrete segments: an unmatched path
  // becomes a single opaque placeholder.
  return "/:unlisted";
}

/** Normalizes a full URL to `origin + approved route template`. */
export function sanitizeRouteUrl(url: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}${sanitizeRoutePath(url)}`;
}

/**
 * Sanitizes an absolute URL using the URL API: origin from the parsed URL
 * (never a string slice, which would retain query parameters like
 * `?invite=SECRETTOKEN123` in a queryless-path URL) plus the approved route
 * template for its pathname. Query strings and fragments never survive.
 * Relative or malformed input reduces to the route template alone.
 */
export function sanitizeAbsoluteUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${sanitizeRoutePath(parsed.pathname)}`;
  } catch {
    return sanitizeRoutePath(url);
  }
}

/**
 * The only properties allowed per approved client event name. Everything
 * else an SDK event might carry — element text, hrefs, attributes, class
 * values, URLs, referrers, form values — is dropped.
 *
 * - `$autocapture`/`$copy_autocapture`: `$el_classes` is NOT allowlisted
 *   (class values are unbounded strings that could contain names or
 *   tokens, and no static class vocabulary is approved yet). `$el_tag_name`
 *   is bounded by the autocapture `element_allowlist`
 *   (`a|button|form|label|select`) configured in src/analytics/client.ts.
 * - `$identify`: the minimum the pinned SDK requires for the
 *   anonymous→authenticated transition (`distinct_id` and
 *   `$anon_distinct_id`); person properties travel in `$set`/`$set_once`
 *   capture options, which this application never populates.
 * - `$opt_in`/`$opt_out`: the pinned SDK attaches only caller-supplied
 *   capture properties, and this boundary calls them with none.
 */
const APPROVED_EVENT_PROPERTIES: Record<string, readonly string[]> = {
  $autocapture: ["$event_type", "$el_tag_name"],
  $copy_autocapture: ["$event_type", "$el_tag_name"],
  $identify: ["distinct_id", "$anon_distinct_id"],
  $opt_in: [],
  $opt_out: [],
};

/**
 * Properties the pinned SDK requires on every event for ingestion. The
 * SDK snapshots these before `before_send` hooks run and drops the whole
 * event with a warning when a hook removes one (a scrubber matching
 * /token/i is the documented example). `token` is the public client
 * ingest token (NEXT_PUBLIC_*), never a secret, and must survive
 * sanitization.
 */
const SDK_REQUIRED_EVENT_PROPERTIES: readonly string[] = ["token"];

type ClientEvent = {
  readonly event?: string;
  readonly properties?: Record<string, unknown>;
};

/**
 * `before_send` sanitizer for the pinned posthog-js. Supported signature:
 * `(CaptureResult | null) => CaptureResult | null`. Page events are rebuilt
 * from an explicit property allowlist — sanitized route templates plus
 * nothing else — so PostHog-enriched pageview properties
 * ($initial_current_url, $initial_pathname, $initial_referrer, $referrer,
 * $raw_event_path, query/UTM/attribution properties, and any other
 * URL-like SDK property) can never pass through. Every other approved
 * event keeps only its allowlisted properties; unknown client event names
 * are dropped.
 */
export function sanitizeClientEventForSend<T extends ClientEvent | null>(
  event: T,
): T {
  if (event === null || typeof event !== "object") {
    return event;
  }

  const eventName = event.event;

  if (eventName === "$pageview" || eventName === "$pageleave") {
    const currentUrl =
      typeof event.properties?.$current_url === "string"
        ? event.properties.$current_url
        : "/";
    // The emitted properties are ONLY the sanitized route template and the
    // derived current URL (plus SDK-required ingestion properties); every
    // SDK-enriched pageview property ($initial_*, $referrer,
    // $raw_event_path, UTM/attribution, …) is discarded here, never
    // filtered selectively.
    return {
      ...event,
      properties: {
        $current_url: sanitizeAbsoluteUrl(currentUrl),
        $pathname: sanitizeRoutePath(currentUrl),
        ...preserveRequiredSdkProperties(event.properties),
      },
    };
  }

  // Unknown client event names are dropped unless explicitly approved.
  const approvedProperties =
    typeof eventName === "string"
      ? APPROVED_EVENT_PROPERTIES[eventName]
      : undefined;
  if (!approvedProperties) {
    return null as T;
  }

  // Every other approved event keeps only its allowlisted properties;
  // anything the SDK or a caller added beyond the allowlist is dropped.
  const properties = { ...(event.properties ?? {}) };
  const allowed: Record<string, unknown> = {};
  for (const key of approvedProperties) {
    if (key in properties) {
      allowed[key] = properties[key];
    }
  }
  return {
    ...event,
    properties: {
      ...allowed,
      ...preserveRequiredSdkProperties(event.properties),
    },
  };
}

/**
 * Copies the SDK-required ingestion properties (only those actually
 * present and non-nullish) into the sanitized property set so the pinned
 * SDK does not drop the event outright.
 */
function preserveRequiredSdkProperties(
  originalProperties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  if (!originalProperties) {
    return preserved;
  }
  for (const key of SDK_REQUIRED_EVENT_PROPERTIES) {
    const value = originalProperties[key];
    if (value !== undefined && value !== null) {
      preserved[key] = value;
    }
  }
  return preserved;
}

/**
 * Reusable sensitive-region mechanism for feature slices.
 *
 * Spread onto any element whose content must never be captured or recorded:
 * the `ph-no-capture` class is wired into BOTH the session-recording
 * blockClass and the autocapture ignorelist in src/analytics/client.ts, so
 * one attribute blocks autocapture, and blocks the element and its subtree
 * from replay. `ph-mask` (maskTextClass) masks text content only.
 */
export const SENSITIVE_BLOCK_CLASS = "ph-no-capture";
export const SENSITIVE_MASK_CLASS = "ph-mask";

export function sensitiveAnalyticsAttributes(): {
  "data-ph-no-capture": boolean;
  className: string;
} {
  return { "data-ph-no-capture": true, className: SENSITIVE_BLOCK_CLASS };
}

export function sensitiveTextMaskAttributes(): {
  "data-ph-mask": boolean;
  className: string;
} {
  return { "data-ph-mask": true, className: SENSITIVE_MASK_CLASS };
}
