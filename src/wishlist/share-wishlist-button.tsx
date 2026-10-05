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
import { buttonClassName } from "@/src/ui/styles";
import type { OwnShareState, ShareWishlistChange } from "./public-share-types";

export function ShareWishlistButton({
  state,
  onChange,
  showLabel = false,
  onShared,
}: {
  state: OwnShareState;
  onChange: ShareWishlistChange;
  showLabel?: boolean;
  onShared?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [saved, setSaved] = useState<OwnShareState | null>(null);
  // Revalidation can deliver older props while an action is completing.
  // Versions are validated canonical bigint strings at the server boundary.
  const current =
    saved && BigInt(saved.version) > BigInt(state.version) ? saved : state;
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="Share wishlist"
        aria-haspopup="dialog"
        onClick={() => {
          setOrigin(window.location.origin);
          setOpen(true);
        }}
        className={
          showLabel
            ? `${buttonClassName({ variant: "primary", size: "md" })} cursor-pointer gap-2`
            : "inline-flex cursor-pointer transition-colors hover:bg-surface-sunken h-11 w-11 shrink-0 items-center justify-center rounded-control border-2 border-outline-strong bg-surface-raised text-content-primary"
        }
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" />
        </svg>
        {showLabel ? "Share wishlist" : null}
      </button>
      {open
        ? createPortal(
            <ShareSheet
              state={current}
              origin={origin}
              onClose={close}
              onShared={onShared}
              onChange={async (version, enabled) => {
                const result = await onChange(version, enabled);
                if (result.status === "saved") setSaved(result.state);
                return result;
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ShareSheet({
  state,
  origin,
  onChange,
  onClose,
  onShared,
}: {
  state: OwnShareState;
  origin: string;
  onChange: ShareWishlistChange;
  onClose: () => void;
  onShared?: () => void;
}) {
  const id = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const focusedVersion = useRef(state.version);
  const [error, setError] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const url =
    state.enabled && state.shareToken
      ? `${origin}/s/${encodeURIComponent(state.shareToken)}`
      : null;
  useEffect(() => {
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    if (pending || focusedVersion.current === state.version) return;
    focusedVersion.current = state.version;
    closeButton.current?.focus();
  }, [state.version, pending]);

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!pending) onClose();
    }
    if (event.key !== "Tab") return;
    const targets = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), a[href]",
      ),
    );
    const first = targets[0],
      last = targets[targets.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function enableSharing() {
    setError(false);
    setCopyState("idle");
    startTransition(async () => {
      try {
        const result = await onChange(state.version, true);
        if (result.status === "error") setError(true);
      } catch {
        setError(true);
      }
    });
  }
  async function copy() {
    if (!url) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      onShared?.();
    } catch {
      setCopyState("failed");
      linkInput.current?.focus();
      linkInput.current?.select();
    }
  }
  return (
    <div
      className="ph-no-capture fixed inset-0 z-[100] flex items-end justify-center bg-content-primary/40 sm:items-center sm:p-6"
      data-ph-no-capture
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        aria-busy={pending}
        onKeyDown={keyboard}
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-surface-xl border-2 border-outline-strong bg-surface-page p-5 pb-8 shadow-chunk-lg sm:max-w-md sm:rounded-surface-xl sm:pb-6"
      >
        <header className="flex items-start justify-between gap-3">
          <h2
            id={`${id}-title`}
            className="font-display text-2xl font-extrabold"
          >
            Share your wishlist
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close sharing"
            disabled={pending}
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-outline-strong bg-surface-raised text-xl transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:cursor-not-allowed"
          >
            ×
          </button>
        </header>
        <p
          id={`${id}-description`}
          className="mt-3 text-sm text-content-secondary"
        >
          {state.enabled
            ? "Anyone with your link can see your profile and wishlist. People who sign in can react. Reservations and group gifting stay private."
            : "Your public wishlist is turned off. Enable sharing to make it available again."}
        </p>
        {url ? (
          <div className="mt-5 space-y-3">
            <label className="block text-sm font-bold" htmlFor={`${id}-link`}>
              Public wishlist link
            </label>
            <div className="relative">
              <input
                ref={linkInput}
                id={`${id}-link`}
                value={url}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                className="h-12 w-full rounded-control border-2 border-outline-strong bg-surface-raised pl-3 pr-14 text-sm"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open public wishlist (opens in a new tab)"
                title="Open public wishlist"
                className="absolute right-0.5 top-0.5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-content-primary transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h6v6M10 14 21 3" />
                  <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                </svg>
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void copy()}
                className="min-h-12 cursor-pointer rounded-control border-2 border-outline-strong bg-content-primary px-4 py-3 font-bold text-surface-raised hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info"
              >
                Copy link
              </button>
              <a
                onClick={onShared}
                href={`https://wa.me/?text=${encodeURIComponent(`Here's my wishlist on Get Me This: ${url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center rounded-control border-2 border-outline-strong bg-surface-raised px-4 py-3 text-center font-bold shadow-chunk-sm hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info"
              >
                Share on WhatsApp
              </a>
            </div>
            {copyState !== "idle" ? (
              <p role="status" className="text-sm">
                {copyState === "copied"
                  ? "Link copied."
                  : "Copy didn’t work. Select and copy the link above."}
              </p>
            ) : null}
          </div>
        ) : state.enabled ? (
          <p role="status" className="mt-5 text-sm">
            Your sharing link is unavailable right now. Close this sheet and try
            again.
          </p>
        ) : null}
        {!state.enabled ? (
          <button
            type="button"
            disabled={pending}
            onClick={enableSharing}
            className="mt-5 min-h-12 w-full cursor-pointer rounded-control border-2 border-outline-strong bg-action-primary px-4 font-bold transition-colors hover:bg-action-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Enabling…" : "Enable sharing"}
          </button>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-4 text-sm font-semibold text-feedback-error"
          >
            Sharing couldn’t be updated. Try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
