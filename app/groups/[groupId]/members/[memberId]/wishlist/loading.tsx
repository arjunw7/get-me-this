/**
 * The designed loading state for the member wishlist browse route (brief
 * 006e): the browse screen's broad back-link, member-header, and grid
 * geometry with no names, counts, item titles, or inferred membership. No
 * skeleton width encodes private text length; the pulse animation rests
 * static under prefers-reduced-motion (app/globals.css). It renders
 * nothing private and is never cached (the proxy's protected-route no-store
 * policy covers this path).
 */
export default function MemberWishlistLoading() {
  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <div
        role="status"
        aria-label="Loading the shared wishlist"
        className="mx-auto w-full max-w-4xl px-gutter py-10 sm:py-14"
      >
        <div className="h-6 w-40 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-6 flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-full bg-surface-sunken" />
          <div className="h-12 w-full max-w-96 animate-pulse rounded-surface bg-surface-sunken" />
        </div>
        <ul
          className="mt-10 grid list-none gap-5 sm:grid-cols-2"
          aria-hidden="true"
        >
          {[0, 1, 2].map((slot) => (
            <li
              key={slot}
              className="overflow-hidden rounded-surface-lg border-2 border-outline-strong bg-surface-raised shadow-chunk"
            >
              <div className="aspect-[4/3] animate-pulse bg-surface-sunken" />
              <div className="p-4">
                <div className="h-6 w-full max-w-56 animate-pulse rounded-surface bg-surface-sunken" />
                <div className="mt-2 h-5 w-32 animate-pulse rounded-surface bg-surface-sunken" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
