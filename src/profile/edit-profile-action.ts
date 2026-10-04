"use server";
import { parseVibe } from "./vibe";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { validateOnboardingInput } from "./onboarding";
import type { EditProfileState } from "./edit-profile-state";

/** Only the verified session identifies the row; posted owner ids are ignored. */
export async function editProfileAction(
  formData: FormData,
): Promise<EditProfileState> {
  const client = await createSupabaseServerClient();
  if (!client) return { status: "error", failure: "unavailable" };
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user)
    return { status: "error", failure: "unauthenticated" };
  const name = formData.get("displayName");
  const line = formData.get("tasteLine");
  const input = validateOnboardingInput(
    typeof name === "string" ? name : "",
    typeof line === "string" ? line : "",
  );
  if (!input.ok) return { status: "error", errors: input.errors };
  const rawVibe = formData.get("vibe");
  const vibe = parseVibe(rawVibe);
  if (rawVibe !== null && vibe === null)
    return { status: "error", errors: { vibe: "invalid" } };
  const { data, error } = await client
    .from("profiles")
    .update({
      display_name: input.displayName,
      taste_line: input.tasteLine,
      ...(vibe !== null ? { vibe } : {}),
    })
    .eq("id", user.id)
    .select("id")
    .single();
  if (error || data?.id !== user.id)
    return { status: "error", failure: "update-failed" };
  revalidatePath("/home");
  revalidatePath("/wishlist", "layout");
  revalidatePath("/groups", "layout");
  return { status: "saved" };
}
