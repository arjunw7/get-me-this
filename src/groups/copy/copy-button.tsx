"use client";

import { useActionState } from "react";

import {
  copyToMyWishlistAction,
  type CopyToWishlistState,
} from "./copy-actions";

const INITIAL_STATE: CopyToWishlistState = { status: "idle" };

const STATUS_LABELS: Record<CopyToWishlistState["status"], string> = {
  idle: "Copy to my wishlist",
  success: "Copied to your wishlist",
  already: "Already in your wishlist",
  failure: "Couldn't copy — try again",
};

/**
 * The friend-item copy affordance (brief 007b): one action, no navigation.
 * States are designed and explicit — idle, in-progress, success,
 * already-copied, and a generic failure that restores the actionable
 * button. The status text is announced politely; the action is keyboard
 * accessible with visible focus, at least 44 by 44 CSS pixels on mobile,
 * uses only semantic design tokens, and its motion is a brief press that
 * respects reduced-motion preferences.
 *
 * No copy provenance, source owner, or source group is ever rendered:
 * the copied item is the copier's own normal wishlist item.
 */
export function CopyToWishlistButton({
  groupId,
  itemId,
}: {
  readonly groupId: string;
  readonly itemId: string;
}) {
  const [state, action, pending] = useActionState(
    copyToMyWishlistAction,
    INITIAL_STATE,
  );

  const done = state.status === "success" || state.status === "already";

  return (
    <div className="mt-auto flex flex-col gap-1">
      <form action={action} className="contents">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="itemId" value={itemId} />
        <button
          type="submit"
          disabled={pending || state.status === "success"}
          aria-busy={pending}
          data-testid="copy-to-wishlist"
          className={`inline-flex min-h-touch-min items-center justify-center gap-2 rounded-control border-2 px-4 font-display text-label font-bold transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-70 ${
            state.status === "already"
              ? "border-outline-strong bg-accent-info-soft text-content-primary"
              : "border-outline-strong bg-action-primary text-content-primary hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transition-none"
          }`}
        >
          {pending ? "Copying…" : STATUS_LABELS[state.status]}
        </button>
        <p
          aria-live="polite"
          role="status"
          className="min-h-[1em] text-sm font-semibold text-content-secondary"
        >
          {state.status === "success"
            ? "Copied to your wishlist"
            : state.status === "already"
              ? "Already in your wishlist"
              : state.status === "failure"
                ? "Couldn't copy — try again"
                : ""}
        </p>
      </form>
    </div>
  );
}
