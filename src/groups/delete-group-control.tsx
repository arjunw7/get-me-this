"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/src/ui/button";
import type { DeleteGroupResult } from "./action-state";

export function DeleteGroupControl({
  groupId,
  groupName,
  version,
  deleteAction,
  disabled,
}: {
  groupId: string;
  groupName: string;
  version: string;
  deleteAction: (
    groupId: string,
    expectedVersion: string,
  ) => Promise<DeleteGroupResult>;
  disabled?: boolean;
}) {
  const router = useRouter();
  // Capture the version the organizer confirmed, even if a refresh arrives
  // while the dialog is open. A changed roster requires a new confirmation.
  const [confirmationVersion, setConfirmationVersion] = useState<string | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (confirmationVersion === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [confirmationVersion]);

  useEffect(() => {
    // Disabled buttons leave the tab order; keep keyboard focus inside the
    // dialog while the request is pending.
    if (pending) dialog.current?.focus();
  }, [pending]);

  function close() {
    if (submitting.current) return;
    setConfirmationVersion(null);
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

  async function confirm() {
    if (submitting.current || confirmationVersion === null) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    let deleted = false;
    try {
      const result = await deleteAction(groupId, confirmationVersion);
      if (result.ok) {
        deleted = true;
        router.replace("/groups");
        router.refresh();
        return;
      }
      if (result.reason === "stale") {
        setError("The group changed. Review the current group and try again.");
        setConfirmationVersion(null);
        trigger.current?.focus();
        router.refresh();
      } else {
        setError(
          "We couldn’t delete this group. Please try again or refresh the page.",
        );
      }
    } catch {
      setError(
        "We couldn’t confirm the deletion. Refresh the page before trying again.",
      );
    } finally {
      if (!deleted) {
        submitting.current = false;
        setPending(false);
      }
    }
  }

  return (
    <div className="mt-6 border-t-2 border-outline-subtle pt-5">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setConfirmationVersion(version);
        }}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-control px-3 font-bold text-feedback-error hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        Delete group
      </button>
      {error && confirmationVersion === null ? (
        <p role="alert" className="mt-2 text-sm text-feedback-error">
          {error}
        </p>
      ) : null}
      {confirmationVersion !== null
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
                aria-labelledby={titleId}
                aria-describedby={`${titleId}-description`}
                aria-busy={pending}
                onKeyDown={keyboard}
                data-ph-no-capture
                className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-surface-xl border-2 border-outline-strong bg-surface-page p-5 pb-8 shadow-chunk-lg sm:max-w-md sm:rounded-surface-xl sm:pb-6"
              >
                <h2
                  id={titleId}
                  className="break-words font-display text-2xl leading-tight font-extrabold"
                >
                  Delete {groupName}?
                </h2>
                <p
                  id={`${titleId}-description`}
                  className="mt-3 text-sm text-content-secondary"
                >
                  This removes the group for everyone. Invite links will stop
                  working, and the group’s gifting plans and reservations will
                  no longer be available. Everyone keeps their personal
                  wishlist. This can’t be undone.
                </p>
                {error ? (
                  <p
                    role="alert"
                    className="mt-3 text-sm font-bold text-feedback-error"
                  >
                    {error}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    ref={cancel}
                    disabled={pending}
                    onClick={close}
                    className="inline-flex h-12 items-center justify-center rounded-surface border-2 border-outline-strong bg-surface-raised px-5 font-bold hover:bg-surface-sunken disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <Button
                    disabled={pending}
                    onClick={() => {
                      void confirm();
                    }}
                  >
                    {pending ? "Deleting…" : "Delete group"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
