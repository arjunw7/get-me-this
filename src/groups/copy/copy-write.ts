import "server-only";

import { getServerAnalytics } from "@/src/analytics/server";
import { createSupabaseServerClient } from "@/src/supabase/server";

/**
 * Server-side copy-to-own-wishlist data access (brief 007b). The single
 * write path is the 007b definer function `copy_group_item`: the actor is
 * derived from the authenticated session inside the database via
 * auth.uid(), and every denial class — signed-out, outsider, pending,
 * declined, left, removed, cross-group, unknown group/item, invisible
 * extraction state, own item — is the same generic `unavailable` outcome.
 * Only a copied-destination badge is group-visible through the separately authorized projection. Source provenance remains private.
 *
 * The already-copied verdict comes from an owner-scoped pre-read of the
 * copier's own rows under the 005a `wishlist_items_select_own` policy
 * (columns selected explicitly; `copied_from_item_id` is readable only in
 * the copier's own owner-scoped reads). A pre-read hit reports
 * `already_copied` without any write. A pre-read miss calls the definer
 * function, whose own lock-then-lookup is the authoritative idempotency
 * check; a concurrent same-copier race labels the idempotent loser's event
 * `created` (a documented, harmless mislabel: the copy row itself is still
 * exactly one, enforced by the partial unique index).
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CopyItemOutcome =
  { kind: "created" } | { kind: "already_copied" } | { kind: "unavailable" };

/**
 * Copy a friend's visible group item into the caller's own wishlist.
 * Returns the generic outcome only — never source metadata, never a
 * copied-item id, and never a distinguishing denial reason.
 */
export async function copyFriendGroupItem(
  groupId: string,
  itemId: string,
): Promise<CopyItemOutcome> {
  if (!UUID_PATTERN.test(groupId) || !UUID_PATTERN.test(itemId)) {
    return { kind: "unavailable" };
  }

  const client = await createSupabaseServerClient();
  if (!client) return { kind: "unavailable" };

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { kind: "unavailable" };

  // Owner-scoped pre-read under RLS: the copier's own rows only.
  const { data: existing } = await client
    .from("wishlist_items")
    .select("id")
    .eq("owner_id", user.id)
    .eq("copied_from_item_id", itemId)
    .limit(1);

  if (existing && existing.length > 0) {
    await emitCopyEvent(user.id, "already_copied");
    return { kind: "already_copied" };
  }

  const { data, error } = await client.rpc("copy_group_item", {
    p_group_id: groupId,
    p_item_id: itemId,
  });
  if (error || data === null) return { kind: "unavailable" };

  // The function returns a scalar uuid: PostgREST delivers it as a JSON
  // string (not a result row array).
  const copiedId = typeof data === "string" ? data : null;
  if (!copiedId || !UUID_PATTERN.test(copiedId)) {
    return { kind: "unavailable" };
  }

  await emitCopyEvent(user.id, "created");
  return { kind: "created" };
}

/**
 * The single privacy-safe server event for a successful copy: exactly once
 * per call, with only the closed `copy_outcome` property. No identifiers,
 * titles, URLs, prices, currencies, or counts are ever sent. Every denial
 * class emits nothing (the caller returns before this function).
 */
async function emitCopyEvent(
  userId: string,
  copyOutcome: "created" | "already_copied",
): Promise<void> {
  const analytics = await getServerAnalytics();
  await analytics.capture(
    "item_copied",
    { copy_outcome: copyOutcome },
    { distinctId: userId },
  );
}
