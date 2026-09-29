/**
 * Request-level policies for the auth flow, enforced by proxy.ts (Next.js
 * 16) and pinned by unit tests here (004c).
 */

/** The route the emailed link lands on; 004c keeps it interim and safe. */
export const AUTH_CONFIRM_PATH = "/auth/confirm";

/**
 * The token hash in the emailed link is authentication material: any query
 * on /auth/confirm is discarded by a clean redirect before substantive
 * rendering or analytics can run, and the route never verifies on GET (an
 * email-scanner prefetch must not consume the one-time token — 004d adds
 * the explicit-action flow on top of this cleanup).
 */
export function shouldRedirectToCleanConfirmUrl(
  pathname: string,
  search: string,
): boolean {
  return pathname === AUTH_CONFIRM_PATH && search.length > 0;
}

/** The clean target of the query-stripping redirect (same path, no query). */
export function cleanConfirmUrl(origin: string): string {
  return `${origin}${AUTH_CONFIRM_PATH}`;
}

/**
 * True for Next.js Server Action requests: they POST to the page's own URL
 * and carry the framework's `Next-Action` header. Their responses can set
 * or clear session and carry cookies, so they must never be cacheable.
 */
export function isServerActionRequest(
  method: string,
  nextActionHeader: string | null,
): boolean {
  return method === "POST" && nextActionHeader !== null;
}

export const NO_STORE = "no-store";
export const NO_REFERRER = "no-referrer";
