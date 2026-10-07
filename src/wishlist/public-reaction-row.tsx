"use client";

import { useId, useTransition } from "react";
import {
  REACTION_KINDS,
  REACTION_LABELS,
  totalReactionCount,
} from "@/src/groups/reactions/types";
import type {
  ReactionKind,
  ReactionSummaryRow,
} from "@/src/groups/reactions/types";

function PublicGlyph({ kind }: { kind: ReactionKind }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
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

/** Public counts only: never reactor identities or group gifting state. */
export function PublicReactionRow({
  summary,
  onReact,
}: {
  summary: ReactionSummaryRow;
  onReact?: (kind: ReactionKind | null) => Promise<void>;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const counts: Record<ReactionKind, number> = {
    very_you: summary.counts.veryYou,
    questionable: summary.counts.questionable,
    want_it_too: summary.counts.wantItToo,
  };
  if (!onReact && totalReactionCount(summary.counts) === 0) return null;
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={onReact ? "React to this item" : "Item reactions"}
      aria-busy={pending}
      data-public-reactions
    >
      {REACTION_KINDS.map((kind) => {
        const name =
          kind === "questionable"
            ? "Questionable, but supported"
            : REACTION_LABELS[kind];
        const count = `${counts[kind]} ${counts[kind] === 1 ? "reaction" : "reactions"}`;
        const content = (
          <>
            <span
              className="public-reaction-glyph"
              data-kind={kind}
              aria-hidden="true"
            >
              <PublicGlyph kind={kind} />
            </span>
            <span aria-hidden="true" className="text-sm font-bold tabular-nums">
              {counts[kind]}
            </span>
          </>
        );
        return onReact ? (
          <button
            key={kind}
            type="button"
            className="public-reaction-choice"
            aria-label={name}
            aria-describedby={`${id}-${kind}`}
            aria-pressed={summary.viewerReaction === kind}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onReact(summary.viewerReaction === kind ? null : kind);
              })
            }
          >
            {content}
            <span id={`${id}-${kind}`} className="sr-only">
              {count}
            </span>
          </button>
        ) : (
          <span
            key={kind}
            className="inline-flex min-h-11 items-center gap-1.5 px-1"
            role="img"
            aria-label={`${name}: ${count}`}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
