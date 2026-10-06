import "server-only";
import { createSupabaseServerClient } from "@/src/supabase/server";

/** Only the viewer's own current copies, under owner RLS, after browse authorization. */
export async function loadOwnCopiedItemIds(
  sourceItemIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (!sourceItemIds.length) return new Set();
  const client = await createSupabaseServerClient();
  if (!client) return new Set();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return new Set();
  // Bound PostgREST GET URLs so large wishlists do not hit the proxy's URI limit.
  const sourceIds = [...new Set(sourceItemIds)];
  const copied = new Set<string>();
  for (let offset = 0; offset < sourceIds.length; offset += 100) {
    const batch = sourceIds.slice(offset, offset + 100);
    const { data, error } = await client
      .from("wishlist_items")
      .select("copied_from_item_id")
      .eq("owner_id", user.id)
      .in("copied_from_item_id", batch);
    // An unavailable batch keeps its actions available without losing known copies.
    if (error || !Array.isArray(data)) continue;
    const allowed = new Set(batch);
    for (const row of data) {
      if (
        typeof row.copied_from_item_id === "string" &&
        allowed.has(row.copied_from_item_id)
      )
        copied.add(row.copied_from_item_id);
    }
  }
  return copied;
}
