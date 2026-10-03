"use server";

import { revalidatePath } from "next/cache";
import { setGroupItemReaction } from "./reactions/reaction-write";
import { isReactionKind, type ReactionKind } from "./reactions/types";

export async function reactToMemberItem(
  groupId: string,
  itemId: string,
  reaction: ReactionKind | null,
) {
  if (reaction !== null && !isReactionKind(reaction))
    return { kind: "unavailable" } as const;
  const result = await setGroupItemReaction(groupId, itemId, reaction);
  if (result.kind === "confirmed") revalidatePath(`/groups/${groupId}`);
  return result;
}
