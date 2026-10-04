import type { Metadata } from "next";
import { parsePublicShareToken } from "./public-share-token";
import type { PublicWishlistView } from "./public-share-types";

export function publicWishlistMetadata(
  snapshot: PublicWishlistView | null,
  token: string,
  origin?: URL,
): Metadata {
  const active = snapshot && parsePublicShareToken(token);
  const title = active
    ? `${snapshot.displayName}’s wishlist | Get Me This`
    : "Wishlist unavailable | Get Me This";
  const description = active
    ? snapshot.tasteLine ||
      "A few things they'd love. Take a peek at their wishlist."
    : "This wishlist link is unavailable.";
  const images =
    active && origin
      ? [
          {
            url: new URL(`/s/${token}/preview`, origin).href,
            width: 1200,
            height: 630,
            type: "image/png",
            alt: `${snapshot.displayName}’s wishlist on Get Me This`,
          },
        ]
      : [];
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: { title, description, type: "website", images },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((image) => image.url),
    },
  };
}
