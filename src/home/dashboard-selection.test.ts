import { describe, expect, it } from "vitest";
import { selectHomeGroup } from "./dashboard-selection";
import type { MyGroupSummary } from "./my-groups-data";
const now = new Date("2026-10-04T09:00:00Z");
function group(
  id: string,
  date: string,
  mode: MyGroupSummary["mode"] = "secret_draw",
): MyGroupSummary {
  return {
    groupId: id,
    groupName: id,
    occasion: "Birthday",
    occasionAt: `${date} 18:00:00`,
    timeZone: "Asia/Kolkata",
    location: null,
    mode,
    joinedMemberCount: 5,
    callerIsOrganizer: false,
  };
}
describe("Home occasion selection", () => {
  it("keeps the no-group state empty", () =>
    expect(selectHomeGroup([], now)).toBeNull());
  it.each(["secret_draw", "gift_everyone", "wishlist_only"] as const)(
    "supports a single %s group",
    (mode) => {
      const one = group("one", "2026-10-06", mode);
      expect(selectHomeGroup([one], now)).toBe(one);
    },
  );
  it("selects nearest upcoming among same-mode groups without mutating the list", () => {
    const groups = [
      group("later", "2026-12-25"),
      group("near", "2026-10-06"),
      group("past", "2026-10-01"),
    ];
    expect(selectHomeGroup(groups, now)?.groupId).toBe("near");
    expect(groups[0]?.groupId).toBe("later");
  });
  it("does not prioritize a gift mode over an earlier occasion", () => {
    expect(
      selectHomeGroup(
        [
          group("secret", "2026-12-25"),
          group("everyone", "2026-10-06", "gift_everyone"),
          group("browse", "2026-10-04", "wishlist_only"),
        ],
        now,
      )?.groupId,
    ).toBe("browse");
  });
  it("uses the latest past group if none are upcoming", () =>
    expect(
      selectHomeGroup(
        [group("old", "2026-09-01"), group("recent", "2026-10-03")],
        now,
      )?.groupId,
    ).toBe("recent"));
  it("compares calendar days in each group's zone", () => {
    const late = {
      ...group("local-today", "2026-10-04"),
      timeZone: "America/Los_Angeles",
    };
    const tomorrow = group("tomorrow", "2026-10-06");
    expect(
      selectHomeGroup([tomorrow, late], new Date("2026-10-05T01:00:00Z")),
    ).toBe(late);
  });
});
