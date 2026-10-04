import "server-only";
import { createSupabaseServerClient } from "@/src/supabase/server";
import type { ReservationViewerState } from "./reservations/types";

/** Read only the reviewed owner-blind projection, keyed by item id, never row position. */
export async function loadGiftingItemStates(
  groupId: string,
  memberId: string,
  callerId: string,
): Promise<Record<string, ReservationViewerState>> {
  if (memberId === callerId) return {};
  const client = await createSupabaseServerClient();
  if (!client) return {};
  const { data, error } = await client.rpc("member_wishlist_gifting_snapshot", {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error || !Array.isArray(data)) return {};
  const states: Record<string, ReservationViewerState> = {};
  for (const row of data) {
    if (
      typeof row.item_id !== "string" ||
      typeof row.viewer_reserved !== "boolean" ||
      typeof row.reserved_by_other !== "boolean" ||
      (row.viewer_reserved && row.reserved_by_other) ||
      states[row.item_id]
    )
      return {};
    states[row.item_id] = row.viewer_reserved
      ? "yours"
      : row.reserved_by_other
        ? "other"
        : "unreserved";
  }
  return states;
}
