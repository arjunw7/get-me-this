// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Snapshot-first display resolution (005f): the client-safe view carries
 * the signed snapshot URL, then image_url, then null (placeholder), and
 * never the raw storage path.
 */

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/src/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("./data", () => ({
  getOwnWishlist: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { toItemView } from "./display";
import type { WishlistItemSnapshot } from "./display";
import { getOwnWishlist } from "./data";
import { resolveOwnWishlistView, toItemViews } from "./item-views";

const OWNER = "00000000-0000-4000-8000-00000000000a";

function snapshot(
  overrides: Partial<WishlistItemSnapshot> = {},
): WishlistItemSnapshot {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Ceramic pour-over coffee set",
    sourceUrl: "https://example.invalid/products/pour-over-set",
    retailer: "Fixture Roasters",
    imageUrl: null,
    imageSnapshotPath: null,
    note: null,
    desireLevel: "really_want",
    sortPosition: 1,
    originalAmountMinor: "249900",
    originalCurrency: "INR",
    converted: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

function storageClient(
  signed: Record<string, string> = {},
  fails = false,
): unknown {
  return {
    storage: {
      from(bucket: string) {
        if (bucket !== "wishlist-item-snapshots")
          throw new Error(`unexpected bucket ${bucket}`);
        return {
          async createSignedUrls(paths: string[]) {
            if (fails) return { data: null, error: new Error("boom") };
            return {
              data: paths.map((path) => ({
                path,
                signedUrl: signed[path] ?? null,
              })),
              error: null,
            };
          },
        };
      },
    },
  };
}

beforeEach(() => {
  mocks.createSupabaseServerClient.mockReset();
});

describe("toItemView", () => {
  it("strips the raw storage path and resolves the signed URL first", () => {
    const view = toItemView(
      snapshot({
        imageSnapshotPath: `${OWNER}/s.webp`,
        imageUrl: "https://img.example/remote.jpg",
      }),
      "https://storage.example/signed/s.webp",
    );
    expect(view.imageSrc).toBe("https://storage.example/signed/s.webp");
    expect(Object.hasOwn(view, "imageSnapshotPath")).toBe(false);
    expect(Object.hasOwn(view, "imageUrl")).toBe(false);
    expect(JSON.stringify(view)).not.toContain(`${OWNER}/s.webp`);
  });

  it("falls back to the remote image_url when no signed URL exists", () => {
    const view = toItemView(
      snapshot({
        imageSnapshotPath: `${OWNER}/s.webp`,
        imageUrl: "https://img.example/remote.jpg",
      }),
      null,
    );
    expect(view.imageSrc).toBe("https://img.example/remote.jpg");
  });

  it("resolves to the placeholder (null) for an image-less item", () => {
    const view = toItemView(snapshot(), null);
    expect(view.imageSrc).toBeNull();
  });
});

describe("toItemViews", () => {
  it("creates signed URLs only for items with snapshot paths and keeps the fallback order", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(
      storageClient({ [`${OWNER}/a.webp`]: "https://signed.example/a" }),
    );
    const views = await toItemViews([
      snapshot({
        id: "00000000-0000-4000-8000-0000000000a1",
        imageSnapshotPath: `${OWNER}/a.webp`,
        imageUrl: "https://img.example/a-remote.jpg",
      }),
      snapshot({
        id: "00000000-0000-4000-8000-0000000000a2",
        imageUrl: "https://img.example/b-remote.jpg",
      }),
      snapshot({ id: "00000000-0000-4000-8000-0000000000a3" }),
    ]);

    expect(views.map((view) => view.imageSrc)).toEqual([
      "https://signed.example/a", // snapshot first
      "https://img.example/b-remote.jpg", // image_url fallback
      null, // placeholder
    ]);
    for (const view of views) {
      expect(Object.hasOwn(view, "imageSnapshotPath")).toBe(false);
    }
  });

  it("a signed-URL failure degrades to the image_url fallback without throwing", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(storageClient({}, true));
    const views = await toItemViews([
      snapshot({
        imageSnapshotPath: `${OWNER}/a.webp`,
        imageUrl: "https://img.example/a-remote.jpg",
      }),
    ]);
    expect(views[0].imageSrc).toBe("https://img.example/a-remote.jpg");
  });

  it("requests no storage signing at all for an image-less list", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(storageClient());
    const views = await toItemViews([snapshot()]);
    expect(views).toHaveLength(1);
    expect(views[0].imageSrc).toBeNull();
  });
});

describe("resolveOwnWishlistView", () => {
  it("maps the owner's wishlist into client-safe views", async () => {
    const mocked = getOwnWishlist as unknown as ReturnType<typeof vi.fn>;
    mocked.mockResolvedValue({
      wishlistId: "w-1",
      items: [
        snapshot({
          imageSnapshotPath: `${OWNER}/s.webp`,
          imageUrl: "https://img.example/remote.jpg",
        }),
      ],
    });
    mocks.createSupabaseServerClient.mockResolvedValue(
      storageClient({ [`${OWNER}/s.webp`]: "https://signed.example/s" }),
    );

    const view = await resolveOwnWishlistView(OWNER);
    expect(view).toEqual({
      wishlistId: "w-1",
      items: [
        expect.objectContaining({
          imageSrc: "https://signed.example/s",
        }),
      ],
    });
    expect(JSON.stringify(view)).not.toContain(`${OWNER}/s.webp`);
  });

  it("passes the missing-wishlist invariant through as null", async () => {
    const mocked = getOwnWishlist as unknown as ReturnType<typeof vi.fn>;
    mocked.mockResolvedValue(null);
    expect(await resolveOwnWishlistView(OWNER)).toBeNull();
  });
});
