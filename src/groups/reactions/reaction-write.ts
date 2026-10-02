import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";
import { isReactionKind } from "./types";
import type { ReactionCounts, ReactionKind, ReactionSummaryRow } from "./types";

/**
 * Server-side reaction data access (brief 007a). Every call goes through the
 * 007a public database API — never a base-table query. The actor is derived
 * from the authenticated session inside the database functions via
 * auth.uid(); a signed-out or otherwise denied caller gets the same generic
 * failure as every other denial class, and the UI restores the prior state.
 */

export type ReactionWriteOutcome =
  | { kind: "confirmed"; summary: ReactionSummaryRow }
  | { kind: "unavailable" }
  | { kind: "retry" };

type ReactionFunctionRow = {
  item_id: unknown;
  very_you_count: unknown;
  questionable_count: unknown;
  want_it_too_count: unknown;
  viewer_reaction: unknown;
};

function toSummaryRow(row: ReactionFunctionRow): ReactionSummaryRow | null {
  if (
    typeof row.item_id !== "string" ||
    typeof row.very_you_count !== "number" ||
    typeof row.questionable_count !== "number" ||
    typeof row.want_it_too_count !== "number"
  ) {
    return null;
  }
  return {
    itemId: row.item_id,
    counts: {
      veryYou: row.very_you_count,
      questionable: row.questionable_count,
      wantItToo: row.want_it_too_count,
    },
    viewerReaction: isReactionKind(row.viewer_reaction)
      ? row.viewer_reaction
      : null,
  };
}

/**
 * Set, replace, or remove (null reaction) the caller's single reaction.
 * Returns the authoritative post-write summary; any denial is the same
 * generic `unavailable` outcome.
 */
export async function setGroupItemReaction(
  groupId: string,
  itemId: string,
  reaction: ReactionKind | null,
): Promise<ReactionWriteOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc("set_group_item_reaction", {
    p_group_id: groupId,
    p_item_id: itemId,
    p_reaction: reaction,
  });
  if (error) return { kind: "retry" };

  const rows = (data ?? []) as ReactionFunctionRow[];
  const first = rows[0];
  if (!first) return { kind: "unavailable" };
  const summary = toSummaryRow(first);
  if (!summary) return { kind: "retry" };
  return { kind: "confirmed", summary };
}

/**
 * Friend-facing read: one summary row per visible item, including
 * zero-count rows, in 005d order. Zero rows for every denial class.
 */
export async function getGroupItemReactionSnapshot(
  groupId: string,
  memberId: string,
): Promise<ReactionSummaryRow[]> {
  const client = await createSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client.rpc("group_item_reaction_snapshot", {
    p_group_id: groupId,
    p_member_id: memberId,
  });
  if (error) return [];

  const rows = (data ?? []) as ReactionFunctionRow[];
  return rows
    .map(toSummaryRow)
    .filter((row): row is ReactionSummaryRow => row !== null);
}

type OwnerSummaryRow = {
  item_id: unknown;
  very_you_count: unknown;
  questionable_count: unknown;
  want_it_too_count: unknown;
};

export type OwnerReactionSummary = {
  itemId: string;
  counts: ReactionCounts;
};

/**
 * Owner-facing read: per-kind counts for the caller's own items across
 * currently-joined group contexts. No identities, no timestamps.
 */
export async function getOwnItemReactionSummary(): Promise<
  OwnerReactionSummary[]
> {
  const client = await createSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client.rpc("own_item_reaction_summary");
  if (error) return [];

  const rows = (data ?? []) as OwnerSummaryRow[];
  const mapped: OwnerReactionSummary[] = [];
  for (const row of rows) {
    if (
      typeof row.item_id === "string" &&
      typeof row.very_you_count === "number" &&
      typeof row.questionable_count === "number" &&
      typeof row.want_it_too_count === "number"
    ) {
      mapped.push({
        itemId: row.item_id,
        counts: {
          veryYou: row.very_you_count,
          questionable: row.questionable_count,
          wantItToo: row.want_it_too_count,
        },
      });
    }
  }
  return mapped;
}
