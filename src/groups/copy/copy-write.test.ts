import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { getServerAnalytics } from "@/src/analytics/server";

import { copyFriendGroupItem } from "./copy-write";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/src/analytics/server", () => ({
  getServerAnalytics: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const groupId = "00000000-0000-4000-8000-0000000000a1";
const itemId = "00000000-0000-4000-8000-0000000000b1";
const userId = "00000000-0000-4000-8000-0000000000c1";

function mockClient(
  overrides: {
    rpc?: ReturnType<typeof vi.fn>;
    from?: ReturnType<typeof vi.fn>;
    user?: unknown;
  } = {},
) {
  const rpc =
    overrides.rpc ??
    vi.fn().mockResolvedValue({
      data: "00000000-0000-4000-8000-0000000000d1",
      error: null,
    });
  const from =
    overrides.from ??
    vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });
  const auth = {
    getUser: vi.fn().mockResolvedValue({
      data: {
        user: overrides.user === undefined ? { id: userId } : overrides.user,
      },
    }),
  };
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    rpc,
    from,
    auth,
  } as never);
  return { rpc, from, auth };
}

function mockAnalytics() {
  const capture = vi.fn().mockResolvedValue({ ok: true } as const);
  vi.mocked(getServerAnalytics).mockResolvedValue({ capture } as never);
  return { capture };
}

describe("copyFriendGroupItem", () => {
  it("calls the definer function once and emits item_copied with created on success", async () => {
    const { rpc } = mockClient();
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "created",
    });
    expect(rpc).toHaveBeenCalledWith("copy_group_item", {
      p_group_id: groupId,
      p_item_id: itemId,
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      "item_copied",
      { copy_outcome: "created" },
      { distinctId: userId },
    );
  });

  it("reports already_copied from the owner-scoped pre-read without a write and emits already_copied", async () => {
    const rpc = vi.fn();
    const from = vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({
                data: [{ id: "00000000-0000-4000-8000-0000000000d1" }],
                error: null,
              }),
          }),
        }),
      }),
    });
    mockClient({ rpc, from });
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "already_copied",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      "item_copied",
      { copy_outcome: "already_copied" },
      { distinctId: userId },
    );
  });

  it("emits nothing for a signed-out session", async () => {
    mockClient({ user: null });
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("emits nothing for a malformed id", async () => {
    mockClient();
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem("not-a-uuid", itemId)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("maps every database denial to the generic unavailable outcome with zero emission", async () => {
    // A null scalar result: every uniform denial class.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    mockClient({ rpc });
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("maps an RPC error to unavailable with zero emission", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "x" } });
    mockClient({ rpc });
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("maps a malformed function result to unavailable with zero emission", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: ["not-a-uuid"], error: null });
    mockClient({ rpc });
    const { capture } = mockAnalytics();

    await expect(copyFriendGroupItem(groupId, itemId)).resolves.toEqual({
      kind: "unavailable",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("emits nothing when there is no analytics identity", async () => {
    mockClient();
    const capture = vi.fn();
    vi.mocked(getServerAnalytics).mockRejectedValue(new Error("no identity"));

    await expect(copyFriendGroupItem(groupId, itemId)).rejects.toThrow(
      "no identity",
    );
    expect(capture).not.toHaveBeenCalled();
  });
});
