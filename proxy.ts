import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/src/supabase/config";
import {
  AUTH_CONFIRM_PATH,
  AUTH_LINK_PATH,
  NO_REFERRER,
  NO_STORE,
  cleanConfirmUrl,
  isProtectedRoutePath,
  isServerActionRequest,
  linkLandingUrl,
  shouldRedirectToCleanConfirmUrl,
} from "@/src/auth/proxy-policy";
import { AUTH_LINK_CARRY_MAX_AGE_SECONDS } from "@/src/auth/flow-config";
import {
  LINK_COOKIE_NAME,
  encodeLinkEnvelope,
  getAuthLinkCookieSecret,
  linkCookieOptions,
  parseLinkLandingQuery,
} from "@/src/auth/link-cookie";

/**
 * Next.js 16 proxy (the renamed middleware) for the email-code flow (004c).
 * It is the session-maintenance point of the standard `@supabase/ssr`
 * cookie scheme: expired access tokens are refreshed with the provider and
 * written back through this response before any page or action reads them.
 * Signed-out requests for protected routes are redirected to /auth here
 * (the 004e protected-route block below).
 *
 * Cache policy (004c): every response that sets or clears session or carry
 * cookies is non-cacheable — cached Set-Cookie responses can leak one
 * user's session to another. The library itself supplies no-store headers
 * alongside auth-cookie writes; the proxy also marks Server Action
 * responses (which may set or clear the carry cookie and session cookies)
 * and the interim /auth/confirm route as no-store. Both policies are
 * pinned by src/auth/proxy.test.ts and by e2e header assertions.
 */

export async function proxy(request: NextRequest) {
  const { pathname, search, origin } = request.nextUrl;

  // 1. /auth/confirm with any query: discard the query (it may carry the
  // one-time token hash) before substantive rendering or analytics, with
  // the required headers on the initial redirect response itself. The route
  // never verifies on GET. 004d: when the query is a valid link landing
  // (present token_hash, closed `type` enum), the hash is PARKED in the
  // signed, HttpOnly link cookie and the clean 302 goes to /auth/link,
  // where the explicit user action verifies; any other query — missing,
  // empty, or unknown `type` — is rejected to the clean recovery route.
  // Neither branch consumes the one-time token or creates a session.
  if (shouldRedirectToCleanConfirmUrl(pathname, search)) {
    const secret = getAuthLinkCookieSecret();
    const landing =
      secret !== null
        ? parseLinkLandingQuery(request.nextUrl.searchParams)
        : null;
    const redirectResponse = NextResponse.redirect(
      landing !== null ? linkLandingUrl(origin) : cleanConfirmUrl(origin),
      302,
    );
    if (landing !== null && secret !== null) {
      redirectResponse.cookies.set(
        LINK_COOKIE_NAME,
        await encodeLinkEnvelope(
          landing.tokenHash,
          "email",
          Date.now(),
          secret,
        ),
        linkCookieOptions(AUTH_LINK_CARRY_MAX_AGE_SECONDS),
      );
    }
    redirectResponse.headers.set("Cache-Control", NO_STORE);
    redirectResponse.headers.set("Referrer-Policy", NO_REFERRER);
    return redirectResponse;
  }

  // 2. Session maintenance first: a refresh rebuilds the response (the
  // updated request cookies must flow downstream), so cache policy is
  // applied to the final response object afterwards.
  let response = NextResponse.next({ request });

  const config = getSupabasePublicConfig();
  if (config) {
    const supabase = createServerClient(config.url, config.publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // The library passes no-store cache headers whenever auth cookies
          // are written; forward them onto the outgoing response.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    });
    // getUser() validates the session with the provider — never trust a
    // client-held session claim — and refreshes expired tokens via setAll.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 4. Protected routes (004e): anonymous requests for authenticated
    // routes — page GETs, refreshes, direct links, and the Server Actions
    // that POST to those same pathnames — are redirected to /auth before
    // any page or action runs. /auth without an intent parameter is the
    // safe default (`home`); no return destination beyond that enum is
    // ever reconstructed from the attempted URL. Each protected route
    // ALSO verifies the session server-side (requireCompleteProfile), so
    // a matcher gap is never the sole control. When no provider is
    // configured, this whole block is skipped and the server-side gate
    // remains the control.
    if (user === null && isProtectedRoutePath(pathname)) {
      const signedOutResponse = NextResponse.redirect(`${origin}/auth`, 302);
      // The redirect bounces an unauthenticated request away from
      // authenticated data access; it sets no cookies but must never be
      // cached as a signed-in-page response.
      signedOutResponse.headers.set("Cache-Control", NO_STORE);
      signedOutResponse.headers.set("Referrer-Policy", NO_REFERRER);
      return signedOutResponse;
    }
  }

  // 3. Cache policy on the final response: Server Action responses can set
  // or clear session and carry cookies; the interim /auth/confirm route
  // must also never be cached (its initial redirect carries the headers
  // above; the rendered page stays non-cacheable too). 005b generalizes the
  // policy to every response for a protected route path — redirect, rendered
  // document, or action response — because wishlist content is per-user
  // data: a cached document could leak one user's items to another through
  // a shared cache. /home and /onboarding gain no-store as an intended
  // hardening side effect.
  if (
    isServerActionRequest(request.method, request.headers.get("next-action"))
  ) {
    response.headers.set("Cache-Control", NO_STORE);
  }
  if (pathname === AUTH_CONFIRM_PATH || pathname === AUTH_LINK_PATH) {
    response.headers.set("Cache-Control", NO_STORE);
    response.headers.set("Referrer-Policy", NO_REFERRER);
  }
  if (isProtectedRoutePath(pathname)) {
    response.headers.set("Cache-Control", NO_STORE);
  }

  return response;
}

export const config = {
  // Runs on every route and Server Action request except Next's static
  // assets. Server Actions POST to the page's own URL, so a matcher that
  // excludes page paths would silently exclude the auth actions — this
  // matcher is pinned by test (src/auth/proxy.test.ts) and the no-store
  // headers on action responses are proven end-to-end (tests/e2e).
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
