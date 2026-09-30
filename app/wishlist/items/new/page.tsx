import type { Metadata } from "next";

import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { requireCompleteProfile } from "@/src/profile/session";
import { WishlistShellHeader } from "@/src/wishlist/wishlist-shell-header";

export const metadata: Metadata = {
  title: "Get Me This | Add an item",
  description: "Add the first thing to your wishlist.",
};

/**
 * The interim add-route page (005b): a minimal, honest protected state at
 * `/wishlist/items/new` so the empty state's CTA is never a 404 dead end.
 * It carries no form, no extraction, and no mock data — item entry arrives
 * with 005c, which replaces this page's content; 005f extends the route
 * into the extraction state machine. The route is claimed now so it has
 * no signed-out exposure from the moment it exists.
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
        <section className="rounded-surface-2xl border-2 border-dashed border-outline-strong/35 bg-surface-raised px-6 py-12 text-center">
          <h1 className="font-display text-display-sm font-extrabold tracking-tight sm:text-display-md">
            Add an item
          </h1>
          <p className="mt-3 text-content-secondary">
            This is where adding items will live — it’s arriving with the next
            update. Your wishlist is safe and waiting.
          </p>
          <a
            href="/wishlist"
            className="mt-6 inline-flex min-h-touch-min items-center rounded-surface border-2 border-outline-strong bg-surface-raised px-6 font-bold text-content-primary shadow-chunk-sm transition-transform duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5"
          >
            Back to your wishlist
          </a>
        </section>
      </main>
    </div>
  );
}
