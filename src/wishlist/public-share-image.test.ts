import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc, download, normalize, create } = vi.hoisted(() => ({
  rpc: vi.fn(),
  download: vi.fn(),
  normalize: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: create }));
vi.mock("./extraction/image-normalizer", () => ({
  normalizeCandidateImage: normalize,
}));
vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
import { loadPublicWishlistImage } from "./public-share-image";
const token = "A".repeat(43),
  owner = "12345678-1234-4123-8123-123456789012",
  item = "22345678-1234-4123-8123-123456789012";
const row = {
  owner_id: owner,
  image_snapshot_path: `${owner}/${item}.webp`,
  image_url: "https://example.com/photo.jpg",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:58321");
  vi.stubEnv("SUPABASE_SERVICE_KEY", "test-only");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  create.mockReturnValue({ rpc, storage: { from: () => ({ download }) } });
});
describe("public image authorization", () => {
  it("accepts the documented server-only service configuration", async () => {
    vi.stubEnv("SUPABASE_SERVICE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-role-only");
    rpc.mockResolvedValue({ data: [], error: null });
    await loadPublicWishlistImage(token, item);
    expect(create).toHaveBeenCalledWith(
      "http://127.0.0.1:58321",
      "test-role-only",
      expect.any(Object),
    );
  });
  it("denies invalid tokens without privileged access", async () => {
    expect(await loadPublicWishlistImage("bad", item)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it("denies unknown or revoked links before fetching images", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await loadPublicWishlistImage(token, item)).toBeNull();
    expect(download).not.toHaveBeenCalled();
    expect(normalize).not.toHaveBeenCalled();
  });
  it("refuses paths belonging to another owner", async () => {
    rpc.mockResolvedValue({
      data: [{ ...row, image_snapshot_path: `${item}/${item}.webp` }],
      error: null,
    });
    expect(await loadPublicWishlistImage(token, item)).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });
  it("serves only private image bytes and rechecks revocation", async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    download.mockResolvedValue({
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null,
    });
    expect(await loadPublicWishlistImage(token, item)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(normalize).not.toHaveBeenCalled();
  });
  it("does not return an image revoked during fetch", async () => {
    rpc
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    download.mockResolvedValue({ data: new Blob(["image"]), error: null });
    expect(await loadPublicWishlistImage(token, item)).toBeNull();
  });
  it("uses the SSRF-safe normalizer for remote fallback", async () => {
    rpc.mockResolvedValue({
      data: [{ ...row, image_snapshot_path: null }],
      error: null,
    });
    normalize.mockResolvedValue(new Uint8Array([1]));
    expect(await loadPublicWishlistImage(token, item)).toEqual(
      new Uint8Array([1]),
    );
    expect(normalize).toHaveBeenCalledWith(row.image_url);
  });
  it("rejects oversized normalized bytes", async () => {
    rpc.mockResolvedValue({
      data: [{ ...row, image_snapshot_path: null }],
      error: null,
    });
    normalize.mockResolvedValue(new Uint8Array(5 * 1024 * 1024 + 1));
    expect(await loadPublicWishlistImage(token, item)).toBeNull();
  });
  it("coalesces identical work and caps concurrent image fetches", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    rpc.mockImplementation(async () => {
      await barrier;
      return { data: [], error: null };
    });
    const first = loadPublicWishlistImage(token, item);
    const duplicate = loadPublicWishlistImage(token, item);
    const other = Array.from({ length: 31 }, (_, i) =>
      loadPublicWishlistImage(
        token,
        `${(i + 3).toString(16).padStart(8, "0")}-1234-4123-8123-123456789012`,
      ),
    );
    expect(
      await loadPublicWishlistImage(
        token,
        "ffffffff-1234-4123-8123-123456789012",
      ),
    ).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(4);
    release();
    expect(await Promise.all([first, duplicate, ...other])).toEqual(
      Array(33).fill(null),
    );
    await loadPublicWishlistImage(token, item);
    expect(rpc).toHaveBeenCalledTimes(33);
  });
});
