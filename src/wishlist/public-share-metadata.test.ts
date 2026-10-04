import { describe, expect, it } from "vitest";
import { publicWishlistMetadata } from "./public-share-metadata";
import type { PublicWishlistView } from "./public-share-types";
const token = "A".repeat(43);
const snapshot: PublicWishlistView = {
  displayName: "Arjun",
  tasteLine: "My cart is a personality",
  vibe: "acid_lime",
  viewerIsOwner: false,
  items: [],
};
describe("public wishlist metadata", () => {
  it("uses the active wishlist banner and configured site origin", () => {
    const result = publicWishlistMetadata(
      snapshot,
      token,
      new URL("https://getmethis.fun"),
    );
    expect(result.openGraph).toMatchObject({
      title: "Arjun’s wishlist | Get Me This",
      images: [
        {
          url: `https://getmethis.fun/s/${token}/preview`,
          width: 1200,
          height: 630,
        },
      ],
    });
    expect(result.twitter).toMatchObject({
      card: "summary_large_image",
      images: [`https://getmethis.fun/s/${token}/preview`],
    });
    expect(result.robots).toEqual({ index: false, follow: false });
  });
  it.each([null, snapshot])(
    "does not attach a banner to an invalid capability",
    (value) => {
      expect(
        publicWishlistMetadata(
          value,
          "invalid",
          new URL("https://getmethis.fun"),
        ).openGraph,
      ).toMatchObject({ images: [] });
    },
  );
  it("does not expose stale personal metadata after revocation", () => {
    const result = publicWishlistMetadata(
      null,
      token,
      new URL("https://getmethis.fun"),
    );
    expect(JSON.stringify(result)).not.toContain("Arjun");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result.openGraph).toMatchObject({ images: [] });
  });
});
