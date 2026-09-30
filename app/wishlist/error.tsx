"use client";

import { useEffect } from "react";

/**
 * The designed route error state for /wishlist (005b): generic branded
 * copy with a retry affordance — no stack traces, no raw provider errors,
 * no data. The missing-wishlist invariant renders the same designed error
 * through the view's state selection (never a fake empty state).
 */
export default function WishlistErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Surfaced to the framework's error reporting only (identifiers, never
  // contents): the UI itself renders no error detail.
  useEffect(() => {
    console.error(error.digest ?? "wishlist-render-error");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
      <h1 className="font-display text-display-sm font-extrabold tracking-tight sm:text-display-md">
        Something went wrong.
      </h1>
      <p className="mt-3 max-w-md text-content-secondary">
        Your wishlist couldn’t be loaded just now. Nothing is lost — give it
        another moment and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-touch-min items-center rounded-surface border-2 border-outline-strong bg-action-primary px-6 font-bold text-content-primary shadow-chunk transition-transform duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5"
      >
        Try again
      </button>
    </main>
  );
}
