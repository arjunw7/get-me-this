"use server";

import { revalidatePath } from "next/cache";

import { requireCompleteProfile } from "@/src/profile/session";

import { getOwnWishlist } from "./data";
import { toItemViews } from "./item-views";
import {
  persistWishlistMove,
  type WishlistMoveInput,
  type WishlistMoveOutcome,
} from "./reorder-write";
import type { WishlistItemView } from "./display";

export type ReorderActionResult =
  | {
      status: "saved" | "refreshed";
      items: readonly WishlistItemView[];
    }
  | { status: "recovery" }
  | { status: "unavailable" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidMoveInput(input: WishlistMoveInput): boolean {
  const ids = input.expectedIds;
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id)) &&
    new Set(ids).size === ids.length &&
    typeof input.movedItemId === "string" &&
    UUID_PATTERN.test(input.movedItemId) &&
    ids.includes(input.movedItemId) &&
    Number.isInteger(input.targetIndex) &&
    input.targetIndex >= 0 &&
    input.targetIndex < ids.length
  );
}

// Client-safe item views (005f): raw snapshot paths are resolved to signed
// URLs server-side and stripped before the result crosses into the client.
async function freshOwnerItems(
  userId: string,
): Promise<readonly WishlistItemView[] | null> {
  const wishlist = await getOwnWishlist(userId);
  if (!wishlist) return null;
  return toItemViews(wishlist.items);
}

async function resultAfterFreshRead(
  userId: string,
  outcome: WishlistMoveOutcome,
): Promise<ReorderActionResult> {
  const items = await freshOwnerItems(userId);
  if (items === null) return { status: "recovery" };
  revalidatePath("/wishlist");
  return {
    status: outcome.kind === "confirmed" ? "saved" : "refreshed",
    items,
  };
}

export async function reorderWishlistItemAction(
  input: WishlistMoveInput,
): Promise<ReorderActionResult> {
  const { userId } = await requireCompleteProfile();
  if (!isValidMoveInput(input)) return { status: "unavailable" };
  const outcome = await persistWishlistMove(input);
  return resultAfterFreshRead(userId, outcome);
}

export async function refreshWishlistOrderAction(): Promise<ReorderActionResult> {
  const { userId } = await requireCompleteProfile();
  const items = await freshOwnerItems(userId);
  if (items === null) return { status: "recovery" };
  revalidatePath("/wishlist");
  return { status: "refreshed", items };
}
