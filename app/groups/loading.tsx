import { AppShellLoading } from "@/src/home/app-shell-loading";

/** Prefetchable feedback while membership-scoped group data is fetched. */
export default function GroupsLoading() {
  return (
    <div className="min-h-screen bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <AppShellLoading />
      <main className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8 lg:pt-10">
        <p role="status" className="sr-only">
          Loading your groups.
        </p>
        <div aria-hidden="true">
          <div className="h-10 w-64 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
          <div className="mt-2 h-6 w-96 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
          <div className="mt-6 grid grid-cols-1 gap-4">
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="flex items-center gap-3 rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk"
              >
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-surface bg-surface-sunken" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-6 w-48 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
                  <div className="h-4 w-72 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
