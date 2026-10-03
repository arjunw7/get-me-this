/**
 * The designed loading state for the authenticated Home: the same shell as
 * HomeScreen with animated placeholder blocks, never a browser-default
 * blank or spinner. Respects reduced-motion preferences through the app's
 * motion tokens.
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen w-full animate-pulse bg-surface-page text-content-primary motion-reduce:animate-none">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <div className="h-8 w-40 rounded-surface bg-surface-sunken" />
        <div className="h-11 w-28 rounded-surface bg-surface-sunken" />
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[1fr_18rem] lg:pt-14">
        <section>
          <div className="h-12 w-72 rounded-surface bg-surface-sunken" />
          <div className="mt-4 h-6 w-96 max-w-full rounded-surface bg-surface-sunken" />
          <div className="mt-10 h-7 w-36 rounded-surface bg-surface-sunken" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="h-24 rounded-surface-lg border-2 border-outline bg-surface-raised" />
            <div className="h-24 rounded-surface-lg border-2 border-outline bg-surface-raised" />
          </div>
          <div className="mt-10 h-7 w-40 rounded-surface bg-surface-sunken" />
          <div className="mt-4 h-28 rounded-surface-lg border-2 border-outline bg-surface-raised" />
        </section>

        <aside>
          <div className="h-32 rounded-surface-xl border-2 border-outline bg-surface-raised" />
        </aside>
      </main>
    </div>
  );
}
