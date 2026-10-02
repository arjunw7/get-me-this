import { totalReactionCount } from "./types";

type Key = "veryYou" | "questionable" | "wantItToo";

const LABEL_FOR_KEY: Record<Key, string> = {
  veryYou: "Very you",
  questionable: "Questionable",
  wantItToo: "Want it too",
};
import type { OwnerReactionSummary } from "./reaction-write";

/**
 * The approved read-only owner summary row for one of the caller's own items
 * (brief 007a): per-kind counts and breakdown, `No reactions yet` at zero.
 * No interactive control exists here anywhere; the owner cannot react to
 * their own items and never sees reactor identities.
 */
export function OwnerReactionSummaryRow({
  summary,
}: {
  summary: OwnerReactionSummary;
}) {
  const total = totalReactionCount(summary.counts);

  if (total === 0) {
    return (
      <p
        className="mt-3 text-sm font-semibold text-content-secondary"
        role="status"
      >
        No reactions yet
      </p>
    );
  }

  return (
    <dl
      className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold"
      role="status"
    >
      <dt className="sr-only">Reactions to this item</dt>
      {(["veryYou", "questionable", "wantItToo"] as const).map((key: Key) => (
        <div
          key={key}
          className="flex items-center gap-1 rounded-surface border-2 border-outline-strong bg-surface-raised px-3 py-1 text-content-primary"
        >
          <dt>{LABEL_FOR_KEY[key]}</dt>
          <dd className="tabular-nums">{summary.counts[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
