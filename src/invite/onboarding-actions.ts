"use server";

import { redirect } from "next/navigation";
import { parseVibe } from "@/src/profile/vibe";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { validateOnboardingInput } from "@/src/profile/onboarding";
import { isProfileComplete } from "@/src/profile/profile";
import { getOwnProfile } from "@/src/profile/session";
import type { OnboardingSubmitState } from "@/src/profile/onboarding-state";
import { readFlowCookie } from "./flow-session";
import { resumeInvitationJoinAction } from "./invite-actions";
import { isFlowId } from "./token";

/**
 * The invitation onboarding completion action (brief 006c): the approved
 * 004e validation and profile write, with the invitation-specific return —
 * automatic continuation of the person's original Join decision. Every render
 * and submit repeats the
 * authenticated-session and continuation checks; a flow-id edit, cookie
 * swap, session switch, expired continuation, or mismatched verified user
 * cannot choose a destination. Only a previously recorded Join is resumed.
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
    return { status: "error", failure: "update-failed" };
  }

  // Re-read the saved profile before resuming the original Join decision.
  const profile = await getOwnProfile(user.id);
  if (!isProfileComplete(profile?.displayName ?? null)) {
    return { status: "error", failure: "update-failed" };
  }

  if (flow.joinRequested === true) await resumeInvitationJoinAction(formData);
  redirect(`/invite/continue/${flowId}`);
}
