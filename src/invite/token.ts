/**
 * Canonical invitation token, browser-secret, and flow-id validation
 * (brief 006c). The raw token is exactly the 006b issuance output: 32
 * cryptographically random bytes encoded as 43-character canonical
 * unpadded base64url — no slug, id, group id, or version ever appears in
 * the recipient URL. The browser secret and coordinator secret share the
 * same canonical shape (32 bytes of high entropy, canonical encoding).
 *
 * This module is pure and proxy-safe: it imports nothing from
 * `next/headers` and never touches storage, logging, or analytics.
 */

const CANONICAL_43_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The final base64url character carries exactly two zero bits. */
const CANONICAL_TAIL_PATTERN = /[AEIMQUYcgkosw048]$/;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalOpaqueToken(
  value: string | undefined | null,
): value is string {
  return (
    typeof value === "string" &&
    value.length === 43 &&
    CANONICAL_43_PATTERN.test(value) &&
    CANONICAL_TAIL_PATTERN.test(value)
  );
}

/** A browser or coordinator secret has the same canonical 32-byte shape. */
export const isCanonicalSecret = isCanonicalOpaqueToken;

export function isFlowId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Generates a fresh 32-byte browser secret as canonical base64url. The
 * final character is forced into the canonical two-zero-bit alphabet (the
 * same construction the database issuance loop uses).
 */
export function generateCanonicalSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const full = btoa(binary).replaceAll("+", "-").replaceAll("/", "_");
  // 32 bytes encode to exactly 43 canonical characters plus one '=' pad.
  const chars = full.slice(0, 43).split("");
  const canonicalTail = "AEIMQUYcgkosw048";
  const last = chars[42].charCodeAt(0);
  // Map the discarded two bits deterministically onto the canonical tail
  // alphabet: the canonical encoding of the stored digest never depends on
  // which tail character carried the zeros.
  const forced = canonicalTail[last % canonicalTail.length];
  chars[42] = forced;
  return chars.join("");
}

/** The requested-email normalization shared by binding and comparison. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
