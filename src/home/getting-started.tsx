"use client";

import { useState, useSyncExternalStore } from "react";
import { ShareWishlistButton } from "@/src/wishlist/share-wishlist-button";
import type {
  OwnShareState,
  ShareWishlistChange,
} from "@/src/wishlist/public-share-types";
import Link from "next/link";
import type { OwnWishlistView } from "@/src/wishlist/display";
import { CardImage } from "@/src/wishlist/card-image";
import { HomeLinkForm } from "./home-link-form";
import { StarterIdeasRow } from "./starter-ideas-row";

const SHARED_EVENT = "gmt:onboarding-shared";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(SHARED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(SHARED_EVENT, listener);
  };
}
function readProgress(key: string) {
  try {
    return window.localStorage.getItem(key) === "done";
  } catch {
    return false;
  }
}
export function GettingStarted({
  wishlist,
  shareState = null,
  onShareChange,
}: {
  wishlist: OwnWishlistView;
  shareState?: OwnShareState | null;
  onShareChange?: ShareWishlistChange;
}) {
  const hasItems = wishlist.items.length > 0;
  const progressKey = `gmt:onboarding:shared:${wishlist.wishlistId}`;
  const persisted = useSyncExternalStore(
    subscribe,
    () => readProgress(progressKey),
    () => false,
  );
  const [sharedNow, setSharedNow] = useState(false);
  const shared = persisted || sharedNow;
  const groupReady = hasItems && shared;
  function completeSharing() {
    setSharedNow(true);
    // This browser-only onboarding hint grants no access and stores no link or token.
    try {
      window.localStorage.setItem(progressKey, "done");
    } catch {
      /* Progress still updates for this visit. */
    }
    window.dispatchEvent(new Event(SHARED_EVENT));
  }
  return (
    <ol className="relative mt-8">
      <li className="relative flex gap-4 pb-10 sm:gap-5">
        <span
          aria-hidden="true"
          className="absolute top-10 bottom-0 left-5 border-l-2 border-dashed border-outline-strong/25"
        />
        <span
          aria-hidden="true"
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong font-display font-extrabold shadow-chunk-sm ${hasItems ? "bg-content-primary text-surface-page" : "bg-action-primary"}`}
        >
          {hasItems ? "✓" : "1"}
        </span>
        <section
          className="min-w-0 flex-1"
          aria-labelledby="start-wishlist-heading"
          aria-current={!hasItems ? "step" : undefined}
        >
          <p className="text-sm font-bold text-content-muted">
            Step 1 · Your wishlist
          </p>
          <h2
            id="start-wishlist-heading"
            className="mt-0.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl"
          >
            {hasItems
              ? `${wishlist.items.length} ${wishlist.items.length === 1 ? "item" : "items"} on your wishlist`
              : "Add something you’d love to get"}
          </h2>
          {hasItems ? (
            <>
              <ul className="mt-4 flex gap-3" aria-label="Your items">
                {wishlist.items.slice(0, 4).map((item) => (
                  <li
                    key={item.id}
                    className="h-16 w-16 overflow-hidden rounded-surface border-2 border-outline-strong bg-surface-raised"
                  >
                    <span className="sr-only">{item.title}</span>
                    <span aria-hidden="true">
                      {item.imageSrc ? (
                        <CardImage
                          key={item.imageSrc}
                          src={item.imageSrc}
                          title={item.title}
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center p-1 text-center text-caption">
                          {item.title}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[15px] text-content-secondary">
                Nice. Three or four gives friends real options.{" "}
                <Link
                  href="/wishlist/items/new"
                  className="inline-flex min-h-11 items-center font-bold text-content-primary underline underline-offset-2"
                >
                  Add another
                </Link>
              </p>
            </>
          ) : (
            <div className="mt-4 rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk sm:p-6">
              <HomeLinkForm />
              <div className="mt-6 border-t-2 border-dashed border-outline-strong/10 pt-5">
                <StarterIdeasRow />
              </div>
            </div>
          )}
        </section>
      </li>
      <li className="relative flex gap-4 pb-10 sm:gap-5">
        <span
          aria-hidden="true"
          className="absolute top-10 bottom-0 left-5 border-l-2 border-dashed border-outline-strong/25"
        />
        <span
          aria-hidden="true"
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong font-display font-extrabold shadow-chunk-sm ${shared ? "bg-content-primary text-surface-page" : hasItems ? "bg-action-primary" : "bg-surface-page text-content-muted"}`}
        >
          {shared ? "✓" : "2"}
        </span>
        <section
          className="min-w-0 flex-1"
          aria-labelledby="start-share-heading"
          aria-current={hasItems && !shared ? "step" : undefined}
        >
          <p className="text-sm font-bold text-content-muted">
            Step 2 · Share your wishlist
          </p>
          <h2
            id="start-share-heading"
            className="mt-0.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl"
          >
            Share your wishlist
          </h2>
          <p className="mt-1.5 text-[15px] text-content-secondary">
            Send your link to your people so they know what you’d love.
          </p>
          <div className="mt-4">
            {shareState && onShareChange ? (
              <ShareWishlistButton
                state={shareState}
                onChange={onShareChange}
                showLabel
                onShared={completeSharing}
              />
            ) : (
              <p className="text-sm text-content-secondary">
                Sharing is unavailable right now. Try again in a moment.
              </p>
            )}
          </div>
          {shared ? (
            <p role="status" className="mt-3 text-sm font-bold">
              Wishlist shared.
            </p>
          ) : null}
        </section>
      </li>
      <li className="relative flex gap-4 sm:gap-5">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-display font-extrabold ${groupReady ? "border-outline-strong bg-action-primary shadow-chunk-sm" : "border-outline-strong/30 bg-surface-page text-content-muted"}`}
        >
          3
        </span>
        <section
          className="min-w-0 flex-1"
          aria-labelledby="start-group-heading"
          aria-current={groupReady ? "step" : undefined}
        >
          <p className="text-sm font-bold text-content-muted">
            Step 3 · Your people
          </p>
          <h2
            id="start-group-heading"
            className={`mt-0.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl ${!groupReady ? "text-content-secondary" : ""}`}
          >
            Create a group for your next occasion
          </h2>
          <p className="mt-1.5 text-[15px] text-content-secondary">
            A birthday, Diwali, a wedding. Friends see your wishlist once they
            join.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/groups"
              className={`inline-flex h-12 items-center gap-2 rounded-surface border-2 border-outline-strong px-5 font-bold ${groupReady ? "bg-action-primary shadow-chunk-sm" : "bg-surface-raised hover:bg-surface-sunken"}`}
            >
              Create a group <span aria-hidden="true">→</span>
            </Link>
            {!hasItems && (
              <span className="text-sm text-content-muted">
                You can do this first if you prefer.
              </span>
            )}
          </div>
          <p className="mt-5 flex items-start gap-2.5 text-sm text-content-secondary">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-info"
            >
              <path d="m3 10 9-7 9 7v11H3Zm0 0 9 6 9-6" />
            </svg>
            Got an invite from a friend? Open their link and you’ll land
            straight in the group.
          </p>
        </section>
      </li>
    </ol>
  );
}
