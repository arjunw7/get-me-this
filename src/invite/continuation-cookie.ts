import { isCanonicalOpaqueToken, isFlowId } from "./token";

/**
 * The sealed invitation-continuation cookie envelopes (brief 006c).
 *
 * Three cookie families protect the invitation journey, all HttpOnly,
 * Secure, SameSite=Lax, `Path=/` (`__Host-` prefixed, no Domain):
 *
 * - The fixed coordinator cookie: one per browser, sealed value contains
 *   ONLY a random coordinator secret, version, issue time, and expiry —
 *   never a flow, destination, email, user, token, or group value.
 * - One dynamic flow cookie per continuation, named with the flow id:
 *   a versioned AES-256-GCM envelope containing the flow id, the fresh
 *   browser secret, the optional requested email, issued-at, and expiry.
 *   The flow id is authenticated as additional data.
 * - The bounded pending-start and bootstrap-lease cookies for the
 *   token-free first-contact bootstrap.
 *
 * Cookie parsing rejects an unknown version, bad length, bad encoding,
 * failed authentication tag, future issue time, expiry, or a
 * cookie-name/flow mismatch as one generic failure. The envelope NEVER
 * contains the raw invitation token, token hash, invitation id, group id,
 * profile, or membership state.
 *
 * This module is proxy-safe and pure: no `next/headers` import, no
 * logging, no analytics. The secret is the dedicated server-only
 * INVITATION_CONTINUATION_COOKIE_SECRET (32 random bytes, canonical
 * base64url), never a Supabase or Resend credential.
 */

export const COORDINATOR_COOKIE_NAME = "__Host-gmt-invite-coordinator";
export const LEASE_COOKIE_NAME = "__Host-gmt-invite-lease";
export const PENDING_COOKIE_PREFIX = "__Host-gmt-invite-start-";
export const FLOW_COOKIE_PREFIX = "__Host-gmt-invite-";
/**
 * The one-use auth-mutation delivery nonce (brief 006c criteria 5 and 12):
 * set only by a lease-holding broker mutation whose response delivers the
 * mutation's cookie effects, consumed by the separate acknowledgement
 * route, and cleared by acknowledgement or recovery. Its presence on a
 * later request proves that delivery has not been acknowledged yet.
 */
export const MUTATION_COOKIE_NAME = "__Host-gmt-invite-mutation";

export const FLOW_COOKIE_MAX_AGE_SECONDS = 3600;
/** Outlives the longest possible unreleased envelope; never rotated. */
export const COORDINATOR_COOKIE_MAX_AGE_SECONDS = 86400;
export const PENDING_COOKIE_MAX_AGE_SECONDS = 60;
export const LEASE_COOKIE_MAX_AGE_SECONDS = 60;
/** Bounds the unacknowledged-delivery window; recovery resolves the rest. */
export const MUTATION_COOKIE_MAX_AGE_SECONDS = 120;

export function flowCookieName(flowId: string): string {
  return `${FLOW_COOKIE_PREFIX}${flowId}`;
}

export function pendingCookieName(startId: string): string {
  return `${PENDING_COOKIE_PREFIX}${startId}`;
}

/** True for every dynamic invitation cookie that carries a flow envelope. */
export function isFlowCookieName(name: string): boolean {
  return (
    name.startsWith(FLOW_COOKIE_PREFIX) &&
    name !== COORDINATOR_COOKIE_NAME &&
    name !== LEASE_COOKIE_NAME &&
    !name.startsWith(PENDING_COOKIE_PREFIX) &&
    isFlowId(name.slice(FLOW_COOKIE_PREFIX.length))
  );
}

/** The server-only sealing secret; null disables the invitation surface. */
export function getInvitationCookieSecret(): string | null {
  const secret = process.env.INVITATION_CONTINUATION_COOKIE_SECRET?.trim();
  return secret && isCanonicalOpaqueToken(secret) ? secret : null;
}

// --- base64url AES-256-GCM envelopes (edge-safe, no Buffer) -----------------

