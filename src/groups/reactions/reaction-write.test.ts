import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";

import {
  getOwnItemReactionSummary,
  getGroupItemReactionSnapshot,
  setGroupItemReaction,
} from "./reaction-write";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

const groupId = "00000000-0000-4000-8000-0000000000a1";
const itemId = "00000000-0000-4000-8000-000000000001";
const writeRow = {
  very_you_count: 1,
  questionable_count: 0,
  want_it_too_count: 0,
  viewer_reaction: "very_you",
};

describe("setGroupItemReaction", () => {
  it("maps the exact SQL write result, which has no item_id, to the requested item", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
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

  it.each([
    ["negative", -1],
    ["fractional", 0.5],
    ["non-finite", Infinity],
    ["not a number", NaN],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["numeric string", "1"],
    ["missing", undefined],
  ])(
    "refuses a %s count instead of confirming an invalid summary",
    async (_label, count) => {
      for (const field of [
        "very_you_count",
        "questionable_count",
        "want_it_too_count",
      ]) {
        const rpc = vi.fn().mockResolvedValue({
          data: [{ ...writeRow, [field]: count }],
          error: null,
        });
        vi.mocked(createSupabaseServerClient).mockResolvedValue({
          rpc,
        } as never);
        await expect(
          setGroupItemReaction(groupId, itemId, "very_you"),
        ).resolves.toEqual({ kind: "retry" });
      }
    },
  );

  it.each([
    { data: [null] },
    { data: ["invalid"] },
    { data: [writeRow, writeRow] },
    { data: writeRow },
    { data: [{ ...writeRow, viewer_reaction: "unknown" }] },
    { data: [{ ...writeRow, viewer_reaction: undefined }] },
  ])("fails safely for a malformed write response %#", async ({ data }) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
    await expect(
      setGroupItemReaction(groupId, itemId, "very_you"),
    ).resolves.toEqual({ kind: "retry" });
  });

  it.each([
    ["invalid", itemId, "very_you"],
    [groupId, "invalid", "very_you"],
    [groupId, itemId, "unknown"],
  ])(
    "rejects malformed request values before reaching the database %#",
    async (group, item, reaction) => {
      await expect(
        setGroupItemReaction(group, item, reaction as "very_you"),
      ).resolves.toEqual({ kind: "unavailable" });
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
    },
  );
});

describe("getGroupItemReactionSnapshot", () => {
  it("continues to use each read row's item_id and skips malformed rows", async () => {
    const secondId = "00000000-0000-4000-8000-000000000002";
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { ...writeRow, item_id: itemId },
        { ...writeRow, item_id: secondId, viewer_reaction: null },
        writeRow,
        null,
        { ...writeRow, item_id: itemId, very_you_count: -1 },
      ],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
    await expect(
      getGroupItemReactionSnapshot(groupId, secondId),
    ).resolves.toEqual([
      {
        itemId,
        counts: { veryYou: 1, questionable: 0, wantItToo: 0 },
        viewerReaction: "very_you",
      },
      {
        itemId: secondId,
        counts: { veryYou: 1, questionable: 0, wantItToo: 0 },
        viewerReaction: null,
      },
    ]);
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
