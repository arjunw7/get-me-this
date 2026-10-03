import { parsePublicShareToken } from "@/src/wishlist/public-share-token";
import { parseIntent, type AuthIntent } from "./fixtures";

/** Existing destinations stay fixed. Public links add only a validated token
 * under the fixed /s/ prefix; no caller-supplied URL or path is accepted. */
const INTENT_ROUTES: Readonly<Record<AuthIntent, string>> = {
  home: "/home",
  wishlist: "/home",
  "create-group": "/groups/new",
  "public-wishlist": "/home",
};

/** Malformed intents and public identifiers safely resolve to /home. */
export function resolveSafeRedirectTarget(
  rawValue: string | undefined,
  shareToken?: unknown,
): string {
  const intent = parseIntent(rawValue);
  const token =
    intent === "public-wishlist" ? parsePublicShareToken(shareToken) : null;
  return token ? `/s/${token}` : INTENT_ROUTES[intent];
}
