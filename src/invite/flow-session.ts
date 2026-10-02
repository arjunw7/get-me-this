import "server-only";

import { cookies } from "next/headers";

import {
  COORDINATOR_COOKIE_NAME,
  flowCookieName,
  isFlowCookieName,
  parseCoordinatorCookie,
  parseFlowCookie,
  getInvitationCookieSecret,
  type CoordinatorCookie,
  type FlowCookie,
} from "./continuation-cookie";
import { isFlowId } from "./token";

/**
 * Server-side access to the sealed invitation cookies (brief 006c). Every
 * read validates the envelope server-side; a missing, malformed, expired,
 * or swapped envelope is exactly a missing cookie — never an error leak.
 * Nothing here treats a cookie as identity: the verified session and the
 * database function re-derive all authority.
 */

/** Reads and validates the coordinator cookie, or null. */
export async function readCoordinatorCookie(): Promise<CoordinatorCookie | null> {
  const secret = getInvitationCookieSecret();
  if (!secret) return null;
  const store = await cookies();
  return parseCoordinatorCookie(
    store.get(COORDINATOR_COOKIE_NAME)?.value,
    Date.now(),
    secret,
  );
}

/** Reads and validates the named flow's sealed cookie, or null. */
export async function readFlowCookie(
  flowId: string,
): Promise<FlowCookie | null> {
  if (!isFlowId(flowId)) return null;
  const secret = getInvitationCookieSecret();
  if (!secret) return null;
  const store = await cookies();
  return parseFlowCookie(
    store.get(flowCookieName(flowId))?.value,
    flowId,
    Date.now(),
    secret,
  );
}

export type FlowCookieEntry = {
  readonly flowId: string;
  readonly cookie: FlowCookie;
};

/**
 * Every live flow envelope in this browser, validated against its own
 * cookie name (a cookie whose envelope flow id does not match its name is
 * treated as absent). Used by the confirmed-logout cleanup, which must
 * present the complete proven list to the authoritative-inventory
 * invalidation.
 */
export async function readAllFlowCookies(): Promise<FlowCookieEntry[]> {
  const secret = getInvitationCookieSecret();
  if (!secret) return [];
  const store = await cookies();
  const entries: FlowCookieEntry[] = [];
  for (const cookie of store.getAll()) {
    if (!isFlowCookieName(cookie.name)) continue;
    const flowId = cookie.name.slice("__Host-gmt-invite-".length);
    if (!isFlowId(flowId)) continue;
    const parsed = await parseFlowCookie(
      cookie.value,
      flowId,
      Date.now(),
      secret,
    );
    if (parsed) entries.push({ flowId, cookie: parsed });
  }
  return entries;
}
