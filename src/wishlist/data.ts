import "server-only";

import { createSupabaseServerClient } from "@/src/supabase/server";

import {
  toWishlistItemSnapshot,
  type WishlistItemRow,
  type WishlistItemSnapshot,
} from "./display";

/**
 * The repository's first server-side wishlist data access (005b),
 * mirroring the `src/profile/session.ts` precedent: every access goes
 * through `createSupabaseServerClient()` under the owner-only RLS policies
 * of 005a (`wishlists_select_own`, `wishlist_items_select_own`), in server
 * code only, never in a client bundle. There is no client-side wishlist
 * read: the list is a single server-rendered document.
 *
 * The owner read is one fixed shape: the caller's own `wishlists` row (at
 * most one, by the one-wishlist-per-owner invariant) plus their
 * `wishlist_items` rows selected as the display snapshot, ordered by the
 * 005a deterministic total order (`sort_position ASC, id ASC`). Columns
 * are selected explicitly — never `select *` — and the converted-money
 * tuple is deliberately not selected: 005b never renders conversions
 * (005g owns that contract).
 */

export type OwnWishlist = {
  readonly wishlistId: string;
  readonly items: readonly WishlistItemSnapshot[];
};

/** The explicit display-snapshot column list (never `select *`). */
const ITEM_COLUMNS = [
  "id",
  "title",
  "source_url",
  "retailer",
  "image_url",
  "image_snapshot_path",
  "note",
  "desire_level",
  "sort_position",
  "original_amount_minor",
  "original_currency",
  "created_at",
  "updated_at",
] as const;

/**
 * The caller's own wishlist under RLS, or null when no wishlist row
 * exists. A missing row is an invariant violation (the 005a signup trigger
 * plus backfill guarantee every user a wishlist), never an empty state:
 * the page renders the designed error state for it.
 */
export async function getOwnWishlist(
  userId: string,
): Promise<OwnWishlist | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: wishlist } = await supabase
    .from("wishlists")
    .select("id")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!wishlist) return null;

  const { data: items, error } = await supabase
    .from("wishlist_items")
    .select(ITEM_COLUMNS.join(","))
    .eq("wishlist_id", (wishlist as { id: string }).id)
    .order("sort_position", { ascending: true })
    .order("id", { ascending: true });
  if (error) return null;

  return {
    wishlistId: (wishlist as { id: string }).id,
    items: (items ?? []).map((row) =>
      toWishlistItemSnapshot(row as unknown as WishlistItemRow),
    ),
  };
}
