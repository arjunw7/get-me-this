import { totalReactionCount } from "./types";
import type { OwnerReactionSummary } from "./reaction-write";

type Key = "veryYou" | "questionable" | "wantItToo";
const KINDS: readonly Key[] = ["veryYou", "questionable", "wantItToo"];
const LABELS: Record<Key, string> = {
  veryYou: "Very you",
  questionable: "Questionable, but supported",
  wantItToo: "Want it too",
};
const GLYPHS: Record<Key, string> = {
  veryYou: "✧",
  questionable: "?",
  wantItToo: "♡",
};
const COLORS: Record<Key, string> = {
  veryYou: "bg-action-primary text-content-primary",
  questionable: "bg-accent-highlight text-content-primary",
  wantItToo: "bg-accent-info text-white",
};

/** Aggregate-only owner summary: no reactor identity, reservation state, or mutation. */
export function OwnerReactionSummaryRow({
  summary,
}: {
  summary: OwnerReactionSummary;
}) {
  const total = totalReactionCount(summary.counts);
  const present = KINDS.filter((kind) => summary.counts[kind] > 0);
  return (
    <div
      className="mt-1 border-t-2 border-outline-subtle pt-3 text-sm text-content-secondary"
      role="status"
    >
      {total === 0 ? (
        <p>No reactions yet</p>
      ) : (
        <>
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-flex -space-x-1">
              {present.map((kind) => (
                <span
                  key={kind}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-raised text-base font-bold ${COLORS[kind]}`}
                >
                  {GLYPHS[kind]}
                </span>
              ))}
            </span>
            <span>
              {total} {total === 1 ? "reaction" : "reactions"}
            </span>
          </p>
          <dl className="mt-2 space-y-1">
            {present.map((kind) => (
              <div key={kind} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-3.5 text-center text-base leading-none text-content-primary"
                >
                  {GLYPHS[kind]}
                </span>
                <dd className="order-1 tabular-nums font-bold text-content-primary">
                  {summary.counts[kind]}
                </dd>
                <dt className="order-2">{LABELS[kind]}</dt>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
