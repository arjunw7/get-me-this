import { beforeEach, describe, expect, it, vi } from "vitest";
const { load, banner } = vi.hoisted(() => ({ load: vi.fn(), banner: vi.fn() }));
vi.mock("@/src/wishlist/public-share-data", () => ({
  loadPublicWishlist: load,
}));
vi.mock("@/src/wishlist/public-share-banner", () => ({
  publicWishlistBanner: banner,
}));
import { GET } from "../../app/s/[token]/preview/route";
beforeEach(() => vi.resetAllMocks());
describe("public wishlist preview authorization", () => {
  it("returns 404 for unknown, malformed, or revoked links without rendering", async () => {
    load.mockResolvedValue(null);
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ token: "invalid" }),
    });
    expect(response.status).toBe(404);
    expect(banner).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("renders only the authorised public snapshot", async () => {
    const snapshot = { displayName: "Arjun" };
    load.mockResolvedValue(snapshot);
    banner.mockResolvedValue(new Response("image"));
    await GET(new Request("https://example.test"), {
      params: Promise.resolve({ token: "A".repeat(43) }),
    });
    expect(banner).toHaveBeenCalledWith(snapshot);
  });
});
