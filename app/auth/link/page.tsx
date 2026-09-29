import type { Metadata } from "next";

import { LinkChoiceScreen } from "@/src/auth/link-choice-screen";
import { LinkRecoveryScreen } from "@/src/auth/link-recovery-screen";
import { readLinkCarry } from "@/src/auth/link-carry";

export const metadata: Metadata = {
  title: "Get Me This | Finish signing in",
  description: "Finish signing in with your emailed link or six-digit code.",
};

/**
 * The clean 004d link-landing route. The proxy parks the emailed link's
 * token hash in the signed HttpOnly link cookie and redirects here with
 * the query stripped — this page never sees the hash and never receives a
 * query (no-store/no-referrer are pinned on the route by proxy.ts).
 *
 * With a valid parked value the page renders the explicit-choice state —
 * verification happens only through the "Use my sign-in link" control
 * firing the verify server action; the route itself never verifies. With
 * anything else (missing, malformed, expired, already used, or forged) it
 * renders the approved recovery state, identical for every cause.
 */
export default async function LinkPage() {
  const carried = await readLinkCarry();
  return carried ? <LinkChoiceScreen /> : <LinkRecoveryScreen />;
}
