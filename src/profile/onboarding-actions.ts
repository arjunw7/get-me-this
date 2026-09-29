"use server";

import { redirect } from "next/navigation";

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
 * gate redirects complete profiles away, and this action's redirect target
 * is the fixed, server-defined `/home` — per the brief's intent decision,
 * every user lands on `/home` after onboarding completes.
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
  if (!user) redirect("/auth");

  const rawName = formData.get("displayName");
  const rawLine = formData.get("tasteLine");
  const validated = validateOnboardingInput(
    typeof rawName === "string" ? rawName : "",
    typeof rawLine === "string" ? rawLine : "",
  );
  if (!validated.ok) {
    return { status: "error", errors: validated.errors };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: validated.displayName,
      taste_line: validated.tasteLine,
    })
    .eq("id", user.id);
  if (error) {
    // A database rejection (constraint, RLS, or availability) is reported
    // honestly without provider detail; the submitted values survive in
    // the form for correction.
    return { status: "error", failure: "update-failed" };
  }

  redirect("/home");
}
