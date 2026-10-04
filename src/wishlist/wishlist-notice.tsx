"use client";

import { useState } from "react";

const messages = {
  added: "Item added to your wishlist.",
  updated: "Item changes saved.",
  deleted: "Item removed from your wishlist.",
} as const;

export function WishlistNotice({ notice }: { notice: keyof typeof messages }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="mt-5 flex items-center justify-between gap-3 rounded-surface border-2 border-outline-strong bg-accent-fresh-soft py-1 pl-4 pr-1 font-bold"
    >
      <span>{messages[notice]}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => setDismissed(true)}
        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
