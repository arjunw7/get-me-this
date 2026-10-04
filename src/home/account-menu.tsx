"use client";

import { DEFAULT_VIBE, vibeClasses, type Vibe } from "@/src/profile/vibe";
import Link from "next/link";
import { EditProfileDialog } from "@/src/profile/edit-profile-button";
import { profileInitials } from "./profile-initials";
import { AppIcon } from "./app-icon";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { cx } from "@/src/ui/styles";
import { resetAnalyticsOnLogout, SENSITIVE_BLOCK_CLASS } from "@/src/analytics";
import { signOutAction } from "@/src/auth/actions";
import {
  InvitationMutationUnsupportedError,
  runInvitationMutationResolved,
} from "@/src/invite/mutation-broker";

const menuItemClassName =
  "flex h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-[15px] font-semibold transition-colors duration-150 hover:bg-surface-sunken focus-visible:bg-surface-sunken";

/**
 * The honest minimal account menu (004e/005b): the signed-in email, the
 * My wishlist link to /wishlist (005b lifts this entry's deferral), and a
 * confirmed Log out. Edit profile opens the owner-scoped name and taste-line dialog.
 *
 * Logout requires confirmation (signing in again requires email access),
 * then resets the typed analytics identity through the approved adapter
 * BEFORE the server action clears the local-scoped session — the
 * authenticated PostHog identity cannot survive the logout — and lands on
 * the approved logged-out copy on the landing page.
 *
 * While a browser-bound invitation coordinator exists (brief 006c
 * criterion 12) the confirmed logout runs under the invitation
 * auth-mutation broker: the origin-wide Web Lock is held until the
 * mutation's cookie delivery is acknowledged or recovered, so a
 * concurrent tab's invitation verification can never interleave its
 * session delivery with this logout.
 */

export function AccountMenu({
  email,
  displayName,
  brokered = false,
  variant = "standalone",
  tasteLine,
  vibe,
}: {
  email: string | null;
  /** The display name, for the menu trigger's accessible label. */
  displayName: string;
  /** Whether a live invitation coordinator makes logout brokered. */
  brokered?: boolean;
  variant?: "standalone" | "sidebar" | "topbar";
  tasteLine?: string | null;
  vibe?: Vibe;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const menuId = useId();

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function closeDialog() {
    setEditing(false);
    setConfirming(false);
    triggerRef.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    function outside(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function keyboard(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("click", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  function confirmLogout() {
    // The analytics identity is reset BEFORE the sign-out server action
    // because the action's redirect makes this page unavailable afterward;
    // the identity reset could not run then. This ordering is the
    // deliberate deviation from the literal "session then identity"
    // wording; to be confirmed by the owner in the PR.
    resetAnalyticsOnLogout();
    startTransition(async () => {
      if (!brokered) {
        await signOutAction().catch(() => {
          // A redirect control-flow throw settles the navigation; the
          // action's own failure states cover everything else.
        });
        return;
      }
      await runInvitationMutationResolved(() => signOutAction())
        .then((outcome) => {
          // The landing-page redirect is applied by the router's own
          // RedirectBoundary after the cleared-session delivery settled
          // inside the lock; a resolved (non-redirect) outcome leaves the
          // screen as it was.
          if (outcome.kind === "redirect") return;
        })
        .catch((error: unknown) => {
          // Without the origin-wide lock the mutation never ran — never a
          // half-applied logout. The menu closes; the user can retry.
          if (!(error instanceof InvitationMutationUnsupportedError)) {
            throw error;
          }
        });
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
          setConfirming(false);
        }}
        className={`inline-flex min-h-11 items-center gap-3 rounded-surface text-sm font-bold hover:bg-surface-sunken ${variant === "sidebar" ? "w-full px-2 py-2 text-left" : "px-2"}`}
      >
        <span
          aria-hidden
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-outline-strong text-caption font-extrabold ${vibeClasses(vibe)}`}
        >
          {profileInitials(displayName)}
        </span>
        {variant === "sidebar" ? (
          <span className="min-w-0">
            <span className="block truncate">{displayName}</span>
            {tasteLine && (
              <span className="block truncate text-xs font-normal text-content-muted">
                {tasteLine}
              </span>
            )}
          </span>
        ) : variant === "standalone" ? (
          "Account"
        ) : null}
      </button>

      {open ? (
        <div
          id={menuId}
          data-testid="account-menu-content"
          className={`absolute z-50 w-60 rounded-surface border-2 border-outline-strong bg-surface-page p-1.5 shadow-chunk ${variant === "sidebar" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"}`}
        >
          <div>
            <p
              className={cx(
                "truncate px-3 pt-1.5 pb-2 text-xs text-content-muted",
                // The signed-in email is never captured or recorded.
                SENSITIVE_BLOCK_CLASS,
              )}
              data-ph-no-capture
            >
              {email ?? "Your email is unavailable right now."}
            </p>
            {/* 005b lifts this entry's deferral: /wishlist now exists. */}
            <Link
              href="/wishlist"
              onClick={closeMenu}
              className={menuItemClassName}
            >
              <AppIcon name="wishlist" className="h-4 w-4 shrink-0" />
              My wishlist
            </Link>
            <button
              type="button"
              className={menuItemClassName}
              onClick={() => {
                setOpen(false);
                setSaved(false);
                setEditing(true);
              }}
            >
              <AppIcon name="edit" className="h-4 w-4 shrink-0" />
              Edit profile
            </button>
            <div
              aria-hidden="true"
              className="my-1 border-t-2 border-outline-strong/10"
            />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
              className={menuItemClassName}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Log out
            </button>
          </div>
        </div>
      ) : null}
      {saved ? (
        <span role="status" className="sr-only">
          Profile changes saved.
        </span>
      ) : null}
      {editing
        ? createPortal(
            <EditProfileDialog
              displayName={displayName}
              tasteLine={tasteLine ?? null}
              vibe={vibe ?? DEFAULT_VIBE}
              onClose={closeDialog}
              onSaved={() => {
                setSaved(true);
                closeDialog();
              }}
            />,
            document.body,
          )
        : null}
      {confirming
        ? createPortal(
            <LogoutConfirmation
              pending={pending}
              onClose={closeDialog}
              onConfirm={confirmLogout}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function LogoutConfirmation({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
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
    }
    if (event.key !== "Tab") return;
    const targets = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    if (!targets.length) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === targets[0]) {
      event.preventDefault();
      targets.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === targets.at(-1)) {
      event.preventDefault();
      targets[0]?.focus();
    }
  }
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-content-primary/40 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={`${headingId}-description`}
        aria-busy={pending}
        onKeyDown={keyboard}
        className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-surface-xl border-2 border-outline-strong bg-surface-page p-5 pb-8 shadow-chunk-lg sm:max-w-md sm:rounded-surface-xl sm:pb-6"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id={headingId}
              className="font-display text-2xl leading-tight font-extrabold"
            >
              Log out of Get Me This?
            </h2>
            <p
              id={`${headingId}-description`}
              className="mt-1 text-sm text-content-secondary"
            >
              Your wishlist and reservations stay saved. Next time, we’ll email
              you a code to get back in.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            disabled={pending}
            onClick={onClose}
            aria-label="Close log out confirmation"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-raised hover:bg-surface-sunken disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="m18 6-12 12M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-12 items-center justify-center rounded-surface border-2 border-outline-strong bg-surface-raised px-5 font-bold hover:bg-surface-sunken disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-surface border-2 border-outline-strong bg-action-primary px-5 font-bold text-content-primary shadow-chunk-sm disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {pending ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}
