import "server-only";
import { createSupabaseServerClient } from "@/src/supabase/server";

/** Group-authorized copied destinations only; never source IDs or source owners. */
export async function loadGroupCopiedItemIds(
  groupId: string,
  memberId: string,
  visibleItemIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (!visibleItemIds.length) return new Set();
  const client = await createSupabaseServerClient();
  if (!client) return new Set();
  const { data, error } = await client.rpc("group_copied_item_ids", {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error || !Array.isArray(data)) return new Set();
  const visible = new Set(visibleItemIds);
  return new Set(
    data.flatMap((row) =>
      typeof row?.item_id === "string" && visible.has(row.item_id)
        ? [row.item_id]
        : [],
    ),
  );
}
