/** A public wishlist token is the canonical base64url encoding of 32 random bytes. */
export function parsePublicShareToken(value: unknown): string | null {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)
    ? value
    : null;
}
