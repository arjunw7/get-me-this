/**
 * Public analytics surface.
 *
 * Product code imports from here or from the lane entry points:
 * - Server lane: `getServerAnalytics()` from `@/src/analytics/server`
 *   (server-only) for the ten catalog business events.
 * - Client lane: consent, identity, and pageview helpers from
 *   `@/src/analytics/client` (browser-only).
 * - This shared surface re-exports only the client-safe catalog, validation,
 *   privacy, and sink helpers — never the server-only module.
 *
 * The SDK-ownership ESLint rule (eslint.config.mjs) blocks direct imports of
 * posthog-js and posthog-node anywhere outside src/analytics/** and
 * instrumentation-client.ts.
 */
export {
  EVENT_DEFINITIONS,
  SUPPORTED_CURRENCIES,
  type AnalyticsEventName,
  booleanProperty,
  stringEnum,
} from "./event-definitions";
export type {
  AnalyticsCaptureResult,
  EventProperties,
  ServerAnalytics,
  ServerCaptureContext,
} from "./types";
export { validateAnalyticsEvent, isAnalyticsEventName } from "./validation";
export {
  captureSanitizedPageview,
  getAnalyticsConsent,
  identifyAuthenticatedUser,
  initClientAnalytics,
  isClientAnalyticsConfigured,
  isClientAnalyticsInitialized,
  resetAnalyticsOnLogout,
  setAnalyticsConsent,
  CLIENT_ANALYTICS_CONSENT_STORAGE_KEY,
  type AnalyticsConsentChoice,
} from "./client";
export {
  SENSITIVE_BLOCK_CLASS,
  SENSITIVE_MASK_CLASS,
  sensitiveAnalyticsAttributes,
  sensitiveTextMaskAttributes,
  sanitizeClientEventForSend,
  sanitizeRoutePath,
  sanitizeRouteUrl,
} from "./privacy";
export {
  createMemoryAnalyticsSink,
  type MemoryAnalyticsSink,
} from "./memory-sink";
