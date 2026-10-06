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
  failure: "Copy to my wishlist",
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

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="contents">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="itemId" value={itemId} />
        <button
          type="submit"
          disabled={pending || state.status === "success"}
          aria-busy={pending}
          data-testid="copy-to-wishlist"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border-2 border-outline-strong bg-surface-raised px-4 font-display text-label font-bold transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-70 motion-reduce:transition-none"
        >
          {pending ? "Copying…" : STATUS_LABELS[state.status]}
          {state.status === "success" ? (
            <span aria-hidden="true">✓</span>
          ) : null}
        </button>
        <p aria-live="polite" role="status" className="sr-only">
          {state.status === "success"
            ? "Copied to your wishlist"
            : state.status === "already"
              ? "Already in your wishlist"
              : ""}
        </p>
      </form>
      {state.status === "failure" ? (
        <p role="alert" className="text-sm font-semibold text-feedback-error">
          Couldn&apos;t copy — try again
        </p>
      ) : null}
    </div>
  );
}
