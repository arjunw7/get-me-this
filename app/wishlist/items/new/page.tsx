import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { createDraftDefaults } from "@/src/wishlist/item-drafts";
import { ItemForm } from "@/src/wishlist/item-form";

export const metadata: Metadata = {
  title: "Get Me This | Add an item",
  description: "Add the first thing to your wishlist.",
};

/**
 * Protected, manual wishlist entry. No extraction or third-party URL fetch
 * happens in this route.
 */
export default async function NewWishlistItemPage() {
  const { userId, email, profile } = await requireCompleteProfile();
  // requireCompleteProfile guarantees a non-blank display name.
  const displayName = profile.displayName as string;

  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader email={email} displayName={displayName} />
      <main className="mx-auto w-full max-w-[var(--spacing-content-max)] px-5 pt-10 pb-16 sm:px-8">
        <ItemForm mode="create" initialDraft={createDraftDefaults(crypto.randomUUID())} />
      </main>
    </div>
  );
}
