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
import { useRouter } from "next/navigation";
import { AppIcon } from "@/src/home/app-icon";
import { VibePicker } from "./vibe-picker";
import { DEFAULT_VIBE, type Vibe } from "./vibe";
import { editProfileAction } from "./edit-profile-action";
import { DISPLAY_NAME_MAX } from "./onboarding";
import { TASTE_LINE_MAX } from "@/src/auth/fixtures";
import type { EditProfileState } from "./edit-profile-state";

export function EditProfileButton({
  displayName,
  tasteLine,
  vibe = DEFAULT_VIBE,
  className,
  icon = true,
}: {
  displayName: string;
  tasteLine: string | null;
  vibe?: Vibe;
  className?: string;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    opener.current?.focus();
  }
  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
        className={`cursor-pointer transition-colors duration-150 hover:bg-surface-sunken focus-visible:bg-surface-sunken ${className ?? "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border-2 border-outline-strong bg-surface-raised px-4 text-sm font-bold"}`}
      >
        {icon ? <AppIcon name="edit" className="h-4 w-4" /> : null}Edit profile
      </button>
      {saved ? (
        <span role="status" className="sr-only">
          Profile changes saved.
        </span>
      ) : null}
      {open
        ? createPortal(
            <EditProfileDialog
              displayName={displayName}
              tasteLine={tasteLine}
              vibe={vibe}
              onClose={close}
              onSaved={() => {
                setSaved(true);
                close();
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

export function EditProfileDialog({
  displayName,
  tasteLine,
  vibe,
  onClose,
  onSaved,
}: {
  displayName: string;
  tasteLine: string | null;
  vibe: Vibe;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(displayName);
  const [line, setLine] = useState(tasteLine ?? "");
  const [selectedVibe, setSelectedVibe] = useState(vibe);
  const [result, setResult] = useState<EditProfileState | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    nameRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!pending) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const targets = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), a[href]",
      ),
    );
    if (targets.length === 0) {
      event.preventDefault();
      return;
    }
    const first = targets[0],
      last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  const errors =
    result?.status === "error" && "errors" in result ? result.errors : {};
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-content-primary/40 sm:items-center sm:p-6"
      data-ph-no-capture
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        aria-describedby={`${id}-description`}
        onKeyDown={keyboard}
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-surface-xl border-2 border-outline-strong bg-surface-page p-5 pb-8 shadow-chunk-lg sm:max-w-md sm:rounded-surface-xl sm:pb-6"
        aria-busy={pending}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={`${id}-heading`}
              className="font-display text-2xl font-extrabold leading-tight"
            >
              Edit your profile
            </h2>
            <p
              id={`${id}-description`}
              className="mt-1 text-sm text-content-secondary"
            >
              This is how you appear on your wishlist.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close edit profile"
            disabled={pending}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-raised text-2xl disabled:opacity-50"
          >
            ×
          </button>
        </header>
        <form
          className="mt-4 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setResult(null);
            startTransition(async () => {
              try {
                const next = await editProfileAction(form);
                setResult(next);
                if (next.status === "saved") {
                  router.refresh();
                  onSaved();
                }
              } catch {
                setResult({ status: "error", failure: "unavailable" });
              }
            });
          }}
        >
          <div>
            <label
              htmlFor={`${id}-name`}
              className="mb-2 block text-sm font-bold"
            >
              Name
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              name="displayName"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              maxLength={DISPLAY_NAME_MAX}
              aria-invalid={!!errors.displayName}
              aria-describedby={
                errors.displayName ? `${id}-name-error` : undefined
              }
              className="h-12 w-full rounded-control border-2 border-outline-strong bg-surface-raised px-3.5 outline-none focus:shadow-chunk-sm disabled:opacity-60"
            />
            {errors.displayName ? (
              <p
                id={`${id}-name-error`}
                role="alert"
                className="mt-2 text-sm text-feedback-error"
              >
                {errors.displayName === "required"
                  ? "Add your name so your friends know it’s you."
                  : `Keep your name to ${DISPLAY_NAME_MAX} characters.`}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor={`${id}-line`}
              className="mb-2 block text-sm font-bold"
            >
              Personality line
            </label>
            <input
              id={`${id}-line`}
              name="tasteLine"
              value={line}
              onChange={(event) => setLine(event.target.value)}
              disabled={pending}
              maxLength={TASTE_LINE_MAX}
              aria-invalid={!!errors.tasteLine}
              aria-describedby={`${id}-line-count${errors.tasteLine ? ` ${id}-line-error` : ""}`}
              className="h-12 w-full rounded-control border-2 border-outline-strong bg-surface-raised px-3.5 outline-none focus:shadow-chunk-sm disabled:opacity-60"
            />
            <p
              id={`${id}-line-count`}
              className="mt-1 text-right text-xs text-content-muted"
            >
              {line.length}/{TASTE_LINE_MAX}
            </p>
            {errors.tasteLine ? (
              <p
                id={`${id}-line-error`}
                role="alert"
                className="mt-2 text-sm text-feedback-error"
              >
                Keep your personality line to {TASTE_LINE_MAX} characters.
              </p>
            ) : null}
          </div>
          <VibePicker
            value={selectedVibe}
            onChange={setSelectedVibe}
            disabled={pending}
            invalid={!!errors.vibe}
          />
          {result?.status === "error" && "failure" in result ? (
            <p
              role="alert"
              className="rounded-control border-2 border-feedback-error px-3 py-2 text-sm"
            >
              {result.failure === "unauthenticated" ? (
                <>
                  Your session ended.{" "}
                  <a href="/auth" className="font-bold underline">
                    Sign in again
                  </a>{" "}
                  to save.
                </>
              ) : (
                "Your changes couldn’t be saved. Try again."
              )}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="flex min-h-12 w-full items-center justify-center rounded-surface border-2 border-outline-strong bg-content-primary px-4 font-bold text-surface-page disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
