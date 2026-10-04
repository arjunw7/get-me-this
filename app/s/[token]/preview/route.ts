import { loadPublicWishlist } from "@/src/wishlist/public-share-data";
import { publicWishlistBanner } from "@/src/wishlist/public-share-banner";
import { PUBLIC_SHARE_IMAGE_HEADERS } from "@/src/wishlist/public-share-image-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const snapshot = await loadPublicWishlist(token);
  if (!snapshot)
    return new Response("Preview unavailable", {
      status: 404,
      headers: PUBLIC_SHARE_IMAGE_HEADERS,
    });
  return publicWishlistBanner(snapshot);
}
