import { describe, expect, it } from "vitest";

import {
  budgetLine,
  giftingRouteState,
  statusLabel,
} from "@/src/groups/gifting-view";

describe("gifting route dispatch", () => {
  it("renders the checklist only for an active gift_everyone group", () => {
    expect(giftingRouteState("gift_everyone", "active")).toBe("checklist");
  });

  it("resolves every other mode to the generic not-found result", () => {
    expect(giftingRouteState("wishlist_only", "active")).toBe("not-found");
    expect(giftingRouteState("secret_draw", "active")).toBe("not-found");
  });

  it("denies archived groups and unknown mode values", () => {
    expect(giftingRouteState("gift_everyone", "archived")).toBe("not-found");
    expect(giftingRouteState("draw_names", "active")).toBe("not-found");
    expect(giftingRouteState(null, "active")).toBe("not-found");
  });
});

describe("checklist state text", () => {
  it("uses truthful textual statuses, never color-only", () => {
    expect(statusLabel("todo")).toBe("To gift");
    expect(statusLabel("completed")).toBe("Completed");
    expect(statusLabel(null)).toBe("To gift");
  });
});

describe("budget guidance line", () => {
  it("renders integer minor units with the stored currency", () => {
    expect(budgetLine(150000, "INR")).toBe(
      "Budget guidance: INR 1500.00 per person",
    );
  });

  it("is absent when the group has no configured budget", () => {
    expect(budgetLine(null, null)).toBeNull();
  });
});
