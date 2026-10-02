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
  searchParams,
}: {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<{ restartFailed?: string; restartBlocked?: string }>;
}) {
  const { flowId } = await params;
  if (!isFlowId(flowId)) redirect("/invite/unavailable");
  const flags = await searchParams;

  const flow = await readFlowCookie(flowId);
  if (!flow) redirect("/invite/unavailable");

  const user = await getSessionUser();
  if (user) {
    // A confirmed restart that failed its provider sign-out returns here
    // with the session (and the mismatch) still present: the honest
    // failure flag renders instead of any claimed success.
    const profile = await getOwnProfile(user.id);
    if (isProfileComplete(profile?.displayName ?? null)) {
      if (flags.restartFailed === "1") {
        return (
          <main className="min-h-screen w-full bg-surface-page text-content-primary">
            <RestartFailedNotice />
          </main>
        );
      }
      redirect(`/invite/continue/${flowId}`);
    }
    redirect(`/onboarding/invite/${flowId}`);
  }

  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <InviteEmailScreen
        flowId={flowId}
        blocked={flags.restartBlocked === "1"}
      />
    </main>
  );
}

/**
 * Review note (b): a failed restart is surfaced honestly — the session and
 * the mismatch state remain exactly as they were, and no success is claimed.
 */
function RestartFailedNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-surface-lg border-2 border-outline-strong bg-surface-raised p-6 text-center shadow-chunk">
        <h1 className="font-display text-3xl leading-tight font-extrabold">
          We couldn&apos;t sign you out.
        </h1>
        <p className="mt-3 text-lg text-content-secondary">
          The restart didn&apos;t complete, so nothing changed. Try &ldquo;Log
          out and restart sign-in&rdquo; again in a moment.
        </p>
      </div>
    </div>
  );
}
