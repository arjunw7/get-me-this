import { AppShellLoading } from "@/src/home/app-shell-loading";

/**
 * The designed loading state for /wishlist (005b): skeleton panels
 * matching the card geometry — no fake items, no spinner-only page. The
 * pulse animation is neutralised globally under prefers-reduced-motion
 * (app/globals.css), so the state rests as static skeletons.
 */
export default function WishlistLoading() {
  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary lg:pl-64">
      <AppShellLoading />
      <div className="mx-auto w-full max-w-6xl px-5 pt-6 pb-16 sm:px-8 lg:pt-10">
        {/* Profile header card skeleton: accent band, avatar disc, name lines. */}
        <div className="overflow-hidden rounded-surface-2xl border-2 border-outline-strong bg-surface-raised shadow-chunk">
          <div className="h-24 animate-pulse bg-surface-sunken sm:h-28" />
          <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:px-7">
            <div className="-mt-12 h-24 w-24 animate-pulse rounded-full border-2 border-outline-strong bg-surface-sunken" />
            <div className="flex-1 space-y-2">
              <div className="h-7 w-48 animate-pulse rounded-surface bg-surface-sunken" />
              <div className="h-4 w-72 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
            </div>
          </div>
        </div>
        {/* Card grid skeleton matching the populated masonry geometry. */}
        <div
          className="mt-8 grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 lg:grid-cols-3"
          aria-hidden="true"
        >
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="h-80 animate-pulse rounded-surface-lg border-2 border-outline-strong bg-surface-raised shadow-chunk"
            />
          ))}
        </div>
        <p className="sr-only" role="status">
          Loading your wishlist.
        </p>
      </div>
    </div>
  );
}
