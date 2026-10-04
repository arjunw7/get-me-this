import "server-only";

import { parsePublicShareToken } from "@/src/wishlist/public-share-token";
import { cookies } from "next/headers";

import { CARRY_COOKIE_MAX_AGE_SECONDS } from "./flow-config";
import { isValidEmail } from "./email";
import { parseIntent, type AuthIntent } from "./fixtures";

/**
 * The short-lived, app-owned carry cookie that moves the validated email
 * and approved intent from /auth to /auth/verify (004c, owner decision).
 *
 * - HttpOnly, Secure, SameSite=Lax, scoped to Path=/auth — the email and
 *   intent never travel in URLs, JS-readable storage, logs, or analytics.
 * - Validated server-side on every read: JSON shape, format-checked email,
 *   intent from the closed enum, checked expiry. The cookie is never
 *   treated as proof of identity — it only carries what the user typed.
 * - Cleared on explicit cancel or flow restart, on successful verification,
 *   and at expiry (the browser drops it at Max-Age; expired values are also
 *   rejected server-side).
 */

export const CARRY_COOKIE_NAME = "gmt-auth-carry";

export type AuthCarry = {
  readonly email: string;
  readonly intent: AuthIntent;
  readonly shareToken?: string;
};

type CarryPayload = {
  email?: unknown;
  intent?: unknown;
  shareToken?: unknown;
  exp?: unknown;
};

const carryCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/auth",
  maxAge: CARRY_COOKIE_MAX_AGE_SECONDS,
} as const;

/** Serialises the carry payload with its checked expiry (epoch seconds). */
export function encodeAuthCarry(
  email: string,
  intent: AuthIntent,
  nowMs: number,
  shareToken?: string,
): string {
  return JSON.stringify({
    email,
    intent,
    ...(intent === "public-wishlist" && parsePublicShareToken(shareToken)
      ? { shareToken }
      : {}),
    exp: Math.floor(nowMs / 1000) + CARRY_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Server-side validation of a carried value. Returns the carry only when
 * the JSON shape, email format, closed intent enum, and expiry all check
 * out; anything else is treated exactly like a missing cookie.
 */
export function parseAuthCarry(
  value: string | undefined,
  nowMs: number,
): AuthCarry | null {
  if (value === undefined || value === "") return null;
  let payload: CarryPayload;
  try {
    payload = JSON.parse(value) as CarryPayload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  if (typeof payload.email !== "string" || !isValidEmail(payload.email)) {
    return null;
  }
  if (typeof payload.intent !== "string") return null;
  const intent: AuthIntent = parseIntent(payload.intent);
  if (payload.intent !== intent) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }
  if (payload.exp <= Math.floor(nowMs / 1000)) return null;
  const shareToken = parsePublicShareToken(payload.shareToken);
  if (intent === "public-wishlist" && !shareToken) return null;
  return {
    email: payload.email.trim(),
    intent,
    ...(intent === "public-wishlist" && shareToken ? { shareToken } : {}),
  };
}

/** Reads and validates the carry cookie from the current request. */
export async function readAuthCarry(): Promise<AuthCarry | null> {
  const store = await cookies();
  return parseAuthCarry(store.get(CARRY_COOKIE_NAME)?.value, Date.now());
}

/** Sets the carry cookie on the current action's response. */
export async function setAuthCarry(
  email: string,
  intent: AuthIntent,
  shareToken?: string,
): Promise<void> {
  const store = await cookies();
  store.set(
    CARRY_COOKIE_NAME,
    encodeAuthCarry(email, intent, Date.now(), shareToken),
    {
      ...carryCookieOptions,
    },
  );
}

/** Clears the carry cookie on the current action's response. */
export async function clearAuthCarry(): Promise<void> {
  const store = await cookies();
  store.set(CARRY_COOKIE_NAME, "", { ...carryCookieOptions, maxAge: 0 });
}
