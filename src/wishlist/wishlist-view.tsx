import type { ReactNode } from "react";
import {
  DEFAULT_VIBE,
  VIBE_OPTIONS,
  vibeClasses,
  type Vibe,
} from "@/src/profile/vibe";
import { EditProfileButton } from "@/src/profile/edit-profile-button";
import type { OwnerReactionSummary } from "@/src/groups/reactions/reaction-write";
import { profileInitials } from "@/src/home/profile-initials";
import { formatItemCount } from "./display";
import type { OwnWishlistView } from "./display";
import type { ReorderActionResult } from "./reorder-actions";
import type { WishlistMoveInput } from "./reorder-write";
import type { DeleteActionState } from "./item-actions";
import { WishlistEmpty } from "./wishlist-card";
import { WishlistItemsPanel } from "./reorder-list";
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
 * - Otherwise the populated view renders every saved item as a client-safe
 *   view (005f): raw snapshot paths never cross into the client components.
 */
export function WishlistView({
  displayName,
  tasteLine,
  vibe = DEFAULT_VIBE,
  wishlist,
  notice = null,
  reactionSummaries,
  shareControl,
  reorderAction,
  refreshAction,
  deleteAction,
}: {
  displayName: string;
  tasteLine: string | null;
  vibe?: Vibe;
  wishlist: OwnWishlistView | null;
  shareControl?: ReactNode;
  notice?: "added" | "updated" | "deleted" | null;
  reactionSummaries?: Readonly<Record<string, OwnerReactionSummary>>;
  reorderAction: (input: WishlistMoveInput) => Promise<ReorderActionResult>;
  refreshAction: () => Promise<ReorderActionResult>;
  deleteAction: (
    itemId: string,
    previous: DeleteActionState,
    data: FormData,
  ) => Promise<DeleteActionState>;
}) {
  if (wishlist === null) {
    return <WishlistError />;
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8 lg:pt-10">
      <ProfileHeaderCard
        displayName={displayName}
        tasteLine={tasteLine}
        vibe={vibe}
        itemCount={wishlist.items.length}
        shareControl={shareControl}
      />
      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-surface border-2 border-outline-strong bg-accent-fresh-soft px-4 py-3 font-bold"
        >
          {notice === "added"
            ? "Item added to your wishlist."
            : notice === "updated"
              ? "Item changes saved."
              : "Item removed from your wishlist."}
        </p>
      ) : null}
      <div className={wishlist.items.length === 0 ? "mt-6" : "mt-8"}>
        {wishlist.items.length === 0 ? (
          <WishlistEmpty />
        ) : (
          <WishlistItemsPanel
            items={wishlist.items}
            reactionSummaries={reactionSummaries}
            reorderAction={reorderAction}
            refreshAction={refreshAction}
            deleteAction={deleteAction}
          />
        )}
      </div>
    </main>
  );
}

/**
 * The V18 profile composition uses the owner’s persisted Vibe and real initials.
 */
function ProfileHeaderCard({
  displayName,
  tasteLine,
  vibe = DEFAULT_VIBE,
  itemCount,
  shareControl,
}: {
  displayName: string;
  tasteLine: string | null;
  vibe?: Vibe;
  itemCount: number;
  shareControl?: ReactNode;
}) {
  return (
    <section
      aria-label={displayName}
      className="relative overflow-hidden rounded-surface-2xl border-2 border-outline-strong bg-surface-raised shadow-chunk"
    >
      <div
        data-vibe={vibe}
        className={`relative h-24 border-b-2 border-outline-strong sm:flex sm:h-auto sm:min-h-28 sm:items-end sm:px-7 sm:pt-3 sm:pb-3 ${vibeClasses(vibe)}`}
      >
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
          className={`relative hidden font-display font-extrabold tracking-tight sm:ml-[7.25rem] sm:block sm:min-w-0 sm:flex-1 ${typography.profileName}`}
        >
          {displayName}
        </h1>
      </div>
      <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div className="flex flex-col gap-3 sm:min-w-0 sm:flex-1 sm:flex-row sm:items-start sm:gap-5">
          <span
            aria-hidden="true"
            className={`relative z-10 -mt-12 flex h-24 w-24 flex-none items-center justify-center rounded-full border-2 border-outline-strong font-display text-3xl font-extrabold shadow-chunk-sm ring-4 ring-surface-raised ${vibeClasses(vibe)}`}
          >
            {profileInitials(displayName)}
          </span>
          <div className="sm:mt-1">
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
                className={`h-3 w-3 rounded-full border border-outline-strong ${vibeClasses(vibe)}`}
              />
              <span>
                {VIBE_OPTIONS.find((option) => option.value === vibe)?.label}{" "}
                vibe · <span>{formatItemCount(itemCount)}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:pt-3">
          {shareControl}
          <EditProfileButton
            displayName={displayName}
            tasteLine={tasteLine}
            vibe={vibe}
          />
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
