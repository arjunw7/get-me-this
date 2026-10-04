"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/src/supabase/server";
import {
  isReactionKind,
  type ReactionKind,
} from "@/src/groups/reactions/types";
import type { ReactionWriteOutcome } from "@/src/groups/reactions/reaction-write";
import type { ShareWishlistChange } from "./public-share-types";
import { parsePublicShareToken } from "./public-share-token";
import {
  parseOwnShareState,
  parsePublicReaction,
  PUBLIC_ITEM_ID,
} from "./public-share-data";

export async function changeWishlistSharing(
  expectedVersion: string,
  enabled: boolean,
): ReturnType<ShareWishlistChange> {
  if (
    typeof expectedVersion !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/.test(expectedVersion) ||
    BigInt(expectedVersion) > BigInt("9223372036854775807") ||
    typeof enabled !== "boolean"
  )
    return { status: "error" };
  try {
    const client = await createSupabaseServerClient();
    if (!client) return { status: "error" };
    const { data, error } = await client.rpc(
      enabled ? "enable_wishlist_share" : "revoke_wishlist_share",
      { p_expected_version: expectedVersion },
    );
    const state = error ? null : parseOwnShareState(data);
    if (!state) return { status: "error" };
    revalidatePath("/wishlist");
    return { status: "saved", state };
  } catch {
    return { status: "error" };
  }
}
export async function reactToPublicItem(
  token: string,
  itemId: string,
  reaction: ReactionKind | null,
): Promise<ReactionWriteOutcome> {
  if (
    !parsePublicShareToken(token) ||
    typeof itemId !== "string" ||
    !PUBLIC_ITEM_ID.test(itemId) ||
    (reaction !== null && !isReactionKind(reaction))
  )
    return { kind: "unavailable" };
  try {
    const client = await createSupabaseServerClient();
    if (!client) return { kind: "unavailable" };
    const { data, error } = await client.rpc("set_public_wishlist_reaction", {
      p_token: token,
      p_item_id: itemId,
      p_reaction: reaction,
    });
    if (error) return { kind: "retry" };
    if (Array.isArray(data) && data.length === 0)
      return { kind: "unavailable" };
    const summary =
      Array.isArray(data) && data.length === 1
        ? parsePublicReaction(data[0])
        : null;
    if (!summary || summary.itemId !== itemId) return { kind: "retry" };
    revalidatePath("/wishlist");
    return { kind: "confirmed", summary };
  } catch {
    return { kind: "retry" };
  }
}
