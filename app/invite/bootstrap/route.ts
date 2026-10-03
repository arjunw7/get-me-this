import { NextResponse, type NextRequest } from "next/server";

import {
  COORDINATOR_COOKIE_NAME,
  LEASE_COOKIE_NAME,
  flowCookieName,
  getInvitationCookieSecret,
  invitationCookieOptions,
  parseLeaseCookie,
  parsePendingCookie,
  pendingCookieName,
  sealCoordinatorCookie,
  sealFlowCookie,
  sealLeaseCookie,
} from "@/src/invite/continuation-cookie";
import {
  beginFlowFromStart,
  consumeBootstrapLease,
  establishCoordinator,
} from "@/src/invite/invite-write";
import { generateCanonicalSecret } from "@/src/invite/token";

/**
 * The token-free bootstrap endpoint (brief 006c), called by the start page
 * while it holds the origin-wide Web Lock.
 *
 * Phase one (no coordinator cookie yet): establishes the browser
 * coordinator and a 15-second one-use bootstrap lease in the coordinator
 * row, seals both cookies, and returns WITHOUT creating a continuation.
 *
 * Phase two (coordinator + lease presented): consumes the lease and the
 * start's pending row under the coordinator's database lock and begins the
 * first flow; the valid begin's response carries the flow cookie and the
 * clean destination.
 *
 * Every failure is the same generic unavailable result and creates no
 * continuation. Every response is no-store and no-referrer.
 */

const NO_STORE = "no-store";
const NO_REFERRER = "no-referrer";

type BootstrapBody = {
  startId?: unknown;
};

function jsonResponse(
  payload: Record<string, unknown>,
  status: number,
): NextResponse {
  const response = NextResponse.json(payload, { status });
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}

export async function POST(request: NextRequest) {
  const secret = getInvitationCookieSecret();
  if (!secret) return jsonResponse({ ok: false }, 503);

  let body: BootstrapBody;
  try {
    body = (await request.json()) as BootstrapBody;
  } catch {
    return jsonResponse({ ok: false }, 400);
  }
  const startId = typeof body.startId === "string" ? body.startId : "";
  if (startId.length !== 36) return jsonResponse({ ok: false }, 400);

  const requestCookies = request.cookies;
  const pendingValue = requestCookies.get(pendingCookieName(startId))?.value;
  const pending = await parsePendingCookie(
    pendingValue,
    startId,
    Date.now(),
    secret,
  );
  if (!pending) return jsonResponse({ ok: false, reason: "unavailable" }, 200);

  const coordinatorValue = requestCookies.get(COORDINATOR_COOKIE_NAME)?.value;

  if (!coordinatorValue) {
    // Phase one: establish the coordinator with a one-use lease. No
    // continuation is created here.
    const coordinatorSecret = generateCanonicalSecret();
    const lease = generateCanonicalSecret();
    const established = await establishCoordinator(coordinatorSecret, lease);
    if (established.outcome !== "established") {
      return jsonResponse({ ok: false, reason: "unavailable" }, 200);
    }
    const sealedCoordinator = await sealCoordinatorCookie(
      coordinatorSecret,
      0,
      Date.now(),
      secret,
    );
    const sealedLease = await sealLeaseCookie(lease, Date.now(), secret);
    const response = jsonResponse({ ok: true, phase: "established" }, 200);
    response.cookies.set(
      COORDINATOR_COOKIE_NAME,
      sealedCoordinator,
      invitationCookieOptions(86400),
    );
    response.cookies.set(
      LEASE_COOKIE_NAME,
      sealedLease,
      invitationCookieOptions(60),
    );
    return response;
  }

  const coordinator = await (async () => {
    const { parseCoordinatorCookie } =
      await import("@/src/invite/continuation-cookie");
    return parseCoordinatorCookie(coordinatorValue, Date.now(), secret);
  })();
  if (!coordinator)
    return jsonResponse({ ok: false, reason: "unavailable" }, 200);

  // Phase two: consume the lease and pending start once, then begin.
  const leaseValue = requestCookies.get(LEASE_COOKIE_NAME)?.value;
  const lease = await parseLeaseCookie(leaseValue, Date.now(), secret);
  if (!lease) return jsonResponse({ ok: false, reason: "unavailable" }, 200);

  const consumed = await consumeBootstrapLease(coordinator.secret, lease.lease);
  if (consumed.outcome !== "established") {
    return jsonResponse({ ok: false, reason: "unavailable" }, 200);
  }

  const browserSecret = generateCanonicalSecret();
  const begin = await beginFlowFromStart(
    startId,
    browserSecret,
    pending.nonce,
    coordinator.secret,
  );
  if (!begin) return jsonResponse({ ok: false, reason: "unavailable" }, 200);

  const sealed = await sealFlowCookie(
    { flowId: begin.flowId, browserSecret, email: null },
    Date.now(),
    secret,
  );
  const response = jsonResponse(
    { ok: true, phase: "begun", flowId: begin.flowId },
    200,
  );
  response.cookies.set(
    flowCookieName(begin.flowId),
    sealed,
    invitationCookieOptions(3600),
  );
  // The one-use lease and pending cookies are spent.
  response.cookies.set(LEASE_COOKIE_NAME, "", {
    ...invitationCookieOptions(0),
  });
  response.cookies.set(pendingCookieName(startId), "", {
    ...invitationCookieOptions(0),
  });
  return response;
}
