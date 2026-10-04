import { AppShellLoading } from "@/src/home/app-shell-loading";
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
    <main className="min-h-screen w-full bg-surface-page pb-40 text-content-primary lg:pl-64">
      <AppShellLoading />
      <div
        role="status"
        aria-label="Loading the group room"
        className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8"
      >
        <div className="mb-8 h-64 w-full animate-pulse rounded-[32px] border-2 border-outline-strong bg-accent-highlight/30" />
        <div className="h-7 w-28 animate-pulse rounded-pill border-2 border-outline-strong bg-surface-sunken" />
        <div className="mt-4 h-12 w-full max-w-96 animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-3 h-6 w-56 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-4 h-6 w-40 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-10 h-8 w-32 animate-pulse rounded-surface bg-surface-sunken" />
        <ul className="mt-4 flex gap-4 overflow-hidden" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <li
              key={slot}
              className="flex w-20 shrink-0 flex-col items-center gap-3"
            >
              <span className="h-16 w-16 animate-pulse rounded-full bg-surface-sunken" />
              <span className="h-5 w-full max-w-56 animate-pulse rounded-surface bg-surface-sunken" />
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
