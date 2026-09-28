import type { Metadata } from "next";

import { EmailEntryForm } from "@/src/auth/email-entry-form";
import { INTENT_NOTES, parseIntent } from "@/src/auth/fixtures";

export const metadata: Metadata = {
  title: "Get Me This | Sign in",
  description:
    "Enter your email to start a wishlist, join a group, or pick up where you left off.",
};

/**
 * Static email-entry destination. The `intent` query parameter selects the
 * reference's intent-specific helper copy; `home` (and any unknown value)
 * renders the default state approved with 003a.
 */
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.intent;
  const intent = parseIntent(Array.isArray(raw) ? raw[0] : raw);
  return <EmailEntryForm intentNote={INTENT_NOTES[intent]} />;
}
