"use client";

import { useId, useTransition } from "react";
import { REACTION_KINDS, REACTION_LABELS, totalReactionCount } from "./types";
import type { ReactionKind, ReactionSummaryRow } from "./types";

/**
 * The approved interactive reaction row for a friend's visible item (brief
 * 007a): three choices with the approved labels, the caller's active
 * reaction visibly selected, selecting another replaces, selecting the
 * active one removes. Zero reactions shows `Be the first to react`.
 *
 * Updates apply the authoritative function result through `onReact`;
 * transient failure restores the prior state (the parent keeps the previous
 * summary and only swaps on a confirmed result). Touch targets are at least
 * 44 by 44 CSS pixels; motion is limited to a brief press, respecting
 * reduced motion.
 */
export function ReactionRow({
  summary,
  onReact,
}: {
  summary: ReactionSummaryRow;
  onReact: (reaction: ReactionKind | null) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const labelId = useId();

  const total = totalReactionCount(summary.counts);

  function pick(reaction: ReactionKind) {
    const next = summary.viewerReaction === reaction ? null : reaction;
    startTransition(async () => {
      await onReact(next);
    });
  }

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2"
      role="group"
      aria-labelledby={labelId}
      aria-busy={isPending}
    >
      <span id={labelId} className="sr-only">
        React to this item
      </span>
      {total === 0 ? (
        <span className="text-sm font-semibold text-content-secondary">
          Be the first to react
        </span>
      ) : (
        <span
          className="text-sm font-semibold text-content-secondary"
          role="status"
        >
          {summary.counts.veryYou} Very you · {summary.counts.questionable}{" "}
          Questionable · {summary.counts.wantItToo} Want it too
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        {REACTION_KINDS.map((kind) => {
          const active = summary.viewerReaction === kind;
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              disabled={isPending}
              onClick={() => pick(kind)}
              className={`min-h-11 rounded-pill border-2 px-4 text-sm font-bold transition-transform duration-100 motion-reduce:transition-none disabled:opacity-60 ${
                active
                  ? "border-outline-strong bg-action-primary text-content-primary"
                  : "border-outline-strong bg-surface-raised text-content-primary hover:bg-accent-fresh-soft"
              }`}
            >
              {REACTION_LABELS[kind]}
              {kind === "questionable" ? (
                <span className="sr-only">, but supported</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
