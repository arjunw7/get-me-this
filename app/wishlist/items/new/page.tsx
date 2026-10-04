import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { AddItemHeader } from "@/src/wishlist/add-item-header";
import { getStarterIdea } from "@/src/home/starter-ideas";
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
 * and allowlisted starter prompts in `?pick=` seed an editable note only.
 */
export default async function NewWishlistItemPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; pick?: string }>;
}) {
  const { userId } = await requireCompleteProfile();
  const { url, pick } = await searchParams;
  const starterIdea = getStarterIdea(pick);
  // Only a bounded, non-blank value seeds the field: blankness and the
  // 2048-character bound are checked here — not the URL's shape, which is
  // the flow's own validation job. Anything else is treated as absent and
  // the field starts empty. The value is rendered as a controlled input
  // value, never as HTML.
  const initialUrl =
    url && url.trim().length > 0 && url.length <= 2048 ? url : undefined;

  return (
    <div className="min-h-screen w-full bg-surface-page pb-32 text-content-primary sm:pb-16">
      <AnalyticsIdentity userId={userId} />
      <AddItemHeader />
      {/* ARJ-62: the column width follows the flow's client-side step, not
          the server-known ?url= param. Pinning the width here crushed the
          005f review/manual form into the 520px entry column on the
          paste-into-empty-page path (sliver inputs, overlapping fields);
          add-item-flow.tsx now owns the per-step width. */}
      <main className="mx-auto w-full px-5 pt-8 pb-16 sm:px-8 sm:pt-12">
        <AddItemFlow initialUrl={initialUrl ?? ""} starterIdea={starterIdea} />
      </main>
    </div>
  );
}
