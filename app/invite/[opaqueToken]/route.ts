import { NextResponse, type NextRequest } from "next/server";

import {
  flowCookieName,
  invitationCookieOptions,
  sealFlowCookie,
  sealPendingCookie,
  pendingCookieName,
  getInvitationCookieSecret,
} from "@/src/invite/continuation-cookie";
import { readCoordinatorCookie } from "@/src/invite/flow-session";
import {
  beginFlowFromToken,
  createPendingStart,
} from "@/src/invite/invite-write";
import {
  generateCanonicalSecret,
  isCanonicalOpaqueToken,
} from "@/src/invite/token";

/**
 * The raw-token landing handler (brief 006c): a GET-only bounded redirect,
 * never a page. It never renders application content, runs client code,
 * loads analytics, or verifies authentication.
 *
 * - With an established coordinator cookie: a fresh 32-byte browser secret
 *   is generated and the continuation begin runs server-side; success sets
 *   the flow-specific sealed cookie and 302s to /invite/continue/[flowId].
 * - Without one: only a 30-second one-use pending-start record (invitation
 *   reference + nonce digest) is created, a flow-specific sealed pending
 *   cookie is set, and the clean 302 goes to /invite/start/[startId], where
 *   the token-free bootstrap serializes through the origin-wide lock.
 *
 * Every response — valid and invalid alike — is no-store and no-referrer,
 * and no raw token survives in the body, redirect target, cookie
 * plaintext, or any Server Component payload. No route redirects back to
 * the raw-token URL.
 */

const NO_STORE = "no-store";
const NO_REFERRER = "no-referrer";

function unavailable(origin: string): NextResponse {
  const response = NextResponse.redirect(`${origin}/invite/unavailable`, 302);
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ opaqueToken: string }> },
) {
  const { origin } = request.nextUrl;

  const secret = getInvitationCookieSecret();
  if (!secret) return unavailable(origin);

  const { opaqueToken } = await context.params;
  if (!isCanonicalOpaqueToken(opaqueToken)) return unavailable(origin);

  // Reorder-safe cleanup headers on every branch below.
  const coordinator = await readCoordinatorCookie();
  if (!coordinator) {
    // Token-free first contact: a bounded one-use pending start plus the
    // sealed pending cookie; the bootstrap phase begins the flow.
    const nonce = generateCanonicalSecret();
    const start = await createPendingStart(opaqueToken, nonce);
    if (!start) return unavailable(origin);

    const sealed = await sealPendingCookie(
      { startId: start.startId, nonce },
      Date.now(),
      secret,
    );
    const response = NextResponse.redirect(
      `${origin}/invite/start/${start.startId}`,
      302,
    );
    response.cookies.set(
      pendingCookieName(start.startId),
      sealed,
      invitationCookieOptions(60),
    );
    response.headers.set("Cache-Control", NO_STORE);
    response.headers.set("Referrer-Policy", NO_REFERRER);
    return response;
  }

  // Established coordinator: begin directly under the coordinator's
  // database lock (the begin function serializes creation there).
  const browserSecret = generateCanonicalSecret();
  const begin = await beginFlowFromToken(
    opaqueToken,
    browserSecret,
    coordinator.secret,
  );
  if (!begin) return unavailable(origin);

  const sealed = await sealFlowCookie(
    { flowId: begin.flowId, browserSecret, email: null },
    Date.now(),
    secret,
  );
  const response = NextResponse.redirect(
    `${origin}/invite/continue/${begin.flowId}`,
    302,
  );
  response.cookies.set(
    flowCookieName(begin.flowId),
    sealed,
    invitationCookieOptions(3600),
  );
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}
