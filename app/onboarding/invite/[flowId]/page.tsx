import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/src/auth/onboarding-form";
import { completeOnboardingForInvitationAction } from "@/src/invite/onboarding-actions";
import { readFlowCookie } from "@/src/invite/flow-session";
import { getSessionUser, getOwnProfile } from "@/src/profile/session";
import { isProfileComplete } from "@/src/profile/profile";
import { isFlowId } from "@/src/invite/token";

export const metadata: Metadata = {
  title: "Get Me This | Tell friends who you are",
  description: "Finish setting up to join the group.",
};
export const dynamic = "force-dynamic";

/**
 * The invitation onboarding route (brief 006c): the invitation-specific
 * exception to 004e's default-home decision. It repeats the
 * authenticated-session, flow-cookie, and continuation checks on every
 * render; a complete profile returns to the clean invitation preview.
 * Onboarding NEVER accepts the invitation — after it, the person sees the
 * live preview again and must activate Join the group.
 */
export default async function InviteOnboardingPage({
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

  const profile = await getOwnProfile(user.id);
  if (isProfileComplete(profile?.displayName ?? null)) {
    redirect(`/invite/continue/${flowId}`);
  }

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <OnboardingForm
        live
        completeAction={completeOnboardingForInvitationAction}
        flowId={flowId}
      />
    </main>
  );
}
