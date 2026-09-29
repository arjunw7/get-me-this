/**
 * Trusted, environment-specific destinations for the emailed sign-in link
 * (004c) — the code's mirror of the Supabase Auth `uri_allow_list`
 * configuration recorded in docs/ops/resend-auth-delivery.md: the local
 * development and production-build test origins, and the staging service
 * origin.
 *
 * The request's own origin may only SELECT an allowlisted entry; the
 * returned URL is built entirely from these server-side constants. No
 * staging URL is hard-coded as the redirect target of every environment,
 * and no client input ever becomes part of the link.
 */

/** Exact `emailRedirectTo` per trusted origin, keyed by that same origin. */
const EMAIL_REDIRECT_TARGETS: Readonly<Record<string, string>> = {
  // Local development (pnpm dev).
  "http://localhost:3000": "http://localhost:3000/auth/confirm",
  "http://127.0.0.1:3000": "http://127.0.0.1:3000/auth/confirm",
  // The production-build end-to-end server (playwright.config.ts, port 3100).
  "http://localhost:3100": "http://localhost:3100/auth/confirm",
  "http://127.0.0.1:3100": "http://127.0.0.1:3100/auth/confirm",
  // Staging service; this origin backs the provider's `uri_allow_list`.
  "https://get-me-this-staging.up.railway.app":
    "https://get-me-this-staging.up.railway.app/auth/confirm",
};

/**
 * The allowlisted `emailRedirectTo` for a request origin, or null when the
 * origin is not a trusted deployment (an unlisted environment must fail
 * safely, never redirect somewhere untrusted).
 */
export function emailRedirectToForOrigin(origin: string | null): string | null {
  if (origin === null) return null;
  return Object.prototype.hasOwnProperty.call(EMAIL_REDIRECT_TARGETS, origin)
    ? EMAIL_REDIRECT_TARGETS[origin]
    : null;
}

/**
 * Reconstructs the request origin from server-side request headers. The
 * forwarded protocol is honoured only when it names a real scheme; the
 * resulting value still has to sit on the allowlist before it can matter.
 */
export function requestOrigin(
  host: string | null,
  forwardedProto: string | null,
): string | null {
  if (!host) return null;
  const proto = forwardedProto === "https" ? "https" : "http";
  return `${proto}://${host}`;
}
