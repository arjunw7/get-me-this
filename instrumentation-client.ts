/**
 * Next.js client instrumentation hook. This is the single supported entry
 * point that initializes the client analytics lane and captures one
 * sanitized pageview per route transition. The pinned posthog-js
 * (1.434.15) has no Next.js-specific subpath exports (no posthog-js/next,
 * no posthog-js/init), so this official Next.js mechanism is the
 * integration point of record.
 *
 * The pinned Next.js 16.3.6 client runtime discovers the exported hook by
 * the exact name `onRouterTransitionStart` and calls it as
 * `onRouterTransitionStart(href, navigationType, details)` on every router
 * transition; the discovery wiring is proven by
 * `tests/e2e/instrumentation-hook.spec.ts` against the production build.
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
export function onRouterTransitionStart(
  href: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature fixed by the pinned Next.js runtime
  _navigationType: "push" | "replace" | null,
): void {
  captureSanitizedPageview(href);
}
