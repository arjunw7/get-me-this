import type { ReactNode } from "react";
import { WishlistNotice } from "./wishlist-notice";
import { DEFAULT_VIBE, type Vibe } from "@/src/profile/vibe";
import { EditProfileButton } from "@/src/profile/edit-profile-button";
import type { OwnerReactionSummary } from "@/src/groups/reactions/reaction-write";
import type { OwnWishlistView } from "./display";
import type { ReorderActionResult } from "./reorder-actions";
import type { WishlistMoveInput } from "./reorder-write";
import type { DeleteActionState } from "./item-actions";
import { WishlistEmpty } from "./wishlist-card";
import { WishlistItemsPanel } from "./reorder-list";
import { WishlistProfileHeader } from "./wishlist-profile-header";

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
      <WishlistProfileHeader
        displayName={displayName}
        tasteLine={tasteLine}
        vibe={vibe}
        actions={
          <>
            {shareControl}
            <EditProfileButton
              displayName={displayName}
              tasteLine={tasteLine}
              vibe={vibe}
            />
          </>
        }
      />
      {notice ? <WishlistNotice key={notice} notice={notice} /> : null}
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
