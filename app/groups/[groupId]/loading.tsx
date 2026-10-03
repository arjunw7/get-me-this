/**
 * The designed loading state for the private group room (brief 006d): the
 * room's broad header and roster geometry with no names, counts, budget,
 * location, or inferred membership. No skeleton width encodes private text
 * length; the pulse animation rests static under prefers-reduced-motion
 * (app/globals.css). It renders nothing private and is never cached (the
 * proxy's protected-route no-store policy covers this path).
 */
export default function GroupRoomLoading() {
  return (
    <main className="min-h-screen w-full bg-surface-page text-content-primary">
      <div
        role="status"
        aria-label="Loading the group room"
        className="mx-auto w-full max-w-2xl px-gutter py-10 sm:py-14"
      >
        <div className="h-7 w-28 animate-pulse rounded-pill border-2 border-outline-strong bg-surface-sunken" />
        <div className="mt-4 h-12 w-full max-w-96 animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-3 h-6 w-56 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-4 h-6 w-40 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-10 h-8 w-32 animate-pulse rounded-surface bg-surface-sunken" />
        <ul className="mt-4 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <li
              key={slot}
              className="flex items-center gap-3 rounded-surface border-2 border-outline-strong bg-surface-raised px-4 py-3 shadow-chunk-sm"
            >
              <span className="h-10 w-10 animate-pulse rounded-full bg-surface-sunken" />
              <span className="h-5 w-full max-w-56 animate-pulse rounded-surface bg-surface-sunken" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
