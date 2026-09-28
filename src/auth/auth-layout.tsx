import Link from "next/link";
import type { ReactNode } from "react";

import { cx, OUTLINE_WIDTH } from "@/src/ui/styles";

import { ArrowLeftIcon } from "@/src/landing/icons";
import { Wordmark } from "@/src/landing/wordmark";
import { AuthCollage } from "./auth-collage";

/**
 * Shared chrome for the static public auth screens, ported from the frozen
 * V18 reference (components/auth/AuthLayout.tsx).
 *
 * 003a shipped the email-entry destination; 003b extends the layout with
 * the reference's `back` link and `aside` slots. The defaults reproduce the
 * 003a rendering byte-for-byte, so the approved `auth-home` baselines
 * remain valid.
 */

export type AuthLayoutBack = {
  href: string;
  label: string;
};

export function AuthLayout({
  children,
  aside,
  back = { href: "/", label: "Back to home" },
}: {
  children: ReactNode;
  /** Optional content rendered under the card column (V18: InboxPreview). */
  aside?: ReactNode;
  /** Header return link; defaults to the 003a rendering. */
  back?: AuthLayoutBack;
}) {
  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      {/* The reference keeps the auth header at the 6xl container width —
          logo far left, back CTA far right — even though the content column
          below is the narrow 520px card column. */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="Get Me This home">
          <Wordmark className="text-2xl sm:text-3xl" />
        </Link>
        <Link
          href={back.href}
          className="inline-flex h-11 items-center gap-1.5 rounded-surface px-3 text-sm font-bold hover:bg-surface-sunken"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {back.label}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-content-max flex-col px-5 pt-2 pb-16 sm:pt-8">
        <AuthCollage />
        {children}
        {aside ? <div className="mt-10">{aside}</div> : null}
      </main>
    </div>
  );
}

/** Card treatment from the reference (V18: 28px radius, chunk shadow). */
export const authCardClassName =
  "rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-6 shadow-chunk sm:p-8";

/**
 * Email-input treatment, matched to the reference's `inputCls`
 * (V18: h-14, rounded-2xl, 2px solid border, white fill): the height maps
 * to h-control-lg and the 2px outline to the shared border-strong width.
 * The radius is the 1rem surface step, one above the 0.75rem control
 * radius, exactly as the reference renders this control.
 *
 * Unlike the prototype's `outline-none`, the global :focus-visible ring is
 * preserved: production accessibility takes precedence over prototype
 * shortcuts. Valid/invalid tones are mutually exclusive, mirroring
 * `controlClassName` in src/ui/styles.ts.
 */
export function authInputClassName(options: { invalid: boolean }) {
  return cx(
    "mt-1.5 block h-control-lg w-full rounded-surface pl-12 pr-4",
    OUTLINE_WIDTH,
    "text-body text-content-primary placeholder:text-content-muted",
    "transition-[box-shadow] duration-[var(--duration-press)] ease-snap focus:shadow-chunk-sm",
    options.invalid
      ? "border-feedback-error bg-feedback-error-soft"
      : "border-outline-strong bg-surface-raised",
  );
}
