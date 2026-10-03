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
import { accentClassFor, initialsFor } from "./room-format";
import { CopyToWishlistButton } from "./copy/copy-button";

import type { MemberWishlistItem } from "./member-wishlist-data";

/**
 * The member wishlist browse screen (brief 006e): the V18 gifting-browse
 * member-wishlist region (the "Kabir's wishlist" item-grid region of the
 * approved prototype) backed by the authorized projection. The member
 * header identifies whose wishlist this is and states the sharing truth;
 * the item cards show only the authorized projection fields in the owner's
 * committed order.
 *
 * Deliberately absent (the briefs' non-goals): the gifting banner and
 * budget-fit summary, per-item reserve actions and reservation state, gift
 * tracking, budget-comparison filtering, gifting navigation, reaction
 * controls (a separate wiring slice owns those), and any edit affordance —
 * a member never edits another person's wishlist. The whole surface is
 * marked data-ph-no-capture: it maps group membership to wishlist
 * ownership, so autocapture and session replay are blocked.
 *
 * The one interactive affordance is the 007b `Copy to my wishlist` action
 * on each friend item card: it copies the item into the visitor's own
 * wishlist without navigation and reveals nothing about the copy to
 * anyone.
 */

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

function MemberWishlistItemCard({
  item,
  groupId,
}: {
  readonly item: MemberWishlistItem;
  readonly groupId: string;
}) {
  return (
    <article
      data-testid="member-wishlist-item"
      className="flex h-full flex-col overflow-hidden rounded-surface-lg border-2 border-outline-strong bg-surface-raised shadow-chunk"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
        {item.imageUrl !== null ? (
          <CardImage src={item.imageUrl} title={item.title} />
        ) : (
          <PlaceholderArt title={item.title} />
        )}
        <div className="absolute left-3 top-3">
          <DesireChip level={item.desireLevel} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-display text-heading leading-tight">
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
        </p>
        {item.note !== null ? (
          <p className="rounded-surface rounded-tl-sm bg-surface-sunken px-3 py-2 text-sm leading-snug text-content-primary">
            {item.note}
          </p>
        ) : null}
        {item.sourceUrl !== null ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${item.title}'s original page (opens in a new tab)`}
            className="inline-flex min-h-touch-min items-center justify-center gap-2 rounded-control border-2 border-outline-strong bg-accent-info-soft px-4 font-display text-label font-bold text-content-primary transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Original page
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        ) : null}
        <CopyToWishlistButton groupId={groupId} itemId={item.itemId} />
      </div>
    </article>
  );
}

export function MemberWishlistScreen({
  groupId,
  groupName,
  memberUserId,
  memberDisplayName,
  items,
}: {
  readonly groupId: string;
  readonly groupName: string;
  readonly memberUserId: string;
  readonly memberDisplayName: string;
  readonly items: readonly MemberWishlistItem[];
}) {
  return (
    <div
      className="mx-auto w-full max-w-4xl px-gutter py-10 sm:py-14"
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

      <header className="mt-6 flex items-center gap-4">
        <span
          aria-hidden="true"
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong font-display text-label font-bold ${accentClassFor(memberUserId)}`}
        >
          {initialsFor(memberDisplayName)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-display-lg leading-[1.02] tracking-tight">
            {memberWishlistHeading(memberDisplayName)}
          </h1>
          <p className="mt-1 text-caption text-content-secondary">
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
          className="mt-10 grid list-none gap-5 sm:grid-cols-2"
          data-testid="member-wishlist-grid"
        >
          {items.map((item) => (
            <li key={item.itemId} className="flex">
              <MemberWishlistItemCard item={item} groupId={groupId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
