import type { Metadata } from "next";

import { ConfirmScreen } from "@/src/auth/confirm-screen";

export const metadata: Metadata = {
  title: "Get Me This | One more step",
  description: "The emailed link isn't active yet — your six-digit code works.",
};

/**
 * The interim link-landing route (004c). proxy.ts discards any query —
 * the token hash is authentication material — before this page renders,
 * and the route never verifies on GET, so a link click (or an email
 * scanner's prefetch) cannot consume the one-time token or create a
 * session. 004d adds the explicit-action verification on top of this
 * cleanup; until then the honest interim state is the route's only state.
 */
export default function ConfirmPage() {
  return <ConfirmScreen />;
}
