import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
import { getGroupInviteLink, issueGroupInviteLink } from "./group-write";
const GROUP = "00000000-0000-4000-8000-000000000001";
const ready = {
  result: "ready",
  invitation_version: 5,
  token: "a".repeat(42) + "A",
  expires_at: "2026-11-01T00:00:00Z",
};
describe("recoverable organizer invitation boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: [ready], error: null });
  });
  it("reads through authenticated narrow RPC without direct table access", async () => {
    expect(await getGroupInviteLink(GROUP)).toEqual({
      kind: "ready",
      token: ready.token,
      version: "5",
      expiresAt: ready.expires_at,
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_group_invite_link", {
      p_group_id: GROUP,
    });
  });
  it("maps legacy active links without inventing or requesting replacement", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          result: "replacement_required",
          invitation_version: "8",
          token: null,
          expires_at: ready.expires_at,
        },
      ],
      error: null,
    });
    expect(await getGroupInviteLink(GROUP)).toEqual({
      kind: "replacement_required",
      version: "8",
    });
  });
  it.each([
    null,
    [],
    [ready, ready],
    [{ ...ready, token: "broken" }],
    [{ ...ready, invitation_version: -1 }],
    [{ ...ready, invitation_version: 9007199254740992 }],
    [{ ...ready, expires_at: "invalid" }],
    [
      {
        result: "replacement_required",
        invitation_version: 5,
        token: ready.token,
      },
    ],
  ])("fails closed for denied or malformed data %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await getGroupInviteLink(GROUP)).toEqual({
      kind: Array.isArray(data) && data.length === 0 ? "unavailable" : "retry",
    });
  });
  it("keeps error details out of action outcomes", async () => {
    mocks.rpc.mockRejectedValue(new Error("private database detail"));
    expect(await getGroupInviteLink(GROUP)).toEqual({ kind: "retry" });
  });
  it("returns unavailable when authenticated client is absent", async () => {
    mocks.client.mockResolvedValue(null);
    expect(await getGroupInviteLink(GROUP)).toEqual({ kind: "unavailable" });
  });
  it("passes confirmed CAS versions without Number precision loss", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await issueGroupInviteLink(GROUP, "9007199254740993");
    expect(mocks.rpc).toHaveBeenCalledWith("issue_group_invitation", {
      p_group_id: GROUP,
      p_expected_invitation_version: "9007199254740993",
    });
  });
});
