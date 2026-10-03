import { isCanonicalOpaqueToken } from "@/src/invite/token";

/** Only the current origin's canonical invitation route may be opened. */
export function inviteDestination(
  value: string,
  currentOrigin: string,
): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 2048 || /[\\\u0000-\u001f\u007f]/u.test(raw))
    return null;
  try {
    const destination = new URL(raw, currentOrigin);
    if (
      destination.origin !== new URL(currentOrigin).origin ||
      !["http:", "https:"].includes(destination.protocol) ||
      destination.username ||
      destination.password ||
      destination.search ||
      destination.hash
    )
      return null;
    const match = /^\/invite\/([^/]+)$/.exec(destination.pathname);
    return match && isCanonicalOpaqueToken(match[1])
      ? `/invite/${match[1]}`
      : null;
  } catch {
    return null;
  }
}
