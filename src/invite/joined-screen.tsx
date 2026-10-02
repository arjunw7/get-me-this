import Link from "next/link";

import { Button } from "@/src/ui/button";

/**
 * The joined confirmation (brief 006c): "You're in." plus the group name,
 * shown only after the same verified user has an accepted/joined
 * continuation. The actions are the approved working links — Add an item
 * to my wishlist and Go to home. This state never links to or simulates
 * the later group room, roster, member wishlists, pending members,
 * organizer controls, or gifting views.
 */
export function InviteJoinedScreen({
  groupName,
}: {
  readonly groupName: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-gutter py-10 sm:py-14">
      <span className="inline-flex h-16 w-16 -rotate-6 items-center justify-center rounded-pill border-2 border-outline-strong bg-accent-lime shadow-chunk-sm">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>

      <h1 className="mt-6 font-display text-display-lg leading-[1.02] tracking-tight">
        You&apos;re in.
      </h1>
      <p className="mt-3 text-lg text-content-secondary">
        {groupName
          ? `You joined ${groupName}. Your wishlist is ready for the occasion.`
          : "Your membership is confirmed."}
      </p>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/wishlist"
          className="inline-flex h-control-lg items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-action-primary px-6 font-display text-heading font-bold shadow-chunk transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Add an item to my wishlist
        </Link>
        <Link
          href="/home"
          className="inline-flex h-control-lg items-center justify-center rounded-surface-lg px-6 font-display text-heading font-bold underline-offset-4 hover:underline"
        >
          Go to home
        </Link>
      </div>

      <p className="mt-6 text-caption text-content-secondary">
        The group room opens for everyone closer to the occasion.
      </p>
    </div>
  );
}

/**
 * The one generic unavailable state (brief 006c): malformed, unknown,
 * expired, revoked, exhausted, missing-cookie, expired-continuation, and
 * invalidated flows all render this. It never reveals whether the group,
 * invitation, target, or account exists.
 */
export function InviteUnavailableScreen() {
  return (
    <div className="mx-auto w-full max-w-xl px-gutter py-10 sm:py-14">
      <span className="inline-flex h-16 w-16 -rotate-6 items-center justify-center rounded-pill border-2 border-outline-strong bg-surface-sunken shadow-chunk-sm">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.4"
            fill="none"
          />
          <path
            d="M6 18 18 6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <h1 className="mt-6 font-display text-display-lg leading-[1.02] tracking-tight">
        This invite isn&apos;t available.
      </h1>
      <p className="mt-3 text-lg text-content-secondary">
        The link may have expired or been replaced. Ask the organizer for a new
        one.
      </p>

      <div className="mt-8">
        <Link href="/">
          <Button variant="secondary" size="lg">
            Back to Get Me This
          </Button>
        </Link>
      </div>
    </div>
  );
}
