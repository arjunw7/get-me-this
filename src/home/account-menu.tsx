"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { resetAnalyticsOnLogout, SENSITIVE_BLOCK_CLASS } from "@/src/analytics";
import { signOutAction } from "@/src/auth/actions";
import {
  InvitationMutationUnsupportedError,
  runInvitationMutationResolved,
} from "@/src/invite/mutation-broker";

/**
 * The honest minimal account menu (004e/005b): the signed-in email, the
 * My wishlist link to /wishlist (005b lifts this entry's deferral), and a
 * confirmed Log out. The Edit profile entry stays deferred until that
 * route exists (no navigation to unbuilt routes).
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
}: {
  email: string | null;
  /** The display name, for the menu trigger's accessible label. */
  displayName: string;
  /** Whether a live invitation coordinator makes logout brokered. */
  brokered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const confirmHeadingId = useId();

  function confirmLogout() {
    // The analytics identity is reset BEFORE the sign-out server action
    // because the action's redirect makes this page unavailable afterward;
    // the identity reset could not run then. This ordering is the
    // deliberate deviation from the literal "session then identity"
    // wording; to be confirmed by the owner in the PR.
    resetAnalyticsOnLogout();
    startTransition(() => {
      if (!brokered) {
        void signOutAction().catch(() => {
          // A redirect control-flow throw settles the navigation; the
          // action's own failure states cover everything else.
        });
        return;
      }
      void runInvitationMutationResolved(() => signOutAction())
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
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setOpen((current) => !current);
          setConfirming(false);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-surface px-3 text-sm font-bold hover:bg-surface-sunken"
      >
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-fresh text-caption font-extrabold"
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
        Account
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 z-10 mt-2 w-64 rounded-surface-lg border-2 border-outline-strong bg-surface-raised p-4 shadow-chunk"
        >
          {confirming ? (
            <div role="group" aria-labelledby={confirmHeadingId}>
              <p id={confirmHeadingId} className="text-sm font-extrabold">
                Log out of Get Me This?
              </p>
              <p className="mt-1 text-sm text-content-secondary">
                Signing in again needs access to your email.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={confirmLogout}
                  className={cx(
                    buttonClassName({ variant: "primary", size: "md" }),
                    "flex-1",
                  )}
                >
                  Log out
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                  className={cx(
                    buttonClassName({ variant: "subtle", size: "md" }),
                    "flex-1",
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-caption text-content-muted">Signed in as</p>
              <p
                className={cx(
                  "mt-0.5 text-sm font-bold break-all",
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
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-surface border-2 border-outline-strong bg-surface-raised px-3 text-sm font-bold hover:bg-surface-sunken"
              >
                My wishlist
              </Link>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-surface border-2 border-outline-strong bg-surface-raised px-3 text-sm font-bold hover:bg-surface-sunken"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
