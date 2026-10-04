import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { publicWishlistBanner } from "./public-share-banner";
import { VIBE_OPTIONS } from "@/src/profile/vibe";
describe("public wishlist banner rendering", () => {
  it.each(VIBE_OPTIONS)(
    "renders a PNG in $label with long owner names",
    async ({ value }) => {
      const response = await publicWishlistBanner({
        displayName:
          "An owner with a very long name that still needs to remain readable",
        tasteLine: "A few things I would love",
        vibe: value,
        items: [],
      });
      const metadata = await sharp(
        Buffer.from(await response.arrayBuffer()),
      ).metadata();
      expect(metadata).toMatchObject({
        width: 1200,
        height: 630,
        format: "png",
      });
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    },
  );
});
