/**
 * Reaction vocabulary and summary types (brief 007a).
 *
 * The stored enum is the closed three-value vocabulary below. Display
 * strings live only in the UI layer; the full phrase
 * `questionable, but supported` is display copy, never a stored value.
 * Summaries expose per-kind counts only — never reactor identities.
 */

export const REACTION_KINDS = [
  "very_you",
  "questionable",
  "want_it_too",
] as const;

export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_LABELS: Record<ReactionKind, string> = {
  very_you: "Very you",
  questionable: "Questionable",
  want_it_too: "Want it too",
};

export type ReactionCounts = {
  veryYou: number;
  questionable: number;
  wantItToo: number;
};

export type ReactionSummaryRow = {
  itemId: string;
  counts: ReactionCounts;
  viewerReaction: ReactionKind | null;
};

export function totalReactionCount(counts: ReactionCounts): number {
  return counts.veryYou + counts.questionable + counts.wantItToo;
}

export function isReactionKind(value: unknown): value is ReactionKind {
  return (
    typeof value === "string" &&
    (REACTION_KINDS as readonly string[]).includes(value)
  );
}
