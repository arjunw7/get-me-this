import { CopyCatSticker } from "@/src/groups/copy/copy-cat";
import { OwnerReactionSummaryRow } from "@/src/groups/reactions/owner-reaction-summary";
import type { OwnerReactionSummary } from "@/src/groups/reactions/reaction-write";
import { AppIcon } from "@/src/home/app-icon";
import Link from "next/link";

import { CardImage, PlaceholderArt } from "./card-image";
import type { WishlistItemView } from "./display";
import {
  DESIRE_LEVELS,
  currencyMinorDigits,
  formatMoneyMinor,
  approximateConversionView,
} from "./display";
import { Tape } from "./tape";
import typography from "./wishlist-typography.module.css";

function sourceLabel(sourceUrl: string, retailer: string | null): string {
  if (retailer) return retailer;
  try {
    return new URL(sourceUrl).hostname || "Source link";
  } catch {
    return "Source link";
  }
}

/**
 * One wishlist card (005b), ported from the frozen V18 reference
 * (components/ShelfieCard.tsx) with semantic tokens: the image field with
 * the desire chip overlay, title, retailer, original amount with currency,
 * and the note speech-bubble when a note exists.
 *
 * Image preference (005f, per 005a resolution 7): the card renders the
 * server-resolved `imageSrc` — the short-expiry signed snapshot URL when
 * the row references a private snapshot object, else the remote
 * `image_url`, else the branded placeholder. Raw storage paths never
 * reach the client: the server strips them into `imageSrc` (005f).
 */

/** The V18 masonry variety: cycling aspect ratios, tilts, and tape. */
const ASPECTS = [
  "aspect-[4/5]",
  "aspect-square",
  "aspect-[3/4]",
  "aspect-[5/4]",
] as const;
const TILTS = ["", "lg:rotate-[0.6deg]", "", "lg:-rotate-[0.6deg]"] as const;

const DESIRE_CHIP_STYLES: Record<WishlistItemView["desireLevel"], string> = {
  really_want: "border-outline-strong bg-action-primary text-content-primary",
  would_love:
    "border-outline-strong bg-accent-highlight-soft text-content-primary",
  just_an_idea:
    "border-outline-strong/40 border-dashed bg-surface-raised text-content-secondary",
};

const DESIRE_DOT_STYLES: Record<WishlistItemView["desireLevel"], string> = {
  really_want: "bg-content-primary",
  would_love: "bg-accent-highlight-strong",
  just_an_idea: "bg-content-primary/30",
};

