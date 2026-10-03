import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InviteVerifyScreen } from "@/src/invite/invite-auth-screens";
import { readFlowCookie } from "@/src/invite/flow-session";
import { isFlowId } from "@/src/invite/token";

export const metadata: Metadata = {
  title: "Get Me This | Enter the code",
  description: "Verify the code to continue joining.",
};
export const dynamic = "force-dynamic";

/**
 * The invitation OTP screen (brief 006c). The requested email is read ONLY
 * from the matching sealed flow cookie — never from a URL, query, or
 * client input. Without that cookie the screen reaches the generic
 * restart.
 */
export default async function InviteVerifyPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  if (!isFlowId(flowId)) redirect("/invite/unavailable");

  const flow = await readFlowCookie(flowId);
  if (!flow || !flow.email) redirect("/invite/unavailable");

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteVerifyScreen flowId={flowId} maskedEmail={flow.email} />
    </main>
  );
}
