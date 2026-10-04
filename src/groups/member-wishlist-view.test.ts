import { describe, expect, it } from "vitest";

import { createMemoryAnalyticsSink } from "@/src/analytics/memory-sink";
import { validateAnalyticsEvent } from "@/src/analytics/validation";

import {
  MEMBER_WISHLIST_EMPTY_TEXT,
  itemCountBucket,
  memberWishlistHeading,
  memberWishlistRouteDecision,
} from "./member-wishlist-view";

import type { MemberWishlistSnapshot } from "./member-wishlist-data";

const VIEWER = "9f1d0f2e-0000-4000-8000-000000000001";
const TARGET = "9f1d0f2e-0000-4000-8000-000000000002";

function snapshotWith(itemCount: number): MemberWishlistSnapshot {
  return {
    memberDisplayName: "Kabir Kaul",
    items: Array.from({ length: itemCount }, (_, index) => ({
      itemId: `bb1d0f2e-0000-4000-8000-00000000${`${index + 1}`.padStart(4, "0")}`,
      title: `Item ${index + 1}`,
      sourceUrl: null,
      retailer: null,
      imageUrl: null,
      note: null,
      desireLevel: "would_love" as const,
      originalAmountMinor: null,
      originalCurrency: null,
    })),
  };
}

describe("itemCountBucket", () => {
  it("matches the brief's exact bucket boundaries", () => {
    expect(itemCountBucket(0)).toBe("zero");
    expect(itemCountBucket(1)).toBe("one_to_five");
    expect(itemCountBucket(5)).toBe("one_to_five");
    expect(itemCountBucket(6)).toBe("six_to_ten");
    expect(itemCountBucket(10)).toBe("six_to_ten");
    expect(itemCountBucket(11)).toBe("eleven_plus");
    expect(itemCountBucket(40)).toBe("eleven_plus");
  });
});

describe("memberWishlistRouteDecision", () => {
  it("resolves every denial class to not-found with no event", () => {
    for (const denied of [null, ...([] as const)]) {
      const decision = memberWishlistRouteDecision(
        denied,
        VIEWER,
        TARGET,
        "secret_draw",
      );
      expect(decision.kind).toBe("not-found");
      expect("event" in decision).toBe(false);
    }
    const noMode = memberWishlistRouteDecision(
      snapshotWith(2),
      VIEWER,
      TARGET,
      null,
    );
    expect(noMode.kind).toBe("not-found");
  });

  it("dispatches the own case to the redirect with the own event", () => {
    const decision = memberWishlistRouteDecision(
      snapshotWith(2),
      VIEWER,
      VIEWER,
      "gift_everyone",
    );
    expect(decision.kind).toBe("own");
    if (decision.kind === "own") {
      expect(decision.event.properties).toEqual({
        view_scope: "own",
        wishlist_state: "populated",
        item_count_bucket: "one_to_five",
        gifting_mode: "gift_everyone",
      });
    }
  });

  it("dispatches the friend case with the rendered model and event", () => {
    const decision = memberWishlistRouteDecision(
      snapshotWith(2),
      VIEWER,
      TARGET,
      "wishlist_only",
    );
    expect(decision.kind).toBe("friend");
    if (decision.kind === "friend") {
      expect(decision.memberDisplayName).toBe("Kabir Kaul");
      expect(decision.items).toHaveLength(2);
      expect(decision.event.properties).toEqual({
        view_scope: "friend",
        wishlist_state: "populated",
        item_count_bucket: "one_to_five",
        gifting_mode: "wishlist_only",
      });
    }
  });

  it("emits the authorized-empty sentinel as empty/zero", () => {
    const decision = memberWishlistRouteDecision(
      snapshotWith(0),
      VIEWER,
      TARGET,
      "secret_draw",
    );
    expect(decision.kind).toBe("friend");
    if (decision.kind === "friend") {
      expect(decision.event.properties.wishlist_state).toBe("empty");
      expect(decision.event.properties.item_count_bucket).toBe("zero");
      expect(decision.items).toHaveLength(0);
    }
  });

  it("covers every bucket boundary through the event", () => {
    for (const [count, bucket] of [
      [0, "zero"],
      [1, "one_to_five"],
      [5, "one_to_five"],
      [6, "six_to_ten"],
      [10, "six_to_ten"],
      [11, "eleven_plus"],
      [25, "eleven_plus"],
    ] as const) {
      const decision = memberWishlistRouteDecision(
        snapshotWith(count),
        VIEWER,
        TARGET,
        "secret_draw",
      );
      if (decision.kind === "friend") {
        expect(decision.event.properties.item_count_bucket).toBe(bucket);
      } else {
        expect.unreachable("friend case expected");
      }
    }
  });
});

describe("display contracts", () => {
  it("heads the wishlist with the member's name", () => {
    expect(memberWishlistHeading("Kabir Kaul")).toBe("Kabir Kaul's wishlist");
  });

  it("pins the honest empty and sharing copy", () => {
    expect(MEMBER_WISHLIST_EMPTY_TEXT).toMatch(/has not added anything/);
  });
});

describe("development sink emission", () => {
  it("captures exactly one catalog-valid event per authorized dispatch", async () => {
    const sink = createMemoryAnalyticsSink();
    for (const [target, count, mode] of [
      [TARGET, 2, "secret_draw"],
      [TARGET, 0, "gift_everyone"],
      [VIEWER, 2, "wishlist_only"],
    ] as const) {
      const decision = memberWishlistRouteDecision(
        snapshotWith(count),
        VIEWER,
        target,
        mode,
      );
      if (decision.kind === "not-found") {
        expect.unreachable("authorized dispatch expected");
      }
      const validation = validateAnalyticsEvent(
        decision.event.name,
        decision.event.properties,
      );
      expect(validation).toEqual({ ok: true });
      await sink.capture(decision.event.name, decision.event.properties, {
        distinctId: VIEWER,
      });
    }
    const events = sink.readEvents();
    expect(events).toHaveLength(3);
    expect(new Set(events.map(({ event }) => event))).toEqual(
      new Set(["member_wishlist_viewed"]),
    );
    // No group id, member id, name, title, or count beyond the closed
    // schema ever crosses the sink boundary.
    for (const entry of events) {
      expect(Object.keys(entry.properties)).toEqual([
        "view_scope",
        "wishlist_state",
        "item_count_bucket",
        "gifting_mode",
      ]);
    }
  });

  it("records no event for any denial class", async () => {
    const sink = createMemoryAnalyticsSink();
    // Every denial collapses to the same null snapshot; the dispatch
    // returns not-found with no event to capture.
    const decision = memberWishlistRouteDecision(
      null,
      VIEWER,
      TARGET,
      "secret_draw",
    );
    expect(decision).toEqual({ kind: "not-found" });
    expect(sink.readEvents()).toEqual([]);
  });
});
