import Link from "next/link";

import { buttonClassName, cx } from "@/src/ui/styles";
import { Link2OffIcon } from "@/src/landing/icons";
import { authCardClassName, AuthLayout } from "./auth-layout";
import {
  confirmBackToCodeLabel,
  confirmChangeEmailLabel,
  confirmInterimHeading,
  confirmInterimText,
} from "./flow-copy";

/**
 * The interim /auth/confirm state (004c, owner reviews 2026-09-28).
 *
 * The emailed link is built from the trusted destination plus the token
 * hash, so clicking it cannot consume the one-time token, invalidate the
 * six-digit code, or create a session. The proxy discards any query before
 * this page renders, and the route never verifies on GET — 004d adds the
 * explicit-action verification. Until then this is the route's ONLY state:
 * no false "signed in", no endless loading, a clear not-yet message with a
 * path back to code entry. Copy is honest about the not-yet boundary.
 */
export function ConfirmScreen() {
  return (
    <AuthLayout>
      <div className={cx(authCardClassName, "text-center")}>
        <div className="flex flex-col items-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight-soft">
            <Link2OffIcon className="h-8 w-8" />
          </span>
          <h1 className="mt-6 font-display text-4xl leading-[1.02] font-extrabold tracking-tight">
            {confirmInterimHeading}
          </h1>
          <p className="mt-2 text-content-secondary">{confirmInterimText}</p>
          <Link
            href="/auth/verify"
            className={cx(
              "mt-7",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {confirmBackToCodeLabel}
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