function bytesToBase64Url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (value.length === 0 || /[^A-Za-z0-9_-]/.test(value)) return null;
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

const ENVELOPE_VERSION = 1;
const IV_LENGTH = 12;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = base64UrlToBytes(secret);
  if (raw === null || raw.length !== 32)
    return Promise.reject(new Error("bad key"));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Seals the payload JSON into `iv.ciphertext+tag` base64url parts. The
 * additional data (the flow id, or the fixed cookie role) is authenticated
 * but not part of the value.
 */
export async function sealEnvelope(
  payload: string,
  additionalData: string,
  secret: string,
): Promise<string> {
  const key = await importKey(secret);
  const iv = new Uint8Array(new ArrayBuffer(IV_LENGTH));
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(additionalData) },
    key,
    encoder.encode(payload),
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export type ParsedEnvelope = {
  readonly payload: string;
  readonly issuedAt: number;
  readonly expiry: number;
};

type EnvelopePayload = {
  v?: unknown;
  iat?: unknown;
  exp?: unknown;
  [key: string]: unknown;
};

/**
 * Parses and authenticates an envelope. Every rejection — unknown version,
 * bad length, bad encoding, failed tag, future issue time, expiry, or AAD
 * mismatch — is the same null, so ordering is unobservable.
 */
export async function parseEnvelope(
  value: string | undefined,
  additionalData: string,
  secret: string,
  nowMs: number,
  maxAgeSeconds: number,
): Promise<ParsedEnvelope | null> {
  if (value === undefined || value === "") return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const iv = base64UrlToBytes(value.slice(0, dot));
  const ciphertext = base64UrlToBytes(value.slice(dot + 1));
  if (iv === null || ciphertext === null || iv.length !== IV_LENGTH)
    return null;
  if (ciphertext.length < 16 || ciphertext.length > 4096) return null;

  let key: CryptoKey;
  try {
    key = await importKey(secret);
  } catch {
    return null;
  }

  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(additionalData) },
      key,
      ciphertext,
    );
  } catch {
    return null;
  }

  let payload: EnvelopePayload;
  try {
    payload = JSON.parse(decoder.decode(plain)) as EnvelopePayload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  if (payload.v !== ENVELOPE_VERSION) return null;
  if (typeof payload.iat !== "number" || !Number.isInteger(payload.iat))
    return null;
  if (typeof payload.exp !== "number" || !Number.isInteger(payload.exp))
    return null;

  const nowSeconds = Math.floor(nowMs / 1000);
  // A future issue time and an expired issue time are the same rejection.
  if (payload.iat > nowSeconds) return null;
  if (payload.iat <= nowSeconds - maxAgeSeconds) return null;
  if (payload.exp <= nowSeconds) return null;

  return {
    payload: JSON.stringify(payload),
    issuedAt: payload.iat,
    expiry: payload.exp,
  };
}

// --- typed envelopes -------------------------------------------------------

export type FlowCookie = {
  readonly flowId: string;
  readonly browserSecret: string;
  readonly email: string | null;
  /** Set only by the same-origin Join POST; never by a landing GET. */
  readonly joinRequested?: true;
};

type FlowCookiePayload = EnvelopePayload & {
  flowId?: unknown;
  browserSecret?: unknown;
  email?: unknown;
  joinRequested?: unknown;
};

export async function sealFlowCookie(
  flow: FlowCookie,
  nowMs: number,
  secret: string,
): Promise<string> {
  return sealEnvelope(
    JSON.stringify({
      v: ENVELOPE_VERSION,
      flowId: flow.flowId,
      browserSecret: flow.browserSecret,
      email: flow.email,
      ...(flow.joinRequested === true ? { joinRequested: true } : {}),
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + FLOW_COOKIE_MAX_AGE_SECONDS,
    }),
    flow.flowId,
    secret,
  );
}