function DesireChip({ level }: { level: WishlistItemView["desireLevel"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border-2 px-2.5 py-1 text-caption font-bold ${DESIRE_CHIP_STYLES[level]}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${DESIRE_DOT_STYLES[level]}`}
      />
      {DESIRE_LEVELS[level]}
    </span>
  );
}

export function WishlistCard({
  item,
  index,
  reactionSummary,
}: {
  item: WishlistItemView;
  index: number;
  reactionSummary?: OwnerReactionSummary;
}) {
  const aspect = ASPECTS[index % ASPECTS.length];
  const tilt = TILTS[index % TILTS.length];
  const showTape = index % 3 === 1;
  // The approximate-converted line (005g, dormant conversion): null for
  // every organically created item in V1 — no provider exists, so no
  // conversion is inferred from locale, language, or symbol. Staleness
  // was evaluated at server read time; a stale tuple renders the
  // identical line with its captured date.
  const approximate = approximateConversionView(item);

  return (
    <div className={`relative ${tilt}`}>
      {item.isCopied ? <CopyCatSticker /> : null}
      {showTape ? (
        <Tape className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 -rotate-3" />
      ) : null}
      <article className="flex h-full flex-col overflow-hidden rounded-surface-lg border-2 border-outline-strong bg-surface-raised shadow-chunk">
        <div className={`relative overflow-hidden bg-surface-sunken ${aspect}`}>
          {item.imageSrc !== null ? (
            <CardImage
              key={item.imageSrc}
              src={item.imageSrc}
              title={item.title}
            />
          ) : (
            <PlaceholderArt title={item.title} />
          )}
          <Link
            href={`/wishlist/items/${item.id}/edit`}
            aria-label={`Edit ${item.title}`}
            className={`absolute right-3 ${item.isCopied ? "bottom-3" : "top-3"} inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-raised text-content-primary shadow-chunk-sm transition-transform hover:-translate-y-0.5`}
          >
            <AppIcon name="edit" />
          </Link>
          <div className="absolute left-3 top-3">
            <DesireChip level={item.desireLevel} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div>
            <h3 className="font-display text-heading leading-tight">
              {item.title}
            </h3>
            <p className="mt-1 text-sm text-content-secondary">
              {item.sourceUrl !== null ? (
                <a
                  href={item.sourceUrl}
                  rel="noreferrer"
                  // The 44px touch target (DESIGN.md) without a layout
                  // shift: vertical padding on an inline element does not
                  // change the line box, and the negative margins keep the
                  // rule holding if the display ever becomes atomic.
                  className="py-4 -my-4 font-semibold text-content-primary underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
                >
                  {sourceLabel(item.sourceUrl, item.retailer)}
                </a>
              ) : item.retailer !== null ? (
                <span className="font-semibold text-content-primary">
                  {item.retailer}
                </span>
              ) : null}
              {(item.sourceUrl !== null || item.retailer !== null) &&
              item.originalAmountMinor !== null &&
              item.originalCurrency !== null ? (
                <span aria-hidden="true"> · </span>
              ) : null}
              {item.originalAmountMinor !== null &&
              item.originalCurrency !== null ? (
                <span className="font-bold tabular-nums text-content-primary">
                  {currencyMinorDigits(item.originalCurrency) === null
                    ? `${item.originalAmountMinor} ${item.originalCurrency} — price display unavailable`
                    : formatMoneyMinor(
                        item.originalAmountMinor,
                        item.originalCurrency,
                      )}
                </span>
              ) : null}
            </p>
          </div>
          {approximate !== null ? (
            <p
              className="text-sm text-content-secondary tabular-nums"
              data-testid="approximate-price-line"
            >
              {/* The ≈ glyph is not announced: the accessible text carries
                  "approximately", the amount and code, the rate source, and
                  the captured UTC date. The marker is textual, never
                  color-only, and never replaces the original line. */}
              <span aria-hidden="true">{approximate.visible}</span>
              <span className="sr-only">{approximate.accessible}</span>
            </p>
          ) : null}
          {item.note !== null ? (
            <p className="relative rounded-surface rounded-tl-sm bg-surface-sunken px-3 py-2 text-sm leading-snug text-content-primary">
              {item.note}
            </p>
          ) : null}
          {reactionSummary?.itemId === item.id ? (
            <OwnerReactionSummaryRow summary={reactionSummary} />
          ) : null}
        </div>
      </article>
    </div>
  );
}

/** The wishlist card grid: the V18 masonry composition, in read order. */
export function WishlistCardGrid({
  items,
  reactionSummaries,
}: {
  items: readonly WishlistItemView[];
  reactionSummaries?: Readonly<Record<string, OwnerReactionSummary>>;
}) {
  return (
    <div
      className={`columns-1 gap-6 min-[480px]:columns-2 lg:columns-3 ${items.some((item) => item.isCopied) ? "pr-3 pt-6" : ""}`}
    >
      {items.map((item, index) => (
        <div key={item.id} className="mb-7 break-inside-avoid">
          <WishlistCard
            item={item}
            index={index}
            reactionSummary={reactionSummaries?.[item.id]}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The V18 empty state (components/shelfie/ShelfieEmpty.tsx), with brief
 * resolution 1's pinned CTA label — "Add an item", the approved product
 * vocabulary — instead of the prototype's "Add from a link". The copy
 * never implies public visibility, and there are no fake items, ever.
 */
export function WishlistEmpty() {
  return (
    <section
      aria-label="Your wishlist is empty"
      className="flex flex-col items-center rounded-surface-2xl border-2 border-dashed border-outline-strong/35 bg-surface-raised px-6 py-14 text-center"
    >
      <div className="relative h-36 w-56" aria-hidden="true">
        <div className="absolute left-2 top-4 h-28 w-24 -rotate-6 rounded-surface border-2 border-dashed border-outline-strong/30 bg-surface-sunken" />
        <div className="absolute right-2 top-2 h-28 w-24 rotate-6 rounded-surface border-2 border-dashed border-outline-strong/30 bg-surface-sunken" />
        <div className="absolute left-1/2 top-0 h-32 w-28 -translate-x-1/2 rounded-surface border-2 border-outline-strong bg-surface-raised shadow-chunk">
          <Tape className="absolute -top-3 left-1/2 w-14 -translate-x-1/2 rotate-2" />
          <span className="absolute inset-0 flex items-center justify-center font-display text-display-md font-extrabold text-content-primary/20">
            ?
          </span>
        </div>
      </div>
      <h2
        className={`mt-8 font-display font-extrabold tracking-tight ${typography.emptyHeading}`}
      >
        Very minimalist of you.
      </h2>
      <p className="mt-2 max-w-md text-content-secondary">
        {
          "Add the first thing you'd secretly love to unwrap. A candle, a camera, the hoodie you keep looking at."
        }
      </p>
      <Link
        href="/wishlist/items/new"
        className="mt-6 inline-flex min-h-touch-min items-center rounded-surface border-2 border-outline-strong bg-action-primary px-6 font-bold text-content-primary shadow-chunk transition-transform duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5"
      >
        Add an item
      </Link>
    </section>
  );
}

export { DesireChip };
