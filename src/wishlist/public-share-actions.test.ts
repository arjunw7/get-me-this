import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc, revalidate } = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));
import {
  changeWishlistSharing,
  reactToPublicItem,
} from "./public-share-actions";
const token = "A".repeat(43),
  id = "12345678-1234-4123-8123-123456789012";
beforeEach(() => vi.clearAllMocks());
describe("public action boundary", () => {
  it("rejects malformed input before provider calls", async () => {
    expect(await reactToPublicItem("bad", id, null)).toEqual({
      kind: "unavailable",
    });
    expect(await reactToPublicItem(token, "bad", null)).toEqual({
      kind: "unavailable",
    });
    expect(await changeWishlistSharing("-1", true)).toEqual({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("denied writes do not report success", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await reactToPublicItem(token, id, "very_you")).toEqual({
      kind: "unavailable",
    });
    expect(await changeWishlistSharing("0", false)).toEqual({
      status: "error",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("confirms authoritative set/switch/remove summaries", async () => {
    for (const reaction of ["very_you", "want_it_too", null] as const) {
      rpc.mockResolvedValue({
        data: [
          {
            item_id: id,
            very_you_count: 0,
            questionable_count: 0,
            want_it_too_count: reaction ? 1 : 0,
            viewer_reaction: reaction,
          },
        ],
        error: null,
      });
      expect((await reactToPublicItem(token, id, reaction)).kind).toBe(
        "confirmed",
      );
      expect(rpc).toHaveBeenLastCalledWith("set_public_wishlist_reaction", {
        p_token: token,
        p_item_id: id,
        p_reaction: reaction,
      });
    }
  });
  it("does not trust mismatched item responses", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          item_id: "22345678-1234-4123-8123-123456789012",
          very_you_count: 0,
          questionable_count: 0,
          want_it_too_count: 0,
          viewer_reaction: null,
        },
      ],
      error: null,
    });
    expect(await reactToPublicItem(token, id, null)).toEqual({ kind: "retry" });
  });
  it("revokes with version and only returns owner state", async () => {
    rpc.mockResolvedValue({
      data: [{ enabled: false, version: 1, share_token: null }],
      error: null,
    });
    expect(await changeWishlistSharing("0", false)).toEqual({
      status: "saved",
      state: { enabled: false, version: "1", shareToken: null },
    });
    expect(rpc).toHaveBeenCalledWith("revoke_wishlist_share", {
      p_expected_version: "0",
    });
  });
  it("keeps errors generic", async () => {
    rpc.mockRejectedValue(new Error("secret"));
    expect(await reactToPublicItem(token, id, null)).toEqual({ kind: "retry" });
    expect(await changeWishlistSharing("0", true)).toEqual({ status: "error" });
  });
});
