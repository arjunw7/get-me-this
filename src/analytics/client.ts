/**
 * Client analytics lane (posthog-js 1.434.15).
 *
 * Owns ONLY: consent-gated session replay (shipped disabled), sanitized
 * pageviews, autocapture behind strict allowlists, and anonymous→
 * authenticated identity linking. This module exposes NO capture API for
 * the ten server-authoritative business events; the server lane
 * (src/analytics/server.ts) owns them exclusively, so the browser never
 * duplicates a business event.
 *
 * Inertness contract: when the public configuration is absent — or consent
 * has not been granted — the SDK is never initialized, so no transport
 * (fetch, XHR, sendBeacon, image beacon) is ever constructed. The SDK is
 * loaded through a dynamic import only after configuration exists.
 *
 * Identity contract (approved plan):
 * - the SDK's anonymous identifier is used before authentication;
 * - `identify(supabase user UUID)` is called exactly once after
 *   authentication — the pinned SDK links anonymous history during
 *   identify, so no separate `alias()` call is made;
 * - identify does nothing while consent is pending or denied;
 * - withdrawing consent stops capture (and recording, which is already
 *   disabled) via the supported SDK APIs and resets the authenticated
 *   identity so it cannot survive for a later shared-browser user;
 * - `reset()` is called on logout so identities cannot leak between users
 *   of a shared browser; consent is re-applied because reset clears it.
 *
 * Pageview contract: the initial pageview is captured after the
 * asynchronous SDK initialization completes (when consent is already
 * granted), every subsequent navigation emits exactly one sanitized
 * pageview, and granting consent after initialization captures the current
 * sanitized pageview. Deduplication by route template prevents duplicates
 * across all of those paths.
 */
import type { AutocaptureConfig, PostHog, PostHogConfig } from "posthog-js";

import { isUuid } from "./validation";
import {
  SENSITIVE_BLOCK_CLASS,
  SENSITIVE_MASK_CLASS,
  sanitizeClientEventForSend,
  sanitizeRoutePath,
  sanitizeRouteUrl,
} from "./privacy";

/** Persistence key for the user's analytics consent choice. */
export const CLIENT_ANALYTICS_CONSENT_STORAGE_KEY = "gmt:analytics:consent";

export type AnalyticsConsentChoice = "granted" | "denied";

interface ClientAnalyticsConfig {
  readonly token: string;
  readonly host: string;
}

let posthog: PostHog | undefined;
let initialized = false;
let identifiedThisSession = false;
let lastPageviewPath: string | undefined;

/** Reads the public client-lane configuration. Only NEXT_PUBLIC_* values. */
function readClientConfig(): ClientAnalyticsConfig | undefined {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) {
    return undefined;
  }
  return { token, host };
}

export function isClientAnalyticsConfigured(): boolean {
  return readClientConfig() !== undefined;
}

export function isClientAnalyticsInitialized(): boolean {
  return initialized;
}

/** Reads the persisted consent choice; "pending" until the user chooses. */
export function getAnalyticsConsent(): AnalyticsConsentChoice | "pending" {
  if (typeof window === "undefined") {
    return "pending";
  }
  const stored = window.localStorage.getItem(
    CLIENT_ANALYTICS_CONSENT_STORAGE_KEY,
  );
  return stored === "granted" || stored === "denied" ? stored : "pending";
}

/**
 * Persists the consent choice and applies it to a loaded SDK.
 *
 * Granting consent after initialization captures the current sanitized
 * pageview. Withdrawal (or denial) stops capture via the supported
 * `opt_out_capturing()` API — session recording is disabled outright and
 * consent-gated, so no recording can continue — and, when an identity was
 * active, resets it so the authenticated identity cannot survive for a
 * later user of the same shared browser.
 */
export function setAnalyticsConsent(choice: AnalyticsConsentChoice): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CLIENT_ANALYTICS_CONSENT_STORAGE_KEY, choice);
  }
  if (posthog && initialized) {
    if (choice === "granted") {
      posthog.opt_in_capturing();
      captureSanitizedPageview(window.location.pathname);
    } else {
      posthog.opt_out_capturing();
      if (identifiedThisSession) {
        posthog.reset();
        identifiedThisSession = false;
        lastPageviewPath = undefined;
      }
    }
  }
}

/**
 * Identifies the authenticated user by the internal Supabase user UUID.
 * Never an email address or display name; called at most once per session
 * (until logout or consent withdrawal). Consent-aware: does nothing while
 * consent is pending or denied. Returns whether an identify was emitted.
 */
export function identifyAuthenticatedUser(userId: string): boolean {
  if (!posthog || !initialized || identifiedThisSession) {
    return false;
  }
  if (getAnalyticsConsent() !== "granted") {
    return false;
  }
  if (!isUuid(userId)) {
    // Analytics must never receive an email, display name, or other
    // identifier masquerading as a UUID. Fail closed.
    console.warn("[analytics] identify rejected: distinct id is not a UUID");
    return false;
  }
  // The pinned SDK links the anonymous history during identify; no separate
  // alias() call is required or made.
  posthog.identify(userId);
  identifiedThisSession = true;
  return true;
}

