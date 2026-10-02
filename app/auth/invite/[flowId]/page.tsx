import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { InviteEmailScreen } from "@/src/invite/invite-auth-screens";
import { readFlowCookie } from "@/src/invite/flow-session";
import { getSessionUser, getOwnProfile } from "@/src/profile/session";
import { isProfileComplete } from "@/src/profile/profile";
import { isFlowId } from "@/src/invite/token";

export const metadata: Metadata = {
  title: "Get Me This | Join with your email",
  description: "Verify your email to continue joining.",
};
export const dynamic = "force-dynamic";

/**
 * The dedicated invitation email screen (brief 006c). Selecting Join the
 * group while signed out lands here; the screen obtains preview text only
 * through the flow-bound projection and never creates membership. A user
 * who already has a complete verified session returns to the clean
 * invitation preview instead.
 */
export default async function InviteAuthPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  if (!isFlowId(flowId)) redirect("/invite/unavailable");

  const flow = await readFlowCookie(flowId);
  if (!flow) redirect("/invite/unavailable");

  const user = await getSessionUser();
  if (user) {
    const profile = await getOwnProfile(user.id);
    if (isProfileComplete(profile?.displayName ?? null)) {
      redirect(`/invite/continue/${flowId}`);
    }
    redirect(`/onboarding/invite/${flowId}`);
  }

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteEmailScreen flowId={flowId} />
    </main>
  );
}
