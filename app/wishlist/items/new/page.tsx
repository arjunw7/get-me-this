import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";
import { AddItemFlow } from "@/src/wishlist/add-item-flow";

export const metadata: Metadata = {
  title: "Get Me This | Add an item",
  description: "Add the first thing to your wishlist.",
};
export const dynamic = "force-dynamic";

/**
 * The protected add-item flow (005f): initial URL entry, bounded same-origin
 * extraction, explicit review, and the manual fallback, replacing 005c's
 * interim manual page. All remote page fetching is server-side behind the
 * 005e extract route; the pasted URL is carried in the route as `?url=`
 * (the V18 starter-pick `?pick=` handoff is an omitted feature and is not
 * honoured here).
 */
export default async function NewWishlistItemPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { userId, email, profile } = await requireCompleteProfile();
  const { url } = await searchParams;
  // Only a bounded, non-blank value seeds the field: blankness and the
  // 2048-character bound are checked here — not the URL's shape, which is
  // the flow's own validation job. Anything else is treated as absent and
  // the field starts empty. The value is rendered as a controlled input
  // value, never as HTML.
  const initialUrl =
    url && url.trim().length > 0 && url.length <= 2048 ? url : undefined;
  // requireCompleteProfile guarantees a non-blank display name.
  const displayName = profile.displayName as string;

  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <AnalyticsIdentity userId={userId} />
      <WishlistShellHeader email={email} displayName={displayName} />
      <main
        className={`mx-auto w-full px-5 pt-10 pb-16 sm:px-8 ${
          initialUrl ? "max-w-4xl" : "max-w-[var(--spacing-content-max)]"
        }`}
      >
        <AddItemFlow initialUrl={initialUrl ?? ""} />
      </main>
    </div>
  );
}
