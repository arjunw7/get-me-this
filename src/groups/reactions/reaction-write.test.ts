import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";

import {
  getOwnItemReactionSummary,
  setGroupItemReaction,
} from "./reaction-write";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const groupId = "00000000-0000-4000-8000-0000000000a1";
const itemId = "00000000-0000-4000-8000-000000000001";

describe("setGroupItemReaction", () => {
  it("maps the authoritative post-write summary row", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          item_id: itemId,
          very_you_count: 1,
          questionable_count: 0,
          want_it_too_count: 2,
          viewer_reaction: "want_it_too",
        },
      ],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      setGroupItemReaction(groupId, itemId, "want_it_too"),
    ).resolves.toEqual({
      kind: "confirmed",
      summary: {
        itemId,
        counts: { veryYou: 1, questionable: 0, wantItToo: 2 },
        viewerReaction: "want_it_too",
      },
    });
    expect(rpc).toHaveBeenCalledWith("set_group_item_reaction", {
      p_group_id: groupId,
      p_item_id: itemId,
      p_reaction: "want_it_too",
    });
  });

  it("passes null through for a removal", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          item_id: itemId,
          very_you_count: 0,
          questionable_count: 0,
          want_it_too_count: 0,
          viewer_reaction: null,
        },
      ],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      setGroupItemReaction(groupId, itemId, null),
    ).resolves.toMatchObject({
      kind: "confirmed",
      summary: { viewerReaction: null },
    });
    expect(rpc).toHaveBeenCalledWith("set_group_item_reaction", {
      p_group_id: groupId,
      p_item_id: itemId,
      p_reaction: null,
    });
  });

  it("maps an empty denial row to the generic unavailable outcome", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      setGroupItemReaction(groupId, itemId, "very_you"),
    ).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("maps a signed-out session to unavailable without calling the RPC", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null as never);

    await expect(
      setGroupItemReaction(groupId, itemId, "very_you"),
    ).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("maps an RPC error to retry", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "x" } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      setGroupItemReaction(groupId, itemId, "very_you"),
    ).resolves.toEqual({
      kind: "retry",
    });
  });
});

describe("getOwnItemReactionSummary", () => {
  it("maps the owner summary rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          item_id: itemId,
          very_you_count: 0,
          questionable_count: 1,
          want_it_too_count: 0,
        },
      ],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(getOwnItemReactionSummary()).resolves.toEqual([
      { itemId, counts: { veryYou: 0, questionable: 1, wantItToo: 0 } },
    ]);
  });

  it("returns zero rows on a signed-out session", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null as never);

    await expect(getOwnItemReactionSummary()).resolves.toEqual([]);
  });
});
