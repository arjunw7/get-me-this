"use client";

import { useId, useState, useTransition } from "react";

/**
 * The minimal per-item reserve affordance for eligible viewers on the 006e
 * member-wishlist browse surface (brief 007c, pinned V18 gifting-browse
 * region). States: `Reserve gift` on an unreserved eligible item,
 * `Reserved by you` with a confirmed release on the caller's own
 * reservation, and a `Reserved` chip with no identity on an item reserved
 * by another member. Losing the atomic race surfaces friendly conflict
 * feedback; transient failure restores the prior state.
 *
 * The owner never sees any of this: the owner's own wishlist gains nothing
 * in this slice (binding zero-diff requirement).
 *
 * Touch targets are at least 44 by 44 CSS pixels; release requires
 * confirmation per the design contract; motion respects reduced motion.
 */
export function ReserveAction({
  viewerState,
  onReserve,
  onRelease,
}: {
  viewerState: "unreserved" | "yours" | "other";
  onReserve: () => Promise<"reserved" | "conflict" | "error">;
  onRelease: () => Promise<"released" | "error">;
}) {
  const [isPending, startTransition] = useTransition();
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const labelId = useId();

  function reserve() {
    setConflict(false);
    setFailed(false);
    startTransition(async () => {
      const outcome = await onReserve();
      if (outcome === "conflict") setConflict(true);
      if (outcome === "error") setFailed(true);
    });
  }

  function release() {
    setFailed(false);
    startTransition(async () => {
      const outcome = await onRelease();
      if (outcome === "released") {
        setConfirmingRelease(false);
      } else {
        setFailed(true);
      }
    });
  }

  return (
    <div className="mt-3" aria-busy={isPending}>
      <span id={labelId} className="sr-only">
        Gift coordination for this item
      </span>
      {viewerState === "other" ? (
        <p
          className="inline-flex items-center rounded-surface border-2 border-outline-strong bg-surface-raised px-3 py-1 text-sm font-semibold text-content-secondary"
          role="status"
        >
          Reserved
        </p>
      ) : viewerState === "yours" ? (
        confirmingRelease ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-content-primary">
              Release your reservation?
            </p>
            <button
              type="button"
              disabled={isPending}
              onClick={release}
              className="min-h-11 rounded-pill border-2 border-outline-strong bg-action-primary px-4 text-sm font-bold text-content-primary transition-transform duration-100 motion-reduce:transition-none disabled:opacity-60"
            >
              Release
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmingRelease(false)}
              className="min-h-11 rounded-pill border-2 border-outline-strong bg-surface-raised px-4 text-sm font-bold text-content-primary disabled:opacity-60"
            >
              Keep it
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p
              className="text-sm font-semibold text-content-primary"
              role="status"
            >
              Reserved by you
            </p>
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={isPending}
              onClick={() => setConfirmingRelease(true)}
              className="min-h-11 rounded-pill border-2 border-outline-strong bg-surface-raised px-4 text-sm font-bold text-content-primary transition-transform duration-100 motion-reduce:transition-none disabled:opacity-60"
            >
              Release reservation
            </button>
          </div>
        )
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={reserve}
          aria-describedby={conflict ? `${labelId}-conflict` : undefined}
          className="min-h-11 rounded-pill border-2 border-outline-strong bg-action-primary px-4 text-sm font-bold text-content-primary transition-transform duration-100 motion-reduce:transition-none disabled:opacity-60"
        >
          Reserve gift
        </button>
      )}
      {conflict ? (
        <p
          id={`${labelId}-conflict`}
          className="mt-2 text-sm font-semibold text-content-secondary"
          role="status"
        >
          Someone beat you to it
        </p>
      ) : null}
      {failed ? (
        <p
          className="mt-2 text-sm font-semibold text-content-secondary"
          role="alert"
        >
          That didn&apos;t go through. Try again.
        </p>
      ) : null}
    </div>
  );
}
