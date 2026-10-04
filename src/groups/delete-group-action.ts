"use server";

import { revalidatePath } from "next/cache";
import { requireCompleteProfile } from "@/src/profile/session";
import { createSupabaseServerClient } from "@/src/supabase/server";
import type { DeleteGroupResult } from "./action-state";

export async function deleteGroupAction(
  groupId: string,
  expectedVersion: string,
): Promise<DeleteGroupResult> {
  await requireCompleteProfile();
  if (
    typeof groupId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      groupId,
    ) ||
    typeof expectedVersion !== "string" ||
    !/^\d+$/.test(expectedVersion) ||
    !Number.isSafeInteger(Number(expectedVersion))
  )
    return { ok: false, reason: "unavailable" };

  try {
    const client = await createSupabaseServerClient();
    if (!client) return { ok: false, reason: "unavailable" };
    const { data, error } = await client.rpc("delete_group", {
      p_group_id: groupId,
      p_expected_member_admin_version: expectedVersion,
    });
    if (error)
      return { ok: false, reason: error.code === "PT409" ? "stale" : "retry" };
    if (data !== true) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "retry" };
  }
  revalidatePath("/home");
  revalidatePath("/groups");
  revalidatePath(`/groups/${groupId}`, "layout");
  return { ok: true };
}
