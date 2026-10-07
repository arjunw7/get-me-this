"use client";

import { useActionState } from "react";
import { ActionSpinner } from "../action-spinner";
import {
  copyToMyWishlistAction,
  type CopyToWishlistState,
} from "./copy-actions";

const INITIAL_STATE: CopyToWishlistState = { status: "idle" };

/** A copied source loses its action; the sticker belongs to the new copy. */
export function CopyToWishlistButton({
  groupId,
  itemId,
  initiallyCopied = false,
  inline = false,
}: {
  readonly groupId: string;
  readonly itemId: string;
  readonly initiallyCopied?: boolean;
  readonly inline?: boolean;
}) {
  const [state, action, pending] = useActionState<
    CopyToWishlistState,
    FormData
  >(
    copyToMyWishlistAction,
    initiallyCopied ? { status: "success" } : INITIAL_STATE,
  );
  const done = state.status === "success" || state.status === "already";
  return (
    <div
      data-copy-complete={done ? true : undefined}
      className={done ? "contents" : "flex flex-col gap-2"}
    >
      {done ? null : (
        <form action={action} className="contents">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="itemId" value={itemId} />
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            data-testid="copy-to-wishlist"
            className={`inline-flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-control border-2 border-outline-strong bg-surface-raised px-4 font-display text-label font-bold transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 cursor-pointer disabled:cursor-default disabled:opacity-70 motion-reduce:transition-none ${inline ? "px-2 text-sm leading-tight" : ""}`}
          >
            {pending ? <ActionSpinner /> : null}
            {pending ? "Copying…" : "Copy to my wishlist"}
          </button>
        </form>
      )}
      <p key="copy-status" aria-live="polite" role="status" className="sr-only">
        {done ? "Copied to your wishlist" : ""}
      </p>
      {state.status === "failure" ? (
        <p role="alert" className="text-sm font-semibold text-feedback-error">
          Couldn&apos;t copy — try again
        </p>
      ) : null}
    </div>
  );
}
