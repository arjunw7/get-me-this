import type { Metadata } from "next";

import { HomeScreen } from "@/src/home/home-screen";
import { requireCompleteProfile } from "@/src/profile/session";

export const metadata: Metadata = {
  title: "Get Me This | Home",
  description: "Your account home.",
};

/**
 * The authenticated Home (004e). Protected server-side: the proxy
 * redirects anonymous requests first, and `requireCompleteProfile`
 * re-verifies the session with the provider on every request (including
 * refresh and direct-link requests) and routes incomplete profiles to
 * `/onboarding`. A complete profile never repeats onboarding.
 */
export default async function HomePage() {
  const { userId, email, profile } = await requireCompleteProfile();
  return <HomeScreen userId={userId} email={email} profile={profile} />;
}
