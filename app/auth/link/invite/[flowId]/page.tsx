import type { Metadata } from "next";

import { InviteLinkScreen } from "@/src/invite/invite-auth-screens";
import { isFlowId } from "@/src/invite/token";

export const metadata: Metadata = {
  title: "Get Me This | Use your sign-in link",
  description: "Finish signing in to continue joining.",
};
export const dynamic = "force-dynamic";

/**
 * The clean magic-link screen (brief 006c): the parked credential is
 * verified ONLY by the explicit "Use my sign-in link" action on this page.
 * A link opened without its original browser binding renders the recovery
 * (the flow cookie check inside the action) — it never transfers the flow
 * to the new browser.
 */
export default async function InviteLinkPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteLinkScreen flowId={isFlowId(flowId) ? flowId : ""} />
    </main>
  );
}
