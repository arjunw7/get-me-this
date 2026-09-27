/**
 * Next.js client instrumentation hook (supported by the pinned Next.js
 * 16.3.6; `onRouterTransition` runs in the browser on every route
 * transition). This is the single supported entry point that initializes
 * the client analytics lane and captures one sanitized pageview per route
 * change. The pinned posthog-js (1.434.15) has no Next.js-specific
 * subpath exports (no posthog-js/next, no posthog-js/init), so this
 * official Next.js mechanism is the integration point of record.
 */
import {
  captureSanitizedPageview,
  initClientAnalytics,
} from "@/src/analytics/client";

// Initialize exactly once when the browser runtime loads this module.
// Inert (no SDK load, no transport construction) when the public PostHog
// configuration is absent.
void initClientAnalytics();

/**
 * Captures one sanitized pageview per route transition. The path is reduced
 * to an approved route template (src/analytics/privacy.ts); query strings,
 * fragments, and unlisted route segments are never emitted.
 */
export function onRouterTransition(path: string): void {
  captureSanitizedPageview(path);
}
