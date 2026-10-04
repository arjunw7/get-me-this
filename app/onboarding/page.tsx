import { parsePublicShareToken } from "@/src/wishlist/public-share-token";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/src/auth/onboarding-form";
import { parseOnboardingVariant } from "@/src/auth/fixtures";
import { getOwnProfile, getSessionUser } from "@/src/profile/session";
import { isProfileComplete } from "@/src/profile/profile";
import { resolveSafeRedirectTarget } from "@/src/auth/link-intents";

export const metadata: Metadata = {
  title: "Get Me This | Tell friends who you are",
  description: "This is how you'll show up in groups and on your wishlist.",
};

/**
 * The real onboarding route (004e) for profiles that still need a display
 * name, plus the static URL-fixture states (`?state=`) kept for
 * deterministic review and visual capture — those render the designed
 * states directly and are not part of the live flow.
 *
 * Live gate, evaluated server-side on every request (defense in depth —
 * proxy.ts already redirects anonymous requests):
 * - signed out → `/auth` (the safe default intent);
 * - complete profile → the destination resolved ONLY through 004d's tested
 *   intent table (unbuilt intents land on `/home`); a complete profile can
 *   never be forced back into onboarding;
 * - incomplete profile → the onboarding form backed by the
 *   `completeOnboardingAction` server action.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.state;
  if (raw !== undefined) {
    const variant = parseOnboardingVariant(Array.isArray(raw) ? raw[0] : raw);
    return <OnboardingForm variant={variant} />;
  }

  const shareToken = parsePublicShareToken(params.share);
  const user = await getSessionUser();
  if (!user)
    redirect(
      shareToken ? `/auth?intent=public-wishlist&share=${shareToken}` : "/auth",
    );
  const profile = await getOwnProfile(user.id);
  if (isProfileComplete(profile?.displayName ?? null)) {
    redirect(
      resolveSafeRedirectTarget(
        shareToken ? "public-wishlist" : undefined,
        shareToken,
      ),
    );
  }

  return <OnboardingForm live shareToken={shareToken ?? undefined} />;
}
