import { describe, expect, it } from "vitest";

import {
  accentClassFor,
  calendarDateInZone,
  countdownText,
  initialsFor,
  occasionDateText,
  rosterSummaryText,
  roomBudgetText,
  wallClockIsoDate,
} from "./room-format";

describe("wallClockIsoDate", () => {
  it("narrows the projected group-zone wall clock to its calendar date", () => {
    expect(wallClockIsoDate("2026-11-07 18:00:00")).toBe("2026-11-07");
    expect(wallClockIsoDate("2026-11-07T18:00:00.123456")).toBe("2026-11-07");
  });

  it("rejects values that are not a parseable wall clock", () => {
    expect(wallClockIsoDate("not a clock")).toBe(null);
    expect(wallClockIsoDate("2026-13-40 00:00:00")).toBe(null);
  });
});

describe("occasionDateText", () => {
  it("formats the group's calendar day without shifting the date", () => {
    expect(occasionDateText("2026-11-07 18:00:00")).toBe("Sat, 7 Nov, 2026");
  });

  it("keeps the calendar day for a zone-edge instant", () => {
    // 23:30 group-zone wall clock is still the same calendar day.
    expect(occasionDateText("2026-12-18 23:30:00")).toBe("Fri, 18 Dec, 2026");
  });

  it("returns null for an unparseable wall clock", () => {
    expect(occasionDateText("whenever")).toBe(null);
  });
});

describe("calendarDateInZone", () => {
  it("resolves the zone-local calendar date for a fixed instant", () => {
    const instant = new Date("2026-11-07T18:30:00Z");
    expect(calendarDateInZone(instant, "Asia/Kolkata")).toBe("2026-11-08");
    expect(calendarDateInZone(instant, "UTC")).toBe("2026-11-07");
  });

  it("handles DST transitions without shifting the arithmetic", () => {
    // US DST ends 2026-11-01; zone-local dates stay calendar dates.
    const instant = new Date("2026-11-01T03:30:00Z");
    expect(calendarDateInZone(instant, "America/New_York")).toBe("2026-10-31");
  });

  it("returns null for an unknown zone", () => {
    expect(calendarDateInZone(new Date(), "Mars/Olympus")).toBe(null);
  });
});

describe("countdownText", () => {
  it("renders Today on the occasion date", () => {
    expect(countdownText("2026-11-07", "2026-11-07")).toBe("Today");
  });

  it("renders singular and plural future days", () => {
    expect(countdownText("2026-11-06", "2026-11-07")).toBe("1 day");
    expect(countdownText("2026-11-01", "2026-11-07")).toBe("6 days");
  });

  it("renders singular and plural past days", () => {
    expect(countdownText("2026-11-08", "2026-11-07")).toBe("1 day ago");
    expect(countdownText("2026-11-20", "2026-11-07")).toBe("13 days ago");
  });

  it("is plain calendar-day arithmetic across DST transitions", () => {
    // US DST ends 2026-11-01; the day count is unaffected.
    expect(countdownText("2026-10-31", "2026-11-02")).toBe("2 days");
  });

  it("returns null for malformed dates", () => {
    expect(countdownText("someday", "2026-11-07")).toBe(null);
  });
});

describe("roomBudgetText", () => {
  it("formats exact minor units in the pinned money format", () => {
    expect(roomBudgetText("250000", "INR")).toBe("2500.00 INR");
    expect(roomBudgetText("0", "JPY")).toBe("0 JPY");
  });

  it("returns null when the pair is absent or unsupported", () => {
    expect(roomBudgetText(null, null)).toBe(null);
    expect(roomBudgetText("250000", null)).toBe(null);
    expect(roomBudgetText(null, "INR")).toBe(null);
    expect(roomBudgetText("-5", "INR")).toBe(null);
    expect(roomBudgetText("250000", "buzz")).toBe(null);
  });
});

describe("initialsFor", () => {
  it("takes the first grapheme of the first two tokens", () => {
    expect(initialsFor("Riya Room")).toBe("RR");
    expect(initialsFor("Arjun")).toBe("A");
  });

  it("handles long names, extra whitespace, and non-latin scripts", () => {
    expect(initialsFor("  Zephyrine   Nathaniel-Clarke  ")).toBe("ZN");
    expect(initialsFor("आयुष Verma")).toBe("आV");
  });

  it("falls back to M for an effectively empty name", () => {
    expect(initialsFor("   ")).toBe("M");
  });
});

describe("accentClassFor", () => {
  it("is deterministic and always in the approved accent set", () => {
    const approved = [
      "bg-accent-fresh-soft text-accent-fresh-strong",
      "bg-accent-info-soft text-accent-info-strong",
      "bg-accent-highlight-soft text-accent-highlight-strong",
    ];
    const first = accentClassFor("9f1d0f2e-1111-4222-8333-444455556666");
    expect(approved).toContain(first);
    expect(accentClassFor("9f1d0f2e-1111-4222-8333-444455556666")).toBe(first);
  });

  it("varies across member ids without persisting anything", () => {
    const accents = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        accentClassFor(`9f1d0f2e-0000-4000-8000-${`${n}`.padStart(12, "0")}`),
      ),
    );
    expect(accents.size).toBeGreaterThan(1);
  });
});

describe("rosterSummaryText", () => {
  it("follows the approved grammar", () => {
    expect(rosterSummaryText(4, 0)).toBe("4 joined");
    expect(rosterSummaryText(1, 0)).toBe("1 joined");
    expect(rosterSummaryText(2, 1)).toBe("2 joined, 1 invited");
    expect(rosterSummaryText(3, 4)).toBe("3 joined, 4 invited");
  });
});
