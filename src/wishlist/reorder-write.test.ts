import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/src/supabase/server";

import { persistWishlistMove } from "./reorder-write";

vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const expectedIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];

beforeEach(() => vi.clearAllMocks());

describe("persistWishlistMove", () => {
  it("passes only the exact sequence, moved item, and target index to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "moved", ordered_ids: [...expectedIds].reverse() }],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      persistWishlistMove({
        expectedIds,
        movedItemId: expectedIds[0],
        targetIndex: 1,
      }),
    ).resolves.toEqual({ kind: "confirmed" });
    expect(rpc).toHaveBeenCalledWith("reorder_wishlist_item", {
      expected_ids: expectedIds,
      moved_item_id: expectedIds[0],
      target_index: 1,
    });
  });

  it("keeps stale, unavailable, and uncertain outcomes data-free", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ result: "stale", ordered_ids: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ result: "unavailable", ordered_ids: null }],
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST000" } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);
    const input = {
      expectedIds,
      movedItemId: expectedIds[0],
      targetIndex: 1,
    };

    await expect(persistWishlistMove(input)).resolves.toEqual({
      kind: "stale",
    });
    await expect(persistWishlistMove(input)).resolves.toEqual({
      kind: "unavailable",
    });
    await expect(persistWishlistMove(input)).resolves.toEqual({
      kind: "uncertain",
    });
  });

  it("treats a malformed confirmed response as uncertain", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ result: "moved", ordered_ids: [expectedIds[0]] }],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ rpc } as never);

    await expect(
      persistWishlistMove({
        expectedIds,
        movedItemId: expectedIds[0],
        targetIndex: 1,
      }),
    ).resolves.toEqual({ kind: "uncertain" });
  });
});
