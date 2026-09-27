import type { Metadata } from "next";

import { EmailEntryForm } from "@/src/auth/email-entry-form";

export const metadata: Metadata = {
  title: "Get Me This | Sign in",
  description:
    "Enter your email to start a wishlist, join a group, or pick up where you left off.",
};

/**
 * Static email-entry destination (003a). The `intent` query parameter is
 * accepted so landing CTAs resolve to their designed destinations; the
 * intent-specific helper copy and the verification/confirmation/onboarding
 * routes arrive with 003b.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await searchParams;
  return <EmailEntryForm />;
}
