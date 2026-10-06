"use client";

import { useId, useTransition } from "react";
import { REACTION_KINDS, REACTION_LABELS, totalReactionCount } from "./types";
import type { ReactionKind, ReactionSummaryRow } from "./types";

function StampGlyph({ kind }: { kind: ReactionKind }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width="32"
      height="32"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {kind === "very_you" ? (
        <path d="M20 5 L23 17 L36 20 L23 23 L20 35 L17 23 L4 20 L17 17 Z" />
      ) : kind === "questionable" ? (
        <>
          <path d="M12 14c0-5.5 4-9 9-9s9 3.4 9 8.4c0 5.6-6.4 6.6-8.4 11.2" />
          <circle cx="21" cy="31" r="2" fill="currentColor" stroke="none" />
        </>
      ) : (
        <path d="M20 32c-9-7.5-13-13.2-13-18.4C7 8.6 10.6 5 15 5c2.6 0 4.9 1.6 5 4.4C20.1 6.6 22.4 5 25 5c4.4 0 8 3.6 8 8.6 0 5.2-4 10.9-13 18.4Z" />
      )}
    </svg>
  );
}

/** One confirmed reaction per person: switching replaces, pressing again removes. */
export function ReactionRow({
  summary,
  onReact,
  compact = false,
}: {
  summary: ReactionSummaryRow;
  compact?: boolean;
  onReact: (reaction: ReactionKind | null) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const labelId = useId();
  const total = totalReactionCount(summary.counts);
  const counts: Record<ReactionKind, number> = {
    very_you: summary.counts.veryYou,
    questionable: summary.counts.questionable,
    want_it_too: summary.counts.wantItToo,
  };

  function pick(reaction: ReactionKind) {
    startTransition(async () => {
      await onReact(summary.viewerReaction === reaction ? null : reaction);
    });
  }

  return (
    <div
      className={compact ? "mt-2" : "mt-3"}
      role="group"
      aria-labelledby={labelId}
      aria-busy={isPending}
    >
      <span id={labelId} className="sr-only">
        React to this item
      </span>
      <span className="sr-only" role={total > 0 ? "status" : undefined}>
        {total === 0
          ? "Be the first to react"
          : `${total} ${total === 1 ? "reaction" : "reactions"}`}
      </span>
      <div className="reaction-stamps">
        {REACTION_KINDS.map((kind) => {
          const active = summary.viewerReaction === kind;
          const name =
            kind === "questionable"
              ? "Questionable, but supported"
              : REACTION_LABELS[kind];
          return (
            <div key={kind} className="reaction-stamp-choice">
              <button
                type="button"
                aria-label={name}
                aria-describedby={`${labelId}-${kind}-count`}
                aria-pressed={active}
                disabled={isPending}
                onClick={() => pick(kind)}
                className="reaction-stamp"
                data-kind={kind}
              >
                <span
                  key={String(active)}
                  className={
                    active
                      ? "reaction-stamp-ink reaction-stamp-selected"
                      : "reaction-stamp-ink"
                  }
                  aria-hidden="true"
                >
                  {active ? <span className="reaction-stamp-ring" /> : null}
                  <StampGlyph kind={kind} />
                  <span className="reaction-stamp-counter">
                    <span key={counts[kind]} className="reaction-stamp-count">
                      {counts[kind]}
                    </span>
                  </span>
                </span>
                <span id={`${labelId}-${kind}-count`} className="sr-only">
                  {counts[kind]} {counts[kind] === 1 ? "reaction" : "reactions"}
                </span>
              </button>
              <span data-reaction-label className="reaction-stamp-label">
                {REACTION_LABELS[kind]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