export async function parseFlowCookie(
  value: string | undefined,
  flowId: string,
  nowMs: number,
  secret: string,
): Promise<FlowCookie | null> {
  const parsed = await parseEnvelope(
    value,
    flowId,
    secret,
    nowMs,
    FLOW_COOKIE_MAX_AGE_SECONDS,
  );
  if (parsed === null) return null;
  let payload: FlowCookiePayload;
  try {
    payload = JSON.parse(parsed.payload) as FlowCookiePayload;
  } catch {
    return null;
  }
  if (typeof payload.flowId !== "string" || payload.flowId !== flowId)
    return null;
  if (
    typeof payload.browserSecret !== "string" ||
    !isCanonicalOpaqueToken(payload.browserSecret)
  ) {
    return null;
  }
  if (payload.joinRequested !== undefined && payload.joinRequested !== true)
    return null;
  if (payload.email !== null && typeof payload.email !== "string") return null;
  return {
    flowId,
    browserSecret: payload.browserSecret,
    email: payload.email ?? null,
    ...(payload.joinRequested === true ? { joinRequested: true as const } : {}),
  };
}

export type CoordinatorCookie = {
  readonly secret: string;
  /**
   * The session epoch presented when this cookie was sealed. The broker
   * lease routes compare-and-swap against it; acknowledgement reseals the
   * cookie with the advanced epoch. Cookies sealed before the broker
   * existed parse as epoch 0, which matches a fresh coordinator row.
   */
  readonly epoch: number;
};

type CoordinatorPayload = EnvelopePayload & {
  secret?: unknown;
  epoch?: unknown;
};

export async function sealCoordinatorCookie(
  coordinatorSecret: string,
  epoch: number,
  nowMs: number,
  secret: string,
): Promise<string> {
  return sealEnvelope(
    JSON.stringify({
      v: ENVELOPE_VERSION,
      secret: coordinatorSecret,
      epoch,
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + COORDINATOR_COOKIE_MAX_AGE_SECONDS,
    }),
    COORDINATOR_COOKIE_NAME,
    secret,
  );
}

export async function parseCoordinatorCookie(
  value: string | undefined,
  nowMs: number,
  secret: string,
): Promise<CoordinatorCookie | null> {
  const parsed = await parseEnvelope(
    value,
    COORDINATOR_COOKIE_NAME,
    secret,
    nowMs,
    COORDINATOR_COOKIE_MAX_AGE_SECONDS,
  );
  if (parsed === null) return null;
  let payload: CoordinatorPayload;
  try {
    payload = JSON.parse(parsed.payload) as CoordinatorPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.secret !== "string" ||
    !isCanonicalOpaqueToken(payload.secret)
  ) {
    return null;
  }
  const epoch =
    payload.epoch === undefined
      ? 0
      : typeof payload.epoch === "number" &&
          Number.isInteger(payload.epoch) &&
          payload.epoch >= 0
        ? payload.epoch
        : null;
  if (epoch === null) return null;
  return { secret: payload.secret, epoch };
}

export type PendingCookie = {
  readonly startId: string;
  readonly nonce: string;
};

type PendingPayload = EnvelopePayload & {
  startId?: unknown;
  nonce?: unknown;
};

export async function sealPendingCookie(
  pending: PendingCookie,
  nowMs: number,
  secret: string,
): Promise<string> {
  return sealEnvelope(
    JSON.stringify({
      v: ENVELOPE_VERSION,
      startId: pending.startId,
      nonce: pending.nonce,
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + PENDING_COOKIE_MAX_AGE_SECONDS,
    }),
    pending.startId,
    secret,
  );
}

export async function parsePendingCookie(
  value: string | undefined,
  startId: string,
  nowMs: number,
  secret: string,
): Promise<PendingCookie | null> {
  const parsed = await parseEnvelope(
    value,
    startId,
    secret,
    nowMs,
    PENDING_COOKIE_MAX_AGE_SECONDS,
  );
  if (parsed === null) return null;
  let payload: PendingPayload;
  try {
    payload = JSON.parse(parsed.payload) as PendingPayload;
  } catch {
    return null;
  }
  if (typeof payload.startId !== "string" || payload.startId !== startId)
    return null;
  if (
    typeof payload.nonce !== "string" ||
    !isCanonicalOpaqueToken(payload.nonce)
  ) {
    return null;
  }
  return { startId, nonce: payload.nonce };
}

