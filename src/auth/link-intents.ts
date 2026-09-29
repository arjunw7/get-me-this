import { parseIntent, type AuthIntent } from "./fixtures";

/**
 * The 004d intent-to-route table: the ONLY mechanism that turns a carried
 * auth intent into a redirect target. Resolution is a pure value lookup —
 * redirect targets are never constructed from user input, so no external
 * URL, protocol-relative URL, encoded bypass, or unexpected intent value
 * can ever become a destination.
 *
 * 004d defines and unit-tests the table but does not navigate: the verify
 * action resolves the destination as a value only, and the unbuilt
 * `wishlist` / `create-group` routes resolve to `home` with no claim that a
 * wishlist or group was created (004e serves the real routes).
 */

/**
 * Server-defined routes only, keyed by the closed 004c intent enum. The
 * wishlist and create-group experiences are 004e scope; until they exist,
 * every intent resolves to the authenticated home route.
 */
const INTENT_ROUTES: Readonly<Record<AuthIntent, string>> = {
  home: "/home",
  wishlist: "/home",
  "create-group": "/home",
};

/**
 * Resolves a raw intent value (as carried by the 004c carry cookie) to a
 * server-defined route. Unknown, absent, and malicious values fall through
 * `parseIntent`'s closed enum into the `home` default — attacker-controlled
 * input never reaches the result.
 */
export function resolveSafeRedirectTarget(
  rawValue: string | undefined,
): string {
  return INTENT_ROUTES[parseIntent(rawValue)];
}
