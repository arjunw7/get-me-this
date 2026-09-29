import Link from "next/link";

import { buttonClassName, cx } from "@/src/ui/styles";
import { Link2OffIcon } from "@/src/landing/icons";
import { authCardClassName, AuthLayout } from "./auth-layout";
import {
  confirmChangeEmailLabel,
  linkBackToCodeLabel,
  linkRecoveryHeading,
  linkRecoveryText,
} from "./flow-copy";

/**
 * The 004d /auth/link recovery state: rendered when no valid link cookie
 * is present — the link was missing, malformed, expired, already used, or
 * the parked value was rejected server-side. Honest about the failure,
 * identical for every cause (no error leak), and always offering the
 * working paths back: code entry (with its resend control) or a fresh
 * start at the entry screen.
 */
export function LinkRecoveryScreen() {
  return (
    <AuthLayout>
      <div className={cx(authCardClassName, "text-center")}>
        <div className="flex flex-col items-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight-soft">
            <Link2OffIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-6 font-display text-4xl leading-[1.02] font-extrabold tracking-tight">
            {linkRecoveryHeading}
          </h1>
          <p className="mt-2 text-content-secondary">{linkRecoveryText}</p>
          <Link
            href="/auth/verify"
            className={cx(
              "mt-7",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {linkBackToCodeLabel}
          </Link>
          <Link
            href="/auth"
            className="mt-3 inline-flex h-12 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
          >
            {confirmChangeEmailLabel}
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
