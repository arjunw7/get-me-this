/**
 * Memory sink tests: explicit injection only, bounded FIFO retention, and a
 * deterministic injected clock.
 */
import { describe, expect, it } from "vitest";

import { createMemoryAnalyticsSink } from "./memory-sink";

const CONTEXT = { distinctId: "00000000-0000-4000-8000-000000000000" };

describe("createMemoryAnalyticsSink", () => {
  it("records emitted events so tests can observe them without a network request", async () => {
    const sink = createMemoryAnalyticsSink();
    const result = await sink.capture(
      "auth_completed",
      { method: "email", is_new_user: true },
      CONTEXT,
    );
    expect(result).toEqual({ ok: true, delivered: false });
    expect(sink.readEvents()).toEqual([
      {
        event: "auth_completed",
        properties: { method: "email", is_new_user: true },
        context: CONTEXT,
        recordedAt: 0,
      },
    ]);
  });

  it("is bounded: the oldest entries are dropped first at capacity", async () => {
    const sink = createMemoryAnalyticsSink({ maxEntries: 3 });
    for (let i = 0; i < 5; i += 1) {
      await sink.capture(
        "invite_accepted",
        { was_authenticated: true },
        { distinctId: `user-${i}` },
      );
    }
    const events = sink.readEvents();
    expect(events).toHaveLength(3);
    expect(events.map((entry) => entry.context.distinctId)).toEqual([
      "user-2",
      "user-3",
      "user-4",
    ]);
  });

  it("is deterministic: timestamps come only from the injected clock", async () => {
    let tick = 0;
    const sink = createMemoryAnalyticsSink({ clock: () => 100 + tick++ });
    await sink.capture(
      "group_created",
      {
        occasion_type: "birthday",
        gifting_mode: "draw_names",
        currency: "INR",
        has_budget_cap: false,
      },
      CONTEXT,
    );
    await sink.capture(
      "invite_sent",
      { channel: "link", group_member_count_bucket: "1-4" },
      CONTEXT,
    );
    expect(sink.readEvents().map((entry) => entry.recordedAt)).toEqual([
      100, 101,
    ]);
  });

  it("clears all retained entries", async () => {
    const sink = createMemoryAnalyticsSink();
    await sink.capture(
      "auth_completed",
      { method: "email", is_new_user: false },
      CONTEXT,
    );
    sink.clear();
    expect(sink.readEvents()).toEqual([]);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => createMemoryAnalyticsSink({ maxEntries: 0 })).toThrow();
    expect(() => createMemoryAnalyticsSink({ maxEntries: -1 })).toThrow();
  });
});