export type LeaseCookie = {
  readonly lease: string;
};

type LeasePayload = EnvelopePayload & { lease?: unknown };

export async function sealLeaseCookie(
  lease: string,
  nowMs: number,
  secret: string,
): Promise<string> {
  return sealEnvelope(
    JSON.stringify({
      v: ENVELOPE_VERSION,
      lease,
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + LEASE_COOKIE_MAX_AGE_SECONDS,
    }),
    LEASE_COOKIE_NAME,
    secret,
  );
}

export async function parseLeaseCookie(
  value: string | undefined,
  nowMs: number,
  secret: string,
): Promise<LeaseCookie | null> {
  const parsed = await parseEnvelope(
    value,
    LEASE_COOKIE_NAME,
    secret,
    nowMs,
    LEASE_COOKIE_MAX_AGE_SECONDS,
  );
  if (parsed === null) return null;
  let payload: LeasePayload;
  try {
    payload = JSON.parse(parsed.payload) as LeasePayload;
  } catch {
    return null;
  }
  if (
    typeof payload.lease !== "string" ||
    !isCanonicalOpaqueToken(payload.lease)
  ) {
    return null;
  }
  return { lease: payload.lease };
}

/** The shared cookie options: `__Host-` semantics, never a Domain. */
export function invitationCookieOptions(maxAge: number): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge };
}

// --- auth-mutation delivery nonce -------------------------------------------

/**
 * What the mutation's cookie delivery contains: a new provider session
 * (`deliver`, verified against the expected provider user on
 * acknowledgement) or a cleared session (`clear`, acknowledged only when
 * the provider session is really gone).
 */
export type MutationDeliveryKind = "deliver" | "clear";

export type MutationCookie = {
  readonly nonce: string;
  readonly kind: MutationDeliveryKind;
  /** The expected provider user id for a `deliver` delivery; null for `clear`. */
  readonly userId: string | null;
};

type MutationPayload = EnvelopePayload & {
  nonce?: unknown;
  kind?: unknown;
  userId?: unknown;
};

export async function sealMutationCookie(
  mutation: MutationCookie,
  nowMs: number,
  secret: string,
): Promise<string> {
  return sealEnvelope(
    JSON.stringify({
      v: ENVELOPE_VERSION,
      nonce: mutation.nonce,
      kind: mutation.kind,
      userId: mutation.userId,
      iat: Math.floor(nowMs / 1000),
      exp: Math.floor(nowMs / 1000) + MUTATION_COOKIE_MAX_AGE_SECONDS,
    }),
    MUTATION_COOKIE_NAME,
    secret,
  );
}

export async function parseMutationCookie(
  value: string | undefined,
  nowMs: number,
  secret: string,
): Promise<MutationCookie | null> {
  const parsed = await parseEnvelope(
    value,
    MUTATION_COOKIE_NAME,
    secret,
    nowMs,
    MUTATION_COOKIE_MAX_AGE_SECONDS,
  );
  if (parsed === null) return null;
  let payload: MutationPayload;
  try {
    payload = JSON.parse(parsed.payload) as MutationPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.nonce !== "string" ||
    !isCanonicalOpaqueToken(payload.nonce)
  ) {
    return null;
  }
  if (payload.kind !== "deliver" && payload.kind !== "clear") return null;
  if (payload.userId !== null && typeof payload.userId !== "string") {
    return null;
  }
  if (payload.kind === "deliver" && typeof payload.userId !== "string") {
    return null;
  }
  return {
    nonce: payload.nonce,
    kind: payload.kind,
    userId: payload.kind === "deliver" ? payload.userId : null,
  };
}
