import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ require: vi.fn(), get: vi.fn() }));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: mocks.require,
}));
vi.mock("./group-write", () => ({
  getGroupInviteLink: mocks.get,
  issueGroupInviteLink: vi.fn(),
  loadOrganizerInvitationState: vi.fn(),
}));
import { getGroupInviteLinkAction } from "./invitation-actions";
const GROUP = "00000000-0000-4000-8000-000000000001";
describe("organizer invitation modal action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.require.mockResolvedValue({ userId: "actor" });
  });
  it("requires verified profile before querying the organizer projection", async () => {
    mocks.require.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/auth"));
    await expect(getGroupInviteLinkAction(GROUP)).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("rejects invalid group identifiers before data access", async () => {
    expect(await getGroupInviteLinkAction("bad-id")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("returns the recovered link without a second issuance", async () => {
    const ready = {
      kind: "ready",
      token: "a".repeat(42) + "A",
      version: "5",
      expiresAt: "2026-11-01T00:00:00Z",
    };
    mocks.get.mockResolvedValue(ready);
    expect(await getGroupInviteLinkAction(GROUP)).toEqual({
      ok: true,
      token: ready.token,
      version: "5",
      expiresAt: ready.expiresAt,
    });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(GROUP);
  });
  it("preserves the explicit confirmation boundary for legacy links", async () => {
    mocks.get.mockResolvedValue({ kind: "replacement_required", version: "7" });
    expect(await getGroupInviteLinkAction(GROUP)).toEqual({
      ok: false,
      reason: "replacement_required",
      version: "7",
    });
  });
  it.each(["unavailable", "retry"])(
    "returns safe %s without provider details",
    async (kind) => {
      mocks.get.mockResolvedValue({ kind });
      expect(await getGroupInviteLinkAction(GROUP)).toEqual({
        ok: false,
        reason: kind,
      });
    },
  );
});
