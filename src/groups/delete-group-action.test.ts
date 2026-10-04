import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  profile: vi.fn(),
  revalidate: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: mocks.profile,
}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { deleteGroupAction } from "./delete-group-action";

const id = "fa000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});
describe("deleteGroupAction", () => {
  it("requires a complete authenticated profile before any mutation", async () => {
    mocks.profile.mockRejectedValue(new Error("sign in"));
    await expect(deleteGroupAction(id, "2")).rejects.toThrow("sign in");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([
    ["invalid", "2"],
    [id, "-1"],
    [id, "1.5"],
    [id, "9007199254740993"],
    [id, null],
  ])("rejects malformed input %s %s", async (group, version) => {
    expect(await deleteGroupAction(group!, version as string)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes only the group and confirmed version, invalidating views on success", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await deleteGroupAction(id, "2")).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_group", {
      p_group_id: id,
      p_expected_member_admin_version: "2",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/groups");
    expect(mocks.revalidate).toHaveBeenCalledWith("/home");
    expect(mocks.revalidate).toHaveBeenCalledWith(`/groups/${id}`, "layout");
  });
  it.each([
    [{ data: false, error: null }, "unavailable"],
    [{ data: null, error: null }, "unavailable"],
    [{ data: null, error: { code: "PT409" } }, "stale"],
    [{ data: null, error: { code: "42501" } }, "retry"],
  ])(
    "maps denied and failed RPC responses without invalidating views",
    async (result, reason) => {
      mocks.rpc.mockResolvedValue(result);
      expect(await deleteGroupAction(id, "2")).toEqual({ ok: false, reason });
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );
  it("handles missing configuration and transport failures", async () => {
    mocks.client.mockResolvedValueOnce(null);
    expect(await deleteGroupAction(id, "2")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    mocks.rpc.mockRejectedValue(new Error("network"));
    expect(await deleteGroupAction(id, "2")).toEqual({
      ok: false,
      reason: "retry",
    });
  });
});
