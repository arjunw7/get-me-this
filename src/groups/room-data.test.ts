import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

// The room data module is server-only; the pure parser under test is
// exercised here with the marker mocked out.
vi.mock("server-only", () => ({}));

import { parseGroupRoomSnapshot, type SnapshotRow } from "./room-data";

const CALLER = "9f1d0f2e-0000-4000-8000-000000000001";
const ORGANIZER = "9f1d0f2e-0000-4000-8000-000000000002";
const OTHER = "9f1d0f2e-0000-4000-8000-000000000003";
const PENDING = "9f1d0f2e-0000-4000-8000-000000000004";
const GROUP = "aa1d0f2e-0000-4000-8000-00000000abcd";

function groupFields(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    group_id: GROUP,
    organizer_id: ORGANIZER,
    group_name: "Diwali Room",
    occasion: "Diwali",
    occasion_at: "2026-11-07 18:00:00",
    time_zone: "Asia/Kolkata",
    location: "Dehradun",
    description: null,
    budget_amount_minor: "250000",
    budget_currency: "INR",
    mode: "secret_draw",
    group_status: "active",
    joined_member_count: 2,
    member_user_id: null,
    member_display_name: null,
    member_state: null,
    member_is_organizer: null,
    ...overrides,
  };
}

function callerRow(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return groupFields({
    member_user_id: CALLER,
    member_display_name: "Riya",
    member_state: "joined",
    member_is_organizer: true,
    ...overrides,
  });
}

describe("parseGroupRoomSnapshot", () => {
  it("parses a valid snapshot with joined and pending rows", () => {
    const snapshot = parseGroupRoomSnapshot(
      [
        // The caller is the organizer here; the organizer row check needs
        // the organizer's own row present.
        callerRow({ organizer_id: CALLER }),
        groupFields({
          organizer_id: CALLER,
          member_user_id: OTHER,
          member_display_name: "Arjun",
          member_state: "joined",
          member_is_organizer: false,
        }),
        groupFields({
          organizer_id: CALLER,
          joined_member_count: 2,
          member_user_id: PENDING,
          member_display_name: "Meera",
          member_state: "invited",
          member_is_organizer: false,
        }),
      ],
      CALLER,
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot?.name).toBe("Diwali Room");
    expect(snapshot?.joinedMemberCount).toBe(2);
    expect(snapshot?.members.map((member) => member.state)).toEqual([
      "joined",
      "joined",
      "invited",
    ]);
    expect(snapshot?.budgetAmountMinor).toBe("250000");
  });

  it("maps a null budget pair to null fields", () => {
    const snapshot = parseGroupRoomSnapshot(
      [
        callerRow({
          organizer_id: CALLER,
          joined_member_count: 1,
          budget_amount_minor: null,
          budget_currency: null,
        }),
      ],
      CALLER,
    );
    expect(snapshot?.budgetAmountMinor).toBe(null);
    expect(snapshot?.budgetCurrency).toBe(null);
  });

  it("returns null for zero rows, null data, and an unusable caller row", () => {
    expect(parseGroupRoomSnapshot(null, CALLER)).toBe(null);
    expect(parseGroupRoomSnapshot([], CALLER)).toBe(null);
    expect(
      parseGroupRoomSnapshot(
        [
          callerRow({
            member_user_id: ORGANIZER,
            member_display_name: "Someone",
          }),
        ],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null when repeated group values disagree", () => {
    expect(
      parseGroupRoomSnapshot(
        [
          callerRow(),
          groupFields({
            member_user_id: OTHER,
            member_state: "joined",
            member_is_organizer: false,
            group_name: "A Different Name",
          }),
        ],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null for duplicate member ids", () => {
    expect(
      parseGroupRoomSnapshot(
        [
          callerRow(),
          groupFields({
            member_user_id: CALLER,
            member_display_name: "Riya Again",
            member_state: "joined",
            member_is_organizer: false,
          }),
        ],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null for a pending organizer row", () => {
    expect(
      parseGroupRoomSnapshot(
        [
          groupFields({
            member_user_id: CALLER,
            member_display_name: "Riya",
            member_state: "joined",
            member_is_organizer: false,
          }),
          groupFields({
            member_user_id: ORGANIZER,
            member_display_name: "Organizer",
            member_state: "invited",
            member_is_organizer: true,
          }),
        ],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null when the joined count disagrees with the joined rows", () => {
    expect(
      parseGroupRoomSnapshot(
        [
          callerRow({ joined_member_count: 3 }),
          groupFields({
            member_user_id: OTHER,
            member_state: "joined",
            member_is_organizer: false,
          }),
        ],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null when the organizer's row is absent", () => {
    expect(
      parseGroupRoomSnapshot(
        [callerRow({ member_is_organizer: false })],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null for invalid enums and statuses", () => {
    expect(
      parseGroupRoomSnapshot([callerRow({ mode: "mystery" })], CALLER),
    ).toBe(null);
    expect(
      parseGroupRoomSnapshot([callerRow({ group_status: "archived" })], CALLER),
    ).toBe(null);
    expect(
      parseGroupRoomSnapshot(
        [
          callerRow({ joined_member_count: 1 }),
          groupFields({
            member_user_id: OTHER,
            member_state: "removed",
            member_is_organizer: false,
          }),
        ],
        CALLER,
      ),
    ).toBe(null);
  });

  it("returns null for a malformed budget pair", () => {
    expect(
      parseGroupRoomSnapshot(
        [callerRow({ budget_amount_minor: "12.5" })],
        CALLER,
      ),
    ).toBe(null);
    expect(
      parseGroupRoomSnapshot([callerRow({ budget_currency: "inr" })], CALLER),
    ).toBe(null);
    expect(
      parseGroupRoomSnapshot(
        [callerRow({ budget_amount_minor: "250000", budget_currency: null })],
        CALLER,
      ),
    ).toBe(null);
  });
});

describe("room data access structure", () => {
  it("queries no base table and imports no service-role client", () => {
    const data = readFileSync("src/groups/room-data.ts", "utf8");
    const route = readFileSync("app/groups/[groupId]/page.tsx", "utf8");
    for (const source of [data, route]) {
      // No direct table reads at all (profiles, members, invitations,
      // wishlists): the projection is the only data source.
      expect(source).not.toMatch(/\.from\(/);
      expect(source).not.toMatch(/service_role|SERVICE_ROLE/);
    }
    // Exactly one projection call.
    expect(data.match(/rpc\(/g)?.length).toBe(1);
    expect(data).toContain("group_room_snapshot");
  });
});
