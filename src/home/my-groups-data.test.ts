import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

// The home data module is server-only; the pure parser under test is
// exercised here with the marker mocked out.
vi.mock("server-only", () => ({}));

import { parseMyGroupsSnapshot, type SnapshotRow } from "./my-groups-data";

const GROUP = "aa1d0f2e-0000-4000-8000-00000000abcd";
const GROUP_TWO = "bb1d0f2e-0000-4000-8000-00000000abcd";

function row(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    group_id: GROUP,
    group_name: "Diwali Room",
    occasion: "Diwali",
    occasion_at: "2026-11-07 18:00:00",
    time_zone: "Asia/Kolkata",
    location: "Dehradun",
    mode: "secret_draw",
    joined_member_count: 4,
    caller_is_organizer: true,
    ...overrides,
  };
}

describe("parseMyGroupsSnapshot", () => {
  it("parses valid rows into strict summaries", () => {
    const groups = parseMyGroupsSnapshot([
      row(),
      row({
        group_id: GROUP_TWO,
        group_name: "Secret Santa",
        mode: "gift_everyone",
        location: null,
        joined_member_count: "7",
        caller_is_organizer: false,
      }),
    ]);
    expect(groups).toEqual([
      {
        groupId: GROUP,
        groupName: "Diwali Room",
        occasion: "Diwali",
        occasionAt: "2026-11-07 18:00:00",
        timeZone: "Asia/Kolkata",
        location: "Dehradun",
        mode: "secret_draw",
        joinedMemberCount: 4,
        callerIsOrganizer: true,
      },
      {
        groupId: GROUP_TWO,
        groupName: "Secret Santa",
        occasion: "Diwali",
        occasionAt: "2026-11-07 18:00:00",
        timeZone: "Asia/Kolkata",
        location: null,
        mode: "gift_everyone",
        joinedMemberCount: 7,
        callerIsOrganizer: false,
      },
    ]);
  });

  it("parses an empty array as the authorized-empty sentinel", () => {
    expect(parseMyGroupsSnapshot([])).toEqual([]);
  });

  it("rejects a null payload", () => {
    expect(parseMyGroupsSnapshot(null)).toBeNull();
  });

  it("rejects a non-array payload", () => {
    expect(parseMyGroupsSnapshot({} as never)).toBeNull();
  });

  it("rejects a malformed group id", () => {
    expect(parseMyGroupsSnapshot([row({ group_id: "not-a-uuid" })])).toBeNull();
  });

  it("rejects an empty group name", () => {
    expect(parseMyGroupsSnapshot([row({ group_name: "" })])).toBeNull();
  });

  it("rejects a missing wall-clock value", () => {
    expect(parseMyGroupsSnapshot([row({ occasion_at: null })])).toBeNull();
  });

  it("rejects an unknown mode", () => {
    expect(parseMyGroupsSnapshot([row({ mode: "shelfie_mode" })])).toBeNull();
  });

  it("rejects a non-integer member count", () => {
    expect(
      parseMyGroupsSnapshot([row({ joined_member_count: 2.5 })]),
    ).toBeNull();
  });

  it("rejects a missing organizer flag", () => {
    expect(
      parseMyGroupsSnapshot([row({ caller_is_organizer: null })]),
    ).toBeNull();
  });

  it("rejects when any single row in the set is malformed", () => {
    expect(parseMyGroupsSnapshot([row(), row({ group_id: null })])).toBeNull();
  });

  it("consumes exactly the pinned projection", () => {
    const source = readFileSync("src/home/my-groups-data.ts", "utf8");
    expect(source).toContain("my_groups_snapshot");
    expect(source).not.toContain('from("public.groups")');
    expect(source).not.toContain('from("public.group_members")');
  });
});
