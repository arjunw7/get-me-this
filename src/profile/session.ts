import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { resolveSafeRedirectTarget } from "@/src/auth/link-intents";
import { isProfileComplete } from "./profile";

/**
 * Server-side session and profile access for the protected routes and the
 * post-auth gate (004e). Every check re-reads the session from the provider
 * (`getUser()` validates with Supabase — a client-held session claim is
 * never trusted) and the profile from the database under the owner-only
 * RLS policies of 004a.
 *
 * Protection is defense in depth: proxy.ts redirects anonymous requests for
 * protected routes first, and each protected page repeats the check here,
 * so a proxy matcher gap can never expose authenticated data.
 */

export type SessionProfile = {
  readonly displayName: string | null;
  readonly tasteLine: string | null;
};

/**
 * The signed-in user, or null. Never trusts session claims: `getUser()`
 * validates with the provider on every call.
 */
export async function getSessionUser(): Promise<{
  id: string;
  email: string | null;
} | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/** The owner's own profile row under RLS, or null when absent. */
export async function getOwnProfile(
  userId: string,
): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("display_name, taste_line")
    .eq("id", userId)
    .single();
  if (!data) return null;
  return {
    displayName: data.display_name ?? null,
    tasteLine: data.taste_line ?? null,
  };
}

/**
 * The route a just-verified user should be sent to, shared by BOTH
 * verification paths (six-digit code and magic link — identical post-auth
 * rules):
 * - incomplete profile → `/onboarding` (regardless of any carried intent;
 *   the brief's intent decision honors the approved intent only for
 *   already-complete profiles);
 * - complete profile → the destination resolved ONLY through 004d's tested
 *   intent-to-route table (`resolveSafeRedirectTarget`; unbuilt intents
 *   land on the honest `/home`).
 */
export async function postAuthRouteForUser(
  userId: string,
  carriedIntent: string | undefined,
): Promise<string> {
  const profile = await getOwnProfile(userId);
  if (!isProfileComplete(profile?.displayName ?? null)) {
    return "/onboarding";
  }
  return resolveSafeRedirectTarget(carriedIntent);
}

/**
 * Page-level gate for protected routes: redirects to `/auth` when signed
 * out (the safe default intent — the entry screen renders its approved
 * default state) and to `/onboarding` when the profile is incomplete.
 * Returns the profile when the user may proceed.
 */
export async function requireCompleteProfile(): Promise<{
  userId: string;
  email: string | null;
  profile: SessionProfile;
}> {
  const user = await getSessionUser();
  if (!user) redirect("/auth");
  const profile = await getOwnProfile(user.id);
  if (!isProfileComplete(profile?.displayName ?? null)) {
    redirect("/onboarding");
  }
  return { userId: user.id, email: user.email, profile: profile! };
}
