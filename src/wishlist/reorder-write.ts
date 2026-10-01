import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

export type WishlistMoveInput = {
  expectedIds: readonly string[];
  movedItemId: string;
  targetIndex: number;
};

export type WishlistMoveOutcome =
  | { kind: "confirmed" }
  | { kind: "stale" }
  | { kind: "unavailable" }
  | { kind: "uncertain" };

type ReorderRow = {
  result: unknown;
  ordered_ids: unknown;
};

function isExactSequenceMemberSet(
  value: unknown,
  expectedIds: readonly string[],
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === expectedIds.length &&
    value.every((id) => typeof id === "string") &&
    new Set(value).size === value.length &&
    expectedIds.every((id) => value.includes(id))
  );
}

export async function persistWishlistMove(
  input: WishlistMoveInput,
): Promise<WishlistMoveOutcome> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "uncertain" };

  const { data, error } = await client.rpc("reorder_wishlist_item", {
    expected_ids: [...input.expectedIds],
    moved_item_id: input.movedItemId,
    target_index: input.targetIndex,
  });
  if (error) return { kind: "uncertain" };

  const rows = data as ReorderRow[] | null;
  if (!rows || rows.length !== 1) return { kind: "uncertain" };
  const row = rows[0];
  if (row.result === "stale" && row.ordered_ids === null)
    return { kind: "stale" };
  if (row.result === "unavailable" && row.ordered_ids === null)
    return { kind: "unavailable" };
  if (
    (row.result === "moved" || row.result === "unchanged") &&
    isExactSequenceMemberSet(row.ordered_ids, input.expectedIds)
  )
    return { kind: "confirmed" };
  return { kind: "uncertain" };
}
