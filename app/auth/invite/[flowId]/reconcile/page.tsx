import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InviteReconcileScreen } from "@/src/invite/invite-auth-screens";
import { readFlowCookie } from "@/src/invite/flow-session";
import { getSessionUser } from "@/src/profile/session";
import { isFlowId } from "@/src/invite/token";

export const metadata: Metadata = {
  title: "Get Me This | Continue this invitation",
  description: "Continue joining with your verified account.",
};
export const dynamic = "force-dynamic";

/**
 * The clean reconciliation screen (brief 006c): the provider session
 * cookies are already applied by the earlier verification response; the
 * explicit POST here binds that session to the continuation through the
 * idempotent, session-derived primitive. Without the flow cookie or a
 * session there is nothing to reconcile.
 */
export default async function InviteReconcilePage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  if (!isFlowId(flowId)) redirect("/invite/unavailable");

  const flow = await readFlowCookie(flowId);
  if (!flow) redirect("/invite/unavailable");

  const user = await getSessionUser();
  if (!user) redirect(`/auth/invite/${flowId}`);

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteReconcileScreen flowId={flowId} />
    </main>
  );
}
