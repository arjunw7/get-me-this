import "server-only";

import { cookies } from "next/headers";

import {
  COORDINATOR_COOKIE_NAME,
  MUTATION_COOKIE_NAME,
  flowCookieName,
  isFlowCookieName,
  parseCoordinatorCookie,
  parseFlowCookie,
  parseMutationCookie,
  getInvitationCookieSecret,
  type CoordinatorCookie,
  type FlowCookie,
  type MutationCookie,
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

/**
 * The broker mutation's sealed one-use delivery nonce, when this browser
 * carries an unacknowledged mutation delivery. Its presence is the honest
 * signal that the server lease is still in `delivery_pending`: continuation
 * reconciliation may run only after the acknowledgement (or recovery)
 * clears this cookie.
 */
export async function readMutationDelivery(): Promise<MutationCookie | null> {
  const secret = getInvitationCookieSecret();
  if (!secret) return null;
  const store = await cookies();
  return parseMutationCookie(
    store.get(MUTATION_COOKIE_NAME)?.value,
    Date.now(),
    secret,
  );
}

/** Clears the delivery-nonce cookie after acknowledgement or recovery. */
export async function clearMutationDelivery(): Promise<void> {
  const store = await cookies();
  store.set(MUTATION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
}
