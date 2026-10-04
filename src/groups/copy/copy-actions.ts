"use server";

import { revalidatePath } from "next/cache";

import { copyFriendGroupItem } from "./copy-write";

/**
 * The typed action state shared by the server action and the client copy
 * button (brief 007b): idle, in-progress (client-tracked), the designed
 * success confirmation, the already-copied report, and the generic failure
 * with the prior state restored. Every denial class maps to the same
 * `failure` — no distinguishing detail, no enumeration.
 */
export type CopyToWishlistState =
  | { readonly status: "idle" }
  | { readonly status: "success" }
  | { readonly status: "already" }
  | { readonly status: "failure" };

/**
 * The single copy write path for the member-wishlist browse surface
 * (brief 007b). The actor and authorization live entirely in the database;
 * the action maps the authoritative outcome to the display state and
 * refreshes nothing on denial.
 */
export async function copyToMyWishlistAction(
  _prevState: CopyToWishlistState,
  formData: FormData,
): Promise<CopyToWishlistState> {
  const groupId = String(formData.get("groupId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const outcome = await copyFriendGroupItem(groupId, itemId);

  if (outcome.kind === "created") {
    // The copied item appears at the end of the copier's own wishlist.
    revalidatePath("/wishlist");
    return { status: "success" };
  }
  if (outcome.kind === "already_copied") {
    return { status: "already" };
  }
  return { status: "failure" };
}
