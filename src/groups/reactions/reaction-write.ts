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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function toSummaryRow(
  value: unknown,
  requestedItemId?: string,
): ReactionSummaryRow | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const row = value as Record<string, unknown>;
  const itemId = requestedItemId ?? row.item_id;
  if (
    typeof itemId !== "string" ||
    !UUID_PATTERN.test(itemId) ||
    !isCount(row.very_you_count) ||
    !isCount(row.questionable_count) ||
    !isCount(row.want_it_too_count) ||
    (row.viewer_reaction !== null && !isReactionKind(row.viewer_reaction))
  ) {
    return null;
  }
  return {
    itemId,
    counts: {
      veryYou: row.very_you_count,
      questionable: row.questionable_count,
      wantItToo: row.want_it_too_count,
    },
    viewerReaction: row.viewer_reaction,
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
  if (
    !UUID_PATTERN.test(groupId) ||
    !UUID_PATTERN.test(itemId) ||
    (reaction !== null && !isReactionKind(reaction))
  )
    return { kind: "unavailable" };
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc("set_group_item_reaction", {
    p_group_id: groupId,
    p_item_id: itemId,
    p_reaction: reaction,
  });
  if (error) return { kind: "retry" };

  if (data === null || (Array.isArray(data) && data.length === 0))
    return { kind: "unavailable" };
  if (!Array.isArray(data) || data.length !== 1) return { kind: "retry" };
  // Unlike the read projection, this RPC returns only counts and the caller's
  // reaction. Its single authorized result belongs to the validated request.
  const summary = toSummaryRow(data[0], itemId);
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

  if (!Array.isArray(data)) return [];
  return data
    .map((row: unknown) => toSummaryRow(row))
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
