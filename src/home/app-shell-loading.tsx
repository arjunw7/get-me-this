/** Stable shell geometry while authenticated data is loading. */
export function AppShellLoading() {
  return (
    <div aria-hidden="true">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r-2 border-outline-strong bg-surface-page px-7 py-7 lg:block">
        <div className="h-8 w-40 animate-pulse rounded-surface bg-surface-sunken" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="h-12 animate-pulse rounded-surface bg-surface-sunken"
            />
          ))}
        </div>
      </aside>
      <div className="flex h-14 items-center justify-between border-b-2 border-outline-strong px-4 lg:hidden">
        <div className="h-7 w-36 animate-pulse rounded-surface bg-surface-sunken" />
        <div className="h-8 w-8 animate-pulse rounded-full bg-surface-sunken" />
      </div>
      <div className="fixed inset-x-0 bottom-0 h-[70px] border-t-2 border-outline-strong bg-surface-page lg:hidden" />
    </div>
  );
}
