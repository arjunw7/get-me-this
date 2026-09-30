"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { deleteItemAction, reconcileDeleteAction } from "./item-actions";

const IDLE_DELETE = { status: "idle" as const };
const IDLE_RECONCILE = { status: "idle" as const };

export function DeleteDialog({
  itemId,
  title,
}: {
  itemId: string;
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteItemAction.bind(null, itemId),
    IDLE_DELETE,
  );
  const [reconcileState, reconcileAction, checking] = useActionState(
    reconcileDeleteAction.bind(null, itemId),
    IDLE_RECONCILE,
  );

  useEffect(() => {
    if (deleteState.status === "deleted") router.push("/wishlist?item=deleted");
  }, [deleteState.status, router]);

  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  function keepFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = [
      ...(event.currentTarget.querySelectorAll(
        "button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
      ) as NodeListOf<HTMLElement>),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  const uncertain = deleteState.status === "uncertain";
  const present = reconcileState.status === "present";
  const hideOwnerTitle = deleteState.status === "unavailable" || uncertain;
  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 mb-28 inline-flex min-h-touch-min scroll-mb-28 items-center font-bold text-feedback-error underline underline-offset-4 sm:mb-0 sm:scroll-mb-0"
      >
        Delete item
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-content-primary/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onKeyDown={keepFocus}
            className="w-full max-w-md rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-6 shadow-chunk-lg"
          >
            <h2
              id="delete-dialog-title"
              className="font-display text-heading font-extrabold"
            >
              {deleteState.status === "unavailable"
                ? "This item isn’t available."
                : uncertain
                  ? "Delete status is unclear."
                  : "Delete this item?"}
            </h2>
            <p
              id="delete-dialog-description"
              className="mt-3 text-content-secondary"
            >
              {hideOwnerTitle
                ? "Return to your wishlist or check the item from a fresh page."
                : `“${title}” will be removed from your wishlist. This can’t be undone.`}
            </p>
            {deleteState.status === "definite-rejection" ? (
              <p role="alert" className="mt-4 text-content-secondary">
                We couldn’t remove this item. It’s still here; you can try
                again.
              </p>
            ) : null}
            {uncertain ? (
              <div role="alert" className="mt-4 space-y-3">
                <p>We couldn’t confirm whether the item was removed.</p>
                {reconcileState.status === "absent" ? (
                  <a
                    className="inline-flex min-h-touch-min items-center font-bold underline"
                    href={`/wishlist/items/${itemId}/edit`}
                  >
                    Check the item
                  </a>
                ) : (
                  <form action={reconcileAction}>
                    <button
                      type="submit"
                      disabled={checking}
                      className="min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold"
                    >
                      {checking ? "Checking…" : "Check status"}
                    </button>
                  </form>
                )}
                {reconcileState.status === "present" ? (
                  <p>
                    The item is still in your wishlist. You can try deleting
                    again.
                  </p>
                ) : null}
                {reconcileState.status === "uncertain" ? (
                  <p>Status is still unclear. Check again when you’re ready.</p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancel}
                type="button"
                onClick={close}
                className="min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold"
              >
                Cancel
              </button>
              {!uncertain || present ? (
                <form action={deleteAction}>
                  <button
                    type="submit"
                    disabled={deleting}
                    className="min-h-touch-min rounded-surface border-2 border-outline-strong bg-action-primary px-4 font-bold disabled:opacity-60"
                  >
                    {deleting
                      ? "Deleting…"
                      : deleteState.status === "definite-rejection" || present
                        ? "Retry delete"
                        : "Delete item"}
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
