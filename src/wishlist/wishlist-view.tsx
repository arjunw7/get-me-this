import { formatItemCount } from "./display";
import type { OwnWishlist } from "./data";
import { WishlistCardGrid, WishlistEmpty } from "./wishlist-card";
import typography from "./wishlist-typography.module.css";

/**
 * The wishlist presentation and its state selection (005b), extracted from
 * the route page into a testable unit: given the owner's profile and their
 * read result, render exactly one designed state.
 *
 * - `wishlist === null` is an invariant violation, not an empty state: the
 *   005a signup trigger plus backfill guarantee every user a wishlist row,
 *   so a missing row renders the designed error state — never a fake empty
 *   state and never raw error detail.
 * - An empty wishlist is "wishlist row present, zero items" and renders the
 *   V18 empty composition.
 * - Otherwise the populated view renders every saved item snapshot.
 */
export function WishlistView({
  displayName,
  tasteLine,
  wishlist,
}: {
  displayName: string;
  tasteLine: string | null;
  wishlist: OwnWishlist | null;
}) {
  if (wishlist === null) {
    return <WishlistError />;
  }
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-6 pb-16 sm:px-8 lg:pt-10">
      <ProfileHeaderCard
        displayName={displayName}
        tasteLine={tasteLine}
        itemCount={wishlist.items.length}
      />
      <div className="mt-8">
        {wishlist.items.length === 0 ? (
          <WishlistEmpty />
        ) : (
          <WishlistCardGrid items={wishlist.items} />
        )}
      </div>
    </div>
  );
}

/**
 * The V18 profile header card (pages/Shelfie.tsx), with the accepted
 * differences recorded in the brief: no theme colour (the band uses the
 * default primary accent token), no "visible to 2 groups" line (no groups
 * before Phase 5), no Edit profile / Share buttons, and the repository's
 * initials-avatar initial disc in place of the V18 avatar image.
 */
function ProfileHeaderCard({
  displayName,
  tasteLine,
  itemCount,
}: {
  displayName: string;
  tasteLine: string | null;
  itemCount: number;
}) {
  return (
    <section
      aria-label={displayName}
      className="relative overflow-hidden rounded-surface-2xl border-2 border-outline-strong bg-surface-raised shadow-chunk"
    >
      <div className="relative h-24 border-b-2 border-outline-strong bg-action-primary sm:flex sm:h-auto sm:min-h-28 sm:items-end sm:px-7 sm:pt-3 sm:pb-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full opacity-30"
        >
          <path
            d="M-10 70 C 60 20, 110 100, 180 55 S 300 10, 410 60"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
        </svg>
        <h1
          className={`relative hidden font-display font-extrabold tracking-tight sm:ml-[6.25rem] sm:block sm:min-w-0 sm:flex-1 ${typography.profileName}`}
        >
          {displayName}
        </h1>
      </div>
      <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div className="flex flex-col gap-3 sm:min-w-0 sm:flex-1 sm:flex-row sm:items-start sm:gap-5">
          <span
            aria-hidden="true"
            className="relative z-10 -mt-12 flex h-16 w-16 flex-none items-center justify-center rounded-full border-2 border-outline-strong bg-accent-fresh font-display text-2xl font-extrabold text-content-primary shadow-chunk-sm ring-4 ring-surface-raised sm:h-20 sm:w-20"
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div className="sm:mt-2">
            <h1
              className={`font-display font-extrabold tracking-tight sm:hidden ${typography.profileName}`}
            >
              {displayName}
            </h1>
            {tasteLine !== null ? (
              <p className="mt-0.5 text-lg text-content-secondary">
                {tasteLine}
              </p>
            ) : null}
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-content-muted">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full border border-outline-strong bg-action-primary"
              />
              {formatItemCount(itemCount)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The designed error state (005b): generic branded copy and a retry
 * affordance — no stack traces, no raw provider errors, no data. Used both
 * for caught failures and for the missing-wishlist invariant violation.
 */
export function WishlistError() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 py-16 text-center sm:px-8">
      <h1 className="font-display text-display-sm font-extrabold tracking-tight sm:text-display-md">
        Something went wrong.
      </h1>
      <p className="mt-3 max-w-md text-content-secondary">
        Your wishlist couldn’t be loaded just now. Nothing is lost — give it
        another moment and try again.
      </p>
      <a
        href="/wishlist"
        className="mt-6 inline-flex min-h-touch-min items-center rounded-surface border-2 border-outline-strong bg-action-primary px-6 font-bold text-content-primary shadow-chunk transition-transform duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5"
      >
        Try again
      </a>
    </main>
  );
}
