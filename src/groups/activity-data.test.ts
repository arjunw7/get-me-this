import { describe, expect, it } from "vitest";

import { parseGroupActivity, type ActivityRow } from "./activity-data";

const ROW: ActivityRow = {
  event_kind: "item_reserved",
  occurred_at: "2026-10-20T10:00:00+00:00",
  actor_display_name: null,
  subject_display_name: null,
  item_id: "00000000-0000-4000-8000-000000000001",
  item_title: "Pour-over kettle",
  owner_display_name: "Owner Orla",
  involves_viewer: false,
};

describe("parseGroupActivity", () => {
  it("parses a well-formed page", () => {
    const parsed = parseGroupActivity([ROW]);
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]).toMatchObject({
      eventKind: "item_reserved",
      itemTitle: "Pour-over kettle",
      involvesViewer: false,
    });
  });

  it("returns an empty list for the authorized-empty projection result", () => {
    expect(parseGroupActivity([])).toEqual([]);
  });

  it("returns null for every denial-shaped null response", () => {
    expect(parseGroupActivity(null)).toBeNull();
  });

  it("rejects a row outside the closed kind set", () => {
    expect(
      parseGroupActivity([{ ...ROW, event_kind: "invitation_issued" }]),
    ).toBeNull();
    expect(
      parseGroupActivity([{ ...ROW, event_kind: "assignment_created" }]),
    ).toBeNull();
  });

  it("rejects a row with a null mandatory field", () => {
    expect(parseGroupActivity([{ ...ROW, involves_viewer: null }])).toBeNull();
    expect(parseGroupActivity([{ ...ROW, occurred_at: null }])).toBeNull();
  });

  it("rejects a row with a malformed optional field", () => {
    expect(parseGroupActivity([{ ...ROW, item_title: 42 }])).toBeNull();
  });
});
