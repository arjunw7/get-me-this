import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  persist: vi.fn(),
  read: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// Action tests have no Next request/cookie scope. Keep storage signing isolated
// even when the verification runner has a configured local Supabase stack.
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/src/profile/session", () => ({
  requireCompleteProfile: mocks.gate,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./reorder-write", () => ({
  persistWishlistMove: mocks.persist,
}));
vi.mock("./data", () => ({ getOwnWishlist: mocks.read }));

import {
  refreshWishlistOrderAction,
  reorderWishlistItemAction,
} from "./reorder-actions";

const ownerId = "00000000-0000-4000-8000-000000000010";
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const items = [
  { id: secondId, title: "Second" },
  { id: firstId, title: "First" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue({
    userId: ownerId,
    email: null,
    profile: { displayName: "Ada", tasteLine: null },
  });
  mocks.read.mockResolvedValue({ wishlistId: "w-1", items });
});

describe("wishlist reorder actions", () => {
  it("gates before persistence and accepts no posted owner or wishlist id", async () => {
    const gateFailure = new Error("profile incomplete");
    mocks.gate.mockRejectedValue(gateFailure);

    await expect(
      reorderWishlistItemAction({
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 1,
      }),
    ).rejects.toBe(gateFailure);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("returns a fresh owner read after a confirmed move", async () => {
    mocks.persist.mockResolvedValue({ kind: "confirmed" });

    await expect(
      reorderWishlistItemAction({
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 1,
      }),
    ).resolves.toEqual({ status: "saved", items });
    expect(mocks.persist).toHaveBeenCalledWith({
      expectedIds: [firstId, secondId],
      movedItemId: firstId,
      targetIndex: 1,
    });
    expect(mocks.read).toHaveBeenCalledWith(ownerId);
    expect(mocks.revalidate).toHaveBeenCalledWith("/wishlist");
  });

  it.each([
    {
      name: "malformed UUID",
      input: {
        expectedIds: ["not-a-uuid", secondId],
        movedItemId: "not-a-uuid",
        targetIndex: 1,
      },
    },
    {
      name: "duplicate sequence",
      input: {
        expectedIds: [firstId, firstId],
        movedItemId: firstId,
        targetIndex: 1,
      },
    },
    {
      name: "fractional index",
      input: {
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 0.5,
      },
    },
    {
      name: "out-of-range index",
      input: {
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 2,
      },
    },
  ])(
    "returns data-free unavailable before RPC for $name",
    async ({ input }) => {
      await expect(reorderWishlistItemAction(input)).resolves.toEqual({
        status: "unavailable",
      });
      expect(mocks.persist).not.toHaveBeenCalled();
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );

  it("refetches stale or uncertain outcomes without claiming a new save", async () => {
    mocks.persist.mockResolvedValueOnce({ kind: "stale" });
    await expect(
      reorderWishlistItemAction({
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 1,
      }),
    ).resolves.toEqual({ status: "refreshed", items });

    mocks.persist.mockResolvedValueOnce({ kind: "uncertain" });
    await expect(
      reorderWishlistItemAction({
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 1,
      }),
    ).resolves.toEqual({ status: "refreshed", items });
  });

  it("keeps recovery unresolved when the authoritative refetch fails", async () => {
    mocks.persist.mockResolvedValue({ kind: "uncertain" });
    mocks.read.mockResolvedValue(null);

    await expect(
      reorderWishlistItemAction({
        expectedIds: [firstId, secondId],
        movedItemId: firstId,
        targetIndex: 1,
      }),
    ).resolves.toEqual({ status: "recovery" });
  });

  it("offers a read-only recovery action that never replays a move", async () => {
    await expect(refreshWishlistOrderAction()).resolves.toEqual({
      status: "refreshed",
      items,
    });
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledWith(ownerId);
  });
});
