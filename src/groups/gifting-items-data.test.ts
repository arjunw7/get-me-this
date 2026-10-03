import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, client } = vi.hoisted(() => ({ rpc: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: client,
}));
import { loadGiftingItemStates } from "./gifting-items-data";
describe("private gifting item states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.mockResolvedValue({ rpc });
  });
  it("does not read reservations for a recipient's own wishlist", async () => {
    expect(await loadGiftingItemStates("group", "owner", "owner")).toEqual({});
    expect(client).not.toHaveBeenCalled();
  });
  it("maps only the reviewed boolean projection by item id", async () => {
    rpc.mockResolvedValue({
      data: [
        { item_id: "two", viewer_reserved: false, reserved_by_other: true },
        { item_id: "one", viewer_reserved: true, reserved_by_other: false },
      ],
      error: null,
    });
    expect(await loadGiftingItemStates("group", "friend", "viewer")).toEqual({
      two: "other",
      one: "yours",
    });
    expect(rpc).toHaveBeenCalledWith("member_wishlist_gifting_snapshot", {
      p_group_id: "group",
      p_member_id: "friend",
    });
  });
  it("does not infer unreserved controls from a denied or malformed read", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await loadGiftingItemStates("group", "friend", "viewer")).toEqual(
      {},
    );
    rpc.mockResolvedValue({
      data: [
        { item_id: "one", viewer_reserved: true, reserved_by_other: true },
      ],
      error: null,
    });
    expect(await loadGiftingItemStates("group", "friend", "viewer")).toEqual(
      {},
    );
  });
});
