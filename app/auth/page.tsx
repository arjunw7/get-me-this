import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmailEntryForm } from "@/src/auth/email-entry-form";
import { INTENT_NOTES, parseIntent } from "@/src/auth/fixtures";
import { getSessionUser } from "@/src/profile/session";

export const metadata: Metadata = {
  title: "Get Me This | Sign in",
  description:
    "Enter your email to start a wishlist, join a group, or pick up where you left off.",
};

/**
 * The email-entry destination of the real email-code flow (004c). The
 * `intent` query parameter selects the reference's intent-specific helper
 * copy; `home` (and any unknown value) renders the default state approved
 * with 003a, and the parsed intent travels through the server action,
 * which re-validates it against the closed enum.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Validate with the provider before rendering sign-in. Home retains its
  // existing profile gate for users who still need to finish onboarding.
  if (await getSessionUser()) redirect("/home");

  const params = await searchParams;
  const raw = params.intent;
  const intent = parseIntent(Array.isArray(raw) ? raw[0] : raw);
  return <EmailEntryForm intent={intent} intentNote={INTENT_NOTES[intent]} />;
}
