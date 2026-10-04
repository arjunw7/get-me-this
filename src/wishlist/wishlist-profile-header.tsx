import type { ReactNode } from "react";
import {
  DEFAULT_VIBE,
  VIBE_OPTIONS,
  vibeClasses,
  type Vibe,
} from "@/src/profile/vibe";
import { profileInitials } from "@/src/home/profile-initials";
import { formatItemCount } from "./display";
import typography from "./wishlist-typography.module.css";

/**
 * The V18 profile composition uses the owner’s persisted Vibe and real initials.
 */
export function WishlistProfileHeader({
  displayName,
  tasteLine,
  vibe = DEFAULT_VIBE,
  itemCount,
  actions,
  label,
}: {
  displayName: string;
  tasteLine: string | null;
  vibe?: Vibe;
  itemCount: number;
  actions?: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label ?? displayName}
      className="relative overflow-hidden rounded-surface-2xl border-2 border-outline-strong bg-surface-raised shadow-chunk"
    >
      <div
        data-vibe={vibe}
        className={`relative h-24 border-b-2 border-outline-strong sm:flex sm:h-auto sm:min-h-28 sm:items-end sm:px-7 sm:pt-3 sm:pb-3 ${vibeClasses(vibe)}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full opacity-30"
        >
          <path
            d="M-10 70 C 60 20, 110 100, 180 55 S 300 10, 410 60"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
        </svg>
        <h1
          className={`relative hidden font-display font-extrabold tracking-tight sm:ml-[7.25rem] sm:block sm:min-w-0 sm:flex-1 ${typography.profileName}`}
        >
          {displayName}
        </h1>
      </div>
      <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div className="flex flex-col gap-3 sm:min-w-0 sm:flex-1 sm:flex-row sm:items-start sm:gap-5">
          <span
            aria-hidden="true"
            className={`relative z-10 -mt-12 flex h-24 w-24 flex-none items-center justify-center rounded-full border-2 border-outline-strong font-display text-3xl font-extrabold shadow-chunk-sm ring-4 ring-surface-raised ${vibeClasses(vibe)}`}
          >
            {profileInitials(displayName)}
          </span>
          <div className="sm:mt-1">
            <h1
              className={`font-display font-extrabold tracking-tight sm:hidden ${typography.profileName}`}
            >
              {displayName}
            </h1>
            {tasteLine !== null ? (
              <p className="mt-0.5 text-lg text-content-secondary">
                {tasteLine}
              </p>
            ) : null}
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-content-muted">
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full border border-outline-strong ${vibeClasses(vibe)}`}
              />
              <span>
                {VIBE_OPTIONS.find((option) => option.value === vibe)?.label}{" "}
                vibe · <span>{formatItemCount(itemCount)}</span>
              </span>
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2 sm:pt-3">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
