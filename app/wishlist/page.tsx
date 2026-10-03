import {
  loadOwnShareState,
  loadOwnPublicReactions,
  combineOwnerReactions,
} from "@/src/wishlist/public-share-data";
import { changeWishlistSharing } from "@/src/wishlist/public-share-actions";
import { ShareWishlistButton } from "@/src/wishlist/share-wishlist-button";
import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { resolveOwnWishlistView } from "@/src/wishlist/item-views";
import {
  refreshWishlistOrderAction,
  reorderWishlistItemAction,
} from "@/src/wishlist/reorder-actions";
import { deleteItemFromReorderAction } from "@/src/wishlist/item-actions";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { getOwnItemReactionSummary } from "@/src/groups/reactions/reaction-write";
import { WishlistView } from "@/src/wishlist/wishlist-view";

export const metadata: Metadata = {
  title: "Get Me This | My wishlist",
  description: "The things you'd secretly love to unwrap.",
};

/**
 * The protected wishlist display (005b). Protected at BOTH layers: the
 * proxy redirects anonymous requests for /wishlist first (302, no-store,
 * no-referrer — the same envelope /home and /onboarding receive), and this
 * page re-verifies the session with `requireCompleteProfile` before
 * reading data, so a proxy matcher gap is never the sole control (004e).
 *
 * The read is the caller's own rows under the owner-only RLS policies of
 * 005a (`src/wishlist/data.ts`). A missing wishlist row is an invariant
 * violation and renders the designed error state — never a fake empty
 * state and never raw error detail.
 */
export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { userId, email, profile } = await requireCompleteProfile();
  const { item: marker } = await searchParams;
  const notice =
    marker === "added" || marker === "updated" || marker === "deleted"
      ? marker
      : null;
  const [wishlist, groupReactionRows, publicReactionRows, shareState] =
    await Promise.all([
      resolveOwnWishlistView(userId),
      getOwnItemReactionSummary(),
      loadOwnPublicReactions(),
      loadOwnShareState(),
    ]);
  const reactionRows = combineOwnerReactions(
    groupReactionRows,
    publicReactionRows,
  );
  const ownItemIds = new Set(wishlist?.items.map((item) => item.id) ?? []);
  const reactionSummaries = Object.fromEntries(
    reactionRows
      .filter((row) => ownItemIds.has(row.itemId))
      .map((row) => [row.itemId, row]),
  );
  // requireCompleteProfile guarantees a non-blank display name.
  const displayName = profile.displayName as string;

  return (
    <div className="min-h-screen w-full bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader
        email={email}
        displayName={displayName}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
      />
      <WishlistView
        displayName={displayName}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
        wishlist={wishlist}
        reactionSummaries={reactionSummaries}
        shareControl={
          shareState ? (
            <ShareWishlistButton
              state={shareState}
              onChange={changeWishlistSharing}
            />
          ) : (
            <span className="text-sm text-content-muted">
              Sharing is temporarily unavailable.
            </span>
          )
        }
        notice={notice}
        reorderAction={reorderWishlistItemAction}
        refreshAction={refreshWishlistOrderAction}
        deleteAction={deleteItemFromReorderAction}
      />
    </div>
  );
}
