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
}

/** Normalizes a concrete path or URL to its approved route template. */
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

/** Extracts the scheme and authority (`https://app.example.com`) from a URL. */
function originOf(url: string): string {
  const schemeIndex = url.indexOf("://");
  if (schemeIndex < 0) {
    return "";
  }
  const authority = url.slice(schemeIndex + 3).split("/")[0];
  return url.slice(0, schemeIndex + 3) + authority;
}

/**
 * The only autocapture properties that may leave the browser. Everything
 * else — element text, hrefs, attributes, form values, ids — is dropped.
 * (Element text and attributes are additionally masked inside the SDK via
 * maskAllText/maskAllElementAttributes; this allowlist is defense in depth.)
 */
const AUTOCAPTURE_ALLOWED_PROPERTIES: readonly string[] = [
  "$event_type",
  "$el_tag_name",
  "$el_classes",
];

/** Properties removed from page events; a sanitized template is emitted instead. */
const PAGE_URL_PROPERTIES: readonly string[] = [
  "$current_url",
  "$pathname",
  "$referrer",
  "$raw_event_path",
];

type ClientEvent = {
  readonly event?: string;
  readonly properties?: Record<string, unknown>;
};

/**
 * `before_send` sanitizer for the pinned posthog-js. Supported signature:
 * `(CaptureResult | null) => CaptureResult | null`. Returns the event with
 * only approved route templates and properties, or null to pass null
 * through untouched.
 */
export function sanitizeClientEventForSend<T extends ClientEvent | null>(
  event: T,
): T {
  if (event === null || typeof event !== "object") {
    return event;
  }

  const eventName = event.event;
  const properties = { ...(event.properties ?? {}) };

  if (eventName === "$pageview" || eventName === "$pageleave") {
    const currentUrl =
      typeof properties.$current_url === "string"
        ? properties.$current_url
        : "/";
    properties.$current_url = sanitizeRouteUrl(
      currentUrl,
      originOf(currentUrl),
    );
    if (typeof properties.$pathname === "string") {
      properties.$pathname = sanitizeRoutePath(properties.$pathname);
    }
    for (const key of PAGE_URL_PROPERTIES) {
      if (key !== "$current_url" && key !== "$pathname") {
        delete properties[key];
      }
    }
    // A referrer may be an external page with user content; only the
    // sanitized current route is ever emitted.
    return { ...event, properties };
  }

  if (eventName === "$autocapture" || eventName === "$copy_autocapture") {
    const allowed: Record<string, unknown> = {};
    for (const key of AUTOCAPTURE_ALLOWED_PROPERTIES) {
      if (key in properties) {
        allowed[key] = properties[key];
      }
    }
    return { ...event, properties: allowed };
  }

  return { ...event, properties };
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
