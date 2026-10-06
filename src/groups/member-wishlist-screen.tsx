import { vibeClasses, type Vibe } from "@/src/profile/vibe";
import Link from "next/link";

import { ArrowLeftIcon } from "@/src/landing/icons";
import { CardImage, PlaceholderArt } from "@/src/wishlist/card-image";
import { DesireChip } from "@/src/wishlist/wishlist-card";
import { formatMoneyMinor } from "@/src/wishlist/display";

import {
  MEMBER_WISHLIST_EMPTY_TEXT,
  MEMBER_WISHLIST_SHARING_NOTE,
  memberWishlistHeading,
} from "./member-wishlist-view";
import { initialsFor } from "./room-format";
import { CopyToWishlistButton } from "./copy/copy-button";

import type { MemberWishlistItem } from "./member-wishlist-data";

/** The vendored Lucide external-link glyph (no new runtime dependency). */
function ExternalLinkIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function sourceLabel(sourceUrl: string, retailer: string | null): string {
  if (retailer) return retailer;
  try {
    return new URL(sourceUrl).hostname || "Source link";
  } catch {
    return "Source link";
  }
}

export function MemberWishlistItemCard({
  item,
  groupId,
  presentation = "browse",
  budgetLabel,
  compact = false,
  reservedByOther = false,
  reservationBadge,
  children,
  actions,
}: {
  readonly item: MemberWishlistItem;
  readonly groupId: string;
  readonly presentation?: "browse" | "gifting" | "owner" | "room";
  readonly reservationBadge?: "yours" | "other";
  readonly budgetLabel?: string;
  readonly compact?: boolean;
  readonly reservedByOther?: boolean;
  readonly children?: React.ReactNode;
  readonly actions?: React.ReactNode;
}) {
  return (
    <article
      data-testid="member-wishlist-item"
      className={`relative flex h-full flex-col overflow-hidden rounded-[26px] border-2 bg-surface-raised ${reservedByOther ? "border-outline/25 text-content-secondary" : "border-outline-strong"} ${presentation === "gifting" ? "" : "shadow-chunk"}`}
    >
      <div
        className={`relative overflow-hidden bg-surface-sunken ${presentation === "gifting" ? "aspect-[4/3]" : compact ? "aspect-square" : "aspect-[5/4]"}`}
      >
        {item.imageUrl !== null ? (
          <CardImage src={item.imageUrl} title={item.title} />
        ) : (
          <PlaceholderArt title={item.title} />
        )}
        {reservedByOther ? (
          <>
            <div className="absolute inset-0 bg-surface-page/65" />
            <p className="absolute inset-x-3 bottom-3 rounded-pill border-2 border-outline-strong bg-surface-raised px-2 py-2 text-center text-caption font-bold text-content-primary">
              Reserved by someone else
            </p>
          </>
        ) : null}
        {presentation === "room" && reservationBadge ? (
          <div className="absolute inset-x-3 bottom-3">
            <span
              className={`inline-flex items-center gap-1 rounded-pill border-2 border-outline-strong px-2.5 py-1 text-xs font-bold ${reservationBadge === "yours" ? "bg-accent-fresh" : "bg-surface-raised"}`}
            >
              <span aria-hidden="true">
                {reservationBadge === "yours" ? "✓" : "◉"}
              </span>
              {reservationBadge === "yours"
                ? "Reserved by you"
                : "Someone’s on it"}
            </span>
          </div>
        ) : null}
        <div className="absolute left-3 top-3">
          <DesireChip level={item.desireLevel} />
        </div>
      </div>
      <div
        className={`flex flex-1 flex-col gap-2 ${compact ? "p-3.5" : "p-4"}`}
      >
        <h2
          className={`font-display font-extrabold leading-tight ${compact ? "text-base" : "text-xl"}`}
        >
          {item.title}
        </h2>
        <p className="text-sm text-content-secondary">
          {item.sourceUrl !== null ? (
            <span className="font-semibold text-content-primary">
              {sourceLabel(item.sourceUrl, item.retailer)}
            </span>
          ) : item.retailer !== null ? (
            <span className="font-semibold text-content-primary">
              {item.retailer}
            </span>
          ) : null}
          {item.retailer !== null || item.sourceUrl !== null ? (
            <span aria-hidden="true"> · </span>
          ) : null}
          {item.originalAmountMinor !== null &&
          item.originalCurrency !== null ? (
            <span className="font-bold tabular-nums text-content-primary">
              {formatMoneyMinor(
                item.originalAmountMinor,
                item.originalCurrency,
              )}
            </span>
          ) : null}
          {item.sourceUrl !== null && presentation === "browse" ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${item.title}'s original page (opens in a new tab)`}
              className="ml-2 inline-flex min-h-touch-min items-center gap-1 font-semibold underline underline-offset-4 text-content-secondary hover:text-content-primary"
            >
              Original store <ExternalLinkIcon className="h-4 w-4" />
            </a>
          ) : null}
        </p>
        {budgetLabel ? (
          <p className="text-sm font-bold text-content-secondary">
            {budgetLabel}
          </p>
        ) : null}
        {item.note !== null ? (
          <p className="rounded-surface rounded-tl-sm bg-surface-sunken px-3 py-2 text-sm leading-snug text-content-primary">
            {item.note}
          </p>
        ) : null}
        {presentation === "gifting" && !reservedByOther ? children : null}
        {item.sourceUrl !== null &&
        presentation === "gifting" &&
        !reservedByOther ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${item.title}'s original page (opens in a new tab)`}
            className={`inline-flex min-h-touch-min items-center justify-center gap-2 rounded-control border-2 border-outline-strong px-4 font-display text-label font-bold transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${presentation === "gifting" ? "bg-accent-info text-white" : "bg-accent-info-soft text-content-primary"}`}
          >
            {presentation === "gifting" ? "Get this" : "Original page"}
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        ) : null}
        {reservedByOther ? (
          <p className="mt-auto rounded-surface bg-surface-sunken px-3 py-3 text-center text-caption font-bold">
            Someone in the group has this covered.
          </p>
        ) : null}
        {presentation !== "gifting" ? (
          <div className="mt-auto space-y-3 pt-1">
            {children}
            {presentation === "browse"
              ? (actions ?? (
                  <CopyToWishlistButton
                    groupId={groupId}
                    itemId={item.itemId}
                  />
                ))
              : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function MemberWishlistScreen({
  groupId,
  groupName,
  vibe,
  memberDisplayName,
  items,
  itemControls,
  itemActions,
}: {
  readonly groupId: string;
  readonly groupName: string;
  readonly memberUserId: string;
  readonly vibe?: Vibe;
  readonly memberDisplayName: string;
  readonly items: readonly MemberWishlistItem[];
  readonly itemControls?: Readonly<Record<string, React.ReactNode>>;
  readonly itemActions?: Readonly<Record<string, React.ReactNode>>;
}) {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 lg:py-10"
      data-ph-no-capture
      data-testid="member-wishlist"
    >
      <Link
        href={`/groups/${groupId}`}
        className="inline-flex min-h-touch-min items-center gap-1.5 font-bold"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        Back to {groupName}
      </Link>

      <header
        className={`mt-6 flex items-center gap-4 rounded-surface-2xl border-2 border-outline-strong p-5 sm:p-6 ${vibeClasses(vibe)}`}
      >
        <span
          aria-hidden="true"
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong font-display text-label font-bold ${vibeClasses(vibe)}`}
        >
          {initialsFor(memberDisplayName)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-display-lg leading-[1.02] tracking-tight">
            {memberWishlistHeading(memberDisplayName)}
          </h1>
          <p className="mt-1 text-caption opacity-90">
            {MEMBER_WISHLIST_SHARING_NOTE}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <section
          aria-label={memberWishlistHeading(memberDisplayName)}
          data-testid="member-wishlist-empty"
          className="mt-10 flex flex-col items-center rounded-surface-2xl border-2 border-dashed border-outline-strong/35 bg-surface-raised px-6 py-14 text-center"
        >
          <p className="max-w-md text-content-secondary">
            {MEMBER_WISHLIST_EMPTY_TEXT}
          </p>
        </section>
      ) : (
        <ul
          className="mt-10 grid list-none gap-5 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="member-wishlist-grid"
        >
          {items.map((item) => (
            <li key={item.itemId} className="flex">
              <MemberWishlistItemCard
                item={item}
                groupId={groupId}
                actions={itemActions?.[item.itemId]}
              >
                {itemControls?.[item.itemId]}
              </MemberWishlistItemCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
