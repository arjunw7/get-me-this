import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
import { loadGroupMemberVibes, parseMemberVibes } from "./member-vibes-data";
const group = "00000000-0000-4000-8000-000000000001";
const member = "00000000-0000-4000-8000-000000000002";
describe("narrow joined member Vibe projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  });
  it("returns only selected Vibes keyed by identity, ignoring additional payload fields", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          member_user_id: member,
          vibe: "electric",
          display_name: "Not exposed",
        },
      ],
      error: null,
    });
    expect(await loadGroupMemberVibes(group)).toEqual({ [member]: "electric" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("group_member_vibes", {
      p_group_id: group,
    });
  });
  it("does not query malformed group ids or invent data on denied reads", async () => {
    expect(await loadGroupMemberVibes("bad-id")).toEqual({});
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await loadGroupMemberVibes(group)).toEqual({});
    mocks.rpc.mockResolvedValue({
      data: [{ member_user_id: member, vibe: "tomato" }],
      error: { code: "42501" },
    });
    expect(await loadGroupMemberVibes(group)).toEqual({});
  });
  it("rejects unknown Vibes, malformed identity, and duplicate contradictory rows", () => {
    expect(
      parseMemberVibes([{ member_user_id: member, vibe: "purple" }]),
    ).toEqual({});
    expect(
      parseMemberVibes([{ member_user_id: "not-an-id", vibe: "tomato" }]),
    ).toEqual({});
    expect(
      parseMemberVibes([
        { member_user_id: member, vibe: "tomato" },
        { member_user_id: member, vibe: "electric" },
      ]),
    ).toEqual({});
    expect(parseMemberVibes(null)).toEqual({});
  });
});
