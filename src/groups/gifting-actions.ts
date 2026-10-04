"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { setChecklistEntryStatus } from "@/src/groups/gifting";

/**
 * The single write path for the gift-everyone checklist (brief 008b).
 * Compare-and-swap through the reviewed definer function: on a conflict the
 * caller is returned to the freshly refetched checklist — never a silent
 * overwrite and never a claimed success for a lost update. Conflicts and
 * denials are non-enumerating; only a committed change emits analytics.
 */
export async function setGiftEntryStatusAction(
  formData: FormData,
): Promise<void> {
  const groupId = String(formData.get("groupId") ?? "");
  const recipientId = String(formData.get("recipientId") ?? "");
  const expectedRaw = String(formData.get("expectedVersion") ?? "");
  const status =
    String(formData.get("status") ?? "") === "completed" ? "completed" : "todo";

  const expectedVersion = /^\d+$/.test(expectedRaw)
    ? Number(expectedRaw)
    : null;

  const outcome = await setChecklistEntryStatus(
    groupId,
    recipientId,
    expectedVersion,
    status,
  );

  if (outcome.kind === "conflict") {
    revalidatePath(`/groups/${groupId}/gifting`);
    redirect(`/groups/${groupId}/gifting?conflict=1`);
  }
  if (outcome.kind === "updated") {
    revalidatePath("/home");
    revalidatePath(`/groups/${groupId}/gifting`);
  }
}
