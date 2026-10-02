"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { validateOnboardingInput } from "@/src/profile/onboarding";
import { isProfileComplete } from "@/src/profile/profile";
import { getOwnProfile } from "@/src/profile/session";
import type { OnboardingSubmitState } from "@/src/profile/onboarding-state";
import { readFlowCookie } from "./flow-session";
import { isFlowId } from "./token";

/**
 * The invitation onboarding completion action (brief 006c): the approved
 * 004e validation and profile write, with the invitation-specific return —
 * the clean invitation preview. Every render and submit repeats the
 * authenticated-session and continuation checks; a flow-id edit, cookie
 * swap, session switch, expired continuation, or mismatched verified user
 * cannot choose a destination. Onboarding NEVER accepts the invitation.
 */
export async function completeOnboardingForInvitationAction(
  _previous: OnboardingSubmitState,
  formData: FormData,
): Promise<OnboardingSubmitState> {
  const rawFlowId = formData.get("flowId");
  const flowId = typeof rawFlowId === "string" ? rawFlowId : "";
  const flow = await readFlowCookie(flowId);
  if (!isFlowId(flowId) || !flow) redirect("/invite/unavailable");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", failure: "unavailable" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/invite/${flowId}`);

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
    return { status: "error", failure: "update-failed" };
  }

  // Defense in depth: a complete profile returns to the clean preview;
  // nothing here accepted the invitation.
  const profile = await getOwnProfile(user.id);
  if (!isProfileComplete(profile?.displayName ?? null)) {
    return { status: "error", failure: "update-failed" };
  }

  redirect(`/invite/continue/${flowId}`);
}
