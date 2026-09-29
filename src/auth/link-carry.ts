import "server-only";

import { cookies } from "next/headers";

import {
  LINK_COOKIE_NAME,
  getAuthLinkCookieSecret,
  linkCookieOptions,
  parseLinkEnvelope,
  type LinkCarry,
} from "./link-cookie";

/**
 * Cookie-store half of the 004d link carriage (server-only). The proxy sets
 * the link cookie on its own redirect response; this module reads and
 * clears it inside server components and the explicit verify action.
 *
 * Every read validates the signed envelope server-side (signature, closed
 * `type` enum, checked `issuedAt` window); any rejection is treated exactly
 * like a missing cookie. The verify action clears the cookie on every
 * completed attempt — success, provider failure, and every terminal
 * recovery outcome alike (one-shot carriage; crash-safe deletion is
 * deliberately not claimed).
 */

/** Reads and validates the link cookie from the current request. */
export async function readLinkCarry(): Promise<LinkCarry | null> {
  const secret = getAuthLinkCookieSecret();
  if (!secret) return null;
  const store = await cookies();
  return parseLinkEnvelope(
    store.get(LINK_COOKIE_NAME)?.value,
    Date.now(),
    secret,
  );
}

/** Clears the link cookie on the current action's response. */
export async function clearLinkCarry(): Promise<void> {
  const store = await cookies();
  store.set(LINK_COOKIE_NAME, "", linkCookieOptions(0));
}
