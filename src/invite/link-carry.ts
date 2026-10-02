import "server-only";

import { cookies } from "next/headers";

import {
  getInvitationCookieSecret,
  parseEnvelope,
  sealEnvelope,
} from "./continuation-cookie";

/**
 * The parked magic-link credential for the invitation flow (brief 006c).
 * GET /auth/confirm/invite/[flowId] parks the auth token hash inside the
 * flow's sealed link cookie and redirects clean; only the explicit
 * "Use my sign-in link" action verifies. The envelope is bound to the flow
 * id (authenticated as additional data), so a link opened in another
 * browser or under another flow can never adopt the credential.
 *
 * The parked token hash is removed after every completed verification
 * attempt, and it never enters tables, logs, analytics, or URLs after the
 * initial provider email.
 */

export const INVITE_LINK_COOKIE_NAME = "__Host-gmt-invite-link";
export const INVITE_LINK_COOKIE_MAX_AGE_SECONDS = 3600;

export type InviteLinkCarry = {
  readonly tokenHash: string;
  readonly flowId: string;
};

type InviteLinkPayload = {
  v?: unknown;
  tokenHash?: unknown;
  flowId?: unknown;
  iat?: unknown;
  exp?: unknown;
};

export async function sealInviteLinkCarry(
  carry: InviteLinkCarry,
): Promise<string | null> {
  const secret = getInvitationCookieSecret();
  if (!secret) return null;
  return sealEnvelope(
    JSON.stringify({
      v: 1,
      tokenHash: carry.tokenHash,
      flowId: carry.flowId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + INVITE_LINK_COOKIE_MAX_AGE_SECONDS,
    }),
    carry.flowId,
    secret,
  );
}

export async function parseInviteLinkCarry(
  flowId: string,
): Promise<InviteLinkCarry | null> {
  const secret = getInvitationCookieSecret();
  if (!secret) return null;
  const store = await cookies();
  const parsed = await parseEnvelope(
    store.get(INVITE_LINK_COOKIE_NAME)?.value,
    flowId,
    secret,
    Date.now(),
    INVITE_LINK_COOKIE_MAX_AGE_SECONDS,
  );
  if (parsed === null) return null;
  let payload: InviteLinkPayload;
  try {
    payload = JSON.parse(parsed.payload) as InviteLinkPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.tokenHash !== "string" ||
    payload.tokenHash.length === 0 ||
    payload.tokenHash.length > 512 ||
    payload.flowId !== flowId
  ) {
    return null;
  }
  return { tokenHash: payload.tokenHash, flowId };
}

export async function clearInviteLinkCarry(): Promise<void> {
  const store = await cookies();
  store.set(INVITE_LINK_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
