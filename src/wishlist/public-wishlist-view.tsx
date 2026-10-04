"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/src/landing/wordmark";
import { WishlistProfileHeader } from "./wishlist-profile-header";
import { ReactionRow } from "@/src/groups/reactions/reaction-row";
import { OwnerReactionSummaryRow } from "@/src/groups/reactions/owner-reaction-summary";
import type {
  ReactionKind,
  ReactionSummaryRow,
} from "@/src/groups/reactions/types";
import type { ReactionWriteOutcome } from "@/src/groups/reactions/reaction-write";
import type { PublicWishlistView as PublicWishlistSnapshot } from "./public-share-types";
import { CardImage, PlaceholderArt } from "./card-image";
import { DesireChip } from "./wishlist-card";
import { currencyMinorDigits, formatMoneyMinor } from "./display";

type ReactToPublicItem = (
  itemId: string,
  reaction: ReactionKind | null,
) => Promise<ReactionWriteOutcome>;

export function PublicWishlistView({
  token,
  snapshot,
  signedIn,
  onReact,
  signinHref,
}: {
  token: string;
  snapshot: PublicWishlistSnapshot;
  signedIn: boolean;
  onReact: ReactToPublicItem;
  signinHref: string;
}) {
  return (
    <div
      className="min-h-screen bg-surface-page pb-16 text-content-primary"
      data-ph-no-capture
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link
          href="/"
          aria-label="Get Me This home"
          className="inline-flex min-h-11 items-center"
        >
          <Wordmark className="text-2xl" />
        </Link>
        {signedIn ? (
          <Link
            href="/wishlist"
            className="inline-flex min-h-11 items-center text-sm font-bold underline"
          >
            My wishlist
          </Link>
        ) : (
          <Link
            href={signinHref}
            className="inline-flex min-h-11 items-center text-sm font-bold underline"
          >
            Sign in
          </Link>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-5 pt-4 sm:px-8">
        <WishlistProfileHeader
          displayName={snapshot.displayName}
          tasteLine={snapshot.tasteLine}
          vibe={snapshot.vibe}
          itemCount={snapshot.items.length}
          label={`${snapshot.displayName}'s profile`}
        />
        {snapshot.items.length === 0 ? (
          <section className="mt-8 rounded-surface-2xl border-2 border-dashed border-outline-strong/35 bg-surface-raised px-6 py-14 text-center">
            <h2 className="font-display text-2xl font-extrabold">
              No wishlist items yet.
            </h2>
            <p className="mt-3 text-content-secondary">
              Check back once {snapshot.displayName} adds something they’d love.
            </p>
          </section>
        ) : (
          <ul
            className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Wishlist items"
          >
            {snapshot.items.map((item) => (
              <li key={`${token}:${item.itemId}`} className="min-w-0">
                <article className="flex h-full flex-col overflow-hidden rounded-[26px] border-2 border-outline-strong bg-surface-raised shadow-chunk">
                  <div className="relative aspect-[5/4] overflow-hidden bg-surface-sunken">
                    {item.imageUrl ? (
                      <CardImage src={item.imageUrl} title={item.title} />
                    ) : (
                      <PlaceholderArt title={item.title} />
                    )}
                    <div className="absolute left-3 top-3">
                      <DesireChip level={item.desireLevel} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h2 className="break-words font-display text-xl font-extrabold leading-tight">
                      {item.title}
                    </h2>
                    <p className="text-sm text-content-secondary">
                      {item.retailer ? <span>{item.retailer}</span> : null}
                      {item.retailer &&
                      item.originalAmountMinor !== null &&
                      item.originalCurrency
                        ? " · "
                        : ""}
                      {item.originalAmountMinor !== null &&
                      item.originalCurrency ? (
                        <span className="font-bold text-content-primary">
                          {currencyMinorDigits(item.originalCurrency) === null
                            ? `${item.originalAmountMinor} ${item.originalCurrency} — price display unavailable`
                            : formatMoneyMinor(
                                item.originalAmountMinor,
                                item.originalCurrency,
                              )}
                        </span>
                      ) : null}
                    </p>
                    {item.note ? (
                      <p className="rounded-surface bg-surface-sunken px-3 py-2 text-sm">
                        {item.note}
                      </p>
                    ) : null}
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-bold underline underline-offset-4"
                      >
                        Original page
                        <span className="sr-only">
                          {" "}
                          for {item.title} (opens in a new tab)
                        </span>
                      </a>
                    ) : null}
                    <div className="mt-auto pt-2">
                      {!signedIn || snapshot.viewerIsOwner ? (
                        <>
                          <OwnerReactionSummaryRow summary={item.reaction} />
                          {!signedIn ? (
                            <Link
                              href={signinHref}
                              className="mt-2 inline-flex min-h-11 items-center text-sm font-bold underline"
                            >
                              Sign in to react
                            </Link>
                          ) : null}
                        </>
                      ) : (
                        <PublicItemReactions
                          initialSummary={item.reaction}
                          onReact={onReact}
                        />
                      )}
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function PublicItemReactions({
  initialSummary,
  onReact,
}: {
  initialSummary: ReactionSummaryRow;
  onReact: ReactToPublicItem;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <ReactionRow
        compact
        summary={summary}
        onReact={async (reaction) => {
          setFailed(false);
          try {
            const result = await onReact(summary.itemId, reaction);
            if (
              result.kind === "confirmed" &&
              result.summary.itemId === summary.itemId
            )
              setSummary(result.summary);
            else setFailed(true);
          } catch {
            setFailed(true);
          }
        }}
      />
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-feedback-error">
          Your reaction couldn’t be saved. Try again.
        </p>
      ) : null}
    </>
  );
}
