import type { Metadata } from "next";

import { OnboardingForm } from "@/src/auth/onboarding-form";
import { parseOnboardingVariant } from "@/src/auth/fixtures";

export const metadata: Metadata = {
  title: "Get Me This | Tell friends who you are",
  description: "This is how you'll show up in groups and on your wishlist.",
};

/**
 * Static first-time onboarding route. The designed validation state is a
 * URL fixture (`?state=validation`); the bare route renders the empty form.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.state;
  const variant = parseOnboardingVariant(Array.isArray(raw) ? raw[0] : raw);
  return <OnboardingForm variant={variant} />;
}
