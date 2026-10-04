import { beforeEach, expect, it, vi } from "vitest";
const reads = vi.hoisted(() => ({
  room: vi.fn(),
  activity: vi.fn(),
  assignment: vi.fn(),
  checklist: vi.fn(),
  vibes: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/src/groups/room-data", () => ({
  loadGroupRoomSnapshot: reads.room,
}));
vi.mock("@/src/groups/activity-data", () => ({
  loadGroupActivity: reads.activity,
}));
vi.mock("@/src/groups/assignment-data", () => ({
  loadMyAssignment: reads.assignment,
}));
vi.mock("@/src/groups/gifting", () => ({ loadGiftChecklist: reads.checklist }));
vi.mock("@/src/groups/member-vibes-data", () => ({
  loadGroupMemberVibes: reads.vibes,
}));
import { loadHomeDashboard } from "./dashboard-data";
import type { MyGroupSummary } from "./my-groups-data";
const group: MyGroupSummary = {
  groupId: "chosen",
  groupName: "Chosen",
  occasion: "Diwali",
  occasionAt: "2026-11-07 18:00:00",
  timeZone: "Asia/Kolkata",
  location: null,
  mode: "secret_draw",
  joinedMemberCount: 5,
  callerIsOrganizer: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  reads.activity.mockResolvedValue([]);
  reads.assignment.mockResolvedValue(null);
  reads.checklist.mockResolvedValue(null);
  reads.vibes.mockResolvedValue({});
});
it("does not read private projections if membership cannot be established", async () => {
  reads.room.mockResolvedValue(null);
  expect(
    await loadHomeDashboard([group], "caller", new Date("2026-10-04")),
  ).toBeNull();
  expect(reads.assignment).not.toHaveBeenCalled();
  expect(reads.checklist).not.toHaveBeenCalled();
  expect(reads.activity).not.toHaveBeenCalled();
  expect(reads.vibes).not.toHaveBeenCalled();
});
it.each(["secret_draw", "gift_everyone", "wishlist_only"] as const)(
  "loads only the selected group's authorized %s projection",
  async (mode) => {
    reads.room.mockResolvedValue({ groupId: "chosen", mode });
    await loadHomeDashboard(
      [
        group,
        { ...group, groupId: "other", occasionAt: "2026-12-25 18:00:00" },
      ],
      "caller",
      new Date("2026-10-04"),
    );
    expect(reads.room).toHaveBeenCalledExactlyOnceWith("chosen", "caller");
    expect(reads.activity).toHaveBeenCalledExactlyOnceWith("chosen");
    expect(reads.vibes).toHaveBeenCalledExactlyOnceWith("chosen");
    if (mode === "secret_draw")
      expect(reads.assignment).toHaveBeenCalledExactlyOnceWith("chosen");
    else expect(reads.assignment).not.toHaveBeenCalled();
    if (mode === "gift_everyone")
      expect(reads.checklist).toHaveBeenCalledExactlyOnceWith("chosen");
    else expect(reads.checklist).not.toHaveBeenCalled();
  },
);
