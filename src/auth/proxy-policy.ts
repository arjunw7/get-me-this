/**
 * Request-level policies for the auth flow, enforced by proxy.ts (Next.js
 * 16) and pinned by unit tests here (004c).
 */

/** The route the emailed link lands on; 004c keeps it interim and safe. */
export const AUTH_CONFIRM_PATH = "/auth/confirm";

/**
 * The 004d clean choice route: after a valid link GET parks its token hash
 * in the signed link cookie, the initial redirect lands here — a clean URL
 * (query stripped) before substantive content or analytics.
 */
export const AUTH_LINK_PATH = "/auth/link";

/**
 * The token hash in the emailed link is authentication material: any query
 * on /auth/confirm is discarded by a clean redirect before substantive
 * rendering or analytics can run, and the route never verifies on GET (an
 * email-scanner prefetch must not consume the one-time token — 004d parks
 * the hash in the signed link cookie instead). The redirect target is the
 * clean route itself; the 004d cookie-parking branch chooses /auth/link.
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

/** The clean /auth/link target of the 004d cookie-parking redirect. */
export function linkLandingUrl(origin: string): string {
  return `${origin}${AUTH_LINK_PATH}`;
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

/**
 * The protected application routes (004e): every authenticated route is
 * listed here explicitly — the landing page, the auth routes, the interim
 * confirm route, and the limited invitation preview stay public per the
 * permissions matrix. Wishlist routes include the owner's display, manual
 * item create, owner-scoped item edit surfaces, and 005e's Node-only
 * extraction POST boundary.
 *
 * The proxy redirects anonymous requests for these paths to `/auth` (whose
 * default is the safe `home` intent) BEFORE any page or action reads
 * cookies, covering refresh and direct-link requests alike. Server Actions
 * POST to the page's own URL, so pathname protection covers them too — a
 * signed-out POST to `/wishlist` is redirected, never executed. Each
 * protected route ALSO verifies the session server-side
 * (`requireCompleteProfile`): a proxy matcher gap must never be the sole
 * control. Unknown `/wishlist/*` child paths are deliberately NOT
 * blanket-protected: nothing matches them (the framework's not-found state
 * renders, which carries no wishlist data), and the e2e suite pins that
 * consequence.
 */
const PROTECTED_ROUTE_PATHS: readonly string[] = [
  "/home",
  "/onboarding",
  "/wishlist",
  "/wishlist/items/new",
  "/wishlist/items/extract",
  "/groups/new",
];

export function isProtectedRoutePath(pathname: string): boolean {
  return (
    PROTECTED_ROUTE_PATHS.includes(pathname) ||
    /^\/wishlist\/items\/[^/]+\/edit$/.test(pathname) ||
    /^\/groups\/[^/]+\/created$/.test(pathname) ||
    // The private group room (006d): every /groups/[groupId] document and
    // action response. /groups/new and the /created suffix are covered by
    // the entries above; the room path covers the bare group id.
    /^\/groups\/[^/]+$/.test(pathname)
  );
}

export const NO_STORE = "no-store";
export const NO_REFERRER = "no-referrer";
