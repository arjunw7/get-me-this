"use server";

import { parsePublicShareToken } from "@/src/wishlist/public-share-token";
import { resolveSafeRedirectTarget } from "@/src/auth/link-intents";
import { redirect } from "next/navigation";
import { getServerAnalytics } from "@/src/analytics/server";
import { parseVibe } from "@/src/profile/vibe";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { validateOnboardingInput } from "./onboarding";
import type { OnboardingSubmitState } from "./onboarding-state";

/**
 * The onboarding completion action (004e): persists the required display
 * name and the optional bounded taste line to the signed-in user's OWN
 * profile row through the 004a column-limited, owner-only RLS grant.
 *
 * Every input is re-validated server-side on every submit (the client
 * checks are convenience, not proof): a blank display name is rejected, a
 * taste line over the approved limit is rejected — never silently
 * truncated — and blank taste lines normalize to null under the one shared
 * whitespace rule before any write (the database trigger enforces the same
 * normalization for direct writes).
 *
 * A complete profile can never be forced back into onboarding: the route
 * gate redirects complete profiles away. Ordinary completion returns to
 * `/home`; the approved public-wishlist continuation accepts only a canonical
 * token and resolves through the safe route helper. It never posts a reaction.
 */
export async function completeOnboardingAction(
  _previous: OnboardingSubmitState,
  formData: FormData,
): Promise<OnboardingSubmitState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", failure: "unavailable" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const shareToken = parsePublicShareToken(formData.get("share"));
  if (!user)
    redirect(
      shareToken ? `/auth?intent=public-wishlist&share=${shareToken}` : "/auth",
    );

  const rawName = formData.get("displayName");
  const rawLine = formData.get("tasteLine");
  const validated = validateOnboardingInput(
    typeof rawName === "string" ? rawName : "",
    typeof rawLine === "string" ? rawLine : "",
  );
  if (!validated.ok) {
    return { status: "error", errors: validated.errors };
  }

  const rawVibe = formData.get("vibe");
  const vibe = parseVibe(rawVibe);
  if (rawVibe !== null && vibe === null) {
    return { status: "error", errors: { vibe: "invalid" } };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: validated.displayName,
      taste_line: validated.tasteLine,
      // Legacy submissions omit this column, retaining the database default or saved choice.
      ...(vibe !== null ? { vibe } : {}),
    })
    .eq("id", user.id);
  if (error) {
    // A database rejection (constraint, RLS, or availability) is reported
    // honestly without provider detail; the submitted values survive in
    // the form for correction.
    return { status: "error", failure: "update-failed" };
  }

  await getServerAnalytics().capture(
    "onboarding_completed",
    { avatar_selected: false },
    { distinctId: user.id },
  );

  redirect(
    resolveSafeRedirectTarget(
      shareToken ? "public-wishlist" : undefined,
      shareToken,
    ),
  );
}
