import type { MyGroupSummary } from "./my-groups-data";
import { calendarDateInZone, wallClockIsoDate } from "@/src/groups/room-format";

/** Nearest upcoming occasion in its own zone; latest past occasion otherwise. */
export function selectHomeGroup(
  groups: readonly MyGroupSummary[],
  now: Date,
): MyGroupSummary | null {
  const dated = groups.flatMap((group) => {
    const date = wallClockIsoDate(group.occasionAt);
    const today = calendarDateInZone(now, group.timeZone);
    return date && today ? [{ group, date, upcoming: date >= today }] : [];
  });
  dated.sort((a, b) => {
    if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
    const order = a.date.localeCompare(b.date);
    return (
      (a.upcoming ? order : -order) ||
      a.group.groupId.localeCompare(b.group.groupId)
    );
  });
  return dated[0]?.group ?? groups[0] ?? null;
}
