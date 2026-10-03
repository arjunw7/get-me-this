import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The draw Server Action contract (brief 008d acceptance criteria 4, 6, 9):
 * the CAS expected version passes through untouched, a stale result
 * re-renders refreshed state with no retry and zero enqueues, a committed
 * draw enqueues exactly the current-version rows through the pinned 009a
 * contract helper, the tombstone reads zero rows so nothing is enqueued,
 * exactly one `name_draw_completed` per committed draw and nothing on
 * failures, and no assignment content ever reaches the client.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  capture: vi.fn(),
  requireCompleteProfile: vi.fn(),
  enqueueAssignmentEmails: vi.fn(),
  revalidatePath: vi.fn(),
  serviceClient: { rpc: vi.fn() },
}));

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: () => ({ capture: mocks.capture }),
}));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: mocks.requireCompleteProfile,
}));
vi.mock("@/src/email/assignment-enqueue", () => ({
  enqueueAssignmentEmails: mocks.enqueueAssignmentEmails,
}));
vi.mock("@/src/email/service", () => ({
  getEmailServiceConfig: () => ({
    supabaseUrl: "http://127.0.0.1:54321",
    serviceKey: "fixture-service-key",
    resendApiKey: null,
    appBaseUrl: "http://127.0.0.1:3100",
  }),
  createEmailServiceClient: () => mocks.serviceClient,
}));
vi.mock("@/src/groups/assignment-data", () => ({
  isGroupIdFormat: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { runDrawAction } from "./draw-actions";

const USER_ID = "00000000-0000-4000-8000-00000000000a";
const GROUP_ID = "00000000-0000-4000-8000-0000000000b0";

function formData(expectedDrawVersion: string | null): FormData {
  const data = new FormData();
  data.set("groupId", GROUP_ID);
  if (expectedDrawVersion !== null) {
    data.set("expectedDrawVersion", expectedDrawVersion);
  }
  return data;
}

function drawRpcResult(
  result: string,
  drawVersion: number | null = null,
): void {
  mocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === "run_secret_draw") {
      return {
        data: [{ result, draw_version: drawVersion }],
        error: null,
      };
    }
    if (fn === "draw_assignments_for_email") {
      return {
        data: [
          {
            group_name: "Draw Crew",
            occasion_date: "2026-12-20",
            draw_version: drawVersion,
            giver_id: USER_ID,
            recipient_display_name: "Dev",
            is_valid: true,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCompleteProfile.mockResolvedValue({
    userId: USER_ID,
    email: "user@example.invalid",
    profile: { displayName: "Ada", tasteLine: null },
  });
  mocks.capture.mockResolvedValue({ ok: true, delivered: true });
  mocks.enqueueAssignmentEmails.mockResolvedValue({
    enqueued: 1,
    skippedInvalid: 0,
    quotaDeferred: 0,
  });
});

async function captureRedirect(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      return error.message;
    }
    throw error;
  }
  throw new Error("expected the action to redirect");
}

describe("runDrawAction", () => {
  it("passes the confirmed expected version through to the CAS untouched", async () => {
    drawRpcResult("drawn", 3);
    await captureRedirect(() => runDrawAction(formData("2")));
    expect(mocks.rpc).toHaveBeenCalledWith("run_secret_draw", {
      p_group_id: GROUP_ID,
      p_expected_draw_version: 2,
    });
  });

  it("enqueues exactly the read rows on a committed draw and emits one analytics event", async () => {
    drawRpcResult("drawn", 1);
    const redirect = await captureRedirect(() => runDrawAction(formData(null)));
    expect(redirect).toBe(`NEXT_REDIRECT:/groups/${GROUP_ID}?draw=drawn`);
    expect(mocks.enqueueAssignmentEmails).toHaveBeenCalledTimes(1);
    const rows = mocks.enqueueAssignmentEmails.mock.calls[0][1];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      groupId: GROUP_ID,
      drawVersion: 1,
      giverId: USER_ID,
      isValid: true,
    });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture.mock.calls[0][0]).toBe("name_draw_completed");
    expect(mocks.capture.mock.calls[0][1]).toEqual({
      participant_count_bucket: "2-3",
      is_redraw: false,
    });
  });

  it("marks a committed redraw with is_redraw true and the new version's key material only", async () => {
    drawRpcResult("drawn", 3);
    await captureRedirect(() => runDrawAction(formData("2")));
    expect(mocks.capture.mock.calls[0][1]).toEqual({
      participant_count_bucket: "2-3",
      is_redraw: true,
    });
    const rows = mocks.enqueueAssignmentEmails.mock.calls[0][1];
    expect(rows[0].drawVersion).toBe(3);
  });

  it("enqueues nothing on a stale result and never retries", async () => {
    drawRpcResult("stale");
    const redirect = await captureRedirect(() => runDrawAction(formData("1")));
    expect(redirect).toBe(`NEXT_REDIRECT:/groups/${GROUP_ID}?draw=stale`);
    expect(mocks.enqueueAssignmentEmails).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
  });

  it("renders the insufficient-participants blocked notice with no enqueue", async () => {
    drawRpcResult("insufficient_participants");
    const redirect = await captureRedirect(() => runDrawAction(formData("1")));
    expect(redirect).toBe(
      `NEXT_REDIRECT:/groups/${GROUP_ID}?draw=insufficient`,
    );
    expect(mocks.enqueueAssignmentEmails).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("enqueues nothing when the tombstone leaves no readable assignments", async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === "run_secret_draw") {
        return { data: [{ result: "drawn", draw_version: 5 }], error: null };
      }
      // The tombstoned / wrong-mode group reads zero rows.
      return { data: [], error: null };
    });
    const redirect = await captureRedirect(() => runDrawAction(formData("4")));
    expect(redirect).toBe(`NEXT_REDIRECT:/groups/${GROUP_ID}?draw=drawn`);
    const rows = mocks.enqueueAssignmentEmails.mock.calls[0][1];
    expect(rows).toHaveLength(0);
  });

  it("maps an unexpected result to the generic unavailable notice", async () => {
    drawRpcResult("unavailable");
    const redirect = await captureRedirect(() => runDrawAction(formData("1")));
    expect(redirect).toBe(`NEXT_REDIRECT:/groups/${GROUP_ID}?draw=unavailable`);
    expect(mocks.enqueueAssignmentEmails).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("refuses a malformed group id without touching the database", async () => {
    const data = new FormData();
    data.set("groupId", "not-a-uuid");
    const redirect = await captureRedirect(() => runDrawAction(data));
    expect(redirect).toBe(`NEXT_REDIRECT:/groups/not-a-uuid?draw=unavailable`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
