import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The create-group Server Action contract (brief 006b): session-derived
 * authority, no service-role credential, server-side validation, stable
 * replay mapping, analytics exactly once on `created_now`, and safe behavior
 * when analytics fails.
 */

const mocks = vi.hoisted(() => ({
  createGroupWithReceipt: vi.fn(),
  capture: vi.fn(),
  requireCompleteProfile: vi.fn(),
}));

vi.mock("./group-write", () => ({
  createGroupWithReceipt: mocks.createGroupWithReceipt,
}));
vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: () => ({ capture: mocks.capture }),
}));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: mocks.requireCompleteProfile,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { createGroupAction } from "./create-actions";

const USER_ID = "00000000-0000-4000-8000-00000000000a";
const GROUP_ID = "00000000-0000-4000-8000-0000000000b0";
const REQUEST_KEY = "00000000-0000-4000-8000-0000000000c0";

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    name: "Rohan turns 27",
    occasionType: "birthday",
    occasionDate: "2026-12-18",
    timeZone: "Asia/Kolkata",
    budgetAmount: "2500",
    budgetCurrency: "INR",
    mode: "secret_draw",
    requestKey: REQUEST_KEY,
    ...overrides,
  })) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCompleteProfile.mockResolvedValue({
    userId: USER_ID,
    email: "user@example.invalid",
    profile: { displayName: "Ada", tasteLine: null },
  });
  mocks.capture.mockResolvedValue({ ok: true, delivered: true });
});

describe("createGroupAction", () => {
  it("redirects to the organizer-only created route on success", async () => {
    mocks.createGroupWithReceipt.mockResolvedValue({
      kind: "created",
      groupId: GROUP_ID,
      createdNow: true,
    });
    let redirect: string | null = null;
    try {
      await createGroupAction({ status: "idle" }, formData({}));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
        redirect = error.message;
      }
    }
    expect(redirect).toBe(`NEXT_REDIRECT:/groups/${GROUP_ID}/created`);
  });

  it("emits group_created exactly once for the committed first creation", async () => {
    mocks.createGroupWithReceipt.mockResolvedValue({
      kind: "created",
      groupId: GROUP_ID,
      createdNow: true,
    });
    try {
      await createGroupAction({ status: "idle" }, formData({}));
    } catch {
      // The redirect throw is expected.
    }
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      "group_created",
      {
        occasion_type: "birthday",
        gifting_mode: "draw_names",
        currency: "INR",
        has_budget_cap: true,
      },
      { distinctId: USER_ID, group: { id: GROUP_ID } },
    );
  });

  it("never emits analytics for a replayed creation", async () => {
    mocks.createGroupWithReceipt.mockResolvedValue({
      kind: "created",
      groupId: GROUP_ID,
      createdNow: false,
    });
    try {
      await createGroupAction({ status: "idle" }, formData({}));
    } catch {
      // Expected redirect.
    }
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("a failed analytics capture cannot fail the committed creation", async () => {
    mocks.createGroupWithReceipt.mockResolvedValue({
      kind: "created",
      groupId: GROUP_ID,
      createdNow: true,
    });
    mocks.capture.mockRejectedValue(new Error("posthog down"));
    let redirected = false;
    try {
      await createGroupAction({ status: "idle" }, formData({}));
    } catch (error) {
      redirected =
        error instanceof Error && error.message.startsWith("NEXT_REDIRECT");
    }
    expect(redirected).toBe(true);
  });

  it("maps the typed idempotency conflict without analytics", async () => {
    mocks.createGroupWithReceipt.mockResolvedValue({ kind: "conflict" });
    const result = await createGroupAction({ status: "idle" }, formData({}));
    expect(result).toEqual({ status: "conflict" });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("maps retry and unavailable without analytics", async () => {
    mocks.createGroupWithReceipt.mockResolvedValue({ kind: "retry" });
    expect(await createGroupAction({ status: "idle" }, formData({}))).toEqual({
      status: "retry",
    });
    mocks.createGroupWithReceipt.mockResolvedValue({ kind: "unavailable" });
    expect(await createGroupAction({ status: "idle" }, formData({}))).toEqual({
      status: "unavailable",
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("rejects a forged or missing request key without touching the database", async () => {
    const result = await createGroupAction(
      { status: "idle" },
      formData({ requestKey: "forged" }),
    );
    expect(result).toEqual({ status: "unavailable" });
    expect(mocks.createGroupWithReceipt).not.toHaveBeenCalled();
  });

  it("revalidates every field server-side", async () => {
    const result = await createGroupAction(
      { status: "idle" },
      formData({ occasionDate: "2026-02-30" }),
    );
    expect(result.status).toBe("invalid");
    expect(mocks.createGroupWithReceipt).not.toHaveBeenCalled();
  });

  it("never imports a service-role credential anywhere in the group module", () => {
    const action = readFileSync(
      new URL("./create-actions.ts", import.meta.url),
      "utf8",
    );
    const write = readFileSync(
      new URL("./group-write.ts", import.meta.url),
      "utf8",
    );
    for (const source of [action, write]) {
      expect(source).not.toMatch(/service[_-]?role/i);
    }
  });
});
