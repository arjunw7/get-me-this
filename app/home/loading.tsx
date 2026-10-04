import { AppShellLoading } from "@/src/home/app-shell-loading";

/**
 * The designed loading state for the authenticated Home: the same shell as
 * HomeScreen with animated placeholder blocks, never a browser-default
 * blank or spinner. Respects reduced-motion preferences through the app's
 * motion tokens.
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen w-full animate-pulse bg-surface-page text-content-primary motion-reduce:animate-none lg:pl-64">
      <AppShellLoading />

      <main className="mx-auto w-full max-w-4xl px-5 pt-6 pb-16 sm:px-8 lg:pt-10">
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
      </main>
    </div>
  );
}
