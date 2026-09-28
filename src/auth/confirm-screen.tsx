import Link from "next/link";

import { buttonClassName, cx } from "@/src/ui/styles";
import { CheckIcon, Link2OffIcon, LoaderIcon } from "@/src/landing/icons";
import { authCardClassName, AuthLayout } from "./auth-layout";
import { PreviewNotice } from "./preview-notice";
import type { ConfirmVariant } from "./fixtures";

/**
 * Static magic-link confirmation screen, ported from the frozen V18
 * reference (pages/auth/ConfirmLink.tsx).
 *
 * Every state renders DIRECTLY from its URL fixture — no timer, animation,
 * or transition gates application state:
 *   - bare route and `?state=loading`: the static loading frame
 *   - `?state=valid`: the success frame immediately
 *   - `?state=expired`: the recovery frame immediately
 *
 * STATIC PREVIEW BOUNDARY: no link is checked and nobody is signed in.
 * The success frame's copy never claims a session — the preview notice is
 * visible in the same frame so the represented state can't read as a
 * completed sign-in. Documented copy difference from V18 (reviewed
 * 2026-09-28): V18's "Send a new email" and "We'll send a new one" promise
 * delivery, but here the action only navigates to the code screen and
 * nothing is sent, so the recovery path uses honest journey wording ("Try
 * again with a new code"). A regression test holds the no-delivery-promise
 * rule for every state. The loading→final transition is deliberately
 * absent here; it belongs to Phase 3's real flow and its controlled-time
 * tests (plan amendment approved 2026-09-28).
 */

export function ConfirmScreen({ variant }: { variant: ConfirmVariant }) {
  return (
    <AuthLayout>
      <div className={cx(authCardClassName, "text-center")}>
        <div className="flex flex-col items-center">
          {variant === "loading" ? (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-sunken">
                <LoaderIcon className="h-8 w-8 animate-spin" />
              </span>
              <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">
                Signing you in…
              </h1>
              <p className="mt-2 text-content-secondary">
                Checking your link. This takes a second.
              </p>
            </>
          ) : null}

          {variant === "valid" ? (
            <>
              <span className="flex h-20 w-20 -rotate-6 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-fresh shadow-chunk-sm">
                <CheckIcon className="h-9 w-9" strokeWidth={3} />
              </span>
              <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">
                You’re in.
              </h1>
              <p className="mt-2 text-content-secondary">
                In the real product, this takes you where you were headed.
              </p>
            </>
          ) : null}

          {variant === "expired" ? (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight-soft">
                <Link2OffIcon className="h-8 w-8" />
              </span>
              <h1 className="mt-6 font-display text-4xl leading-[1.02] font-extrabold tracking-tight">
                This link has expired.
              </h1>
              <p className="mt-2 text-content-secondary">
                Sign-in links only work once and last 10 minutes. No harm done.
                In the real product, we’d send a new one.
              </p>
              <Link
                href="/auth/verify"
                className={cx(
                  "mt-7",
                  `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
                )}
              >
                Try again with a new code
              </Link>
              <Link
                href="/auth"
                className="mt-3 inline-flex h-12 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
              >
                Use a different email
              </Link>
            </>
          ) : null}

          <div className="mt-6 w-full">
            <PreviewNotice id="confirm-preview-notice" />
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
