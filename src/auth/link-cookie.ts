import { AUTH_LINK_CARRY_MAX_AGE_SECONDS } from "./flow-config";

/**
 * The one-shot link cookie that parks the emailed magic-link's token hash
 * between the initial GET of `/auth/confirm` and the explicit user
 * verification action (004d — the resolution of the 004c design gate).
 *
 * - GET `/auth/confirm?token_hash=...&type=email` NEVER verifies and never
 *   consumes: it validates the query server-side and, when valid, sets this
 *   cookie before the same clean 302 (no-store, no-referrer) to `/auth/link`.
 *   An email-scanner prefetch may therefore park the hash harmlessly; the
 *   one-time token stays unconsumed until the user's explicit action.
 * - The cookie mirrors the approved 004c carry-cookie pattern — app-owned,
 *   HttpOnly, Secure, SameSite=Lax, scoped to `Path=/auth` — with one
 *   hardening: the envelope is INTEGRITY-PROTECTED. The value is
 *   `base64url(payload).base64url(HMAC-SHA256(payload, secret))` so a
 *   client-stored copy cannot be altered (for example to extend a future
 *   `issuedAt`). The secret is server-only configuration.
 * - Read paths validate the signature, the closed `type` enum, and the
 *   `issuedAt` against the wall clock; every rejected value is treated
 *   exactly like a missing cookie (recovery, never an error leak).
 *
 * This module is proxy-safe: it imports nothing from `next/headers`, so
 * proxy.ts can both sign the envelope and set the cookie on its own
 * redirect response. The cookie-store helpers live in link-carry.ts.
 */

export const LINK_COOKIE_NAME = "gmt-auth-link";

/**
 * The closed set of `type` values the 004c email templates actually emit —
 * `email` per the pinned link form
 * `.../auth/confirm?token_hash={{ .TokenHash }}&type=email`. The set is
 * extended only if a staging review proves the magic-link template's token
 * requires `magiclink`; every other value is rejected to recovery.
 */
export const LINK_TOKEN_TYPES = ["email"] as const;
export type LinkTokenType = (typeof LINK_TOKEN_TYPES)[number];

export type LinkCarry = {
  readonly tokenHash: string;
  readonly type: LinkTokenType;
  /** Epoch seconds when the envelope was issued (an expiry input). */
  readonly issuedAt: number;
};

type LinkPayload = {
  tokenHash?: unknown;
  type?: unknown;
  issuedAt?: unknown;
};

/** The server-only secret; null means the carriage feature is disabled. */
export function getAuthLinkCookieSecret(): string | null {
  const secret = process.env.AUTH_LINK_COOKIE_SECRET?.trim();
  return secret ? secret : null;
}

// --- base64url (edge-safe: no Buffer dependency) ---------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

/** Constant-time-enough comparison: both digests are fixed-length HMACs. */
function signaturesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

// --- envelope --------------------------------------------------------------

/** Serialises and signs the link-carry payload into the cookie value. */
export async function encodeLinkEnvelope(
  tokenHash: string,
  type: LinkTokenType,
  nowMs: number,
  secret: string,
): Promise<string> {
  const payload = JSON.stringify({
    tokenHash,
    type,
    issuedAt: Math.floor(nowMs / 1000),
  });
  // The signature covers the encoded payload part, so verification can
  // recompute it from the envelope alone.
  const payloadPart = bytesToBase64Url(encoder.encode(payload));
  return `${payloadPart}.${await hmac(payloadPart, secret)}`;
}

/**
 * Server-side validation of a parked value. Returns the carry only when the
 * envelope's signature verifies under the secret, the payload shape and
 * closed `type` enum check out, and `issuedAt` lies within the named
 * carry window — never in the future, never older than
 * AUTH_LINK_CARRY_MAX_AGE_SECONDS. Every rejection is treated exactly like
 * a missing cookie by the caller (recovery, never an error leak).
 */
export async function parseLinkEnvelope(
  value: string | undefined,
  nowMs: number,
  secret: string,
): Promise<LinkCarry | null> {
  if (value === undefined || value === "") return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const payloadPart = value.slice(0, dot);
  const signaturePart = value.slice(dot + 1);
  // Signature verification happens FIRST: an untrusted payload is never
  // decoded or inspected beyond splitting the envelope. Only after the
  // HMAC check passes is the payload parsed and its shape validated. Every
  // rejection path returns the same null, so ordering is unobservable.
  const expected = await hmac(payloadPart, secret);
  if (!signaturesEqual(expected, signaturePart)) return null;
  const payloadBytes = base64UrlToBytes(payloadPart);
  if (payloadBytes === null) return null;
  let payload: LinkPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as LinkPayload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  if (typeof payload.tokenHash !== "string" || payload.tokenHash === "") {
    return null;
  }
  if (payload.tokenHash.length > 512) return null;
  if (
    typeof payload.type !== "string" ||
    !LINK_TOKEN_TYPES.includes(payload.type as LinkTokenType)
  ) {
    return null;
  }
  if (
    typeof payload.issuedAt !== "number" ||
    !Number.isInteger(payload.issuedAt)
  ) {
    return null;
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  // Forged-future issuedAt and expired issuedAt are both rejected here.
  if (payload.issuedAt > nowSeconds) return null;
  if (payload.issuedAt <= nowSeconds - AUTH_LINK_CARRY_MAX_AGE_SECONDS) {
    return null;
  }
  return {
    tokenHash: payload.tokenHash,
    type: payload.type as LinkTokenType,
    issuedAt: payload.issuedAt,
  };
}

/**
 * Server-side validation of the initial GET query (004d): the link cookie is
 * set ONLY from a present, non-empty `token_hash` with a `type` from the
 * closed enum. Any other query — missing, empty, or wrong `type` — is
 * rejected to the recovery redirect, never an error leak.
 */
export function parseLinkLandingQuery(
  params: URLSearchParams,
): { tokenHash: string } | null {
  const tokenHash = params.get("token_hash");
  if (tokenHash === null || tokenHash === "" || tokenHash.length > 512) {
    return null;
  }
  const type = params.get("type");
  if (type === null || !LINK_TOKEN_TYPES.includes(type as LinkTokenType)) {
    return null;
  }
  return { tokenHash };
}

/** The link cookie's set/delete options (mirrors the 004c carry cookie). */
export function linkCookieOptions(maxAge: number): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/auth";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/auth",
    maxAge,
  };
}
