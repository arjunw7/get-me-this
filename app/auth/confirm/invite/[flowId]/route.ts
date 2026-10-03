import { NextResponse, type NextRequest } from "next/server";

import {
  getInvitationCookieSecret,
  sealFlowCookie,
} from "@/src/invite/continuation-cookie";
import { readFlowCookie } from "@/src/invite/flow-session";
import { sealInviteLinkCarry } from "@/src/invite/link-carry";
import { isFlowId } from "@/src/invite/token";

/**
 * The invitation magic-link landing (brief 006c): GET NEVER verifies. It
 * validates the flow cookie and query shape, parks the auth token hash
 * inside the flow's sealed link cookie, and returns a clean 302 to
 * /auth/link/invite/[flowId]. It renders no content, runs no analytics,
 * and creates no session. A missing browser cookie, altered flow, or
 * malformed query reaches the same clean recovery and creates no session —
 * a link opened in another browser can never adopt the flow.
 */

const NO_STORE = "no-store";
const NO_REFERRER = "no-referrer";

function recovery(origin: string, flowId: string): NextResponse {
  const response = NextResponse.redirect(
    `${origin}/auth/link/invite/${flowId}`,
    302,
  );
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}

/**
 * The request's own origin, from the Host header. Never `request.nextUrl`
 * or `request.url`: Next's proxy chain normalizes the reconstructed host
 * (127.0.0.1 became localhost), and a cross-host redirect would strand the
 * cookies the browser just received on its actual host. The forwarded
 * headers are honoured because a proxy already validated them.
 */
function requestOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return host !== null ? `${proto}://${host}` : new URL(request.url).origin;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ flowId: string }> },
) {
  const origin = requestOrigin(request);
  const { flowId } = await context.params;

  // The recovery destination is always the clean link screen; without a
  // valid flow cookie the screen itself renders the other-browser
  // recovery, so a foreign adoption learns nothing.
  if (!isFlowId(flowId)) {
    return recovery(origin, flowId);
  }

  const flow = await readFlowCookie(flowId);
  if (!flow) return recovery(origin, flowId);

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (
    tokenHash === null ||
    tokenHash === "" ||
    tokenHash.length > 512 ||
    type !== "email"
  ) {
    return recovery(origin, flowId);
  }

  const secret = getInvitationCookieSecret();
  const sealed =
    secret !== null ? await sealInviteLinkCarry({ tokenHash, flowId }) : null;
  if (sealed === null) return recovery(origin, flowId);

  const response = NextResponse.redirect(
    `${origin}/auth/link/invite/${flowId}`,
    302,
  );
  response.cookies.set("__Host-gmt-invite-link", sealed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  // The flow cookie is re-anchored to this response so the parked
  // credential and the flow travel together (same-site, same lifetime
  // window). The envelope content is unchanged.
  const resealed = await sealFlowCookie(
    { flowId, browserSecret: flow.browserSecret, email: flow.email },
    Date.now(),
    secret!,
  );
  response.cookies.set(`__Host-gmt-invite-${flowId}`, resealed, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}
