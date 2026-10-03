import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { loadPublicWishlist } from "@/src/wishlist/public-share-data";
import { reactToPublicItem } from "@/src/wishlist/public-share-actions";
import { PublicWishlistView } from "@/src/wishlist/public-wishlist-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "A wishlist for you | Get Me This",
  description:
    "A few things they'd love. Browse their wishlist and sign in to react.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SharedWishlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const snapshot = await loadPublicWishlist(token);
  if (!snapshot) notFound();
  const client = await createSupabaseServerClient();
  const user = client ? (await client.auth.getUser()).data.user : null;
  return (
    <div className="ph-no-capture" data-ph-no-capture>
      <PublicWishlistView
        token={token}
        snapshot={snapshot}
        signedIn={Boolean(user)}
        signinHref={`/auth?intent=public-wishlist&share=${token}`}
        onReact={reactToPublicItem.bind(null, token)}
      />
    </div>
  );
}
