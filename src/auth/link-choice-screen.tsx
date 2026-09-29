"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { Link2OffIcon } from "@/src/landing/icons";
import { verifyMagicLinkAction } from "./actions";
import type { LinkVerifyState } from "./action-state";
import { authCardClassName, AuthLayout } from "./auth-layout";
import {
  linkBackToCodeLabel,
  linkChoiceHeading,
  linkChoiceText,
  linkRejectedCopy,
  linkVerifyButtonLabel,
} from "./flow-copy";

/**
 * The 004d /auth/link choice state, rendered only when the signed link
 * cookie parked a valid token hash. Verification happens ONLY through the
 * explicit "Use my sign-in link" control firing the verify server action —
 * no prefetch, no automatic call — and the hash itself never reaches this
 * component: it lives in the HttpOnly cookie the server reads.
 *
 * On success the action redirects to the approved signed-in boundary on
 * the verification screen (session equivalence with the code path). On any
 * failure the one-shot cookie is gone, so the completed action's route
 * re-render shows the honest recovery screen; the closed generic error
 * state below is a same-render fallback for that outcome.
 */
export function LinkChoiceScreen() {
  const [state, formAction, pending] = useActionState(verifyMagicLinkAction, {
    status: "idle",
  } as LinkVerifyState);

  return (
    <AuthLayout>
      <div className={cx(authCardClassName, "text-center")}>
        <div className="flex flex-col items-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight-soft">
            <Link2OffIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-6 font-display text-4xl leading-[1.02] font-extrabold tracking-tight">
            {linkChoiceHeading}
          </h1>
          <p className="mt-2 text-content-secondary">{linkChoiceText}</p>
          {state.status === "error" ? (
            <p
              role="alert"
              className="mt-3 text-sm font-semibold text-feedback-error"
            >
              {linkRejectedCopy}
            </p>
          ) : null}
          <form action={formAction} className="mt-7 w-full">
            <button
              type="submit"
              disabled={pending}
              className={cx(
                buttonClassName({ variant: "primary", size: "lg" }),
                "w-full",
              )}
            >
              {linkVerifyButtonLabel}
            </button>
          </form>
          <Link
            href="/auth/verify"
            className="mt-3 inline-flex h-12 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
          >
            {linkBackToCodeLabel}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
