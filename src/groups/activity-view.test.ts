import { describe, expect, it } from "vitest";

import type { ActivityEntry } from "./activity-data";
import {
  activityCountBucket,
  activityEntryText,
  groupActivityViewedEvent,
} from "./activity-view";

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    eventKind: "invitation_accepted",
    occurredAt: "2026-10-20T10:00:00+00:00",
    actorDisplayName: "Reserver Rai",
    subjectDisplayName: null,
    itemId: null,
    itemTitle: null,
    ownerDisplayName: null,
    involvesViewer: false,
    ...overrides,
  };
}

describe("activityCountBucket", () => {
  it("matches the brief's closed buckets over visible entries only", () => {
    expect(activityCountBucket(0)).toBe("zero");
    expect(activityCountBucket(1)).toBe("one_to_five");
    expect(activityCountBucket(5)).toBe("one_to_five");
    expect(activityCountBucket(6)).toBe("six_to_twenty");
    expect(activityCountBucket(20)).toBe("six_to_twenty");
    expect(activityCountBucket(21)).toBe("twenty_one_plus");
  });
});

describe("groupActivityViewedEvent", () => {
  it("carries exactly the three closed properties and no identifiers", () => {
    const event = groupActivityViewedEvent(3, "secret_draw");
    expect(event.name).toBe("group_activity_viewed");
    expect(event.properties).toEqual({
      scope: "group",
      entry_count_bucket: "one_to_five",
      gifting_mode: "secret_draw",
    });
    expect(Object.keys(event.properties).sort()).toEqual(
      ["entry_count_bucket", "gifting_mode", "scope"].sort(),
    );
  });
});

describe("activityEntryText", () => {
  it("renders membership events with the actor name, and the viewer's own self-labelled", () => {
    expect(activityEntryText(entry())).toBe("Reserver Rai joined the group");
    expect(activityEntryText(entry({ involvesViewer: true }))).toBe(
      "You joined the group",
    );
    expect(
      activityEntryText(
        entry({
          eventKind: "group_created",
          actorDisplayName: "Organizer Ona",
        }),
      ),
    ).toBe("Organizer Ona created the group");
  });

  it("renders member_removed through the subject, never the actor", () => {
    expect(
      activityEntryText(
        entry({
          eventKind: "member_removed",
          actorDisplayName: "Organizer Ona",
          subjectDisplayName: "Former Fae",
        }),
      ),
    ).toBe("Former Fae was removed from the group");
  });

  it("renders reservation entries state-only for every non-reserver viewer", () => {
    expect(
      activityEntryText(
        entry({
          eventKind: "item_reserved",
          actorDisplayName: null,
          itemTitle: "Pour-over kettle",
          ownerDisplayName: "Owner Orla",
        }),
      ),
    ).toBe("A gift was reserved for Owner Orla");
    expect(
      activityEntryText(
        entry({
          eventKind: "reservation_released",
          actorDisplayName: null,
          itemTitle: "Pour-over kettle",
          ownerDisplayName: "Owner Orla",
        }),
      ),
    ).toBe("A gift was released for Owner Orla");
  });

  it("self-labels the reserver's own reservation entries without an actor name", () => {
    expect(
      activityEntryText(
        entry({
          eventKind: "item_reserved",
          actorDisplayName: null,
          itemTitle: "Pour-over kettle",
          ownerDisplayName: "Owner Orla",
          involvesViewer: true,
        }),
      ),
    ).toBe("You reserved Pour-over kettle for Owner Orla");
  });

  it("keeps state-only wording when item fields are withheld", () => {
    expect(
      activityEntryText(
        entry({
          eventKind: "item_reserved",
          actorDisplayName: null,
          itemTitle: null,
          ownerDisplayName: null,
        }),
      ),
    ).toBe("A gift was reserved");
  });

  it("renders reaction entries with the actor, self-labelled for the viewer", () => {
    expect(
      activityEntryText(
        entry({
          eventKind: "item_reacted",
          itemTitle: "Pour-over kettle",
        }),
      ),
    ).toBe("Reserver Rai reacted to Pour-over kettle");
    expect(
      activityEntryText(
        entry({
          eventKind: "item_reacted",
          itemTitle: "Pour-over kettle",
          involvesViewer: true,
        }),
      ),
    ).toBe("You reacted to Pour-over kettle");
  });
});
