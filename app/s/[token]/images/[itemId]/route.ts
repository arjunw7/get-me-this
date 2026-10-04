import { loadPublicWishlistImage } from "@/src/wishlist/public-share-image";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; itemId: string }> },
) {
  const { token, itemId } = await params;
  const bytes = await loadPublicWishlistImage(token, itemId);
  return new Response(bytes ? new Uint8Array(bytes) : null, {
    status: bytes ? 200 : 404,
    headers: {
      "Content-Type": bytes ? "image/webp" : "text/plain",
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
