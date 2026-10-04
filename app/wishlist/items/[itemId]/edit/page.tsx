import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { editDraftDefaults } from "@/src/wishlist/item-drafts";
import { ItemForm } from "@/src/wishlist/item-form";
import { loadOwnItemForEdit, type EditItem } from "@/src/wishlist/item-write";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";

export const metadata: Metadata = { title: "Get Me This | Edit item" };
export const dynamic = "force-dynamic";

function Unavailable({
  retry = false,
  itemId,
}: {
  retry?: boolean;
  itemId: string;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="font-display text-display-sm font-extrabold">
        {retry ? "We couldn’t load this item." : "This item isn’t available."}
      </h1>
      <p className="mt-3 text-content-secondary">
        Try again, or return to your wishlist.
      </p>
      <a
        href="/wishlist"
        className="mt-6 inline-flex min-h-touch-min items-center rounded-surface border-2 border-outline-strong px-5 font-bold"
      >
        Back to your wishlist
      </a>
      {retry ? (
        <a
          href={`/wishlist/items/${itemId}/edit`}
          className="ml-4 inline-flex min-h-touch-min items-center font-bold underline"
        >
          Try again
        </a>
      ) : null}
    </main>
  );
}

export default async function EditWishlistItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { userId, email, profile } = await requireCompleteProfile();
  const { itemId } = await params;
  const validId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      itemId,
    );
  let item: EditItem | null | undefined = null;
  if (validId) {
    item = undefined;
    try {
      item = await loadOwnItemForEdit(userId, itemId);
    } catch {
      item = undefined;
    }
  }
  return (
    <div className="min-h-screen bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader
        email={email}
        displayName={profile.displayName as string}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
      />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {item === undefined ? (
          <Unavailable retry itemId={itemId} />
        ) : item === null ? (
          <Unavailable itemId={itemId} />
        ) : (
          <ItemForm
            mode="edit"
            itemId={itemId}
            item={item}
            initialDraft={editDraftDefaults(item)}
          />
        )}
      </main>
    </div>
  );
}
