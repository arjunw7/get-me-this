import "server-only";
import { loadGroupMemberVibes } from "@/src/groups/member-vibes-data";
import { loadGroupRoomSnapshot } from "@/src/groups/room-data";
import { loadGroupActivity } from "@/src/groups/activity-data";
import { loadMyAssignment } from "@/src/groups/assignment-data";
import { loadGiftChecklist } from "@/src/groups/gifting";
import { selectHomeGroup } from "./dashboard-selection";
import type { MyGroupSummary } from "./my-groups-data";

/** Compose existing caller-authorized projections, never unrestricted group data. */
export async function loadHomeDashboard(
  groups: readonly MyGroupSummary[],
  userId: string,
  now: Date,
) {
  const selected = selectHomeGroup(groups, now);
  if (!selected) return null;
  const room = await loadGroupRoomSnapshot(selected.groupId, userId);
  if (!room) return null;
  const [activity, assignment, checklist, memberVibes] = await Promise.all([
    loadGroupActivity(room.groupId),
    room.mode === "secret_draw" ? loadMyAssignment(room.groupId) : null,
    room.mode === "gift_everyone" ? loadGiftChecklist(room.groupId) : null,
    loadGroupMemberVibes(room.groupId),
  ]);
  return { room, activity, assignment, checklist, memberVibes };
}
export type HomeDashboard = NonNullable<
  Awaited<ReturnType<typeof loadHomeDashboard>>
>;
