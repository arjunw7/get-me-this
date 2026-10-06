"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

const ERROR_TEXT = "That didn't go through. Try again.";
const buttonClass =
  "flex min-h-12 w-full items-center justify-center rounded-control border-2 border-outline-strong px-4 font-display text-sm font-bold transition-transform duration-100 motion-reduce:transition-none disabled:cursor-wait disabled:opacity-60";

/** Confirmed private coordination only; the recipient never receives these controls. */
export function ReserveAction({
  viewerState,
  onReserve,
  onRelease,
  presentation = "default",
  secondaryAction,
}: {
  viewerState: "unreserved" | "yours" | "other";
  presentation?: "default" | "gifting";
  secondaryAction?: React.ReactNode;
  onReserve: () => Promise<"reserved" | "conflict" | "error">;
  onRelease: () => Promise<"released" | "error">;
}) {
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const [conflict, setConflict] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const labelId = useId();

  useEffect(() => {
    if (!confirmingRelease) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    keep.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [confirmingRelease]);
  useEffect(() => {
    if (isPending && confirmingRelease) dialog.current?.focus();
    if (!isPending && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus();
    }
  }, [isPending, confirmingRelease]);

  function close() {
    if (submitting.current || isPending) return;
    setConfirmingRelease(false);
    setFailed(false);
    trigger.current?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    if (!buttons.length) {
      event.preventDefault();
      return;
    }
    if (document.activeElement === event.currentTarget) {
      event.preventDefault();
      (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
    } else if (event.shiftKey && document.activeElement === buttons[0]) {
      event.preventDefault();
      buttons.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
      event.preventDefault();
      buttons[0]?.focus();
    }
  }
  function reserve() {
    if (submitting.current) return;
    submitting.current = true;
    setConflict(false);
    setFailed(false);
    startTransition(async () => {
      try {
        const outcome = await onReserve();
        if (outcome === "conflict") setConflict(true);
        if (outcome === "error") setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        submitting.current = false;
      }
    });
  }
  function release() {
    if (submitting.current) return;
    submitting.current = true;
    setFailed(false);
    startTransition(async () => {
      try {
        const outcome = await onRelease();
        if (outcome === "released") {
          restoreFocus.current = true;
          setConfirmingRelease(false);
        } else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <div
      className={presentation === "gifting" ? "pt-3" : "mt-3"}
      aria-busy={isPending}
    >
      {viewerState !== "unreserved" ? (
        <p
          className="mb-2 text-sm font-semibold text-content-secondary"
          role="status"
        >
          {viewerState === "yours" ? "Reserved by you" : "Someone’s on it"}
        </p>
      ) : null}
      <div
        className={
          secondaryAction
            ? `grid gap-2 ${viewerState === "other" ? "grid-cols-1" : "grid-cols-2"}`
            : undefined
        }
      >
        {viewerState === "yours" ? (
          <button
            ref={trigger}
            type="button"
            aria-haspopup="dialog"
            disabled={isPending}
            onClick={() => {
              setFailed(false);
              setConfirmingRelease(true);
            }}
            className={`${buttonClass} bg-surface-raised text-content-primary hover:bg-surface-sunken ${secondaryAction ? "h-12 px-2 leading-tight" : ""}`}
          >
            Release reservation
          </button>
        ) : viewerState === "unreserved" ? (
          <button
            ref={trigger}
            type="button"
            disabled={isPending}
            onClick={reserve}
            aria-describedby={
              conflict
                ? `${labelId}-conflict`
                : failed
                  ? `${labelId}-error`
                  : undefined
            }
            className={`${buttonClass} bg-action-primary text-content-primary hover:-translate-y-0.5 active:translate-y-0.5 ${secondaryAction ? "h-12 px-2 leading-tight" : ""}`}
          >
            {isPending ? "Reserving…" : "Reserve secretly"}
          </button>
        ) : null}
        {secondaryAction}
      </div>
      {conflict ? (
        <p
          id={`${labelId}-conflict`}
          className="mt-2 text-sm font-semibold text-content-secondary"
          role="status"
        >
          Someone beat you to it
        </p>
      ) : null}
      {failed && !confirmingRelease ? (
        <p
          id={`${labelId}-error`}
          role="alert"
          className="mt-2 text-sm font-semibold text-feedback-error"
        >
          {ERROR_TEXT}
        </p>
      ) : null}
      {confirmingRelease
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-content-primary/40 sm:items-center sm:p-6"
              onClick={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div
                ref={dialog}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${labelId}-title`}
                aria-describedby={`${labelId}-description`}
                aria-busy={isPending}
                onKeyDown={keyboard}
                className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-surface-xl border-2 border-outline-strong bg-surface-page p-5 pb-8 shadow-chunk-lg sm:max-w-md sm:rounded-surface-xl sm:pb-6"
              >
                <h2
                  id={`${labelId}-title`}
                  className="font-display text-2xl font-extrabold leading-tight"
                >
                  Release your reservation?
                </h2>
                <p
                  id={`${labelId}-description`}
                  className="mt-3 text-sm text-content-secondary"
                >
                  Other eligible group members will be able to reserve this
                  gift. The recipient won’t be notified.
                </p>
                {failed ? (
                  <p
                    role="alert"
                    className="mt-3 text-sm font-bold text-feedback-error"
                  >
                    {ERROR_TEXT}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    ref={keep}
                    type="button"
                    disabled={isPending}
                    onClick={close}
                    className={`${buttonClass} bg-surface-raised text-content-primary hover:bg-surface-sunken`}
                  >
                    Keep reservation
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={release}
                    className={`${buttonClass} bg-action-primary text-content-primary`}
                  >
                    {isPending ? "Releasing…" : "Release reservation"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
