import { AppShellLoading } from "@/src/home/app-shell-loading";

/**
 * The designed loading state for the authenticated Home: the same shell as
 * HomeScreen with animated placeholder blocks, never a browser-default
 * blank or spinner. Respects reduced-motion preferences through the app's
 * motion tokens.
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary motion-reduce:animate-none lg:pl-64">
      <AppShellLoading />

      <main className="mx-auto w-full max-w-6xl px-5 pt-6 pb-16 sm:px-8 lg:pt-10">
        <p className="sr-only" role="status">
          Loading your home.
        </p>
        <section aria-hidden="true">
          <div className="h-12 w-72 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
          <div className="mt-4 h-6 w-96 max-w-full animate-pulse rounded-surface bg-surface-sunken" />
          <div className="mt-10 h-7 w-36 animate-pulse rounded-surface bg-surface-sunken" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-3 rounded-surface-lg border-2 border-outline bg-surface-raised p-5">
              <div className="h-6 w-2/3 animate-pulse rounded-surface bg-surface-sunken" />
              <div className="h-4 w-1/2 animate-pulse rounded-surface bg-surface-sunken" />
            </div>
            <div className="space-y-3 rounded-surface-lg border-2 border-outline bg-surface-raised p-5">
              <div className="h-6 w-2/3 animate-pulse rounded-surface bg-surface-sunken" />
              <div className="h-4 w-1/2 animate-pulse rounded-surface bg-surface-sunken" />
            </div>
          </div>
          <div className="mt-10 h-7 w-40 animate-pulse rounded-surface bg-surface-sunken" />
          <div className="mt-4 space-y-3 rounded-surface-lg border-2 border-outline bg-surface-raised p-5">
            <div className="h-6 w-2/3 animate-pulse rounded-surface bg-surface-sunken" />
            <div className="h-4 w-1/2 animate-pulse rounded-surface bg-surface-sunken" />
            <div className="h-4 w-32 animate-pulse rounded-surface bg-surface-sunken" />
          </div>
        </section>
      </main>
    </div>
  );
}
