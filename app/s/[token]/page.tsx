import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/src/supabase/server";
import { loadPublicWishlist } from "@/src/wishlist/public-share-data";
import { reactToPublicItem } from "@/src/wishlist/public-share-actions";
import { PublicWishlistView } from "@/src/wishlist/public-wishlist-view";

import { publicSiteOrigin } from "@/src/brand/metadata";
import { publicWishlistMetadata } from "@/src/wishlist/public-share-metadata";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const snapshot = await loadPublicWishlist(token);
  const origin = publicSiteOrigin(process.env);
  return publicWishlistMetadata(snapshot, token, origin);
}
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