/**
 * Resets analytics on logout so identities cannot leak between users of a
 * shared browser. Consent is re-applied because the SDK's reset also clears
 * the consent state.
 */
export function resetAnalyticsOnLogout(): void {
  if (posthog && initialized) {
    posthog.reset();
  }
  identifiedThisSession = false;
  lastPageviewPath = undefined;
  const consent = getAnalyticsConsent();
  if (consent === "granted") {
    posthog?.opt_in_capturing();
  }
}

/**
 * Initializes the client lane exactly once. Returns whether the SDK was
 * initialized. Inert — no SDK load, no transport construction — when the
 * public configuration is absent.
 *
 * Page-event ownership decision: automatic pageview and pageleave capture
 * are BOTH disabled; sanitized route-template pageviews are captured
 * manually from the Next.js `onRouterTransition` hook
 * (instrumentation-client.ts). No $pageleave is emitted by the client lane
 * in this foundation.
 */
export async function initClientAnalytics(): Promise<boolean> {
  if (initialized || typeof window === "undefined") {
    return initialized;
  }

  const config = readClientConfig();
  if (!config) {
    // True inertness: the SDK is not even loaded, so none of its transports
    // (fetch, XHR, sendBeacon, image beacons) can be constructed.
    return false;
  }

  const { default: sdk } = await import("posthog-js");
  posthog = sdk;

  // Autocapture privacy options (maskAllText, maskAllElementAttributes,
  // disableCaptureUrlHashes, getCurrentUrl) are supported at runtime by the
  // pinned posthog-js (1.434.15) but are missing from the AutocaptureConfig
  // type shipped by its pinned @posthog/types dependency, so the object is
  // built fully and passed through a documented cast.
  const autocapture = {
    // Strict allowlists: URLs through the sanitizer, a conservative DOM and
    // element scope, and the reusable sensitive-region classes ignored.
    url_allowlist: [/^https?:\/\//],
    dom_event_allowlist: ["click", "change", "submit"],
    element_allowlist: ["a", "button", "form", "label", "select"],
    css_selector_ignorelist: [
      `.${SENSITIVE_BLOCK_CLASS}`,
      "[data-ph-no-capture]",
      `.${SENSITIVE_MASK_CLASS}`,
      "[data-ph-mask]",
    ],
    // Element text and attributes are masked inside the SDK; before_send
    // additionally reduces every autocapture event to the approved property
    // allowlist (src/analytics/privacy.ts) as defense in depth.
    maskAllText: true,
    maskAllElementAttributes: true,
    disableCaptureUrlHashes: true,
    getCurrentUrl: (defaultUrl: string) =>
      sanitizeRouteUrl(
        defaultUrl,
        new URL(defaultUrl, window.location.origin).origin,
      ),
  } as AutocaptureConfig;

  const initOptions: Partial<PostHogConfig> = {
    api_host: config.host,

    // Consent-gated: nothing is captured or recorded until explicit
    // opt-in. No consent UI ships in this issue, so production capture
    // cannot begin yet (see docs/analytics/enabling-posthog.md).
    opt_out_capturing_by_default: true,
    person_profiles: "identified_only",

    // Page-event ownership: manual, sanitized pageviews only.
    capture_pageview: false,
    capture_pageleave: false,

    // Session replay ships disabled. Recording can only start after the
    // staging masking gate passes; when it later starts, these privacy
    // defaults already apply. Mask all form inputs by default, block
    // sensitive regions via the reusable ph-no-capture mechanism, mask
    // sensitive text via ph-mask, and record no network bodies.
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      blockClass: SENSITIVE_BLOCK_CLASS,
      maskTextClass: SENSITIVE_MASK_CLASS,
      recordBody: false,
      streamNetworkBody: false,
      sampleRate: 0,
    },
    // Console-log capture and network-body capture stay disabled.
    enable_recording_console_log: false,
    capture_performance: false,

    autocapture,

    // Route templates are the only URLs that may ever leave the browser.
    before_send: [sanitizeClientEventForSend],

    // The pinned SDK completes its initialization asynchronously after
    // init() returns: `capture` silently drops events until the request
    // queue exists. Consent is therefore applied and the initial pageview
    // captured from the supported `loaded` callback, which runs once the
    // SDK is actually ready to transport events.
    loaded: (instance) => {
      initialized = true;
      if (getAnalyticsConsent() === "granted") {
        instance.opt_in_capturing();
        // Initial pageview: emitted exactly once, after asynchronous
        // initialization completes, for the route the browser is on.
        captureSanitizedPageview(window.location.pathname);
      }
    },
  };

  sdk.init(config.token, initOptions);

  return true;
}

/**
 * Captures one sanitized pageview for a route change. Emits at most one
 * pageview per distinct sanitized route template, and only when the client
 * lane is initialized AND consent is granted.
 */
export function captureSanitizedPageview(path: string): void {
  if (!posthog || !initialized || getAnalyticsConsent() !== "granted") {
    return;
  }
  const template = sanitizeRoutePath(path);
  if (template === lastPageviewPath) {
    return;
  }
  lastPageviewPath = template;
  const currentUrl = sanitizeRouteUrl(path, window.location.origin);
  posthog.capture("$pageview", {
    $current_url: currentUrl,
    $pathname: template,
  });
}
